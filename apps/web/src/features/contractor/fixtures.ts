import { ContractorCaseSnapshotSchema } from '@max-smart-city/contracts';

export const ids = {
  case: '11111111-1111-4111-8111-111111111111',
  assignment: '22222222-2222-4222-8222-222222222222',
  iteration: '33333333-3333-4333-8333-333333333333',
  contractor: '44444444-4444-4444-8444-444444444444',
};
export function snapshot(overrides: Record<string, unknown> = {}) {
  const base = {
    case_id: ids.case, display_number: 'C-1', state: 'SENT_TO_CONTRACTOR', revision: 2,
    created_at: '2026-09-25T00:00:00Z', updated_at: '2026-09-25T00:00:00Z',
    description: 'Протечка', location: { house: 'Дом 1', premises: 'Кв. 2' },
    category: { name: 'Вода', result_requirement: 'PHOTO' },
    current_iteration: { iteration_id: ids.iteration, number: 1 },
    responsibility: { semantic_code: 'SERVER', text: 'Ожидается ответ' },
    initial_attachments: [], selection: null,
    assignment: { assignment_id: ids.assignment,
      contractor: { contractor_id: ids.contractor, name: 'Подрядчик A' }, decision: 'PENDING' },
    current_executor: null, current_result: null, resident_feedback: null,
    activity: [], allowed_actions: [
      { code: 'ACCEPT_ASSIGNMENT', target: { assignment_id: ids.assignment }, input: {} },
      { code: 'REJECT_ASSIGNMENT', target: { assignment_id: ids.assignment }, input: { reject_reason_required: true } },
    ],
  };
  return ContractorCaseSnapshotSchema.parse({ case: { ...base, ...overrides } });
}

export function executor(overrides: Record<string, unknown> = {}) {
  return snapshot({
    state: 'EXECUTION',
    assignment: { assignment_id: ids.assignment,
      contractor: { contractor_id: ids.contractor, name: 'Подрядчик A' }, decision: 'ACCEPTED' },
    current_executor: { contractor_id: ids.contractor, name: 'Подрядчик A' },
    allowed_actions: [
      { code: 'ADD_COMMENT', target: {}, input: {} },
      { code: 'ADD_RESULT_MATERIAL', target: { assignment_id: ids.assignment, iteration_id: ids.iteration }, input: {} },
      { code: 'SUBMIT_RESULT', target: { assignment_id: ids.assignment, iteration_id: ids.iteration }, input: {} },
    ], ...overrides,
  });
}
