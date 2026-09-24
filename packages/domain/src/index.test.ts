import { DOMAIN_STATES, evaluateDomain } from './index.js';
import type { Actor, CaseState, DomainCommand, DomainSnapshot, EventCode } from './index.js';
import { describe, expect, test } from 'vitest';

const resident: Actor = { role: 'RESIDENT', userId: 'resident' };
const uk: Actor = { role: 'UK_EMPLOYEE', organizationId: 'uk' };
const admin: Actor = { role: 'UK_ADMIN', organizationId: 'uk' };
const contractor: Actor = { role: 'CONTRACTOR_EMPLOYEE', contractorId: 'contractor-a' };
const otherContractor: Actor = { role: 'CONTRACTOR_EMPLOYEE', contractorId: 'contractor-b' };
const base = (state: CaseState): DomainSnapshot => ({
  caseId: 'case', residentId: 'resident', organizationId: 'uk', state,
  iteration: { id: 'iteration-1', number: 1 }, resultRequirement: 'PHOTO',
  selection: null, assignment: null, executorId: null, result: null, feedback: null,
  noFeedback: null, clarifications: [], materials: [],
});
const selected = (): DomainSnapshot => ({
  ...base('ACCEPTED_BY_UK'),
  selection: { id: 'selection-1', contractorId: 'contractor-a', iterationId: 'iteration-1' },
});
const sent = (): DomainSnapshot => ({
  ...selected(), state: 'SENT_TO_CONTRACTOR',
  assignment: { id: 'assignment-1', selectionId: 'selection-1', contractorId: 'contractor-a', decision: 'PENDING' },
});
const execution = (): DomainSnapshot => ({
  ...sent(), state: 'EXECUTION',
  assignment: { id: 'assignment-1', selectionId: 'selection-1', contractorId: 'contractor-a', decision: 'ACCEPTED' },
  executorId: 'contractor-a',
});
const awaiting = (): DomainSnapshot => ({
  ...execution(), state: 'AWAITING_RESULT_CHECK',
  result: { id: 'result-1', iterationId: 'iteration-1', assignmentId: 'assignment-1' },
});
const confirmation = (): DomainSnapshot => ({
  ...awaiting(),
  feedback: { id: 'feedback-1', resultId: 'result-1', iterationId: 'iteration-1', type: 'CONFIRMATION' },
});
const remark = (): DomainSnapshot => ({
  ...awaiting(), state: 'REMARKS_REVIEW',
  feedback: { id: 'feedback-1', resultId: 'result-1', iterationId: 'iteration-1', type: 'REMARK' },
});
const rework = (): DomainSnapshot => ({
  ...execution(), state: 'REWORK', iteration: { id: 'iteration-2', number: 2 },
  selection: null,
});
const noFeedback = (): DomainSnapshot => ({
  ...awaiting(), noFeedback: { eventId: 'event-15', resultId: 'result-1' },
});
const material = {
  id: 'photo-1', assignmentId: 'assignment-1', iterationId: 'iteration-1',
  contractorId: 'contractor-a', kind: 'PHOTO' as const,
};
const create: DomainCommand = {
  kind: 'CREATE_CASE', organizationId: 'uk', premisesId: 'premises', categoryId: 'category',
  description: 'Протечка', resultRequirement: 'PHOTO', premisesAvailable: true, categoryActive: true,
};
const select: DomainCommand = { kind: 'SELECT_CONTRACTOR', iterationId: 'iteration-1', contractorId: 'contractor-a', contractorAvailable: true };
const send: DomainCommand = { kind: 'SEND_ASSIGNMENT', iterationId: 'iteration-1', selectionId: 'selection-1', contractorAvailable: true };
const accept: DomainCommand = { kind: 'ACCEPT_ASSIGNMENT', assignmentId: 'assignment-1' };
const reject: DomainCommand = { kind: 'REJECT_ASSIGNMENT', assignmentId: 'assignment-1', reason: 'Нет бригады' };
const submit: DomainCommand = { kind: 'SUBMIT_RESULT', assignmentId: 'assignment-1', iterationId: 'iteration-1', description: 'Починили', materialAttachmentIds: ['photo-1'] };
const confirm: DomainCommand = { kind: 'RESIDENT_CONFIRM', resultId: 'result-1', iterationId: 'iteration-1' };
const residentRemark: DomainCommand = { kind: 'RESIDENT_REMARK', resultId: 'result-1', iterationId: 'iteration-1', remarkText: 'Снова течёт' };
const recordNoFeedback: DomainCommand = { kind: 'RECORD_NO_FEEDBACK', resultId: 'result-1', iterationId: 'iteration-1', basisConfirmed: true, basisNote: 'Процесс УК' };
const completeConfirmation: DomainCommand = { kind: 'COMPLETE_CASE', resultId: 'result-1', basis: { type: 'RESIDENT_CONFIRMATION', feedbackId: 'feedback-1' } };
const completeNoFeedback: DomainCommand = { kind: 'COMPLETE_CASE', resultId: 'result-1', basis: { type: 'NO_RESIDENT_FEEDBACK', eventId: 'event-15', completionBasis: { confirmed: true, processReference: 'Процесс УК' } } };
const clarification: DomainCommand = { kind: 'REQUEST_CLARIFICATION', resultId: 'result-1', feedbackId: 'feedback-1', message: 'Уточните место' };
const reworkCommand: DomainCommand = { kind: 'RETURN_TO_REWORK', resultId: 'result-1', feedbackId: 'feedback-1' };
const disputed: DomainCommand = { kind: 'COMPLETE_WITH_EXPLANATION', resultId: 'result-1', feedbackId: 'feedback-1', explanation: 'Проверили на месте' };
const comment: DomainCommand = { kind: 'ADD_COMMENT', body: 'Сведения', attachmentIds: [], clarificationRequestId: null };
const valid = (s: DomainSnapshot | null, a: Actor, c: DomainCommand) => {
  const result = evaluateDomain(s, a, c);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result.plan;
};
const rejected = (s: DomainSnapshot | null, a: Actor, c: DomainCommand, code?: string) => {
  const result = evaluateDomain(s, a, c);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('plan');
  if (code) expect(result).toHaveProperty('code', code);
};

