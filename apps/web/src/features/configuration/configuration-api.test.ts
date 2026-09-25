import { expect, test, vi } from 'vitest';
import { configurationApi, ConfigurationHttpError } from './configuration-api.js';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

test('read uses only own-scope configuration endpoints and canonical schemas', async () => {
  const fetcher = vi.fn(async (path: string) => {
    const values: Record<string, unknown> = {
      '/api/v1/config/organization': { organization_id: id, name: 'УК', active: true },
      '/api/v1/config/houses': [], '/api/v1/config/categories': [],
      '/api/v1/config/contractors': [], '/api/v1/config/users': [],
    };
    return ok(values[path]);
  });
  const api = configurationApi(fetcher);
  expect((await api.organization()).name).toBe('УК');
  await Promise.all([api.houses(), api.categories(), api.contractors(), api.users()]);
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    '/api/v1/config/organization', '/api/v1/config/houses', '/api/v1/config/categories',
    '/api/v1/config/contractors', '/api/v1/config/users',
  ]);
});

test('writes exact canonical payloads with idempotency and no tenant selector', async () => {
  const fetcher = vi.fn(async () => ok({ organization_id: id, name: 'УК', active: true }));
  const api = configurationApi(fetcher);
  await api.organizationUpdate({ name: 'УК' });
  await api.houseCreate({ address: 'Дом 2', display_label: null, active: true });
  await api.houseUpdate(id, { active: false });
  await api.categoryCreate({ name: 'Отопление', description: null, default_contractor_id: other, requires_premises_access: true, result_requirement: 'PHOTO', active: true });
  await api.categoryUpdate(id, { result_requirement: 'FILE', default_contractor_id: null });
  await api.contractorCreate({ display_name: 'Подрядчик' });
  await api.contractorBinding(id, false);
  await api.userRoleBinding(id, { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [other], active: true });
  await api.contractorEmployee(id, other, true);
  const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
  expect(calls.map(([path, init]) => [path, init.method])).toEqual([
    ['/api/v1/config/organization', 'PATCH'], ['/api/v1/config/houses', 'POST'],
    [`/api/v1/config/houses/${id}`, 'PATCH'], ['/api/v1/config/categories', 'POST'],
    [`/api/v1/config/categories/${id}`, 'PATCH'], ['/api/v1/config/contractors', 'POST'],
    [`/api/v1/config/contractors/${id}/binding`, 'PUT'],
    [`/api/v1/config/users/${id}/role-binding`, 'PUT'],
    [`/api/v1/config/contractors/${id}/employees/${other}`, 'PUT'],
  ]);
  for (const [, init] of calls) {
    expect(JSON.parse(init.body as string)).not.toHaveProperty('organization_id');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
  }
  expect(JSON.parse(calls[3]![1].body as string)).toEqual({ name: 'Отопление', description: null, default_contractor_id: other, requires_premises_access: true, result_requirement: 'PHOTO', active: true });
  expect(JSON.parse(calls[7]![1].body as string)).toEqual({ role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [other], active: true });
});

test('rejects fifth role and invented result requirement before transport', async () => {
  const fetcher = vi.fn(async () => ok({}));
  const api = configurationApi(fetcher);
  await expect(api.userRoleBinding(id, { role: 'SUPER_ADMIN' as never, contractor_id: null, house_ids: [] })).rejects.toThrow();
  await expect(api.categoryUpdate(id, { result_requirement: 'VIDEO' as never })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test('preserves server status and semantic error for cross-tenant and conflict responses', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Не найдено', request_id: id } }), { status: 404 }));
  const api = configurationApi(fetcher);
  await expect(api.houseUpdate(other, { active: false })).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' } satisfies Partial<ConfigurationHttpError>);
});
