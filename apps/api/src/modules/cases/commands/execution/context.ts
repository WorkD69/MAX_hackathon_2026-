import type { DatabaseTransaction, LockedCase } from '@max-smart-city/db';
import type { Actor, DomainSnapshot, RejectionCode } from '@max-smart-city/domain';
import { AuthorizationError, AuthorizationPolicy } from '../../../authorization/policy.js';
import { createTransactionAuthorizationRepository } from '../../../commands/kernel/authorization.js';
import type { SessionClaims } from '../../../auth/session-token.js';
import { IntakeError } from '../intake-assignment/options.js';

export const commandError = (code: RejectionCode): never => {
  if (code === 'INVALID_ACTOR') throw new AuthorizationError('FORBIDDEN');
  if (code === 'TERMINAL') throw new IntakeError('TERMINAL_CASE', 409);
  if (code === 'STALE_CLARIFICATION') throw new IntakeError('CLARIFICATION_CONTEXT_REQUIRED', 409);
  if (code === 'STALE_COMPLETION_BASIS') throw new IntakeError('COMPLETION_BASIS_INVALID', 409);
  if (code === 'STALE_FEEDBACK') throw new IntakeError('STALE_RESULT', 409);
  if (code === 'BUSINESS_INPUT') throw new IntakeError('VALIDATION_FAILED', 422);
  if (code === 'INVARIANT') throw new IntakeError('INVALID_STATE', 409);
  if (code === 'INVALID_SNAPSHOT' || code === 'INVALID_COMMAND') throw new IntakeError('INTERNAL_ERROR', 500);
  throw new IntakeError(code, 409);
};

export async function executionSnapshot(tx: DatabaseTransaction, row: LockedCase): Promise<DomainSnapshot> {
  const iteration = await tx.selectFrom('case_iteration').selectAll().where('iteration_id','=',row.current_iteration_id).executeTakeFirstOrThrow();
  const selection = row.current_selection_id ? await tx.selectFrom('contractor_selection').selectAll().where('selection_id','=',row.current_selection_id).executeTakeFirstOrThrow() : null;
  const assignment = row.current_assignment_id ? await tx.selectFrom('assignment').selectAll().where('assignment_id','=',row.current_assignment_id).executeTakeFirstOrThrow() : null;
  const result = row.current_result_id ? await tx.selectFrom('result').selectAll().where('result_id','=',row.current_result_id).executeTakeFirstOrThrow() : null;
  const feedback = result ? await tx.selectFrom('resident_feedback').selectAll().where('result_id','=',result.result_id).executeTakeFirst() : null;
  const noFeedback = result ? await tx.selectFrom('case_event').selectAll().where('result_id','=',result.result_id).where('event_type','=','EVT_015').executeTakeFirst() : null;
  const comments = await tx.selectFrom('comment').selectAll().where('case_id','=',row.case_id).execute();
  const materials = await tx.selectFrom('work_material_attachment as w')
    .innerJoin('attachment as a','a.attachment_id','w.attachment_id')
    .innerJoin('assignment as task','task.assignment_id','w.assignment_id')
    .select(['w.attachment_id','w.assignment_id','w.iteration_id','a.mime_type','task.contractor_id'])
    .where('w.case_id','=',row.case_id).execute();
  return {
    caseId: row.case_id, residentId: row.resident_user_id, organizationId: row.organization_id,
    state: row.current_state, iteration: {id:iteration.iteration_id,number:iteration.iteration_no},
    resultRequirement: row.result_requirement_snapshot,
    selection: selection ? {id:selection.selection_id,contractorId:selection.contractor_id,iterationId:selection.created_iteration_id}:null,
    assignment: assignment && assignment.decision_status !== 'REJECTED' ? {id:assignment.assignment_id,selectionId:assignment.selection_id,contractorId:assignment.contractor_id,decision:assignment.decision_status}:null,
    executorId: row.current_executor_contractor_id,
    result: result ? {id:result.result_id,iterationId:result.iteration_id,assignmentId:result.assignment_id}:null,
    feedback: feedback ? {id:feedback.feedback_id,resultId:feedback.result_id,iterationId:feedback.iteration_id,type:feedback.type}:null,
    noFeedback: noFeedback ? {eventId:noFeedback.event_id,resultId:noFeedback.result_id!}:null,
    clarifications: comments.filter(c => c.comment_kind === 'CLARIFICATION_REQUEST' &&
      !comments.some(reply => reply.comment_kind === 'CLARIFICATION_REPLY' && reply.in_reply_to_comment_id === c.comment_id))
      .map(c=>({id:c.comment_id,resultId:c.context_result_id!,feedbackId:c.context_feedback_id!,iterationId:c.iteration_id,visibleToResident:true})),
    materials: materials.map(m=>({id:m.attachment_id,assignmentId:m.assignment_id,iterationId:m.iteration_id,contractorId:m.contractor_id,
      kind:row.result_requirement_snapshot!=='FILE'&&m.mime_type.startsWith('image/')?'PHOTO':'FILE'})),
  };
}

/** Lock config before actor/access, then re-read TG011 authority after every possible writer wait. */
export async function lockExecutionAuthority(tx: DatabaseTransaction, row: LockedCase, claims: SessionClaims): Promise<Actor> {
  await tx.selectFrom('organization').select('organization_id').where('organization_id','=',row.organization_id).forShare().execute();
  await tx.selectFrom('house').select('house_id').where('house_id','=',row.house_id).forShare().execute();
  await tx.selectFrom('premises').select('premises_id').where('premises_id','=',row.premises_id).forShare().execute();
  const binding = await tx.selectFrom('user_role_binding').selectAll().where('role_binding_id','=',claims.role_binding_id).executeTakeFirst();
  if (binding?.contractor_id) {
    await tx.selectFrom('contractor').select('contractor_id').where('contractor_id','=',binding.contractor_id).forShare().execute();
    await tx.selectFrom('organization_contractor').select('contractor_id').where('organization_id','=',row.organization_id).where('contractor_id','=',binding.contractor_id).forShare().execute();
  }
  await tx.selectFrom('app_user').select('app_user_id').where('app_user_id','=',claims.app_user_id).forShare().execute();
  await tx.selectFrom('user_role_binding').select('role_binding_id').where('role_binding_id','=',claims.role_binding_id).forShare().execute();
  if (claims.role === 'RESIDENT') await tx.selectFrom('resident_premises_access').select('active').where('app_user_id','=',claims.app_user_id).where('premises_id','=',row.premises_id).forShare().execute();
  if (claims.role === 'UK_EMPLOYEE') await tx.selectFrom('uk_house_access').select('active').where('app_user_id','=',claims.app_user_id).where('house_id','=',row.house_id).forShare().execute();
  if (claims.demo_run_id) await tx.selectFrom('demo_run').select('status').where('demo_run_id','=',claims.demo_run_id).forShare().execute();
  const decision = await new AuthorizationPolicy(createTransactionAuthorizationRepository(tx)).case(claims,row.case_id);
  if (decision.principal.binding.role === 'RESIDENT') return {role:'RESIDENT',userId:decision.principal.app_user_id};
  if (decision.principal.binding.role === 'CONTRACTOR_EMPLOYEE') return {role:'CONTRACTOR_EMPLOYEE',contractorId:decision.principal.binding.contractor_id!};
  return {role:decision.principal.binding.role,organizationId:row.organization_id};
}
