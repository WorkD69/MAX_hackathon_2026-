import { randomUUID } from 'node:crypto';
import { AddCommentPayloadSchema, AddCommentSuccessSchema, AddResultMaterialPayloadSchema,
  AddResultMaterialSuccessSchema, SubmitResultRequestSchema, SubmitResultSuccessSchema } from '@max-smart-city/contracts';
import type { RuntimeFastifyInstance } from '../../../../app/static.js';
import type { RuntimeConfig } from '../../../../config/types.js';
import { storeFiles, validateFiles } from '../../../attachments/storage.js';
import { IntakeError } from '../intake-assignment/options.js';
import { registerCaseCommands } from './http.js';
import type { CommandModuleOptions } from './http.js';
import type { CaseCommandDefinition, WriteContext } from './runner.js';
import { parseAttachmentMultipart } from '../../../attachments/multipart.js';
import { parseIntakeMultipart } from '../intake-assignment/multipart.js';

async function resultRecipient(ctx:WriteContext) {
  let recipientId:string|undefined;
  if (ctx.row.demo_run_id) {
    const run=await ctx.tx.selectFrom('demo_run').select('notification_recipient_max_identity_id')
      .where('demo_run_id','=',ctx.row.demo_run_id).forShare().executeTakeFirst();
    recipientId=run?.notification_recipient_max_identity_id;
  } else {
    const identities=await ctx.tx.selectFrom('max_identity').selectAll().where('app_user_id','=',ctx.row.resident_user_id)
      .where('link_status','=','LINKED_CONFIRMED').where('delivery_chat_type','=','DIALOG').where('delivery_chat_id','is not',null)
      .orderBy('max_identity_id').forShare().execute();
    if (identities.length===1) recipientId=identities[0]!.max_identity_id;
  }
  const identity=recipientId?await ctx.tx.selectFrom('max_identity').selectAll().where('max_identity_id','=',recipientId).forShare().executeTakeFirst():null;
  if (!identity || !identity.delivery_chat_id || identity.delivery_chat_type!=='DIALOG')
    throw new IntakeError('MAX_DELIVERY_TARGET_NOT_READY',409);
  return identity;
}

