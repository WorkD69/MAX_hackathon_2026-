import { DOMAIN_STATES } from './model.js';
import type {
  Actor, CaseState, DomainCommand, DomainFact, DomainPlan, DomainSnapshot, DomainValidation,
  EventCode, EventPlan, ProjectionPlan, RejectionCode, RejectionReason, TransitionId,
} from './model.js';

const states: ReadonlySet<string> = new Set(DOMAIN_STATES);
const filled = (s: string): boolean => s.trim().length > 0;
const fail = (code: RejectionCode): DomainValidation => {
  const reason: RejectionReason =
    code === 'TERMINAL' ? 'TERMINAL' :
    code === 'INVALID_ACTOR' ? 'ACTOR' :
    code === 'INVALID_STATE' || code === 'INVALID_SNAPSHOT' || code === 'INVALID_COMMAND' ? 'STATE' :
    code.startsWith('STALE_') ? 'STALE_TARGET' :
    code === 'BUSINESS_INPUT' ? 'BUSINESS_INPUT' : 'INVARIANT';
  return { ok: false, reason, code };
};
const evt = (code: EventCode, iterationNo: number, target?: EventPlan['target']): EventPlan =>
  target ? { code, iterationNo, target } : { code, iterationNo };
const ok = (
  s: DomainSnapshot | null, transition: TransitionId, nextState: CaseState,
  patch: Omit<ProjectionPlan, 'state'>, facts: readonly DomainFact[], events: readonly EventPlan[],
): DomainValidation => {
  const plan: DomainPlan = {
    transition, fromState: s?.state ?? null, nextState,
    caseIdentity: s ? { kind: 'EXISTING', id: s.caseId } : { kind: 'NEW' },
    projection: { state: nextState, ...patch }, facts, events,
  };
  return { ok: true, plan };
};
const uk = (s: DomainSnapshot, a: Actor): boolean =>
  (a.role === 'UK_EMPLOYEE' || a.role === 'UK_ADMIN') && a.organizationId === s.organizationId;
const resident = (s: DomainSnapshot, a: Actor): boolean =>
  a.role === 'RESIDENT' && a.userId === s.residentId;
const executor = (s: DomainSnapshot, a: Actor): boolean =>
  a.role === 'CONTRACTOR_EMPLOYEE' && s.executorId === a.contractorId
  && s.assignment?.decision === 'ACCEPTED' && s.assignment.contractorId === a.contractorId;
const oneOf = (s: DomainSnapshot, allowed: readonly CaseState[]): boolean => allowed.includes(s.state);
const targetIteration = (s: DomainSnapshot, id: string): RejectionCode | null =>
  id === s.iteration.id ? null : 'STALE_ITERATION';
const targetResult = (s: DomainSnapshot, id: string): RejectionCode | null =>
  s.result?.id === id && s.result.iterationId === s.iteration.id ? null : 'STALE_RESULT';
const targetRemark = (s: DomainSnapshot, resultId: string, feedbackId: string): RejectionCode | null => {
  if (targetResult(s, resultId)) return 'STALE_RESULT';
  return s.feedback?.id === feedbackId && s.feedback.resultId === resultId
    && s.feedback.iterationId === s.iteration.id && s.feedback.type === 'REMARK'
    ? null : 'STALE_FEEDBACK';
};
const targetExecutor = (s: DomainSnapshot, a: Actor, assignmentId: string, iterationId: string): RejectionCode | null => {
  if (targetIteration(s, iterationId)) return 'STALE_ITERATION';
  if (s.assignment?.id !== assignmentId || s.assignment.decision !== 'ACCEPTED') return 'STALE_ASSIGNMENT';
  return executor(s, a) ? null : 'INVALID_ACTOR';
};

