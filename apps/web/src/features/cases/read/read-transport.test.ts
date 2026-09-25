import { expect, test, vi } from 'vitest';
import { createHttpCaseReadTransport, CaseReadHttpError } from './read-transport.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const iterationId = '22222222-2222-4222-8222-222222222222';

function snapshot() {
  return { case: {
    case_id: caseId, display_number: 'C-1', state: 'CREATED', revision: 1,
    created_at: '2026-09-25T00:00:00Z', updated_at: '2026-09-25T00:00:00Z',
    description: 'Нет воды', location: { house: 'Дом 1', premises: 'Кв. 2' },
    category: { name: 'Вода', result_requirement: 'NONE' },
    current_iteration: { iteration_id: iterationId, number: 1 },
    responsibility: { semantic_code: 'UK_NEXT', text: 'УК примет случай' },
    initial_attachments: [], selection: null, assignment: null,
    current_executor: null, current_result: null, resident_feedback: null,
    activity: [], allowed_actions: [],
  } };
}

test('list transport requests only role-filtered endpoint and parses server response', async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    items: [{ case_id: caseId, display_number: 'C-1', state: 'CREATED', category: 'Вода',
      location_label: 'Дом 1', current_iteration_no: 1,
      updated_at: '2026-09-25T00:00:00Z', responsibility: 'УК' }], next_cursor: null,
  }), { status: 200 }));
  const transport = createHttpCaseReadTransport(authorizedFetch);
  const data = await transport.list();
  expect(authorizedFetch).toHaveBeenCalledWith('/api/v1/cases', expect.objectContaining({ method: 'GET' }));
  expect(data.items[0]?.updated_at).toBe('2026-09-25T00:00:00Z');
});

test('resident snapshot rejects a forbidden reject_reason field instead of hiding it', async () => {
  const body = snapshot();
  const forbidden = { ...body, case: { ...body.case, assignment: {
    assignment_id: caseId, contractor: { contractor_id: caseId, name: 'Подрядчик' },
    decision: 'REJECTED', reject_reason: 'Внутренняя причина',
  } } };
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(forbidden), { status: 200 }));
  const transport = createHttpCaseReadTransport(authorizedFetch);
  await expect(transport.snapshot(caseId, 'RESIDENT')).rejects.toThrow();
  expect(authorizedFetch).toHaveBeenCalledWith(`/api/v1/cases/${caseId}`, expect.objectContaining({ method: 'GET' }));
});

test('resident snapshot accepts permitted payload and propagates 409 without retry', async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(snapshot()), { status: 200 }))
    .mockResolvedValueOnce(new Response('', { status: 409 }));
  const transport = createHttpCaseReadTransport(authorizedFetch);
  expect((await transport.snapshot(caseId, 'RESIDENT')).case.state).toBe('CREATED');
  await expect(transport.snapshot(caseId, 'RESIDENT')).rejects.toBeInstanceOf(CaseReadHttpError);
  expect(authorizedFetch).toHaveBeenCalledTimes(2);
});