export const executionDefinitions:readonly CaseCommandDefinition[]=[
  {kind:'ADD_COMMENT',path:'/api/v1/cases/:caseId/comments',schema:AddCommentPayloadSchema,success:AddCommentSuccessSchema,
    domain:(p,files)=>({kind:'ADD_COMMENT',body:p.body as string,clarificationRequestId:p.clarification_request_id as string|null,
      attachmentIds:files.map((_,i)=>`new-attachment-${i}`)}),
    beforeValidate:ctx=>{
      validateFiles(ctx.files);
      if(ctx.claims.role==='RESIDENT'&&ctx.payload.clarification_request_id) {
        const request=ctx.snapshot.clarifications.find(c=>c.id===ctx.payload.clarification_request_id);
        if(ctx.snapshot.state!=='REMARKS_REVIEW'||!request||request.resultId!==ctx.snapshot.result?.id||
          request.feedbackId!==ctx.snapshot.feedback?.id||request.iterationId!==ctx.snapshot.iteration.id)
          throw new IntakeError('CLARIFICATION_CONTEXT_REQUIRED',409);
      }
    },
    write:async ctx=>{
      const fact=ctx.domain.facts.find(f=>f.kind==='COMMENT');
      if (!fact||fact.kind!=='COMMENT') throw new IntakeError('INTERNAL_ERROR',500);
      const id=randomUUID();
      await ctx.tx.insertInto('comment').values({comment_id:id,case_id:ctx.row.case_id,iteration_id:ctx.snapshot.iteration.id,
        author_user_id:ctx.claims.app_user_id!,actor_role_snapshot:ctx.claims.role!,
        actor_organization_id:ctx.actor.role==='UK_EMPLOYEE'||ctx.actor.role==='UK_ADMIN'?ctx.row.organization_id:null,
        actor_contractor_id:ctx.actor.role==='CONTRACTOR_EMPLOYEE'?ctx.actor.contractorId:null,
        comment_kind:fact.inReplyToClarificationId?'CLARIFICATION_REPLY':'WORKING',
        context_result_id:fact.contextResultId??null,context_feedback_id:fact.contextFeedbackId??null,
        in_reply_to_comment_id:fact.inReplyToClarificationId??null,body:fact.body,created_at:ctx.now}).execute();
      for (const attachmentId of await storeFiles(ctx.tx,ctx.row.case_id,ctx.claims.app_user_id!,ctx.files,ctx.now))
        await ctx.tx.insertInto('comment_attachment').values({case_id:ctx.row.case_id,comment_id:id,attachment_id:attachmentId}).execute();
      return {commentId:id,created:{comment_id:id}};
    }},
  {kind:'ADD_RESULT_MATERIAL',path:'/api/v1/cases/:caseId/result-materials',schema:AddResultMaterialPayloadSchema,success:AddResultMaterialSuccessSchema,
    domain:(p,files)=>({kind:'ADD_RESULT_MATERIAL',assignmentId:p.assignment_id as string,iterationId:p.iteration_id as string,
      materialKind:files[0]?.mimeType.startsWith('image/')?'PHOTO':'FILE',materialValidated:files.length===1}),
    beforeValidate:ctx=>{validateFiles(ctx.files);if(ctx.files.length!==1) throw new IntakeError('VALIDATION_FAILED',422);},
    write:async ctx=>{
      const [id]=await storeFiles(ctx.tx,ctx.row.case_id,ctx.claims.app_user_id!,ctx.files,ctx.now);
      await ctx.tx.insertInto('work_material_attachment').values({case_id:ctx.row.case_id,iteration_id:ctx.snapshot.iteration.id,
        assignment_id:ctx.snapshot.assignment!.id,attachment_id:id!,created_event_id:ctx.eventIds[0]!}).execute();
      return {attachmentId:id!,created:{attachment_id:id!}};
    }},
  {kind:'SUBMIT_RESULT',path:'/api/v1/cases/:caseId/commands/submit-result',schema:SubmitResultRequestSchema,success:SubmitResultSuccessSchema,
    domain:p=>({kind:'SUBMIT_RESULT',assignmentId:p.assignment_id as string,iterationId:p.iteration_id as string,
      description:p.description as string,materialAttachmentIds:p.material_attachment_ids as string[]}),
    beforeValidate:ctx=>{
      if(ctx.files.length)throw new IntakeError('VALIDATION_FAILED',400);
      if(ctx.payload.assignment_id===ctx.snapshot.assignment?.id&&ctx.payload.iteration_id===ctx.snapshot.iteration.id&&
        ['EXECUTION','REWORK'].includes(ctx.snapshot.state)) {
        const ids=ctx.payload.material_attachment_ids as string[];
        if(new Set(ids).size!==ids.length)throw new IntakeError('RESULT_MATERIAL_INVALID',422);
        const materials=ids.map(id=>ctx.snapshot.materials.find(m=>m.id===id));
        if(materials.some(m=>!m||m.assignmentId!==ctx.snapshot.assignment!.id||m.iterationId!==ctx.snapshot.iteration.id))
          throw new IntakeError('RESULT_MATERIAL_INVALID',422);
        if(ctx.snapshot.resultRequirement==='PHOTO'&&!materials.some(m=>m?.kind==='PHOTO')||
          ctx.snapshot.resultRequirement==='FILE'&&materials.length===0)throw new IntakeError('RESULT_MATERIAL_REQUIRED',422);
      }
    },
    write:async ctx=>{
      // Recipient is locked/rechecked immediately before the first write; all effects roll back together.
      await resultRecipient(ctx);
      const id=randomUUID(),notificationId=randomUUID();
      await ctx.tx.insertInto('result').values({result_id:id,case_id:ctx.row.case_id,iteration_id:ctx.snapshot.iteration.id,
        assignment_id:ctx.snapshot.assignment!.id,contractor_id:ctx.row.current_executor_contractor_id!,author_user_id:ctx.claims.app_user_id!,
        description:ctx.payload.description as string,submitted_at:ctx.now}).execute();
      for (const attachmentId of ctx.payload.material_attachment_ids as string[])
        await ctx.tx.insertInto('result_attachment').values({case_id:ctx.row.case_id,result_id:id,attachment_id:attachmentId}).execute();
      return {resultId:id,notificationId,created:{result_id:id,notification_intent_id:notificationId}};
    },
    notify:async(ctx,effect)=>{
      const recipient=await resultRecipient(ctx);
      await ctx.tx.insertInto('notification_intent').values({notification_intent_id:effect.notificationId!,case_id:ctx.row.case_id,
        result_id:effect.resultId!,recipient_max_identity_id:recipient.max_identity_id,
        delivery_chat_id:recipient.delivery_chat_id!,delivery_chat_type:recipient.delivery_chat_type!,
        notification_kind:'RESULT_READY',dedupe_key:`${effect.resultId}:RESULT_READY`,payload:{case_id:ctx.row.case_id,result_id:effect.resultId},
        status:'PENDING',attempt_count:0,next_attempt_at:ctx.now,last_attempt_at:null,claim_token:null,claimed_at:null,lease_expires_at:null,
        delivered_at:null,provider_message_id:null,last_error_code:null,last_error_message:null,operational_redrive_count:0,created_at:ctx.now}).execute();
    }},
];
/** Central registration remains TG029-owned. */
export function registerExecutionRoutes(app:RuntimeFastifyInstance,config:RuntimeConfig,options:CommandModuleOptions) {
  app.removeContentTypeParser(/^multipart\/form-data(?:;.*)?$/i);
  app.addContentTypeParser(/^multipart\/form-data(?:;.*)?$/i,{parseAs:'buffer',bodyLimit:25*1024*1024},(request,body,done)=>{
    try {
      if(!Buffer.isBuffer(body))throw new IntakeError('VALIDATION_FAILED',400);
      const parse=request.url.split('?')[0]?.endsWith('/result-materials')?parseAttachmentMultipart:parseIntakeMultipart;
      done(null,parse(request.headers['content-type']??'',body));
    }catch(error){done(error as Error);}
  });
  registerCaseCommands(app,config,options,executionDefinitions);
}
