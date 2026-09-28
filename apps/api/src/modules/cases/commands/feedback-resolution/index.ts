import { randomUUID } from 'node:crypto';
import { ResidentConfirmationRequestSchema, ResidentConfirmationSuccessSchema, ResidentRemarkPayloadSchema,
  ResidentRemarkSuccessSchema, RequestClarificationRequestSchema, RequestClarificationSuccessSchema,
  RecordNoResidentFeedbackRequestSchema, RecordNoResidentFeedbackSuccessSchema, ReturnToReworkRequestSchema,
  ReturnToReworkSuccessSchema, CompleteCaseRequestSchema, CompleteCaseSuccessSchema,
  CompleteWithExplanationRequestSchema, CompleteWithExplanationSuccessSchema } from '@max-smart-city/contracts';
import type { RuntimeFastifyInstance } from '../../../../app/static.js';
import type { RuntimeConfig } from '../../../../config/types.js';
import type { DomainCommand } from '@max-smart-city/domain';
import { storeFiles, validateFiles } from '../../../attachments/storage.js';
import { IntakeError } from '../intake-assignment/options.js';
import { registerCaseCommands } from '../execution/http.js';
import type { CommandModuleOptions } from '../execution/http.js';
import type { CaseCommandDefinition, CommandEffect, WriteContext } from '../execution/runner.js';

