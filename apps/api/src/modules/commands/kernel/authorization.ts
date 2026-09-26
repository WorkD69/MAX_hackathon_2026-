import type { CommandAuthorizationInput, CommandPrincipal, DatabaseTransaction } from '@max-smart-city/db';
import type { RuntimeConfig } from '../../../config/types.js';
import { verifySession } from '../../auth/session-token.js';
import { AuthorizationPolicy } from '../../authorization/policy.js';
import type { Action, AttachmentContext, AuthorizationRepository, CaseContext } from '../../authorization/policy.js';

export type CommandAuthorizationContext =
  | { readonly kind: 'CASE'; readonly action: Action; readonly targetAssignmentId?: string }
  | { readonly kind: 'CASE_VISIBILITY' }
  | { readonly kind: 'CREATE_CASE'; readonly premisesId: string }
  | { readonly kind: 'CONFIGURATION'; readonly organizationId: string };

/** Every read uses the transaction that holds the kernel's Case/config locks. */
export function createTransactionAuthorizationRepository(transaction: DatabaseTransaction): AuthorizationRepository {
  return {
    async identity(maxIdentityId) {
      return await transaction.selectFrom('max_identity').select('app_user_id')
        .where('max_identity_id', '=', maxIdentityId).executeTakeFirst() ?? null;
    },
    async appUser(appUserId) {
      return await transaction.selectFrom('app_user').select('active')
        .where('app_user_id', '=', appUserId).executeTakeFirst() ?? null;
    },
    async bindings(appUserId) {
      return transaction.selectFrom('user_role_binding')
        .select(['role_binding_id', 'app_user_id', 'role', 'organization_id', 'contractor_id', 'active'])
        .where('app_user_id', '=', appUserId).execute();
    },
    async organization(organizationId) {
      return await transaction.selectFrom('organization').select('active')
        .where('organization_id', '=', organizationId).executeTakeFirst() ?? null;
    },
    async contractor(contractorId) {
      return await transaction.selectFrom('contractor').select('active')
        .where('contractor_id', '=', contractorId).executeTakeFirst() ?? null;
    },
    async demoRun(runId) {
      return await transaction.selectFrom('demo_run').select(['status', 'created_by_max_identity_id'])
        .where('demo_run_id', '=', runId).executeTakeFirst() ?? null;
    },
    async demoActor(runId, appUserId) {
      return await transaction.selectFrom('demo_run_actor').select('role')
        .where('demo_run_id', '=', runId).where('app_user_id', '=', appUserId).executeTakeFirst() ?? null;
    },
    async house(houseId) {
      return await transaction.selectFrom('house').select(['organization_id', 'active'])
        .where('house_id', '=', houseId).executeTakeFirst() ?? null;
    },
    async premises(premisesId) {
      return await transaction.selectFrom('premises').select(['house_id', 'active'])
        .where('premises_id', '=', premisesId).executeTakeFirst() ?? null;
    },
    async residentAccess(appUserId, premisesId) {
      return (await transaction.selectFrom('resident_premises_access').select('active')
        .where('app_user_id', '=', appUserId).where('premises_id', '=', premisesId).executeTakeFirst())?.active === true;
    },
    async ukHouseAccess(appUserId, houseId) {
      return (await transaction.selectFrom('uk_house_access').select('active')
        .where('app_user_id', '=', appUserId).where('house_id', '=', houseId).executeTakeFirst())?.active === true;
    },
    async organizationContractor(organizationId, contractorId) {
      return (await transaction.selectFrom('organization_contractor').select('active')
        .where('organization_id', '=', organizationId).where('contractor_id', '=', contractorId).executeTakeFirst())?.active === true;
    },
    async caseById(caseId): Promise<CaseContext | null> {
      const row = await transaction.selectFrom('case_table').selectAll().where('case_id', '=', caseId).executeTakeFirst();
      if (!row) return null;
      const assignment = row.current_assignment_id
        ? await transaction.selectFrom('assignment').select(['contractor_id', 'decision_status'])
          .where('assignment_id', '=', row.current_assignment_id).executeTakeFirst()
        : undefined;
      const feedback = row.current_result_id
        ? await transaction.selectFrom('resident_feedback').select(['feedback_id', 'type'])
          .where('result_id', '=', row.current_result_id).executeTakeFirst()
        : undefined;
      const clarification = row.current_result_id && feedback?.feedback_id
        ? await transaction.selectFrom('comment').select('comment_id')
          .where('case_id', '=', caseId).where('comment_kind', '=', 'CLARIFICATION_REQUEST')
          .where('context_result_id', '=', row.current_result_id)
          .where('context_feedback_id', '=', feedback.feedback_id)
          .orderBy('created_at', 'desc').executeTakeFirst()
        : undefined;
      const noFeedback = row.current_result_id
        ? await transaction.selectFrom('case_event').select('event_id')
          .where('case_id', '=', caseId).where('result_id', '=', row.current_result_id)
          .where('event_type', '=', 'EVT_015').executeTakeFirst()
        : undefined;
      return {
        case_id: row.case_id, organization_id: row.organization_id, house_id: row.house_id,
        premises_id: row.premises_id, resident_user_id: row.resident_user_id,
        demo_run_id: row.demo_run_id, current_state: row.current_state,
        current_iteration_id: row.current_iteration_id, current_selection_id: row.current_selection_id,
        current_assignment_id: row.current_assignment_id,
        current_assignment_contractor_id: assignment?.contractor_id ?? null,
        current_assignment_decision: assignment?.decision_status ?? null,
        current_executor_contractor_id: row.current_executor_contractor_id,
        current_result_id: row.current_result_id, current_feedback_id: feedback?.feedback_id ?? null,
        current_feedback_type: feedback?.type ?? null,
        current_clarification_request_id: clarification?.comment_id ?? null,
        no_resident_feedback_recorded: Boolean(noFeedback),
      };
    },
    async attachmentById(attachmentId): Promise<AttachmentContext | null> {
      const attachment = await transaction.selectFrom('attachment').select('case_id')
        .where('attachment_id', '=', attachmentId).executeTakeFirst();
      if (!attachment) return null;
      const initial = await transaction.selectFrom('case_initial_attachment').select('attachment_id')
        .where('attachment_id', '=', attachmentId).executeTakeFirst();
      if (initial) return { attachment_id: attachmentId, case_id: attachment.case_id, kind: 'INITIAL', assignment_id: null, iteration_id: null };
      const work = await transaction.selectFrom('work_material_attachment').select(['assignment_id', 'iteration_id'])
        .where('attachment_id', '=', attachmentId).executeTakeFirst();
      if (work) return { attachment_id: attachmentId, case_id: attachment.case_id, kind: 'WORK_MATERIAL', assignment_id: work.assignment_id, iteration_id: work.iteration_id };
      const result = await transaction.selectFrom('result_attachment').innerJoin('result', 'result.result_id', 'result_attachment.result_id')
        .select(['result.assignment_id', 'result.iteration_id'])
        .where('result_attachment.attachment_id', '=', attachmentId).executeTakeFirst();
      if (result) return { attachment_id: attachmentId, case_id: attachment.case_id, kind: 'RESULT', assignment_id: result.assignment_id, iteration_id: result.iteration_id };
      const comment = await transaction.selectFrom('comment_attachment').select('attachment_id')
        .where('attachment_id', '=', attachmentId).executeTakeFirst();
      return comment ? { attachment_id: attachmentId, case_id: attachment.case_id, kind: 'COMMENT', assignment_id: null, iteration_id: null } : null;
    },
  };
}