const transitions: readonly [string, DomainSnapshot | null, Actor, DomainCommand, CaseState, readonly EventCode[]][] = [
  ['TR-001', null, resident, create, 'CREATED', ['EVT_001']],
  ['TR-002', base('CREATED'), uk, { kind: 'ACCEPT_CASE' }, 'ACCEPTED_BY_UK', ['EVT_002']],
  ['TR-003', base('ACCEPTED_BY_UK'), uk, select, 'ACCEPTED_BY_UK', ['EVT_003']],
  ['TR-004', selected(), uk, send, 'SENT_TO_CONTRACTOR', ['EVT_004']],
  ['TR-005', sent(), contractor, accept, 'EXECUTION', ['EVT_005']],
  ['TR-006', sent(), contractor, reject, 'ACCEPTED_BY_UK', ['EVT_006']],
  ['TR-007', { ...execution(), materials: [material] }, contractor, submit, 'AWAITING_RESULT_CHECK', ['EVT_008']],
  ['TR-008', awaiting(), resident, confirm, 'AWAITING_RESULT_CHECK', ['EVT_010']],
  ['TR-009', awaiting(), resident, residentRemark, 'REMARKS_REVIEW', ['EVT_011']],
  ['TR-010', awaiting(), uk, recordNoFeedback, 'AWAITING_RESULT_CHECK', ['EVT_015']],
  ['TR-011', confirmation(), uk, completeConfirmation, 'COMPLETED', ['EVT_016']],
  ['TR-012', noFeedback(), uk, completeNoFeedback, 'COMPLETED', ['EVT_016']],
  ['TR-013', remark(), uk, clarification, 'REMARKS_REVIEW', ['EVT_012']],
  ['TR-014', { ...remark(), clarifications: [{ id: 'clarification-1', resultId: 'result-1', feedbackId: 'feedback-1', iterationId: 'iteration-1', visibleToResident: true }] }, resident,
    { ...comment, clarificationRequestId: 'clarification-1' }, 'REMARKS_REVIEW', ['EVT_007']],
  ['TR-015', remark(), uk, reworkCommand, 'REWORK', ['EVT_013', 'EVT_014']],
  ['TR-016', remark(), uk, disputed, 'COMPLETED', ['EVT_017']],
  ['TR-017', { ...rework(), materials: [{ ...material, id: 'photo-2', iterationId: 'iteration-2' }] }, contractor,
    { ...submit, iterationId: 'iteration-2', materialAttachmentIds: ['photo-2'] }, 'AWAITING_RESULT_CHECK', ['EVT_008']],
  ['TR-018', rework(), uk, { ...select, iterationId: 'iteration-2', contractorId: 'contractor-b' }, 'REWORK', ['EVT_003']],
  ['TR-019', { ...rework(), selection: { id: 'selection-2', contractorId: 'contractor-b', iterationId: 'iteration-2' }, assignment: null, executorId: null }, uk,
    { ...send, iterationId: 'iteration-2', selectionId: 'selection-2' }, 'SENT_TO_CONTRACTOR', ['EVT_004']],
  ['TR-020', execution(), resident, comment, 'EXECUTION', ['EVT_007']],
  ['TR-021', awaiting(), admin, comment, 'AWAITING_RESULT_CHECK', ['EVT_007']],
  ['TR-022', execution(), contractor, comment, 'EXECUTION', ['EVT_007']],
];
const projectionByTransition: Record<string, object> = {
  'TR-001': { iteration: { operation: 'CREATE', number: 1 } },
  'TR-002': { state: 'ACCEPTED_BY_UK' },
  'TR-003': { selection: { operation: 'CREATE', contractorId: 'contractor-a', iterationId: 'iteration-1' } },
  'TR-004': { assignment: { operation: 'CREATE', selectionId: 'selection-1', contractorId: 'contractor-a' } },
  'TR-005': { assignment: { operation: 'DECIDE', decision: 'ACCEPTED' }, executor: { operation: 'SET', contractorId: 'contractor-a' } },
  'TR-006': { selection: { operation: 'CLEAR' }, assignment: { operation: 'CLEAR' }, executor: { operation: 'CLEAR' } },
  'TR-007': { result: { operation: 'CREATE', assignmentId: 'assignment-1', iterationId: 'iteration-1' } },
  'TR-008': { feedback: { operation: 'CREATE', type: 'CONFIRMATION', resultId: 'result-1' } },
  'TR-009': { feedback: { operation: 'CREATE', type: 'REMARK', resultId: 'result-1' } },
  'TR-010': { noFeedback: { operation: 'CREATE', resultId: 'result-1' } },
  'TR-011': { closure: { operation: 'SET', basis: 'RESIDENT_CONFIRMATION' } },
  'TR-012': { closure: { operation: 'SET', basis: 'NO_RESIDENT_FEEDBACK' } },
  'TR-013': { state: 'REMARKS_REVIEW' },
  'TR-014': { state: 'REMARKS_REVIEW' },
  'TR-015': { iteration: { operation: 'CREATE', number: 2 }, result: { operation: 'CLEAR' }, feedback: { operation: 'CLEAR' } },
  'TR-016': { closure: { operation: 'SET', basis: 'DISPUTED_WITH_EXPLANATION' } },
  'TR-017': { result: { operation: 'CREATE', assignmentId: 'assignment-1', iterationId: 'iteration-2' } },
  'TR-018': { selection: { operation: 'CREATE', contractorId: 'contractor-b', iterationId: 'iteration-2' },
    assignment: { operation: 'CLEAR' }, executor: { operation: 'CLEAR' } },
  'TR-019': { assignment: { operation: 'CREATE', selectionId: 'selection-2', contractorId: 'contractor-b' } },
  'TR-020': { state: 'EXECUTION' },
  'TR-021': { state: 'AWAITING_RESULT_CHECK' },
  'TR-022': { state: 'EXECUTION' },
};
const factByTransition: Record<string, string> = {
  'TR-001': 'CASE', 'TR-002': 'CASE_ACCEPTANCE', 'TR-003': 'SELECTION',
  'TR-004': 'ASSIGNMENT', 'TR-005': 'ASSIGNMENT_DECISION', 'TR-006': 'ASSIGNMENT_DECISION',
  'TR-007': 'RESULT', 'TR-008': 'FEEDBACK', 'TR-009': 'FEEDBACK',
  'TR-010': 'NO_FEEDBACK', 'TR-011': 'COMPLETION', 'TR-012': 'COMPLETION',
  'TR-013': 'COMMENT', 'TR-014': 'COMMENT', 'TR-015': 'REWORK_DECISION',
  'TR-016': 'COMPLETION', 'TR-017': 'RESULT', 'TR-018': 'SELECTION',
  'TR-019': 'ASSIGNMENT', 'TR-020': 'COMMENT', 'TR-021': 'COMMENT', 'TR-022': 'COMMENT',
};
describe('closed TR-001…TR-022 table', () => {
  test.each(transitions)('%s', (id, snapshot, actor, command, nextState, events) => {
    const plan = valid(snapshot, actor, command);
    expect(plan.transition).toBe(id);
    expect(plan.nextState).toBe(nextState);
    expect(plan.projection.state).toBe(nextState);
    expect(plan.projection).toMatchObject(projectionByTransition[id]!);
    expect(plan.events.map(e => e.code)).toEqual(events);
    expect(plan.facts.length).toBeGreaterThan(0);
    expect(plan.facts[0]?.kind).toBe(factByTransition[id]);
  });
});

