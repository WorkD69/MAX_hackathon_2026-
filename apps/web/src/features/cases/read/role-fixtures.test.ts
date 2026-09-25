import { expect, test, vi } from 'vitest';
import {
  CASE_STATES, ROLES, ResidentCaseSnapshotSchema, UkCaseSnapshotSchema,
  ContractorCaseSnapshotSchema, type CaseStateOutput, type RoleOutput,
} from '@max-smart-city/contracts';
import { createHttpCaseReadTransport, CaseReadHttpError } from './read-transport.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const iterationId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const date = '2026-09-25T00:00:00Z';

function roleFilteredFixture(role: RoleOutput, state: CaseStateOutput) {
  const assignment = {
    assignment_id: assignmentId,
    contractor: { contractor_id: assignmentId, name: 'Подрядчик А' },
    decision: 'REJECTED' as const,
    ...(role === 'UK_EMPLOYEE' || role === 'UK_ADMIN' ? { reject_reason: 'Внутренний ответ' } : {}),
  };
  return { case: {
    case_id: caseId, display_number: 'C-1', state, revision: 4,
    created_at: date, updated_at: date, description: 'Нет воды',
    location: { house: 'Дом 1', premises: 'Кв. 2' },
    category: { name: 'Вода', result_requirement: 'NONE' },
    current_iteration: { iteration_id: iterationId, number: 1 },
    responsibility: { semantic_code: 'SERVER_NEXT', text: 'Следующий шаг от сервера' },
    initial_attachments: [], selection: null, assignment,
    current_executor: null, current_result: null, resident_feedback: null,
    activity: [], allowed_actions: [],
  } };
}

test.each(ROLES.flatMap((role) => CASE_STATES.map((state) => [role, state] as const)))(
  '%s receives a role-filtered %s snapshot with server actions only', (role, state) => {
    const raw = roleFilteredFixture(role, state);
    const schema = role === 'RESIDENT' ? ResidentCaseSnapshotSchema
      : role === 'CONTRACTOR_EMPLOYEE' ? ContractorCaseSnapshotSchema : UkCaseSnapshotSchema;
    const parsed = schema.parse(raw);
    expect(parsed.case.state).toBe(state);
    expect(parsed.case.responsibility.text).toBe('Следующий шаг от сервера');
    expect(parsed.case.allowed_actions).toEqual([]);
    expect('reject_reason' in parsed.case.assignment!).toBe(role.startsWith('UK_'));
  },
);

test('former contractor receives hidden 404 from transport and no live projection', async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
  const transport = createHttpCaseReadTransport(authorizedFetch);
  await expect(transport.snapshot(caseId, 'CONTRACTOR_EMPLOYEE'))
    .rejects.toMatchObject({ status: 404 } satisfies Partial<CaseReadHttpError>);
  expect(authorizedFetch).toHaveBeenCalledTimes(1);
});
