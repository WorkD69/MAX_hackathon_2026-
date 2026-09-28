import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AttachmentPathSchema, DownloadCapabilityResponseSchema, UuidSchema } from '@max-smart-city/contracts';
import { CommandTransactionKernel } from '@max-smart-city/db';
import type { CommandPlan, DatabaseConnection, DatabaseTransaction } from '@max-smart-city/db';
import type { FastifyReply } from 'fastify';
import type { RuntimeConfig } from '../../config/types.js';
import type { RuntimeFastifyInstance } from '../../app/static.js';
import { verifySession } from '../auth/session-token.js';
import { AuthorizationError, AuthorizationPolicy } from '../authorization/policy.js';
import { createTransactionAuthorizationRepository } from '../commands/kernel/authorization.js';
import { createCommandFingerprint } from '../commands/kernel/fingerprint.js';
import { lockExecutionAuthority } from '../cases/commands/execution/context.js';
import { handleError, respondError } from '../cases/commands/execution/http.js';

type Capability = {attachmentId:string;token:string;expires:number};
export function registerAttachmentRoutes(app:RuntimeFastifyInstance,config:RuntimeConfig,
  options:{database:DatabaseConnection;nowSeconds?:()=>number}) {
  const seconds=options.nowSeconds??(()=>Math.floor(Date.now()/1000));
  const key=createHash('sha256').update('attachment-download-v1\0').update(config.APP_SESSION_SECRET).digest();
  const encode=(value:Capability)=>{
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
    const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return Buffer.concat([nonce,cipher.getAuthTag(),bytes]).toString('base64url');
  };
  const decode=(raw:string,checkExpiry=true):Capability=>{
    try {
      if(!/^[A-Za-z0-9_-]{40,16000}$/.test(raw))throw new Error();
      const bytes=Buffer.from(raw,'base64url');
      const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12)); cipher.setAuthTag(bytes.subarray(12,28));
      const value=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8')) as Capability;
      UuidSchema.parse(value.attachmentId);
      if(typeof value.token!=='string'||!Number.isSafeInteger(value.expires)||(checkExpiry&&value.expires<=seconds()))throw new Error();
      return value;
    }catch {throw new AuthorizationError('NOT_FOUND');}
  };
  const authorize=async(tx:DatabaseTransaction,token:string,attachmentId:string)=>{
    const claims=verifySession(token,config,seconds());
    if(claims.demo_mode!==config.DEMO_MODE)throw new AuthorizationError('NOT_FOUND');
    const policy=new AuthorizationPolicy(createTransactionAuthorizationRepository(tx));
    const decision=await policy.attachment(claims,attachmentId);
    const row=await tx.selectFrom('case_table').selectAll().where('case_id','=',decision.case.case_id).forShare().executeTakeFirstOrThrow();
    await lockExecutionAuthority(tx,row,claims);
    await policy.attachment(claims,attachmentId);
    return claims;
  };
  const stream=async(reply:FastifyReply,token:string,attachmentId:string)=>{
    const row=await options.database.transaction().execute(async tx=>{
      await authorize(tx,token,attachmentId);
      return tx.selectFrom('attachment').selectAll().where('attachment_id','=',attachmentId).executeTakeFirstOrThrow();
    });
    const ascii=row.file_name.replace(/[^\x20-\x7e]|["\\;]/g,'_');
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff')
      .header('Content-Disposition',`attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`)
      .type(row.mime_type).header('Content-Length',String(row.byte_size));
    return reply.send(row.content);
  };
  app.get('/api/v1/attachments/:attachmentId',async(request,reply)=>{
    const path=AttachmentPathSchema.safeParse(request.params);
    if(!path.success)return respondError(request,reply,400,'VALIDATION_FAILED');
    if(!request.headers.authorization?.startsWith('Bearer '))return respondError(request,reply,401,'UNAUTHENTICATED');
    try{return await stream(reply,request.headers.authorization.slice(7),path.data.attachmentId);}catch(error){return handleError(request,reply,error);}
  });
  app.post('/api/v1/attachments/:attachmentId/download-capability',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    if(!request.headers.authorization?.startsWith('Bearer '))return respondError(request,reply,401,'UNAUTHENTICATED');
    const path=AttachmentPathSchema.safeParse(request.params);
    if(!path.success)return respondError(request,reply,400,'VALIDATION_FAILED');
    const token=request.headers.authorization.slice(7);
    try {
      const claims=verifySession(token,config,seconds());
      if(!claims.app_user_id)throw new AuthorizationError('FORBIDDEN');
      type Context={attachmentId:string};
      const noop=async()=>{};
      const plan:CommandPlan<Record<string,never>,Context,ReturnType<typeof DownloadCapabilityResponseSchema.parse>,unknown>={
        requestedTarget:()=>({kind:'NON_CASE',caseId:null,authorizationKey:`attachment:${path.data.attachmentId}`,authorizationContext:{attachmentId:path.data.attachmentId}}),
        storedTarget:execution=>{
          const saved=DownloadCapabilityResponseSchema.parse(execution.response_body);
          const cap=decode(new URL(saved.download_url).pathname.split('/').pop()!,false);
          return {kind:'NON_CASE',caseId:null,authorizationKey:`attachment:${cap.attachmentId}`,authorizationContext:{attachmentId:cap.attachmentId}};
        },
        authorize:async input=>{await authorize(input.transaction,token,input.target.authorizationContext.attachmentId);},
        terminalGuard:noop,validateExactTargets:noop,validateStateContext:noop,lockConfiguration:noop,validateDomain:noop,
        writeDomain:async input=>{
          const row=await input.transaction.selectFrom('attachment').select(['file_name']).where('attachment_id','=',path.data.attachmentId).executeTakeFirstOrThrow();
          const expires=Math.min(seconds()+120,claims.exp);
          const opaque=encode({attachmentId:path.data.attachmentId,token,expires});
          const url=new URL(`/downloads/${opaque}`,config.PUBLIC_APP_URL);
          // The wire contract requires HTTPS, including local capabilities.
          url.protocol='https:';
          return DownloadCapabilityResponseSchema.parse({download_url:url.href,file_name:row.file_name,expires_at:new Date(expires*1000).toISOString()});
        },
        updateProjection:noop,appendEvents:noop,createNotificationIntents:noop,canonicalResponse:input=>({status:200,body:input.effect}),
      };
      const header=request.headers['idempotency-key'];
      const result=await new CommandTransactionKernel(options.database).run({authenticate:()=>({type:'APP_USER',appUserId:claims.app_user_id!}),
        idempotencyKey:typeof header==='string'?header:undefined,commandType:'DOWNLOAD_CAPABILITY',plan,
        prepare:()=>({payload:{},requestHash:createCommandFingerprint({method:'POST',path:`/api/v1/attachments/${path.data.attachmentId}/download-capability`,commandType:'DOWNLOAD_CAPABILITY',normalizedPayload:{}})})});
      if(result.replayed)reply.header('Idempotency-Replayed','true');
      return reply.code(result.status).send(result.body);
    }catch(error){return handleError(request,reply,error);}
  });
  app.get('/downloads/:capability',async(request,reply)=>{
    try {
      const raw=(request.params as {capability:string}).capability;
      const cap=decode(raw);return await stream(reply,cap.token,cap.attachmentId);
    }catch {return respondError(request,reply,404,'RESOURCE_NOT_FOUND');}
  });
}
