import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IdempotencyKeyHeaderSchema, UuidSchema } from '@max-smart-city/contracts';
import { CommandTransactionKernel } from '@max-smart-city/db';
import type { CommandPlan, DatabaseConnection, DatabaseTransaction, LockedCase } from '@max-smart-city/db';
import { evaluateDomain } from '@max-smart-city/domain';
import type { Actor, DomainCommand, DomainPlan, DomainSnapshot } from '@max-smart-city/domain';
import type { RuntimeConfig } from '../../../../config/types.js';
import { SessionError, verifySession } from '../../../auth/session-token.js';
import type { SessionClaims } from '../../../auth/session-token.js';
import { AuthorizationError, AuthorizationPolicy } from '../../../authorization/policy.js';
import type { Action } from '../../../authorization/policy.js';
import { createTransactionAuthorizationRepository } from '../../../commands/kernel/authorization.js';
import { createCommandFingerprint } from '../../../commands/kernel/fingerprint.js';
import type { LogicalMultipartFile } from '../../../commands/kernel/fingerprint.js';
import { IntakeError } from '../intake-assignment/options.js';
import { commandError, executionSnapshot, lockExecutionAuthority } from './context.js';

export interface WriteContext {
  tx: DatabaseTransaction; row: LockedCase; claims: SessionClaims; actor: Actor;
  snapshot: DomainSnapshot; domain: DomainPlan; payload: Record<string, unknown>;
  files: readonly LogicalMultipartFile[]; commandId: string; now: Date; eventIds: string[];
}
export interface CommandEffect {
  created: Record<string, unknown>;
  commentId?: string; attachmentId?: string; resultId?: string; feedbackId?: string;
  iterationId?: string; notificationId?: string;
}
export interface CaseCommandDefinition {
  kind: Action; path: string; schema: z.ZodType; success: z.ZodType;
  domain(payload: Record<string,unknown>, files: readonly LogicalMultipartFile[], snapshot: DomainSnapshot): DomainCommand;
  write(ctx: WriteContext): Promise<CommandEffect>;
  beforeValidate?(ctx: Omit<WriteContext,'domain'>): void;
  notify?(ctx: WriteContext, effect: CommandEffect): Promise<void>;
}