test('runtime state set is exactly eight and rejects a ninth state', () => {
  expect(DOMAIN_STATES).toEqual([
    'CREATED', 'ACCEPTED_BY_UK', 'SENT_TO_CONTRACTOR', 'EXECUTION',
    'AWAITING_RESULT_CHECK', 'REMARKS_REVIEW', 'REWORK', 'COMPLETED',
  ]);
  rejected({ ...execution(), state: 'NINTH_STATE' } as unknown as DomainSnapshot,
    contractor, comment, 'INVALID_SNAPSHOT');
});

test('terminal guard covers every process command family', () => {
  const terminal: DomainSnapshot = { ...confirmation(), state: 'COMPLETED' };
  for (const [, , actor, command] of transitions) rejected(terminal, actor, command, 'TERMINAL');
  rejected(terminal, contractor, {
    kind: 'ADD_RESULT_MATERIAL', assignmentId: 'assignment-1',
    iterationId: 'iteration-1', materialKind: 'PHOTO', materialValidated: true,
  }, 'TERMINAL');
});

const staleCases: readonly [string, DomainSnapshot, Actor, DomainCommand, string][] = [
  ['selection', selected(), uk, { ...send, selectionId: 'old-selection' }, 'STALE_SELECTION'],
  ['assignment accept', sent(), contractor, { ...accept, assignmentId: 'old-assignment' }, 'STALE_ASSIGNMENT'],
  ['assignment reject', sent(), contractor, { ...reject, assignmentId: 'old-assignment' }, 'STALE_ASSIGNMENT'],
  ['iteration submit', execution(), contractor, { ...submit, iterationId: 'old-iteration' }, 'STALE_ITERATION'],
  ['result confirm', awaiting(), resident, { ...confirm, resultId: 'old-result' }, 'STALE_RESULT'],
  ['feedback return', remark(), uk, { ...reworkCommand, feedbackId: 'old-feedback' }, 'STALE_FEEDBACK'],
  ['clarification reply', remark(), resident, { ...comment, clarificationRequestId: 'old-clarification' }, 'STALE_CLARIFICATION'],
  ['confirmation completion basis', confirmation(), uk,
    { ...completeConfirmation, basis: { type: 'RESIDENT_CONFIRMATION', feedbackId: 'old-feedback' } }, 'STALE_COMPLETION_BASIS'],
  ['no-feedback completion basis', noFeedback(), uk,
    { ...completeNoFeedback, basis: { type: 'NO_RESIDENT_FEEDBACK', eventId: 'old-event', completionBasis: { confirmed: true, processReference: 'x' } } }, 'STALE_COMPLETION_BASIS'],
  ['old result after N+1', { ...awaiting(), iteration: { id: 'iteration-2', number: 2 } }, resident,
    { ...confirm, iterationId: 'iteration-2' }, 'INVALID_SNAPSHOT'],
];
test.each(staleCases)('rejects stale exact %s', (_name, snapshot, actor, command, code) => {
  rejected(snapshot, actor, command, code);
});

