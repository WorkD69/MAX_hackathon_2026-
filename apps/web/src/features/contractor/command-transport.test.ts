import { expect, test, vi } from 'vitest';
import { createContractorCommandTransport, ContractorCommandError } from './command-transport.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const assignmentId = '22222222-2222-4222-8222-222222222222';
const iterationId = '33333333-3333-4333-8333-333333333333';
const resultId = '44444444-4444-4444-8444-444444444444';
const notificationId = '55555555-5555-4555-8555-555555555555';
const success = { command_id: resultId, case_id: caseId, state: 'AWAITING_RESULT_CHECK', revision: 8,
  event_ids: [resultId], created: { result_id: resultId, notification_intent_id: notificationId },
  notification: { status: 'QUEUED' } };

test('SubmitResult sends exact target and material IDs with an idempotency key', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(success), { status: 200 }));
  const transport = createContractorCommandTransport(fetch);
  await expect(transport.submit(caseId, { assignment_id: assignmentId, iteration_id: iterationId,
    description: 'Готово', material_attachment_ids: [resultId] })).resolves.toMatchObject(success);
  const [path, init] = fetch.mock.calls[0] as [string, RequestInit];
  expect(path).toBe(`/api/v1/cases/${caseId}/commands/submit-result`);
  expect(JSON.parse(init.body as string)).toEqual({ assignment_id: assignmentId, iteration_id: iterationId,
    description: 'Готово', material_attachment_ids: [resultId] });
  expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
});

test('semantic 409 remains distinguishable for authoritative refetch', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
    code: 'STALE_ASSIGNMENT', message: 'Changed', request_id: resultId,
  } }), { status: 409 }));
  await expect(createContractorCommandTransport(fetch).accept(caseId, assignmentId))
    .rejects.toMatchObject({ status: 409, code: 'STALE_ASSIGNMENT' } satisfies Partial<ContractorCommandError>);
});

test('material retry keeps its key while SubmitResult uses a separate intent', async () => {
  const material = { command_id: resultId, case_id: caseId, state: 'EXECUTION', revision: 7,
    event_ids: [resultId], created: { attachment_id: resultId } };
  const fetch = vi.fn().mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce(Response.json(material)).mockResolvedValueOnce(Response.json(success));
  const transport = createContractorCommandTransport(fetch);
  const file = new File(['bytes'], 'proof.jpg', { type: 'image/jpeg' });
  await expect(transport.upload(caseId, assignmentId, iterationId, file)).rejects.toThrow();
  await transport.upload(caseId, assignmentId, iterationId, file);
  await transport.submit(caseId, { assignment_id: assignmentId, iteration_id: iterationId,
    description: 'Готово', material_attachment_ids: [resultId] });
  const keys = fetch.mock.calls.map(([, init]) => new Headers(init.headers).get('Idempotency-Key'));
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).not.toBe(keys[1]);
});

test('server error message is never trusted for display', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: {
    code: 'RESULT_MATERIAL_INVALID', message: '<script>alert(1)</script>', request_id: resultId,
  } }, { status: 422 }));
  const error = await createContractorCommandTransport(fetch).accept(caseId, assignmentId).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(ContractorCommandError);
  expect((error as Error).message).not.toContain('<script>');
});
