import { randomUUID } from 'node:crypto';
import {
  AcceptAssignmentRequestSchema, AcceptAssignmentSuccessSchema, AcceptCaseRequestSchema,
  AcceptCaseSuccessSchema, CommandSuccessSchema, IdempotencyKeyHeaderSchema,
  RejectAssignmentRequestSchema, RejectAssignmentSuccessSchema, SelectContractorRequestSchema,
  SelectContractorSuccessSchema, SendAssignmentRequestSchema, SendAssignmentSuccessSchema,
} from '@max-smart-city/contracts';
import { CommandKernelError, CommandTransactionKernel } from '@max-smart-city/db';
import type { CaseTable, CommandPlan, DatabaseConnection, DatabaseTransaction, LockedCase } from '@max-smart-city/db';
import { evaluateDomain } from '@max-smart-city/domain';
import type { Actor, DomainCommand, DomainPlan, DomainSnapshot, RejectionCode } from '@max-smart-city/domain';
import type { Updateable } from 'kysely';
import type { RuntimeConfig } from '../../../../config/types.js';
import { SessionError, verifySession } from '../../../auth/session-token.js';
import { AuthorizationError } from '../../../authorization/policy.js';
import { createCommandAuthorization } from '../../../commands/kernel/authorization.js';
import type { CommandAuthorizationContext } from '../../../commands/kernel/authorization.js';
import { createCommandFingerprint } from '../../../commands/kernel/fingerprint.js';
import { IntakeError } from './options.js';

export type LifecycleKind = 'ACCEPT_CASE' | 'SELECT_CONTRACTOR' | 'SEND_ASSIGNMENT' |
  'ACCEPT_ASSIGNMENT' | 'REJECT_ASSIGNMENT';
type Payload = Record<string, unknown>;
type Effect = { eventId: string; selectionId?: string; assignmentId?: string };

const definitions = {
  ACCEPT_CASE: { path: 'accept', schema: AcceptCaseRequestSchema, success: AcceptCaseSuccessSchema },
  SELECT_CONTRACTOR: { path: 'select-contractor', schema: SelectContractorRequestSchema,
    success: SelectContractorSuccessSchema },
  SEND_ASSIGNMENT: { path: 'send-assignment', schema: SendAssignmentRequestSchema,
    success: SendAssignmentSuccessSchema },
  ACCEPT_ASSIGNMENT: { path: 'accept-assignment', schema: AcceptAssignmentRequestSchema,
    success: AcceptAssignmentSuccessSchema },
  REJECT_ASSIGNMENT: { path: 'reject-assignment', schema: RejectAssignmentRequestSchema,
    success: RejectAssignmentSuccessSchema },
} as const;

const domainError = (code: RejectionCode): never => {
  if (code === 'INVALID_ACTOR') throw new AuthorizationError('FORBIDDEN');
  if (code === 'BUSINESS_INPUT') throw new IntakeError('VALIDATION_FAILED', 422);
  if (code === 'INVARIANT') throw new IntakeError('INVALID_STATE', 409);
  if (code === 'TERMINAL') throw new IntakeError('TERMINAL_CASE', 409);
  if (code === 'INVALID_SNAPSHOT' || code === 'INVALID_COMMAND') throw new IntakeError('INTERNAL_ERROR', 500);
  throw new IntakeError(code, 409);
};