test('selected and sent contractor do not have executor authority', () => {
  rejected(selected(), contractor, submit);
  rejected(sent(), contractor, submit);
  rejected(sent(), contractor, comment);
  rejected(rework(), otherContractor, { ...submit, iterationId: 'iteration-2' }, 'INVALID_ACTOR');
});

test('EVT-009 material plan has no Result or state transition', () => {
  const plan = valid(execution(), contractor, {
    kind: 'ADD_RESULT_MATERIAL', assignmentId: 'assignment-1',
    iterationId: 'iteration-1', materialKind: 'PHOTO', materialValidated: true,
  });
  expect(plan.transition).toBe('ADD_RESULT_MATERIAL');
  expect(plan.nextState).toBe('EXECUTION');
  expect(plan.events.map(e => e.code)).toEqual(['EVT_009']);
  expect(plan.projection.result).toBeUndefined();
});

test('Resident confirmation stays awaiting and only UK can complete', () => {
  expect(valid(awaiting(), resident, confirm).nextState).toBe('AWAITING_RESULT_CHECK');
  rejected(confirmation(), resident, completeConfirmation, 'INVALID_ACTOR');
  rejected(confirmation(), contractor, completeConfirmation, 'INVALID_ACTOR');
});

test('Return To Rework creates exactly one N+1 iteration, preserving accepted authority', () => {
  const plan = valid(remark(), uk, reworkCommand);
  expect(plan.caseIdentity).toEqual({ kind: 'EXISTING', id: 'case' });
  expect(plan.projection.iteration).toEqual({ operation: 'CREATE', number: 2 });
  expect(plan.projection.assignment).toBeUndefined();
  expect(plan.projection.executor).toBeUndefined();
  expect(plan.projection.result).toEqual({ operation: 'CLEAR' });
  expect(plan.events.map(e => [e.code, e.iterationNo])).toEqual([['EVT_013', 1], ['EVT_014', 2]]);
  expect(valid(sent(), contractor, reject).projection.iteration).toBeUndefined();
  expect(valid(rework(), uk, { ...select, iterationId: 'iteration-2', contractorId: 'contractor-b' }).projection.iteration).toBeUndefined();
});

test('different contractor in REWORK loses old current authority immediately', () => {
  const plan = valid(rework(), uk, { ...select, iterationId: 'iteration-2', contractorId: 'contractor-b' });
  expect(plan.projection.assignment).toEqual({ operation: 'CLEAR' });
  expect(plan.projection.executor).toEqual({ operation: 'CLEAR' });
  const newSelection: DomainSnapshot = {
    ...rework(), selection: { id: 'selection-2', contractorId: 'contractor-b', iterationId: 'iteration-2' },
    assignment: null, executorId: null,
  };
  rejected(newSelection, contractor, comment);
  rejected(newSelection, otherContractor, { ...submit, iterationId: 'iteration-2' });
  expect(valid(newSelection, uk, { ...send, iterationId: 'iteration-2', selectionId: 'selection-2' }).nextState)
    .toBe('SENT_TO_CONTRACTOR');
});

