import { expect, test, vi, type MockInstance } from 'vitest';
import {
  createHttpResidentTransport, ResidentHttpError, isStaleResponse, type AuthorizedFetch,
} from './resident-transport.js';
import {
  addCommentSuccessFixture, confirmationSuccessFixture, createCaseOptionsFixture,
  createCaseSuccessFixture, downloadCapabilityFixture, IDS, premiseFixture, remarkSuccessFixture,
} from './fixtures.js';

const KEY = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function transportWith(authorizedFetch: AuthorizedFetch) {
  return createHttpResidentTransport(authorizedFetch);
}

/** vi.fn() is untyped by default, so it must be narrowed to the transport seam. */
function stubFetch(): AuthorizedFetch & MockInstance {
  return vi.fn() as unknown as AuthorizedFetch & MockInstance;
}

test('createCaseOptions reads public initial and selected projections without admin config', async () => {
  const initial = { premises: [premiseFixture], selected_premises_id: null, categories: [] };
  const selected = createCaseOptionsFixture;
  const authorizedFetch = stubFetch()
    .mockResolvedValueOnce(jsonResponse(initial)).mockResolvedValueOnce(jsonResponse(selected));
  const transport = transportWith(authorizedFetch);
  expect(await transport.createCaseOptions()).toEqual(initial);
  expect(await transport.createCaseOptions(IDS.premisesId)).toEqual(selected);
  expect(authorizedFetch.mock.calls.map((call) => call[0])).toEqual([
    '/api/v1/cases/create-options',
    `/api/v1/cases/create-options?premises_id=${IDS.premisesId}`,
  ]);
  expect(authorizedFetch.mock.calls.every((call) => !String(call[0]).includes('/config/'))).toBe(true);
});

test('createCaseOptions rejects admin fields in strict public schema', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse({
    ...createCaseOptionsFixture, categories: [{ ...createCaseOptionsFixture.categories[0], default_contractor_id: IDS.contractorId }],
  }));
  await expect(transportWith(authorizedFetch).createCaseOptions(IDS.premisesId)).rejects.toThrow();
});

test('createCase sends canonical multipart payload with idempotency key', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse(createCaseSuccessFixture, 201));
  const payload = { premises_id: IDS.premisesId, category_id: IDS.categoryId, description: 'Не греет стояк' };
  const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
  const created = await transportWith(authorizedFetch).createCase({ payload, files: [file], idempotencyKey: KEY });
  expect(created.case_id).toBe(IDS.caseId);
  const [path, init] = authorizedFetch.mock.calls[0]!;
  expect(path).toBe('/api/v1/cases');
  expect(init!.method).toBe('POST');
  expect((init!.headers as Record<string, string>)['Idempotency-Key']).toBe(KEY);
  const sent = init!.body as FormData;
  expect(JSON.parse(String(sent.get('payload')))).toEqual(payload);
  expect(sent.getAll('files[]')).toHaveLength(1);
});

test('commands use the canonical interface contract paths', async () => {
  const authorizedFetch = stubFetch()
    .mockResolvedValueOnce(jsonResponse(addCommentSuccessFixture, 201))
    .mockResolvedValueOnce(jsonResponse(confirmationSuccessFixture, 201))
    .mockResolvedValueOnce(jsonResponse(remarkSuccessFixture, 201));
  const transport = transportWith(authorizedFetch);
  await transport.addComment(IDS.caseId, {
    payload: { body: 'Уточните адрес', clarification_request_id: null }, files: [], idempotencyKey: KEY,
  });
  await transport.confirmResult(IDS.caseId, {
    request: { result_id: IDS.resultId, iteration_id: IDS.iterationId }, idempotencyKey: KEY,
  });
  await transport.remarkResult(IDS.caseId, {
    request: { result_id: IDS.resultId, iteration_id: IDS.iterationId, remark_text: 'Протечка' }, files: [], idempotencyKey: KEY,
  });
  expect(authorizedFetch.mock.calls.map((call) => call[0])).toEqual([
    `/api/v1/cases/${IDS.caseId}/comments`,
    `/api/v1/cases/${IDS.caseId}/commands/resident-confirmation`,
    `/api/v1/cases/${IDS.caseId}/commands/resident-remark`,
  ]);
  for (const [, init] of authorizedFetch.mock.calls) {
    expect((init!.headers as Record<string, string>)['Idempotency-Key']).toBe(KEY);
  }
});