/** Signed TG-010 session and TG-011 policy for the kernel's mandatory authorization phase. */
export function createCommandAuthorization(token: string, config: RuntimeConfig, nowSeconds = Math.floor(Date.now() / 1000)) {
  const claims = verifySession(token, config, nowSeconds);
  return {
    authenticate(): CommandPrincipal {
      if (!claims.app_user_id) throw new Error('EFFECTIVE_ACTOR_REQUIRED');
      return { type: 'APP_USER', appUserId: claims.app_user_id };
    },
    async authorize(input: CommandAuthorizationInput<CommandAuthorizationContext>): Promise<void> {
      const policy = new AuthorizationPolicy(createTransactionAuthorizationRepository(input.transaction));
      const context = input.target.authorizationContext;
      if (context.kind === 'CREATE_CASE') {
        await policy.createCase(claims, context.premisesId);
      } else if (context.kind === 'CONFIGURATION') {
        await policy.configuration(claims, context.organizationId);
      } else if (context.kind === 'CASE_VISIBILITY' && input.target.caseId) {
        if (input.phase !== 'REPLAY_STORED') throw new Error('CASE_VISIBILITY_ONLY_FOR_STORED_CREATE_REPLAY');
        await policy.case(claims, input.target.caseId);
      } else if (context.kind === 'CASE' && input.target.caseId) {
        if (input.phase === 'NEW') await policy.command(claims, input.target.caseId, context.action);
        else await policy.replay(claims, input.target.caseId, context.action, context.targetAssignmentId);
      } else {
        throw new Error('COMMAND_AUTHORIZATION_TARGET_INVALID');
      }
    },
  };
}