test('EVT-015 alone cannot complete; late feedback supersedes no-feedback basis', () => {
  rejected(noFeedback(), uk, {
    ...completeNoFeedback,
    basis: { type: 'NO_RESIDENT_FEEDBACK', eventId: 'event-15',
      completionBasis: { confirmed: false, processReference: 'x' } },
  }, 'BUSINESS_INPUT');
  rejected({ ...noFeedback(), feedback: confirmation().feedback }, uk, completeNoFeedback, 'STALE_COMPLETION_BASIS');
  expect(valid(noFeedback(), resident, confirm).events.map(e => e.code)).toEqual(['EVT_010']);
});

test('empty explanation, refusal and required result material reject without event effects', () => {
  rejected(remark(), uk, { ...disputed, explanation: ' ' }, 'BUSINESS_INPUT');
  rejected(sent(), contractor, { ...reject, reason: ' ' }, 'BUSINESS_INPUT');
  rejected(execution(), contractor, { ...submit, materialAttachmentIds: [] }, 'BUSINESS_INPUT');
});

test('sequential current snapshots model first-valid-wins without retargeting', () => {
  expect(valid(sent(), contractor, accept).nextState).toBe('EXECUTION');
  rejected(execution(), contractor, reject);
  expect(valid(awaiting(), resident, residentRemark).nextState).toBe('REMARKS_REVIEW');
  rejected(remark(), resident, confirm);
  const replacedSelection: DomainSnapshot = {
    ...rework(), selection: { id: 'selection-2', contractorId: 'contractor-b', iterationId: 'iteration-2' },
    assignment: null, executorId: null,
  };
  rejected(replacedSelection, uk, { ...send, iterationId: 'iteration-2', selectionId: 'selection-1' }, 'STALE_SELECTION');
});

const invariantChecks: readonly [string, () => void][] = [
  ['INV-001 case identity', () => {
    expect(valid(remark(), uk, reworkCommand).caseIdentity).toEqual({ kind: 'EXISTING', id: 'case' });
    expect(valid(sent(), contractor, reject).caseIdentity).toEqual({ kind: 'EXISTING', id: 'case' });
  }],
  ['INV-002 append-only history plan', () => {
    const before = sent();
    const copy = structuredClone(before);
    expect(valid(before, contractor, reject).facts).toContainEqual({
      kind: 'ASSIGNMENT_DECISION', assignmentId: 'assignment-1', decision: 'REJECTED', reason: 'Нет бригады',
    });
    expect(before).toEqual(copy);
  }],
  ['INV-003 eight states', () => expect(DOMAIN_STATES).toHaveLength(8)],
  ['INV-004 terminal', () =>
    rejected({ ...confirmation(), state: 'COMPLETED' }, uk, completeConfirmation, 'TERMINAL')],
  ['INV-005 one event plan', () => {
    expect(valid(execution(), resident, comment).events).toEqual([{ code: 'EVT_007', iterationNo: 1 }]);
  }],
  ['INV-006 historical results remain facts', () => {
    const old = remark();
    expect(valid(old, uk, reworkCommand).projection.result).toEqual({ operation: 'CLEAR' });
    expect(old.result?.id).toBe('result-1');
  }],
  ['INV-007 selected sent accepted are distinct', () => {
    expect(valid(base('ACCEPTED_BY_UK'), uk, select).projection.executor).toBeUndefined();
    expect(valid(selected(), uk, send).projection.executor).toBeUndefined();
    expect(valid(sent(), contractor, accept).projection.executor).toEqual({ operation: 'SET', contractorId: 'contractor-a' });
  }],
  ['INV-008 only accepted current executor works', () => {
    rejected(sent(), contractor, comment);
    rejected(sent(), contractor, submit);
  }],
  ['INV-009 old contractor authority revoked', () => {
    const replaced: DomainSnapshot = {
      ...rework(), assignment: null, executorId: null,
      selection: { id: 'selection-2', contractorId: 'contractor-b', iterationId: 'iteration-2' },
    };
    rejected(replaced, contractor, comment);
  }],
  ['INV-010 refusal returns UK control', () =>
    expect(valid(sent(), contractor, reject).nextState).toBe('ACCEPTED_BY_UK')],
  ['INV-011 refusal reason only in immutable fact', () => {
    const plan = valid(sent(), contractor, reject);
    expect(plan.facts).toContainEqual({
      kind: 'ASSIGNMENT_DECISION', assignmentId: 'assignment-1', decision: 'REJECTED', reason: 'Нет бригады',
    });
    expect(plan.projection).not.toHaveProperty('reason');
  }],
  ['INV-012 contractor cannot complete', () =>
    rejected(confirmation(), contractor, completeConfirmation, 'INVALID_ACTOR')],
  ['INV-013 no arbitrary execution reassignment', () =>
    rejected(execution(), uk, { ...select, contractorId: 'contractor-b' }, 'INVALID_STATE')],
  ['INV-014 UK coordinates completion', () =>
    expect(valid(confirmation(), uk, completeConfirmation).nextState).toBe('COMPLETED')],
  ['INV-015 resident confirmation does not close', () =>
    expect(valid(awaiting(), resident, confirm).nextState).toBe('AWAITING_RESULT_CHECK')],
  ['INV-016 disputed completion requires explanation', () =>
    rejected(remark(), uk, { ...disputed, explanation: ' ' }, 'BUSINESS_INPUT')],
  ['INV-017 disputed completion emits EVT-017 only', () =>
    expect(valid(remark(), uk, disputed).events.map(e => e.code)).toEqual(['EVT_017'])],
  ['INV-018 silence never confirms', () => {
    const plan = valid(awaiting(), uk, recordNoFeedback);
    expect(plan.projection.feedback).toBeUndefined();
    rejected(awaiting(), uk, completeNoFeedback, 'STALE_COMPLETION_BASIS');
  }],
  ['INV-019 no timer-based closure', () => {
    expect(valid(awaiting(), uk, recordNoFeedback).nextState).toBe('AWAITING_RESULT_CHECK');
    rejected(noFeedback(), uk, { ...completeNoFeedback,
      basis: { type: 'NO_RESIDENT_FEEDBACK', eventId: 'event-15',
        completionBasis: { confirmed: false, processReference: 'elapsed' } } }, 'BUSINESS_INPUT');
  }],
  ['INV-020 manual unique no-feedback fact', () => {
    rejected(noFeedback(), uk, recordNoFeedback, 'INVARIANT');
    rejected(confirmation(), uk, recordNoFeedback, 'INVARIANT');
    expect(valid(awaiting(), uk, recordNoFeedback).events.map(e => e.code)).toEqual(['EVT_015']);
  }],
];
test.each(invariantChecks)('%s', (_name, assertion) => assertion());