async function feedback(ctx:WriteContext,type:'CONFIRMATION'|'REMARK'):Promise<CommandEffect> {
  const id=randomUUID();
  await ctx.tx.insertInto('resident_feedback').values({feedback_id:id,case_id:ctx.row.case_id,
    iteration_id:ctx.snapshot.iteration.id,result_id:ctx.snapshot.result!.id,resident_user_id:ctx.row.resident_user_id,
    type,remark_text:type==='REMARK'?ctx.payload.remark_text as string:null,created_at:ctx.now}).execute();
  for(const attachmentId of await storeFiles(ctx.tx,ctx.row.case_id,ctx.claims.app_user_id!,ctx.files,ctx.now))
    await ctx.tx.insertInto('feedback_attachment').values({case_id:ctx.row.case_id,feedback_id:id,attachment_id:attachmentId}).execute();
  return {feedbackId:id,resultId:ctx.snapshot.result!.id,created:{feedback_id:id}};
}
function validateFeedback(ctx:Omit<WriteContext,'domain'>) {
  validateFiles(ctx.files);
  if(ctx.payload.result_id===ctx.snapshot.result?.id&&ctx.payload.iteration_id===ctx.snapshot.iteration.id&&ctx.snapshot.feedback)
    throw new IntakeError('FEEDBACK_ALREADY_SUBMITTED',409);
}
export const feedbackResolutionDefinitions:readonly CaseCommandDefinition[]=[
  {kind:'RESIDENT_CONFIRM',path:'/api/v1/cases/:caseId/commands/resident-confirmation',schema:ResidentConfirmationRequestSchema,
    success:ResidentConfirmationSuccessSchema,domain:p=>({kind:'RESIDENT_CONFIRM',resultId:p.result_id as string,iterationId:p.iteration_id as string}),
    beforeValidate:validateFeedback,write:ctx=>feedback(ctx,'CONFIRMATION')},
  {kind:'RESIDENT_REMARK',path:'/api/v1/cases/:caseId/commands/resident-remark',schema:ResidentRemarkPayloadSchema,
    success:ResidentRemarkSuccessSchema,domain:p=>({kind:'RESIDENT_REMARK',resultId:p.result_id as string,iterationId:p.iteration_id as string,remarkText:p.remark_text as string}),
    beforeValidate:validateFeedback,write:ctx=>feedback(ctx,'REMARK')},
  {kind:'REQUEST_CLARIFICATION',path:'/api/v1/cases/:caseId/commands/request-clarification',schema:RequestClarificationRequestSchema,
    success:RequestClarificationSuccessSchema,domain:p=>({kind:'REQUEST_CLARIFICATION',resultId:p.result_id as string,feedbackId:p.feedback_id as string,message:p.message as string}),
    beforeValidate:ctx=>validateFiles(ctx.files),write:async ctx=>{
      const id=randomUUID();
      await ctx.tx.insertInto('comment').values({comment_id:id,case_id:ctx.row.case_id,iteration_id:ctx.snapshot.iteration.id,
        author_user_id:ctx.claims.app_user_id!,actor_role_snapshot:ctx.claims.role!,actor_organization_id:ctx.row.organization_id,
        actor_contractor_id:null,comment_kind:'CLARIFICATION_REQUEST',context_result_id:ctx.snapshot.result!.id,
        context_feedback_id:ctx.snapshot.feedback!.id,in_reply_to_comment_id:null,body:ctx.payload.message as string,created_at:ctx.now}).execute();
      for(const attachmentId of await storeFiles(ctx.tx,ctx.row.case_id,ctx.claims.app_user_id!,ctx.files,ctx.now))
        await ctx.tx.insertInto('comment_attachment').values({case_id:ctx.row.case_id,comment_id:id,attachment_id:attachmentId}).execute();
      return {commentId:id,resultId:ctx.snapshot.result!.id,feedbackId:ctx.snapshot.feedback!.id,created:{comment_id:id}};
    }},
  {kind:'RECORD_NO_RESIDENT_FEEDBACK',path:'/api/v1/cases/:caseId/commands/record-no-resident-feedback',schema:RecordNoResidentFeedbackRequestSchema,
    success:RecordNoResidentFeedbackSuccessSchema,domain:p=>({kind:'RECORD_NO_FEEDBACK',resultId:p.result_id as string,iterationId:p.iteration_id as string,
      basisConfirmed:p.basis_confirmed===true,basisNote:p.basis_note as string}),
    beforeValidate:ctx=>{
      if(ctx.payload.result_id===ctx.snapshot.result?.id&&ctx.payload.iteration_id===ctx.snapshot.iteration.id) {
        if(ctx.snapshot.feedback)throw new IntakeError('FEEDBACK_ALREADY_SUBMITTED',409);
        if(ctx.snapshot.noFeedback)throw new IntakeError('NO_FEEDBACK_ALREADY_RECORDED',409);
      }
    },write:async ctx=>({resultId:ctx.snapshot.result!.id,created:{}})},
  {kind:'RETURN_TO_REWORK',path:'/api/v1/cases/:caseId/commands/return-to-rework',schema:ReturnToReworkRequestSchema,
    success:ReturnToReworkSuccessSchema,domain:p=>({kind:'RETURN_TO_REWORK',resultId:p.result_id as string,feedbackId:p.feedback_id as string}),
    write:async ctx=>{
      const id=randomUUID(),number=ctx.snapshot.iteration.number+1;
      await ctx.tx.insertInto('case_iteration').values({iteration_id:id,case_id:ctx.row.case_id,iteration_no:number,
        start_reason:'REWORK',started_at:ctx.now,started_by_user_id:ctx.claims.app_user_id!,source_result_id:ctx.snapshot.result!.id,
        source_feedback_id:ctx.snapshot.feedback!.id,started_by_event_id:ctx.eventIds[1]!}).execute();
      return {iterationId:id,resultId:ctx.snapshot.result!.id,feedbackId:ctx.snapshot.feedback!.id,created:{iteration_id:id,iteration_no:number}};
    }},
  {kind:'COMPLETE_CASE',path:'/api/v1/cases/:caseId/commands/complete',schema:CompleteCaseRequestSchema,success:CompleteCaseSuccessSchema,
    domain:p=>{
      const basis=p.basis as {type:string;feedback_id?:string;event_id?:string;completion_basis?:{confirmed:boolean;process_reference:string}};
      return {kind:'COMPLETE_CASE',resultId:p.result_id as string,basis:basis.type==='RESIDENT_CONFIRMATION'
        ?{type:'RESIDENT_CONFIRMATION',feedbackId:basis.feedback_id!}
        :{type:'NO_RESIDENT_FEEDBACK',eventId:basis.event_id!,completionBasis:{confirmed:basis.completion_basis!.confirmed,processReference:basis.completion_basis!.process_reference}}} satisfies DomainCommand;
    },write:async ctx=>({resultId:ctx.snapshot.result!.id,...(ctx.snapshot.feedback?{feedbackId:ctx.snapshot.feedback.id}:{}),created:{}})},
  {kind:'COMPLETE_WITH_EXPLANATION',path:'/api/v1/cases/:caseId/commands/complete-with-explanation',schema:CompleteWithExplanationRequestSchema,
    success:CompleteWithExplanationSuccessSchema,domain:p=>({kind:'COMPLETE_WITH_EXPLANATION',resultId:p.result_id as string,feedbackId:p.feedback_id as string,explanation:p.explanation as string}),
    write:async ctx=>({resultId:ctx.snapshot.result!.id,feedbackId:ctx.snapshot.feedback!.id,created:{}})},
];
/** TG017 consumes these command descriptors; each command still revalidates through TG011/TG012. */
export function registerFeedbackResolutionRoutes(app:RuntimeFastifyInstance,config:RuntimeConfig,options:CommandModuleOptions) {
  registerCaseCommands(app,config,options,feedbackResolutionDefinitions);
}
