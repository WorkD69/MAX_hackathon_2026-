import { expect, test, vi } from 'vitest';
import type { AllowedActionOutput } from '@max-smart-city/contracts';
import { createUkActionExecutor, UkCommandError } from './uk-transport.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const iterationId = '22222222-2222-4222-8222-222222222222';
const contractorId = '33333333-3333-4333-8333-333333333333';
const selectionId = '44444444-4444-4444-8444-444444444444';
const action = <T extends AllowedActionOutput['code']>(code: T, target: Extract<AllowedActionOutput, { code: T }>['target']) =>
  ({ code, target, input: {} }) as Extract<AllowedActionOutput, { code: T }>;

test('sends exact selection and assignment targets with an idempotency key', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  const execute = createUkActionExecutor();
  const context = { caseId, authorizedFetch: fetch };
  await execute(action('SELECT_CONTRACTOR', { iteration_id: iterationId }),
    { contractor_id: contractorId, iteration_id: iterationId }, context);
  await execute(action('SEND_ASSIGNMENT', { selection_id: selectionId, iteration_id: iterationId }),
    { selection_id: selectionId, iteration_id: iterationId }, context);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0]![0]).toBe(`/api/v1/cases/${caseId}/commands/select-contractor`);
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ contractor_id: contractorId, iteration_id: iterationId });
  expect(fetch.mock.calls[1]![0]).toBe(`/api/v1/cases/${caseId}/commands/send-assignment`);
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ selection_id: selectionId, iteration_id: iterationId });
  expect(new Headers(fetch.mock.calls[0]![1].headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
});

test('sends optional comment attachment via canonical multipart payload', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  const file = new File(['photo'], 'repair.jpg', { type: 'image/jpeg' });
  const payload = { body: 'Проверено', clarification_request_id: null, files: [file] };
  await createUkActionExecutor()(action('ADD_COMMENT', {}), payload,
    { caseId, authorizedFetch: fetch });
  const init = fetch.mock.calls[0]![1] as RequestInit;
  expect(fetch.mock.calls[0]![0]).toBe(`/api/v1/cases/${caseId}/comments`);
  expect(init.body).toBeInstanceOf(FormData);
  const body = init.body as FormData;
  expect(JSON.parse(body.get('payload') as string)).toEqual({ body: 'Проверено', clarification_request_id: null });
  expect(body.getAll('files[]')).toEqual([file]);
  expect(new Headers(init.headers).has('Content-Type')).toBe(false);
});

test('surfaces 409 for shared authoritative refetch without replay', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 409 }));
  await expect(createUkActionExecutor()(action('ACCEPT_CASE', {}), {}, { caseId, authorizedFetch: fetch }))
    .rejects.toMatchObject({ status: 409 } satisfies Partial<UkCommandError>);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('maps every UK decision to the canonical command endpoint without changing the payload', async () => {
  const resultId = '55555555-5555-4555-8555-555555555555';
  const feedbackId = '66666666-6666-4666-8666-666666666666';
  const eventId = '77777777-7777-4777-8777-777777777777';
  const cases = [
    [action('ACCEPT_CASE', {}), {}, 'accept'],
    [action('REQUEST_CLARIFICATION', { result_id: resultId, feedback_id: feedbackId }),
      { result_id: resultId, feedback_id: feedbackId, message: 'Уточните адрес' }, 'request-clarification'],
    [action('RETURN_TO_REWORK', { result_id: resultId, feedback_id: feedbackId }),
      { result_id: resultId, feedback_id: feedbackId }, 'return-to-rework'],
    [action('RECORD_NO_RESIDENT_FEEDBACK', { result_id: resultId, iteration_id: iterationId }),
      { result_id: resultId, iteration_id: iterationId, basis_confirmed: true, basis_note: 'Процесс УК' },
      'record-no-resident-feedback'],
    [action('COMPLETE_CASE', { result_id: resultId }),
      { result_id: resultId, basis: { type: 'RESIDENT_CONFIRMATION', feedback_id: feedbackId } }, 'complete'],
    [action('COMPLETE_CASE', { result_id: resultId }),
      { result_id: resultId, basis: { type: 'NO_RESIDENT_FEEDBACK', event_id: eventId,
        completion_basis: { confirmed: true, process_reference: 'Процесс 1' } } }, 'complete'],
    [action('COMPLETE_WITH_EXPLANATION', { result_id: resultId, feedback_id: feedbackId }),
      { result_id: resultId, feedback_id: feedbackId, explanation: 'Решение УК' }, 'complete-with-explanation'],
  ] as const;
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  const execute = createUkActionExecutor();
  for (const [allowed, payload, endpoint] of cases) {
    await execute(allowed, payload, { caseId, authorizedFetch: fetch });
    const [path, init] = fetch.mock.lastCall!;
    expect(path).toBe(`/api/v1/cases/${caseId}/commands/${endpoint}`);
    expect(JSON.parse(init.body)).toEqual(payload);
  }
  expect(fetch).toHaveBeenCalledTimes(cases.length);
});

test('exposes a typed semantic rejection for the UK error state', async () => {
  const response = { error: { code: 'CONTRACTOR_NOT_AVAILABLE', message: 'Unavailable',
    request_id: '88888888-8888-4888-8888-888888888888' } };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 422 }));
  await expect(createUkActionExecutor()(action('SELECT_CONTRACTOR', { iteration_id: iterationId }),
    { contractor_id: contractorId, iteration_id: iterationId }, { caseId, authorizedFetch: fetch }))
    .rejects.toMatchObject({ status: 422, code: 'CONTRACTOR_NOT_AVAILABLE' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('rejects a stale form target locally without silently retargeting the command', async () => {
  const fetch = vi.fn();
  await expect(createUkActionExecutor()(action('SEND_ASSIGNMENT', {
    selection_id: selectionId, iteration_id: iterationId,
  }), { selection_id: contractorId, iteration_id: iterationId }, { caseId, authorizedFetch: fetch }))
    .rejects.toMatchObject({ status: 409 });
  expect(fetch).not.toHaveBeenCalled();
});
