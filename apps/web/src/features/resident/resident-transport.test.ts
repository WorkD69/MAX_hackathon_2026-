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

function activeCategoriesResponse() {
  return [
    { category_id: IDS.categoryId, name: 'Отопление / стояк', description: null,
      default_contractor_id: null, requires_premises_access: true, result_requirement: 'PHOTO', active: true },
    { category_id: IDS.inactiveCategoryId, name: 'Архивная', description: null,
      default_contractor_id: null, requires_premises_access: false, result_requirement: 'NONE', active: false },
  ];
}

function transportWith(authorizedFetch: AuthorizedFetch, premises = [premiseFixture]) {
  return createHttpResidentTransport(authorizedFetch, async () => premises);
}

/** vi.fn() is untyped by default, so it must be narrowed to the transport seam. */
function stubFetch(): AuthorizedFetch & MockInstance {
  return vi.fn() as unknown as AuthorizedFetch & MockInstance;
}

test('createCaseOptions reads active categories only and returns server premises', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse(activeCategoriesResponse()));
  const options = await transportWith(authorizedFetch).createCaseOptions();
  expect(authorizedFetch).toHaveBeenCalledWith('/api/v1/config/categories', { method: 'GET', cache: 'no-store' });
  expect(options.categories).toEqual([{
    categoryId: IDS.categoryId, name: 'Отопление / стояк', resultRequirement: 'PHOTO', active: true,
  }]);
  expect(options.premises).toEqual([premiseFixture]);
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
    payload: { body: 'Уточните адрес', clarification_request_id: null }, idempotencyKey: KEY,
  });
  await transport.confirmResult(IDS.caseId, {
    request: { result_id: IDS.resultId, iteration_id: IDS.iterationId }, idempotencyKey: KEY,
  });
  await transport.remarkResult(IDS.caseId, {
    request: { result_id: IDS.resultId, iteration_id: IDS.iterationId, remark_text: 'Протечка' }, idempotencyKey: KEY,
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
  const capability = await transportWith(authorizedFetch).downloadCapability(IDS.attachmentId);
  expect(authorizedFetch).toHaveBeenCalledWith(
    `/api/v1/attachments/${IDS.attachmentId}/download-capability`, { method: 'POST', cache: 'no-store' },
  );
  expect(capability.download_url).toBe(downloadCapabilityFixture.download_url);
  expect(capability.download_url).toMatch(/^https:\/\//);
  expect(capability.download_url).not.toContain('s3');
});

test('invalid success payloads are rejected by canonical schemas', async () => {
  const authorizedFetch = stubFetch().mockResolvedValue(jsonResponse({ case_id: 'not-a-uuid' }, 201));
  await expect(transportWith(authorizedFetch).confirmResult(IDS.caseId, {
    request: { result_id: IDS.resultId, iteration_id: IDS.iterationId }, idempotencyKey: KEY,
  })).rejects.toThrow();
});

test('createCaseOptionsFixture stays in sync with the approved projection', () => {
  expect(createCaseOptionsFixture.categories[0]!.active).toBe(true);
});