function consistent(s: DomainSnapshot): boolean {
  if (!states.has(s.state) || !Number.isSafeInteger(s.iteration.number) || s.iteration.number < 1
    || !['NONE', 'PHOTO', 'FILE'].includes(s.resultRequirement)) return false;
  if (s.selection && s.selection.iterationId !== s.iteration.id) return false;
  if (s.assignment) {
    if (s.assignment.decision === 'ACCEPTED' && s.executorId !== s.assignment.contractorId) return false;
    if (s.assignment.decision === 'PENDING' && s.executorId !== null) return false;
  } else if (s.executorId !== null) return false;
  if (s.result && (s.result.iterationId !== s.iteration.id || s.result.assignmentId !== s.assignment?.id)) return false;
  if (s.feedback && (s.feedback.resultId !== s.result?.id || s.feedback.iterationId !== s.iteration.id)) return false;
  if (s.noFeedback && s.noFeedback.resultId !== s.result?.id) return false;
  switch (s.state) {
    case 'CREATED':
      return !s.selection && !s.assignment && !s.result && !s.feedback;
    case 'ACCEPTED_BY_UK':
      return !s.assignment && !s.executorId && !s.result && !s.feedback;
    case 'SENT_TO_CONTRACTOR':
      return !!s.selection && s.assignment?.decision === 'PENDING'
        && s.assignment.selectionId === s.selection.id
        && s.assignment.contractorId === s.selection.contractorId && !s.result && !s.feedback;
    case 'EXECUTION':
      return s.assignment?.decision === 'ACCEPTED' && !s.result && !s.feedback;
    case 'AWAITING_RESULT_CHECK':
      return s.assignment?.decision === 'ACCEPTED' && !!s.result
        && (!s.feedback || s.feedback.type === 'CONFIRMATION');
    case 'REMARKS_REVIEW':
      return s.assignment?.decision === 'ACCEPTED' && !!s.result && s.feedback?.type === 'REMARK';
    case 'REWORK':
      return !s.result && !s.feedback && (s.assignment?.decision === 'ACCEPTED'
        || (!s.assignment && !s.executorId && !!s.selection));
    case 'COMPLETED':
      return !!s.result;
  }
}

/**
 * One deterministic validation against a caller-supplied current snapshot.
 * The backend must repeat it under its Case lock; this pure function does not serialize races.
 */