export class CaseCommandRunner {
  constructor(private readonly db: DatabaseConnection, private readonly config: RuntimeConfig,
    private readonly seconds: () => number = () => Math.floor(Date.now()/1000)) {}
  async run(def: CaseCommandDefinition, caseId: string, token: string, key: string | undefined,
    body: unknown, files: readonly LogicalMultipartFile[] = []) {
    const claims = verifySession(token,this.config,this.seconds());
    if (claims.demo_mode !== this.config.DEMO_MODE) throw new SessionError('SESSION_EXPIRED');
    if (!claims.app_user_id) throw new AuthorizationError('FORBIDDEN');
    let row: LockedCase, snapshot: DomainSnapshot, actor: Actor, domain: DomainPlan;
    const eventIds: string[] = [];
    const context = (tx: DatabaseTransaction, payload: Record<string,unknown>, commandId: string): WriteContext =>
      ({tx,row,claims,actor,snapshot,domain,payload,files,commandId,now:new Date(this.seconds()*1000),eventIds});
    const plan: CommandPlan<Record<string,unknown>, {action:Action|null;assignmentId?:string}, CommandEffect, unknown> = {
      requestedTarget: payload => ({kind:'EXISTING_CASE',caseId,authorizationKey:`case:${caseId}`,
        authorizationContext:{action:def.kind,...(typeof payload.assignment_id==='string'?{assignmentId:payload.assignment_id}:{})}}),
      storedTarget: async execution => {
        const saved = execution.response_body as {case_id?:unknown};
        const storedId = UuidSchema.parse(saved?.case_id);
        const event = await this.db.selectFrom('case_event').select('assignment_id').where('command_id','=',execution.command_id).orderBy('event_seq').executeTakeFirst();
        return {kind:'EXISTING_CASE',caseId:storedId,authorizationKey:`case:${storedId}`,
          authorizationContext:{action:execution.command_type==='CREATE_CASE'?null:execution.command_type as Action,
            ...(event?.assignment_id?{assignmentId:event.assignment_id}:{})}};
      },
      authorize: async input => {
        const policy = new AuthorizationPolicy(createTransactionAuthorizationRepository(input.transaction));
        if (input.phase==='NEW') await policy.command(claims,input.target.caseId!,def.kind);
        else if (!input.target.authorizationContext.action) await policy.case(claims,input.target.caseId!);
        else await policy.replay(claims,input.target.caseId!,input.target.authorizationContext.action,
          input.target.authorizationContext.assignmentId ?? (input.phase==='REPLAY_REQUESTED'?input.lockedCase?.current_assignment_id??undefined:undefined));
      },
      terminalGuard: async input => {
        if (!input.lockedCase) throw new AuthorizationError('NOT_FOUND');
        row = input.lockedCase;
        if (row.current_state==='COMPLETED') throw new IntakeError('TERMINAL_CASE',409);
      },
      validateExactTargets: async input => { snapshot = await executionSnapshot(input.transaction,row); },
      validateStateContext: async () => {},
      lockConfiguration: async input => { actor = await lockExecutionAuthority(input.transaction,row,claims); },
      validateDomain: async input => {
        def.beforeValidate?.(context(input.transaction,input.payload,input.commandId));
        const validation = evaluateDomain(snapshot,actor,def.domain(input.payload,files,snapshot));
        if (!validation.ok) return commandError(validation.code);
        domain = validation.plan;
        eventIds.push(...domain.events.map(()=>randomUUID()));
      },
      writeDomain: input => def.write(context(input.transaction,input.payload,input.commandId)),
      updateProjection: async input => {
        const patch: Record<string,unknown> = {current_state:domain.nextState,updated_at:new Date(this.seconds()*1000)};
        if (input.effect.resultId && domain.projection.result?.operation==='CREATE') patch.current_result_id=input.effect.resultId;
        if (domain.projection.result?.operation==='CLEAR') patch.current_result_id=null;
        if (domain.projection.selection?.operation==='CLEAR') patch.current_selection_id=null;
        if (input.effect.iterationId) patch.current_iteration_id=input.effect.iterationId;
        if (domain.projection.closure) {
          patch.closed_at=new Date(this.seconds()*1000); patch.closed_by_user_id=claims.app_user_id;
          patch.closure_kind=domain.projection.closure.basis==='RESIDENT_CONFIRMATION'?'CONFIRMED_RESULT':domain.projection.closure.basis;
          patch.closure_explanation=input.payload.explanation??null;
        }
        await input.transaction.updateTable('case_table').set(patch).where('case_id','=',caseId).execute();
      },
      appendEvents: async input => {
        for (const [i,event] of domain.events.entries()) {
          await input.transaction.insertInto('case_event').values({event_id:eventIds[i]!,case_id:caseId,
            event_seq:Number(row.last_event_seq)+i+1,event_type:event.code,occurred_at:new Date(this.seconds()*1000),
            actor_user_id:claims.app_user_id,actor_role_snapshot:claims.role,
            actor_organization_id:actor.role==='UK_EMPLOYEE'||actor.role==='UK_ADMIN'?row.organization_id:null,
            actor_contractor_id:actor.role==='CONTRACTOR_EMPLOYEE'?actor.contractorId:null,
            from_state: i===0?domain.fromState:domain.nextState,to_state:domain.nextState,
            iteration_id:i===1&&input.effect.iterationId?input.effect.iterationId:snapshot.iteration.id,
            selection_id:row.current_selection_id,assignment_id:row.current_assignment_id,
            result_id:input.effect.resultId??event.target?.resultId??null,
            feedback_id:input.effect.feedbackId??event.target?.feedbackId??null,
            comment_id:input.effect.commentId??null,attachment_id:input.effect.attachmentId??null,
            description:event.code,presentation_data:{...input.payload, material_attachment_ids:undefined},
            command_id:input.commandId,caused_by_event_id:i===1?eventIds[0]!:null,derived:i===1}).execute();
        }
        await input.transaction.updateTable('case_table').set({last_event_seq:Number(row.last_event_seq)+eventIds.length}).where('case_id','=',caseId).execute();
      },
      createNotificationIntents: async input => { await def.notify?.(context(input.transaction,input.payload,input.commandId),input.effect); },
      canonicalResponse: input => ({status:200,body:def.success.parse({command_id:input.commandId,case_id:caseId,
        state:domain.nextState,revision:input.revision,created:input.effect.created,event_ids:eventIds,
        ...(input.effect.notificationId?{notification:{status:'QUEUED'}}:{}),
        ...(def.kind==='RECORD_NO_RESIDENT_FEEDBACK'?{no_feedback_event_id:eventIds[0]}:{})})}),
    };
    return new CommandTransactionKernel(this.db).run({authenticate:()=>({type:'APP_USER',appUserId:claims.app_user_id!}),
      idempotencyKey:key,commandType:def.kind,plan,prepare:()=>{
        if (!IdempotencyKeyHeaderSchema.safeParse(key).success) throw new IntakeError('IDEMPOTENCY_KEY_REQUIRED',400);
        const parsed=def.schema.safeParse(body);
        if (!parsed.success) throw new IntakeError('VALIDATION_FAILED',400);
        const payload=parsed.data as Record<string,unknown>;
        return {payload,requestHash:createCommandFingerprint({method:'POST',path:def.path.replace(':caseId',caseId),commandType:def.kind,normalizedPayload:payload,files})};
      }});
  }
}