async function loadSnapshot(tx: DatabaseTransaction, row: LockedCase): Promise<DomainSnapshot> {
  const iteration = await tx.selectFrom('case_iteration').selectAll()
    .where('case_id', '=', row.case_id).where('iteration_id', '=', row.current_iteration_id)
    .executeTakeFirst();
  if (!iteration) throw new IntakeError('INTERNAL_ERROR', 500);
  const selection = row.current_selection_id ? await tx.selectFrom('contractor_selection').selectAll()
    .where('case_id', '=', row.case_id).where('selection_id', '=', row.current_selection_id)
    .executeTakeFirst() : undefined;
  const assignment = row.current_assignment_id ? await tx.selectFrom('assignment').selectAll()
    .where('case_id', '=', row.case_id).where('assignment_id', '=', row.current_assignment_id)
    .executeTakeFirst() : undefined;
  const result = row.current_result_id ? await tx.selectFrom('result').selectAll()
    .where('case_id', '=', row.case_id).where('result_id', '=', row.current_result_id)
    .executeTakeFirst() : undefined;
  const feedback = result ? await tx.selectFrom('resident_feedback').selectAll()
    .where('case_id', '=', row.case_id).where('result_id', '=', result.result_id)
    .executeTakeFirst() : undefined;
  if ((row.current_selection_id && !selection) || (row.current_assignment_id && !assignment) ||
    (row.current_result_id && !result)) throw new IntakeError('INTERNAL_ERROR', 500);
  return {
    caseId: row.case_id, residentId: row.resident_user_id, organizationId: row.organization_id,
    state: row.current_state, iteration: { id: iteration.iteration_id, number: iteration.iteration_no },
    resultRequirement: row.result_requirement_snapshot,
    selection: selection ? { id: selection.selection_id, contractorId: selection.contractor_id,
      iterationId: selection.created_iteration_id } : null,
    assignment: assignment && assignment.decision_status !== 'REJECTED'
      ? { id: assignment.assignment_id, selectionId: assignment.selection_id,
        contractorId: assignment.contractor_id, decision: assignment.decision_status }
      : null,
    executorId: row.current_executor_contractor_id,
    result: result ? { id: result.result_id, iterationId: result.iteration_id,
      assignmentId: result.assignment_id } : null,
    feedback: feedback ? { id: feedback.feedback_id, resultId: feedback.result_id,
      iterationId: feedback.iteration_id, type: feedback.type } : null,
    noFeedback: null, clarifications: [], materials: [],
  };
}

/** Called after the kernel has locked the Case. Config rows precede actor/access rows. */
async function lockCurrentAuthority(tx: DatabaseTransaction, row: LockedCase, actorId: string,
  bindingId: string, contractorId: string | null): Promise<boolean> {
  const organization = await tx.selectFrom('organization').selectAll()
    .where('organization_id', '=', row.organization_id).forShare().executeTakeFirst();
  const house = await tx.selectFrom('house').selectAll()
    .where('house_id', '=', row.house_id).forShare().executeTakeFirst();
  const premises = await tx.selectFrom('premises').selectAll()
    .where('premises_id', '=', row.premises_id).forShare().executeTakeFirst();
  if (!organization?.active || !house?.active || !premises?.active ||
    house.organization_id !== row.organization_id || premises.house_id !== row.house_id) {
    throw new AuthorizationError('NOT_FOUND');
  }
  let available = true;
  if (contractorId) {
    const contractor = await tx.selectFrom('contractor').selectAll()
      .where('contractor_id', '=', contractorId).forShare().executeTakeFirst();
    const mapping = await tx.selectFrom('organization_contractor').selectAll()
      .where('organization_id', '=', row.organization_id)
      .where('contractor_id', '=', contractorId).forShare().executeTakeFirst();
    available = contractor?.active === true && mapping?.active === true;
  }
  const actor = await tx.selectFrom('app_user').select('active').where('app_user_id', '=', actorId)
    .forShare().executeTakeFirst();
  const binding = await tx.selectFrom('user_role_binding').selectAll()
    .where('role_binding_id', '=', bindingId).forShare().executeTakeFirst();
  if (!actor?.active || !binding?.active || binding.app_user_id !== actorId) {
    throw new AuthorizationError('NOT_FOUND');
  }
  if (binding.role === 'UK_EMPLOYEE') {
    const access = await tx.selectFrom('uk_house_access').select('active')
      .where('app_user_id', '=', actorId).where('house_id', '=', row.house_id)
      .forShare().executeTakeFirst();
    if (!access?.active) throw new AuthorizationError('NOT_FOUND');
  }
  if (binding.role === 'RESIDENT') {
    const access = await tx.selectFrom('resident_premises_access').select('active')
      .where('app_user_id', '=', actorId).where('premises_id', '=', row.premises_id)
      .forShare().executeTakeFirst();
    if (!access?.active) throw new AuthorizationError('NOT_FOUND');
  }
  return available;
}

function commandFor(kind: LifecycleKind, payload: Payload, available: boolean): DomainCommand {
  switch (kind) {
    case 'ACCEPT_CASE': return { kind };
    case 'SELECT_CONTRACTOR': return { kind, iterationId: payload.iteration_id as string,
      contractorId: payload.contractor_id as string, contractorAvailable: available };
    case 'SEND_ASSIGNMENT': return { kind, iterationId: payload.iteration_id as string,
      selectionId: payload.selection_id as string, contractorAvailable: available };
    case 'ACCEPT_ASSIGNMENT': return { kind, assignmentId: payload.assignment_id as string };
    case 'REJECT_ASSIGNMENT': return { kind, assignmentId: payload.assignment_id as string,
      reason: payload.reason as string };
  }
}