const remainingInvariantChecks: readonly [string, () => void][] = [
  ['INV-021 feedback exact current result', () =>
    rejected(awaiting(), resident, { ...confirm, resultId: 'old-result' }, 'STALE_RESULT')],
  ['INV-022 one formal branch per result', () => {
    rejected(confirmation(), resident, residentRemark, 'INVARIANT');
    rejected(confirmation(), resident, confirm, 'INVARIANT');
  }],
  ['INV-023 reply is comment, not second remark', () => {
    const context: DomainSnapshot = {
      ...remark(), clarifications: [{ id: 'clarification-1', resultId: 'result-1',
        feedbackId: 'feedback-1', iterationId: 'iteration-1', visibleToResident: true }],
    };
    const plan = valid(context, resident, { ...comment, clarificationRequestId: 'clarification-1' });
    expect(plan.facts[0]?.kind).toBe('COMMENT');
    expect(plan.events.map(e => e.code)).toEqual(['EVT_007']);
  }],
  ['INV-024 rework retains Case ID', () =>
    expect(valid(remark(), uk, reworkCommand).caseIdentity).toEqual({ kind: 'EXISTING', id: 'case' })],
  ['INV-025 only Return To Rework grows iteration', () => {
    for (const [, snapshot, actor, command] of transitions) {
      const plan = valid(snapshot, actor, command);
      expect(plan.projection.iteration === undefined || plan.transition === 'TR-001' || plan.transition === 'TR-015').toBe(true);
    }
  }],
  ['INV-026 same contractor rework reuses accepted assignment', () => {
    const noMaterial: DomainSnapshot = { ...rework(), resultRequirement: 'NONE' };
    const plan = valid(noMaterial, contractor, { ...submit, iterationId: 'iteration-2', materialAttachmentIds: [] });
    expect(plan.transition).toBe('TR-017');
    expect(plan.projection.assignment).toBeUndefined();
  }],
  ['INV-027 different contractor must select send accept', () => {
    const plan = valid(rework(), uk, { ...select, iterationId: 'iteration-2', contractorId: 'contractor-b' });
    expect(plan.projection.executor).toEqual({ operation: 'CLEAR' });
    expect(plan.nextState).toBe('REWORK');
  }],
  ['INV-028 past-iteration feedback is stale', () =>
    rejected(awaiting(), resident, { ...confirm, iterationId: 'old-iteration' }, 'STALE_ITERATION')],
  ['INV-029 comments have one shared fact without private recipient', () => {
    const fact = valid(execution(), resident, comment).facts[0];
    expect(fact?.kind).toBe('COMMENT');
    expect(fact).not.toHaveProperty('recipientId');
  }],
  ['INV-030 resident comments only in permitted context', () => {
    rejected(awaiting(), resident, comment, 'INVALID_STATE');
    rejected(remark(), resident, comment, 'STALE_CLARIFICATION');
    expect(valid(execution(), resident, comment).transition).toBe('TR-020');
  }],
  ['INV-031 contractor comments only as current executor', () => {
    rejected(remark(), contractor, comment, 'INVALID_STATE');
    rejected(execution(), otherContractor, comment, 'INVALID_ACTOR');
    expect(valid(execution(), contractor, comment).transition).toBe('TR-022');
  }],
  ['INV-032 completed comments read-only', () =>
    rejected({ ...confirmation(), state: 'COMPLETED' }, resident, comment, 'TERMINAL')],
  ['INV-033 resident full name is not required by case creation', () => {
    expect(valid(null, resident, create).nextState).toBe('CREATED');
    expect(valid(null, resident, create).facts[0]).not.toHaveProperty('residentName');
  }],
  ['INV-034 result text required', () =>
    rejected({ ...execution(), materials: [material] }, contractor, { ...submit, description: '  ' }, 'BUSINESS_INPUT')],
  ['INV-035 simple NONE PHOTO FILE requirement', () => {
    const none: DomainSnapshot = { ...execution(), resultRequirement: 'NONE' };
    expect(valid(none, contractor, { ...submit, materialAttachmentIds: [] }).nextState).toBe('AWAITING_RESULT_CHECK');
    const file: DomainSnapshot = { ...execution(), resultRequirement: 'FILE',
      materials: [{ ...material, kind: 'FILE' }] };
    expect(valid(file, contractor, submit).nextState).toBe('AWAITING_RESULT_CHECK');
  }],
  ['INV-036 invalid result has no EVT-008', () =>
    rejected(execution(), contractor, { ...submit, materialAttachmentIds: [] }, 'BUSINESS_INPUT')],
  ['INV-037 category does not select a different lifecycle', () => {
    const none: DomainSnapshot = { ...execution(), resultRequirement: 'NONE' };
    expect(valid(none, contractor, { ...submit, materialAttachmentIds: [] }).transition).toBe('TR-007');
  }],
  ['INV-038 structured time is optional', () =>
    expect(valid(null, resident, create).nextState).toBe('CREATED')],
  ['INV-039 category without premises access uses same machine', () =>
    expect(valid(null, resident, { ...create, categoryId: 'without-access' }).transition).toBe('TR-001')],
  ['INV-040 deactivation gates new cases, not existing snapshots', () => {
    rejected(null, resident, { ...create, categoryActive: false }, 'BUSINESS_INPUT');
    expect(valid({ ...execution(), materials: [material] }, contractor, submit).transition).toBe('TR-007');
  }],
  ['INV-041 configuration is data, not hardcoded routing', () => {
    expect(valid(null, resident, { ...create, categoryId: 'configured-category' }).facts[0])
      .toHaveProperty('categoryId', 'configured-category');
    expect(valid(base('ACCEPTED_BY_UK'), uk, { ...select, contractorId: 'configured-contractor' }).facts[0])
      .toHaveProperty('contractorId', 'configured-contractor');
  }],
];
test.each(remainingInvariantChecks)('%s', (_name, assertion) => assertion());

