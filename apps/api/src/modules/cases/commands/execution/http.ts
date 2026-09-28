import { randomUUID } from 'node:crypto';
import { CasePathSchema, ErrorResponseSchema, RequestIdHeaderSchema } from '@max-smart-city/contracts';
import { CommandKernelError } from '@max-smart-city/db';
import type { DatabaseConnection } from '@max-smart-city/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RuntimeConfig } from '../../../../config/types.js';
import type { RuntimeFastifyInstance } from '../../../../app/static.js';
import { SessionError } from '../../../auth/session-token.js';
import { AuthorizationError } from '../../../authorization/policy.js';
import { IntakeError } from '../intake-assignment/options.js';
import { CaseCommandRunner } from './runner.js';
import type { CaseCommandDefinition } from './runner.js';
import type { IntakeMultipart } from '../intake-assignment/multipart.js';

export const respondError = (request: FastifyRequest, reply: FastifyReply, status:number, code:string) => {
  const id=RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
  const wire=code==='NOT_FOUND'?'RESOURCE_NOT_FOUND':code;
  return reply.code(status).send(ErrorResponseSchema.parse({error:{code:wire,message:wire,request_id:id.success?id.data:randomUUID()}}));
};
export function handleError(request:FastifyRequest,reply:FastifyReply,error:unknown) {
  if (error instanceof SessionError) return respondError(request,reply,401,error.code);
  if (error instanceof AuthorizationError || error instanceof IntakeError || error instanceof CommandKernelError)
    return respondError(request,reply,error.status,error.code);
  return respondError(request,reply,500,'INTERNAL_ERROR');
}
export interface CommandModuleOptions {database:DatabaseConnection;nowSeconds?:()=>number}
export function registerCaseCommands(app:RuntimeFastifyInstance,config:RuntimeConfig,options:CommandModuleOptions,
  definitions:readonly CaseCommandDefinition[]) {
  const runner=new CaseCommandRunner(options.database,config,options.nowSeconds);
  for (const def of definitions) app.post(def.path,{errorHandler:(error,request,reply)=>
    respondError(request,reply,error instanceof IntakeError?error.status:400,error instanceof IntakeError?error.code:'VALIDATION_FAILED')},
    async(request,reply)=>{
      reply.header('Cache-Control','no-store');
      const header=request.headers.authorization;
      if (!header?.startsWith('Bearer ')) return respondError(request,reply,401,'UNAUTHENTICATED');
      const path=CasePathSchema.safeParse(request.params);
      if (!path.success) return respondError(request,reply,400,'VALIDATION_FAILED');
      const multipart=request.headers['content-type']?.startsWith('multipart/form-data');
      const parsed=request.body as IntakeMultipart;
      try {
        if (multipart && (!parsed||!Array.isArray(parsed.files))) throw new IntakeError('VALIDATION_FAILED',400);
        const key=request.headers['idempotency-key'];
        const result=await runner.run(def,path.data.caseId,header.slice(7),typeof key==='string'?key:undefined,
          multipart?parsed.payload:request.body,multipart?parsed.files:[]);
        if (result.replayed) reply.header('Idempotency-Replayed','true');
        return reply.code(result.status).send(result.body);
      } catch(error) {return handleError(request,reply,error);}
    });
}