export class AssignmentLifecycleService {
  private readonly kernel: CommandTransactionKernel;
  constructor(private readonly database: DatabaseConnection, private readonly config: RuntimeConfig,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000)) {
    this.kernel = new CommandTransactionKernel(database, () => new Date(this.nowSeconds() * 1000));
  }

  async command(kind: LifecycleKind, caseId: string, token: string, key: string | undefined, body: unknown) {
    const claims = verifySession(token, this.config, this.nowSeconds());
    if (claims.demo_mode !== this.config.DEMO_MODE) throw new SessionError('SESSION_EXPIRED');
    const authorization = createCommandAuthorization(token, this.config, this.nowSeconds());
    const definition = definitions[kind];
    const path = `/api/v1/cases/${caseId}/commands/${definition.path}`;
    let snapshot: DomainSnapshot | undefined;
    let domain: DomainPlan | undefined;
    let available = true;
    let actor: Actor | undefined;
    const plan: CommandPlan<Payload, CommandAuthorizationContext, Effect, unknown> = {
      requestedTarget: payload => ({ kind: 'EXISTING_CASE', caseId,
        authorizationKey: `case:${caseId}`, authorizationContext: { kind: 'CASE', action: kind,
          ...((kind === 'ACCEPT_ASSIGNMENT' || kind === 'REJECT_ASSIGNMENT')
            ? { targetAssignmentId: payload.assignment_id as string } : {}) } }),
      storedTarget: async execution => {
        const saved = CommandSuccessSchema.safeParse(execution.response_body);
        const storedCaseId = saved.success ? saved.data.case_id : caseId;
        if (execution.command_type === 'CREATE_CASE') return {
          kind: 'EXISTING_CASE', caseId: storedCaseId, authorizationKey: `case:${storedCaseId}`,
          authorizationContext: { kind: 'CASE_VISIBILITY' },
        };
        const storedAction = (Object.hasOwn(definitions, execution.command_type)
          ? execution.command_type : kind) as LifecycleKind;
        const decisionEvent = (storedAction === 'ACCEPT_ASSIGNMENT' || storedAction === 'REJECT_ASSIGNMENT')
          ? await this.database.selectFrom('case_event').select('assignment_id')
            .where('command_id', '=', execution.command_id).executeTakeFirst()
          : undefined;
        if ((storedAction === 'ACCEPT_ASSIGNMENT' || storedAction === 'REJECT_ASSIGNMENT') &&
          !decisionEvent?.assignment_id) throw new IntakeError('INTERNAL_ERROR', 500);
        return { kind: 'EXISTING_CASE', caseId: storedCaseId, authorizationKey: `case:${storedCaseId}`,
          authorizationContext: { kind: 'CASE', action: storedAction,
            ...((storedAction === 'ACCEPT_ASSIGNMENT' || storedAction === 'REJECT_ASSIGNMENT')
              ? { targetAssignmentId: decisionEvent!.assignment_id! } : {}) } };
      },
      authorize: authorization.authorize,
      terminalGuard: async input => {
        if (!input.lockedCase) throw new AuthorizationError('NOT_FOUND');
        if (input.lockedCase.current_state === 'COMPLETED') throw new IntakeError('TERMINAL_CASE', 409);
      },
      validateExactTargets: async input => {
        if (!input.lockedCase) throw new AuthorizationError('NOT_FOUND');
        snapshot = await loadSnapshot(input.transaction, input.lockedCase);
        if (kind === 'SELECT_CONTRACTOR' || kind === 'SEND_ASSIGNMENT') {
          if (claims.role !== 'UK_EMPLOYEE' && claims.role !== 'UK_ADMIN') {
            throw new AuthorizationError('FORBIDDEN');
          }
          // The kernel's current visibility gate has passed and the Case is locked.
          // Use the same domain rules for state/currentness before config availability;
          // actual availability and current authority are still revalidated below.
          const validation = evaluateDomain(snapshot,
            { role: claims.role, organizationId: input.lockedCase.organization_id },
            commandFor(kind, input.payload, true));
          if (!validation.ok) return domainError(validation.code);
        }
      },
      validateStateContext: async input => {
        if (kind === 'REJECT_ASSIGNMENT' && typeof input.payload.reason === 'string' &&
          input.payload.reason.trim().length === 0) throw new IntakeError('REJECT_REASON_REQUIRED', 422);
      },
      lockConfiguration: async input => {
        if (!input.lockedCase || !snapshot || !claims.app_user_id || !claims.role_binding_id) {
          throw new AuthorizationError('NOT_FOUND');
        }
        const binding = await input.transaction.selectFrom('user_role_binding').selectAll()
          .where('role_binding_id', '=', claims.role_binding_id).executeTakeFirst();
        const contractorId = kind === 'SELECT_CONTRACTOR' ? input.payload.contractor_id as string
          : kind === 'SEND_ASSIGNMENT' ? snapshot.selection?.contractorId ?? null
          : kind === 'ACCEPT_ASSIGNMENT' || kind === 'REJECT_ASSIGNMENT'
            ? snapshot.assignment?.contractorId ?? null : null;
        available = await lockCurrentAuthority(input.transaction, input.lockedCase,
          claims.app_user_id, claims.role_binding_id, contractorId);
        await authorization.authorize({ transaction: input.transaction, target: input.target,
          lockedCase: input.lockedCase,
          execution: { commandId: input.commandId, commandType: kind, caseId }, phase: 'NEW' });
        if (!binding) throw new AuthorizationError('NOT_FOUND');
        if (binding.role === 'UK_EMPLOYEE' || binding.role === 'UK_ADMIN') {
          actor = { role: binding.role, organizationId: input.lockedCase.organization_id };
        } else if (binding.role === 'CONTRACTOR_EMPLOYEE' && binding.contractor_id) {
          actor = { role: binding.role, contractorId: binding.contractor_id };
        } else throw new AuthorizationError('FORBIDDEN');
      },
      validateDomain: async input => {
        if (!snapshot || !actor) throw new IntakeError('INTERNAL_ERROR', 500);
        const validation = evaluateDomain(snapshot, actor, commandFor(kind, input.payload, available));
        if (!validation.ok) {
          if (validation.code === 'BUSINESS_INPUT' &&
            (kind === 'SELECT_CONTRACTOR' || kind === 'SEND_ASSIGNMENT') && !available) {
            throw new IntakeError('CONTRACTOR_NOT_AVAILABLE', 422);
          }
          return domainError(validation.code);
        }
        domain = validation.plan;
      },
      writeDomain: async input => {
        if (!domain || !input.lockedCase || !claims.app_user_id || !snapshot) {
          throw new IntakeError('INTERNAL_ERROR', 500);
        }
        const effect: Effect = { eventId: randomUUID() };
        const now = new Date(this.nowSeconds() * 1000);
        if (kind === 'SELECT_CONTRACTOR') {
          const count = await input.transaction.selectFrom('contractor_selection').select('selection_no')
            .where('case_id', '=', caseId).orderBy('selection_no', 'desc').executeTakeFirst();
          effect.selectionId = randomUUID();
          await input.transaction.insertInto('contractor_selection').values({ selection_id: effect.selectionId,
            case_id: caseId, created_iteration_id: snapshot.iteration.id,
            contractor_id: input.payload.contractor_id as string, selected_by_user_id: claims.app_user_id,
            selected_at: now, selection_no: (count?.selection_no ?? 0) + 1 }).execute();
        } else if (kind === 'SEND_ASSIGNMENT') {
          const count = await input.transaction.selectFrom('assignment').select('assignment_no')
            .where('case_id', '=', caseId).orderBy('assignment_no', 'desc').executeTakeFirst();
          effect.assignmentId = randomUUID();
          await input.transaction.insertInto('assignment').values({ assignment_id: effect.assignmentId,
            case_id: caseId, selection_id: input.payload.selection_id as string,
            contractor_id: snapshot.selection!.contractorId,
            created_iteration_id: snapshot.iteration.id, assignment_no: (count?.assignment_no ?? 0) + 1,
            sent_by_user_id: claims.app_user_id, sent_at: now, decision_status: 'PENDING',
            accepted_at: null, accepted_by_user_id: null, rejected_at: null,
            rejected_by_user_id: null, reject_reason: null }).execute();
        } else if (kind === 'ACCEPT_ASSIGNMENT') {
          await input.transaction.updateTable('assignment').set({ decision_status: 'ACCEPTED',
            accepted_at: now, accepted_by_user_id: claims.app_user_id })
            .where('case_id', '=', caseId).where('assignment_id', '=', input.payload.assignment_id as string)
            .where('decision_status', '=', 'PENDING').executeTakeFirstOrThrow();
        } else if (kind === 'REJECT_ASSIGNMENT') {
          await input.transaction.updateTable('assignment').set({ decision_status: 'REJECTED',
            rejected_at: now, rejected_by_user_id: claims.app_user_id,
            reject_reason: input.payload.reason as string })
            .where('case_id', '=', caseId).where('assignment_id', '=', input.payload.assignment_id as string)
            .where('decision_status', '=', 'PENDING').executeTakeFirstOrThrow();
        }
        return effect;
      },
      updateProjection: async input => {
        if (!domain) throw new IntakeError('INTERNAL_ERROR', 500);
        const projection = domain.projection;
        const patch: Updateable<CaseTable> = { current_state: projection.state,
          updated_at: new Date(this.nowSeconds() * 1000) };
        if (projection.selection?.operation === 'CREATE') patch.current_selection_id = input.effect.selectionId!;
        if (projection.selection?.operation === 'CLEAR') patch.current_selection_id = null;
        if (projection.assignment?.operation === 'CREATE') patch.current_assignment_id = input.effect.assignmentId!;
        if (projection.assignment?.operation === 'CLEAR') patch.current_assignment_id = null;
        if (projection.executor?.operation === 'SET') patch.current_executor_contractor_id = projection.executor.contractorId;
        if (projection.executor?.operation === 'CLEAR') patch.current_executor_contractor_id = null;
        await input.transaction.updateTable('case_table').set(patch).where('case_id', '=', caseId).execute();
      },
      appendEvents: async input => {
        if (!domain || !snapshot || !claims.app_user_id || !claims.role || !input.lockedCase) {
          throw new IntakeError('INTERNAL_ERROR', 500);
        }
        const event = domain.events[0];
        if (!event || domain.events.length !== 1) throw new IntakeError('INTERNAL_ERROR', 500);
        const seq = Number(input.lockedCase.last_event_seq) + 1;
        await input.transaction.insertInto('case_event').values({ event_id: input.effect.eventId,
          case_id: caseId, event_seq: seq, event_type: event.code,
          occurred_at: new Date(this.nowSeconds() * 1000), actor_user_id: claims.app_user_id,
          actor_role_snapshot: claims.role,
          actor_organization_id: actor?.role === 'UK_EMPLOYEE' || actor?.role === 'UK_ADMIN'
            ? input.lockedCase.organization_id : null,
          actor_contractor_id: actor?.role === 'CONTRACTOR_EMPLOYEE' ? actor.contractorId : null,
          from_state: domain.fromState, to_state: domain.nextState,
          iteration_id: snapshot.iteration.id,
          selection_id: input.effect.selectionId ?? event.target?.selectionId ?? null,
          assignment_id: input.effect.assignmentId ?? event.target?.assignmentId ?? null,
          result_id: null, feedback_id: null, comment_id: null, attachment_id: null,
          description: event.code, presentation_data: {}, command_id: input.commandId,
          caused_by_event_id: null, derived: false }).execute();
        await input.transaction.updateTable('case_table').set({ last_event_seq: seq })
          .where('case_id', '=', caseId).execute();
      },
      createNotificationIntents: async () => {},
      canonicalResponse: input => {
        if (!domain) throw new IntakeError('INTERNAL_ERROR', 500);
        const created = kind === 'SELECT_CONTRACTOR' ? { selection_id: input.effect.selectionId }
          : kind === 'SEND_ASSIGNMENT' ? { assignment_id: input.effect.assignmentId } : {};
        const response = { command_id: input.commandId, case_id: caseId,
          state: domain.nextState, revision: input.revision, created,
          event_ids: [input.effect.eventId] };
        return { status: 200, body: definition.success.parse(response) };
      },
    };
    return this.kernel.run({ authenticate: authorization.authenticate, idempotencyKey: key,
      commandType: kind, prepare: () => {
        if (!IdempotencyKeyHeaderSchema.safeParse(key).success) throw new CommandKernelError('IDEMPOTENCY_KEY_REQUIRED', 400);
        const parsed = definition.schema.safeParse(body);
        if (!parsed.success) {
          if (kind === 'REJECT_ASSIGNMENT' && typeof body === 'object' && body !== null &&
            'reason' in body && typeof body.reason === 'string' && body.reason.trim().length === 0) {
            throw new IntakeError('REJECT_REASON_REQUIRED', 422);
          }
          throw new IntakeError('VALIDATION_FAILED', 400);
        }
        const payload = parsed.data as Payload;
        return { payload, requestHash: createCommandFingerprint({ method: 'POST', path,
          commandType: kind, normalizedPayload: payload }) };
      }, plan });
  }
}