test('comment sends multipart payload even without files', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse(addCommentSuccessFixture, 201));
  await transportWith(authorizedFetch).addComment(IDS.caseId, {
    payload: { body: 'Ответ', clarification_request_id: null }, files: [], idempotencyKey: KEY,
  });
  const init = authorizedFetch.mock.calls[0]![1] as RequestInit;
  expect(init.headers).toEqual({ 'Idempotency-Key': KEY });
  expect(init.body).toBeInstanceOf(FormData);
  expect(JSON.parse(String((init.body as FormData).get('payload')))).toEqual({ body: 'Ответ', clarification_request_id: null });
  expect((init.body as FormData).getAll('files[]')).toHaveLength(0);
});

test('comment multipart includes selected files', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse(addCommentSuccessFixture, 201));
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  await transportWith(authorizedFetch).addComment(IDS.caseId, {
    payload: { body: 'Ответ', clarification_request_id: null }, files: [file], idempotencyKey: KEY,
  });
  const sent = authorizedFetch.mock.calls[0]![1]!.body as FormData;
  expect(sent.getAll('files[]')).toEqual([file]);
});

test('remark multipart includes canonical payload and selected files', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse(remarkSuccessFixture, 201));
  const file = new File(['proof'], 'proof.jpg', { type: 'image/jpeg' });
  const request = { result_id: IDS.resultId, iteration_id: IDS.iterationId, remark_text: 'Осталось' };
  await transportWith(authorizedFetch).remarkResult(IDS.caseId, { request, files: [file], idempotencyKey: KEY });
  const init = authorizedFetch.mock.calls[0]![1] as RequestInit;
  expect(init.headers).toEqual({ 'Idempotency-Key': KEY });
  expect(JSON.parse(String((init.body as FormData).get('payload')))).toEqual(request);
  expect((init.body as FormData).getAll('files[]')).toEqual([file]);
});

test('409 propagates as a stale error without retry', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse({ error: { code: 'CONFLICT' } }, 409));
  const transport = transportWith(authorizedFetch);
  const failure = await transport.confirmResult(IDS.caseId, {
    request: { result_id: IDS.resultId, iteration_id: IDS.iterationId }, idempotencyKey: KEY,
  }).catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(ResidentHttpError);
  expect(isStaleResponse(failure)).toBe(true);
  expect(authorizedFetch).toHaveBeenCalledTimes(1);
});

test('downloadCapability mints an opaque capability and never exposes a raw storage url', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse(downloadCapabilityFixture));
  const capability = await transportWith(authorizedFetch).downloadCapability(IDS.attachmentId, KEY);
  expect(authorizedFetch).toHaveBeenCalledWith(
    `/api/v1/attachments/${IDS.attachmentId}/download-capability`,
    { method: 'POST', cache: 'no-store', headers: { 'Idempotency-Key': KEY } },
  );
  expect(capability.download_url).toBe(downloadCapabilityFixture.download_url);
  expect(capability.download_url).toMatch(/^https:\/\//);
  expect(capability.download_url).not.toContain('s3');
});

test('CreateCase exposes the canonical primary-case conflict code', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse({
    error: { code: 'DEMO_PRIMARY_CASE_EXISTS', message: 'Already exists', request_id: IDS.commandId },
  }, 409));
  const failure = await transportWith(authorizedFetch).createCase({
    payload: { premises_id: IDS.premisesId, category_id: IDS.categoryId, description: 'Течь' },
    files: [], idempotencyKey: KEY,
  }).catch((cause: unknown) => cause);
  expect(failure).toMatchObject({ status: 409, code: 'DEMO_PRIMARY_CASE_EXISTS' });
});

test('invalid success payloads are rejected by canonical schemas', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse({ case_id: 'not-a-uuid' }, 201));
  await expect(transportWith(authorizedFetch).confirmResult(IDS.caseId, {
    request: { result_id: IDS.resultId, iteration_id: IDS.iterationId }, idempotencyKey: KEY,
  })).rejects.toThrow();
});

test('createCaseOptionsFixture stays in sync with the approved projection', () => {
  expect(createCaseOptionsFixture.categories[0]!.category_id).toBe(IDS.categoryId);
});