test('pure plans are deterministic and never mutate the supplied snapshot', () => {
  const snapshot = remark();
  const before = structuredClone(snapshot);
  const first = evaluateDomain(snapshot, uk, reworkCommand);
  const second = evaluateDomain(snapshot, uk, reworkCommand);
  expect(first).toEqual(second);
  expect(snapshot).toEqual(before);
  expect(JSON.stringify(first)).not.toMatch(/created_at|updated_at|sql|notification_intent_id/);
});

test.each(transitions)('%s rejects a forbidden source state', (id, _snapshot, actor, command) => {
  const wrongState = id === 'TR-002' ? base('ACCEPTED_BY_UK') : base('CREATED');
  rejected(wrongState, actor, command, 'INVALID_STATE');
});

const forbiddenActors: readonly [string, DomainSnapshot | null, Actor, DomainCommand][] = [
  ['TR-001', null, uk, create],
  ['TR-002', base('CREATED'), resident, { kind: 'ACCEPT_CASE' }],
  ['TR-003', base('ACCEPTED_BY_UK'), resident, select],
  ['TR-004', selected(), resident, send],
  ['TR-005', sent(), resident, accept],
  ['TR-006', sent(), resident, reject],
  ['TR-007', { ...execution(), materials: [material] }, resident, submit],
  ['TR-008', awaiting(), uk, confirm],
  ['TR-009', awaiting(), uk, residentRemark],
  ['TR-010', awaiting(), resident, recordNoFeedback],
  ['TR-011', confirmation(), resident, completeConfirmation],
  ['TR-012', noFeedback(), resident, completeNoFeedback],
  ['TR-013', remark(), resident, clarification],
  ['TR-014', remark(), { role: 'RESIDENT', userId: 'other-resident' }, { ...comment, clarificationRequestId: 'clarification-1' }],
  ['TR-015', remark(), resident, reworkCommand],
  ['TR-016', remark(), resident, disputed],
  ['TR-017', rework(), resident, { ...submit, iterationId: 'iteration-2' }],
  ['TR-018', rework(), resident, { ...select, iterationId: 'iteration-2', contractorId: 'contractor-b' }],
  ['TR-019', rework(), resident, { ...send, iterationId: 'iteration-2' }],
  ['TR-020', execution(), { role: 'RESIDENT', userId: 'other-resident' }, comment],
  ['TR-021', awaiting(), { role: 'UK_EMPLOYEE', organizationId: 'other-uk' }, comment],
  ['TR-022', execution(), otherContractor, comment],
];
test.each(forbiddenActors)('%s rejects a forbidden actor or authority', (_id, snapshot, actor, command) => {
  rejected(snapshot, actor, command, 'INVALID_ACTOR');
});