export function evaluateDomain(s: DomainSnapshot | null, a: Actor, c: DomainCommand): DomainValidation {
  if (s?.state === 'COMPLETED') return fail('TERMINAL');
  if (c.kind === 'CREATE_CASE') {
    if (s) return fail('INVALID_STATE');
    if (a.role !== 'RESIDENT') return fail('INVALID_ACTOR');
    if (!filled(c.description) || !filled(c.organizationId) || !filled(c.premisesId)
      || !filled(c.categoryId) || !c.premisesAvailable || !c.categoryActive
      || !['NONE', 'PHOTO', 'FILE'].includes(c.resultRequirement)) return fail('BUSINESS_INPUT');
    return ok(null, 'TR-001', 'CREATED', { iteration: { operation: 'CREATE', number: 1 } },
      [
        { kind: 'CASE', organizationId: c.organizationId, residentId: a.userId,
          premisesId: c.premisesId, categoryId: c.categoryId, description: c.description,
          resultRequirement: c.resultRequirement },
        { kind: 'ITERATION', number: 1, cause: 'CREATE_CASE' },
      ], [evt('EVT_001', 1)]);
  }
  if (!s) return fail('INVALID_STATE');
  if (!consistent(s)) return fail('INVALID_SNAPSHOT');
  const n = s.iteration.number;
  const iterationId = s.iteration.id;

  switch (c.kind) {
    case 'ACCEPT_CASE':
      if (!uk(s, a)) return fail('INVALID_ACTOR');
      if (s.state !== 'CREATED') return fail('INVALID_STATE');
      return ok(s, 'TR-002', 'ACCEPTED_BY_UK', {}, [{ kind: 'CASE_ACCEPTANCE' }], [evt('EVT_002', n)]);
    case 'SELECT_CONTRACTOR': {
      if (!uk(s, a)) return fail('INVALID_ACTOR');
      if (!oneOf(s, ['ACCEPTED_BY_UK', 'REWORK'])) return fail('INVALID_STATE');
      if (targetIteration(s, c.iterationId)) return fail('STALE_ITERATION');
      if (!filled(c.contractorId) || !c.contractorAvailable) return fail('BUSINESS_INPUT');
      if (s.state === 'REWORK' && s.executorId === c.contractorId) return fail('INVARIANT');
      const reassignment = s.state === 'REWORK';
      return ok(s, reassignment ? 'TR-018' : 'TR-003', s.state,
        {
          selection: { operation: 'CREATE', contractorId: c.contractorId, iterationId },
          ...(reassignment ? { assignment: { operation: 'CLEAR' as const }, executor: { operation: 'CLEAR' as const } } : {}),
        },
        [{ kind: 'SELECTION', contractorId: c.contractorId, iterationId }], [evt('EVT_003', n)]);
    }
    case 'SEND_ASSIGNMENT': {
      if (!uk(s, a)) return fail('INVALID_ACTOR');
      if (!oneOf(s, ['ACCEPTED_BY_UK', 'REWORK'])) return fail('INVALID_STATE');
      if (targetIteration(s, c.iterationId)) return fail('STALE_ITERATION');
      if (s.selection?.id !== c.selectionId || s.selection.iterationId !== iterationId) return fail('STALE_SELECTION');
      if (!c.contractorAvailable) return fail('BUSINESS_INPUT');
      if (s.state === 'REWORK' && s.assignment) return fail('INVARIANT');
      return ok(s, s.state === 'REWORK' ? 'TR-019' : 'TR-004', 'SENT_TO_CONTRACTOR',
        { assignment: { operation: 'CREATE', selectionId: c.selectionId, contractorId: s.selection.contractorId } },
        [{ kind: 'ASSIGNMENT', selectionId: c.selectionId, contractorId: s.selection.contractorId, iterationId }],
        [evt('EVT_004', n, { selectionId: c.selectionId })]);
    }
    case 'ACCEPT_ASSIGNMENT':
    case 'REJECT_ASSIGNMENT': {
      if (a.role !== 'CONTRACTOR_EMPLOYEE') return fail('INVALID_ACTOR');
      if (s.state !== 'SENT_TO_CONTRACTOR') return fail('INVALID_STATE');
      if (s.assignment?.id !== c.assignmentId || s.assignment.decision !== 'PENDING') return fail('STALE_ASSIGNMENT');
      if (a.contractorId !== s.assignment.contractorId) return fail('INVALID_ACTOR');
      if (c.kind === 'ACCEPT_ASSIGNMENT')
        return ok(s, 'TR-005', 'EXECUTION',
          { assignment: { operation: 'DECIDE', decision: 'ACCEPTED' }, executor: { operation: 'SET', contractorId: a.contractorId } },
          [{ kind: 'ASSIGNMENT_DECISION', assignmentId: c.assignmentId, decision: 'ACCEPTED' }],
          [evt('EVT_005', n, { assignmentId: c.assignmentId })]);
      if (!filled(c.reason)) return fail('BUSINESS_INPUT');
      return ok(s, 'TR-006', 'ACCEPTED_BY_UK',
        { selection: { operation: 'CLEAR' }, assignment: { operation: 'CLEAR' }, executor: { operation: 'CLEAR' } },
        [{ kind: 'ASSIGNMENT_DECISION', assignmentId: c.assignmentId, decision: 'REJECTED', reason: c.reason }],
        [evt('EVT_006', n, { assignmentId: c.assignmentId })]);
    }
    case 'ADD_RESULT_MATERIAL':
    case 'SUBMIT_RESULT': {
      if (a.role !== 'CONTRACTOR_EMPLOYEE') return fail('INVALID_ACTOR');
      if (!oneOf(s, ['EXECUTION', 'REWORK'])) return fail('INVALID_STATE');
      const target = targetExecutor(s, a, c.assignmentId, c.iterationId);
      if (target) return fail(target);
      if (c.kind === 'ADD_RESULT_MATERIAL') {
        if (!c.materialValidated || !['PHOTO', 'FILE'].includes(c.materialKind)) return fail('BUSINESS_INPUT');
        return ok(s, 'ADD_RESULT_MATERIAL', s.state, {},
          [{ kind: 'MATERIAL', assignmentId: c.assignmentId, iterationId, materialKind: c.materialKind }],
          [evt('EVT_009', n, { assignmentId: c.assignmentId })]);
      }
      if (!filled(c.description) || s.result) return fail('BUSINESS_INPUT');
      if (new Set(c.materialAttachmentIds).size !== c.materialAttachmentIds.length) return fail('BUSINESS_INPUT');
      const material = c.materialAttachmentIds.map(id => s.materials.find(m => m.id === id));
      if (material.some(m => !m || m.assignmentId !== c.assignmentId || m.iterationId !== iterationId
        || m.contractorId !== a.contractorId)) return fail('STALE_ASSIGNMENT');
      if (s.resultRequirement !== 'NONE' && !material.some(m => m?.kind === s.resultRequirement)) return fail('BUSINESS_INPUT');
      return ok(s, s.state === 'REWORK' ? 'TR-017' : 'TR-007', 'AWAITING_RESULT_CHECK',
        { result: { operation: 'CREATE', assignmentId: c.assignmentId, iterationId } },
        [{ kind: 'RESULT', assignmentId: c.assignmentId, iterationId, description: c.description,
          materialAttachmentIds: [...c.materialAttachmentIds] }],
        [evt('EVT_008', n, { assignmentId: c.assignmentId })]);
    }
    case 'RESIDENT_CONFIRM':
    case 'RESIDENT_REMARK': {
      if (!resident(s, a)) return fail('INVALID_ACTOR');
      if (s.state !== 'AWAITING_RESULT_CHECK') return fail('INVALID_STATE');
      if (targetIteration(s, c.iterationId)) return fail('STALE_ITERATION');
      if (targetResult(s, c.resultId)) return fail('STALE_RESULT');
      if (s.feedback) return fail('INVARIANT');
      if (c.kind === 'RESIDENT_CONFIRM')
        return ok(s, 'TR-008', 'AWAITING_RESULT_CHECK',
          { feedback: { operation: 'CREATE', type: 'CONFIRMATION', resultId: c.resultId } },
          [{ kind: 'FEEDBACK', resultId: c.resultId, iterationId, type: 'CONFIRMATION' }],
          [evt('EVT_010', n, { resultId: c.resultId })]);
      if (!filled(c.remarkText)) return fail('BUSINESS_INPUT');
      return ok(s, 'TR-009', 'REMARKS_REVIEW',
        { feedback: { operation: 'CREATE', type: 'REMARK', resultId: c.resultId } },
        [{ kind: 'FEEDBACK', resultId: c.resultId, iterationId, type: 'REMARK', text: c.remarkText }],
        [evt('EVT_011', n, { resultId: c.resultId })]);
    }
    case 'RECORD_NO_FEEDBACK': {
      if (!uk(s, a)) return fail('INVALID_ACTOR');
      if (s.state !== 'AWAITING_RESULT_CHECK') return fail('INVALID_STATE');
      if (targetIteration(s, c.iterationId)) return fail('STALE_ITERATION');
      if (targetResult(s, c.resultId)) return fail('STALE_RESULT');
      if (s.feedback || s.noFeedback) return fail('INVARIANT');
      if (!c.basisConfirmed || !filled(c.basisNote)) return fail('BUSINESS_INPUT');
      return ok(s, 'TR-010', 'AWAITING_RESULT_CHECK',
        { noFeedback: { operation: 'CREATE', resultId: c.resultId } },
        [{ kind: 'NO_FEEDBACK', resultId: c.resultId, basisNote: c.basisNote }],
        [evt('EVT_015', n, { resultId: c.resultId })]);
    }
    case 'COMPLETE_CASE': {
      if (!uk(s, a)) return fail('INVALID_ACTOR');
      if (s.state !== 'AWAITING_RESULT_CHECK') return fail('INVALID_STATE');
      if (targetResult(s, c.resultId)) return fail('STALE_RESULT');
      if (c.basis.type === 'RESIDENT_CONFIRMATION') {
        if (s.feedback?.id !== c.basis.feedbackId || s.feedback.resultId !== c.resultId
          || s.feedback.iterationId !== iterationId || s.feedback.type !== 'CONFIRMATION')
          return fail('STALE_COMPLETION_BASIS');
        return ok(s, 'TR-011', 'COMPLETED',
          { closure: { operation: 'SET', basis: 'RESIDENT_CONFIRMATION' } },
          [{ kind: 'COMPLETION', basis: 'RESIDENT_CONFIRMATION', resultId: c.resultId, feedbackId: c.basis.feedbackId }],
          [evt('EVT_016', n, { resultId: c.resultId, feedbackId: c.basis.feedbackId })]);
      }
      if (c.basis.type === 'NO_RESIDENT_FEEDBACK') {
        if (!c.basis.completionBasis.confirmed || !filled(c.basis.completionBasis.processReference))
          return fail('BUSINESS_INPUT');
        if (s.feedback || s.noFeedback?.eventId !== c.basis.eventId || s.noFeedback.resultId !== c.resultId)
          return fail('STALE_COMPLETION_BASIS');
        return ok(s, 'TR-012', 'COMPLETED',
          { closure: { operation: 'SET', basis: 'NO_RESIDENT_FEEDBACK' } },
          [{ kind: 'COMPLETION', basis: 'NO_RESIDENT_FEEDBACK', resultId: c.resultId,
            noFeedbackEventId: c.basis.eventId, processReference: c.basis.completionBasis.processReference }],
          [evt('EVT_016', n, { resultId: c.resultId })]);
      }
      return fail('INVALID_COMMAND');
    }
    case 'REQUEST_CLARIFICATION':
    case 'RETURN_TO_REWORK':
    case 'COMPLETE_WITH_EXPLANATION': {
      if (!uk(s, a)) return fail('INVALID_ACTOR');
      if (s.state !== 'REMARKS_REVIEW') return fail('INVALID_STATE');
      const target = targetRemark(s, c.resultId, c.feedbackId);
      if (target) return fail(target);
      if (c.kind === 'REQUEST_CLARIFICATION') {
        if (!filled(c.message)) return fail('BUSINESS_INPUT');
        return ok(s, 'TR-013', 'REMARKS_REVIEW', {},
          [{ kind: 'COMMENT', body: c.message, attachmentIds: [], iterationId,
            contextResultId: c.resultId, contextFeedbackId: c.feedbackId, clarificationRequest: true }],
          [evt('EVT_012', n, { resultId: c.resultId, feedbackId: c.feedbackId })]);
      }
      if (c.kind === 'RETURN_TO_REWORK') {
        if (s.assignment?.decision !== 'ACCEPTED' || !s.executorId || !Number.isSafeInteger(n + 1))
          return fail('INVARIANT');
        return ok(s, 'TR-015', 'REWORK',
          { iteration: { operation: 'CREATE', number: n + 1 }, selection: { operation: 'CLEAR' },
            result: { operation: 'CLEAR' }, feedback: { operation: 'CLEAR' }, noFeedback: { operation: 'CLEAR' } },
          [{ kind: 'REWORK_DECISION', resultId: c.resultId, feedbackId: c.feedbackId, iterationNo: n },
            { kind: 'ITERATION', number: n + 1, cause: 'RETURN_TO_REWORK' }],
          [evt('EVT_013', n, { resultId: c.resultId, feedbackId: c.feedbackId }),
            evt('EVT_014', n + 1, { resultId: c.resultId, feedbackId: c.feedbackId })]);
      }
      if (!filled(c.explanation)) return fail('BUSINESS_INPUT');
      return ok(s, 'TR-016', 'COMPLETED',
        { closure: { operation: 'SET', basis: 'DISPUTED_WITH_EXPLANATION' } },
        [{ kind: 'COMPLETION', basis: 'DISPUTED_WITH_EXPLANATION', resultId: c.resultId,
          feedbackId: c.feedbackId, explanation: c.explanation }],
        [evt('EVT_017', n, { resultId: c.resultId, feedbackId: c.feedbackId })]);
    }
    case 'ADD_COMMENT': {
      if (!filled(c.body) && c.attachmentIds.length === 0) return fail('BUSINESS_INPUT');
      if (new Set(c.attachmentIds).size !== c.attachmentIds.length) return fail('BUSINESS_INPUT');
      if (a.role === 'RESIDENT') {
        if (!resident(s, a)) return fail('INVALID_ACTOR');
        if (s.state === 'REMARKS_REVIEW') {
          const request = s.clarifications.find(item => item.id === c.clarificationRequestId);
          if (!request || !request.visibleToResident || request.resultId !== s.result?.id
            || request.feedbackId !== s.feedback?.id || request.iterationId !== iterationId)
            return fail('STALE_CLARIFICATION');
          return ok(s, 'TR-014', s.state, {},
            [{ kind: 'COMMENT', body: c.body, attachmentIds: [...c.attachmentIds], iterationId,
              contextResultId: request.resultId, contextFeedbackId: request.feedbackId,
              inReplyToClarificationId: request.id, clarificationRequest: false }],
            [evt('EVT_007', n, { resultId: request.resultId, feedbackId: request.feedbackId,
              clarificationId: request.id })]);
        }
        if (!oneOf(s, ['EXECUTION', 'REWORK']) || c.clarificationRequestId) return fail('INVALID_STATE');
        return ok(s, 'TR-020', s.state, {},
          [{ kind: 'COMMENT', body: c.body, attachmentIds: [...c.attachmentIds], iterationId, clarificationRequest: false }],
          [evt('EVT_007', n)]);
      }
      if (a.role === 'CONTRACTOR_EMPLOYEE') {
        if (!oneOf(s, ['EXECUTION', 'REWORK'])) return fail('INVALID_STATE');
        if (!executor(s, a)) return fail('INVALID_ACTOR');
        if (c.clarificationRequestId) return fail('STALE_CLARIFICATION');
        return ok(s, 'TR-022', s.state, {},
          [{ kind: 'COMMENT', body: c.body, attachmentIds: [...c.attachmentIds], iterationId, clarificationRequest: false }],
          [evt('EVT_007', n)]);
      }
      if (!uk(s, a)) return fail('INVALID_ACTOR');
      if (s.state === 'CREATED') return fail('INVALID_STATE');
      if (c.clarificationRequestId) return fail('STALE_CLARIFICATION');
      return ok(s, 'TR-021', s.state, {},
        [{ kind: 'COMMENT', body: c.body, attachmentIds: [...c.attachmentIds], iterationId, clarificationRequest: false }],
        [evt('EVT_007', n)]);
    }
  }
  return fail('INVALID_COMMAND');
}
