import type { AllowedActionOutput, ContractorCaseSnapshotOutput } from '@max-smart-city/contracts';

type Action<Code extends AllowedActionOutput['code']> = Extract<AllowedActionOutput, { code: Code }>;
type Case = ContractorCaseSnapshotOutput['case'];

export type ContractorSurface =
  | { kind: 'hidden' }
  | { kind: 'pending'; value: Case; accept?: Action<'ACCEPT_ASSIGNMENT'>;
      reject?: Action<'REJECT_ASSIGNMENT'> }
  | { kind: 'current'; value: Case; iteration: Case['current_iteration'];
      accept?: never; comment?: Action<'ADD_COMMENT'>;
      material?: Action<'ADD_RESULT_MATERIAL'>; submit?: Action<'SUBMIT_RESULT'> };

export function contractorSurface(snapshot: ContractorCaseSnapshotOutput): ContractorSurface {
  const value = snapshot.case;
  const assignment = value.assignment;
  if (!assignment) return { kind: 'hidden' };

  const action = <Code extends AllowedActionOutput['code']>(code: Code): Action<Code> | undefined =>
    value.allowed_actions.find((entry): entry is Action<Code> => entry.code === code);
  const exactAssignment = <T extends { target: { assignment_id: string } }>(entry: T | undefined): T | undefined =>
    entry?.target.assignment_id === assignment.assignment_id ? entry : undefined;
  const exactWork = <T extends { target: { assignment_id: string; iteration_id: string } }>(entry: T | undefined): T | undefined =>
    entry?.target.assignment_id === assignment.assignment_id &&
      entry.target.iteration_id === value.current_iteration.iteration_id ? entry : undefined;

  if (assignment.decision === 'PENDING') {
    const accept = exactAssignment(action('ACCEPT_ASSIGNMENT'));
    const reject = exactAssignment(action('REJECT_ASSIGNMENT'));
    if (!accept && !reject) return { kind: 'hidden' };
    return { kind: 'pending', value,
      ...(accept ? { accept } : {}), ...(reject ? { reject } : {}) };
  }
  if (assignment.decision !== 'ACCEPTED' ||
    value.current_executor?.contractor_id !== assignment.contractor.contractor_id) {
    return { kind: 'hidden' };
  }
  const comment = action('ADD_COMMENT');
  const material = exactWork(action('ADD_RESULT_MATERIAL'));
  const submit = exactWork(action('SUBMIT_RESULT'));
  return { kind: 'current', value, iteration: value.current_iteration,
    ...(comment ? { comment } : {}),
    ...(material ? { material } : {}),
    ...(submit ? { submit } : {}) };
}