test('same contractor on a newer assignment cannot accept or reject an old assignment ID', () => {
  const newer: DomainSnapshot = {
    ...sent(),
    selection: { id: 'selection-2', contractorId: 'contractor-a', iterationId: 'iteration-1' },
    assignment: { id: 'assignment-2', selectionId: 'selection-2', contractorId: 'contractor-a', decision: 'PENDING' },
  };
  rejected(newer, contractor, accept, 'STALE_ASSIGNMENT');
  rejected(newer, contractor, reject, 'STALE_ASSIGNMENT');
});

test('Return To Rework and disputed completion are mutually exclusive on updated snapshots', () => {
  expect(valid(remark(), uk, reworkCommand).nextState).toBe('REWORK');
  rejected(rework(), uk, disputed, 'INVALID_STATE');
  expect(valid(remark(), uk, disputed).nextState).toBe('COMPLETED');
  rejected({ ...remark(), state: 'COMPLETED' }, uk, reworkCommand, 'TERMINAL');
});

test('manual no-feedback event loses to later confirmation or remark at completion', () => {
  const laterConfirmation: DomainSnapshot = { ...noFeedback(), feedback: confirmation().feedback };
  rejected(laterConfirmation, uk, completeNoFeedback, 'STALE_COMPLETION_BASIS');
  expect(valid(laterConfirmation, uk, completeConfirmation).transition).toBe('TR-011');
  const laterRemark: DomainSnapshot = { ...remark(), noFeedback: noFeedback().noFeedback };
  rejected(laterRemark, uk, completeNoFeedback, 'INVALID_STATE');
  expect(valid(laterRemark, uk, disputed).transition).toBe('TR-016');
});

test.each([
  ['stale material iteration', execution(), contractor,
    { kind: 'ADD_RESULT_MATERIAL', assignmentId: 'assignment-1', iterationId: 'old-iteration',
      materialKind: 'PHOTO', materialValidated: true }, 'STALE_ITERATION'],
  ['stale material assignment', execution(), contractor,
    { kind: 'ADD_RESULT_MATERIAL', assignmentId: 'old-assignment', iterationId: 'iteration-1',
      materialKind: 'PHOTO', materialValidated: true }, 'STALE_ASSIGNMENT'],
  ['unvalidated material', execution(), contractor,
    { kind: 'ADD_RESULT_MATERIAL', assignmentId: 'assignment-1', iterationId: 'iteration-1',
      materialKind: 'PHOTO', materialValidated: false }, 'BUSINESS_INPUT'],
  ['wrong material target', { ...execution(), materials: [{ ...material, assignmentId: 'old-assignment' }] }, contractor,
    submit, 'STALE_ASSIGNMENT'],
  ['duplicate material IDs', { ...execution(), materials: [material] }, contractor,
    { ...submit, materialAttachmentIds: ['photo-1', 'photo-1'] }, 'BUSINESS_INPUT'],
  ['missing no-feedback recording note', awaiting(), uk,
    { ...recordNoFeedback, basisNote: ' ' }, 'BUSINESS_INPUT'],
  ['missing completion process reference', noFeedback(), uk,
    { ...completeNoFeedback, basis: { type: 'NO_RESIDENT_FEEDBACK', eventId: 'event-15',
      completionBasis: { confirmed: true, processReference: ' ' } } }, 'BUSINESS_INPUT'],
  ['old clarification context', { ...remark(),
    clarifications: [{ id: 'clarification-1', resultId: 'old-result', feedbackId: 'feedback-1',
      iterationId: 'iteration-1', visibleToResident: true }] }, resident,
    { ...comment, clarificationRequestId: 'clarification-1' }, 'STALE_CLARIFICATION'],
  ['invisible clarification', { ...remark(),
    clarifications: [{ id: 'clarification-1', resultId: 'result-1', feedbackId: 'feedback-1',
      iterationId: 'iteration-1', visibleToResident: false }] }, resident,
    { ...comment, clarificationRequestId: 'clarification-1' }, 'STALE_CLARIFICATION'],
] as const satisfies readonly (readonly [string, DomainSnapshot, Actor, DomainCommand, string])[])(
  '%s rejects without projection or event effects',
  (_name, snapshot, actor, command, code) => rejected(snapshot, actor, command, code),
);
