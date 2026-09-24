import { afterEach, expect, test, vi } from 'vitest';
import { authenticateMax, readSession, switchActor, startDemoRun } from './session-api.js';

const actor = { app_user_id: null, role: null, display_name: 'Эксперт' };
const session = {
  real_max_identity: {
    max_identity_id: '11111111-1111-4111-8111-111111111111',
    display_name: 'Эксперт MAX',
    outbound_max_ready: true,
  },
  demo_mode: true,
  demo_run_id: null,
  primary_case_id: null,
  effective_actor: actor,
};
const auth = { session_token: 'server-token', expires_at: '2030-01-01T00:00:00Z', session };

afterEach(() => vi.unstubAllGlobals());

test('MAX auth sends only raw signed initData and accepts server-issued context', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(auth), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  expect(await authenticateMax('signed=raw')).toEqual(auth);
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/auth/max');
  expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body)).toEqual({ init_data: 'signed=raw' });
  expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('omit');
});

test('session read uses Bearer token and validates authoritative context', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  expect(await readSession('server-token')).toEqual(session);
  expect(fetch.mock.calls[0]?.[1]?.headers.Authorization).toBe('Bearer server-token');
});

test('actor switch sends only role_view with mutation headers', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(auth), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await switchActor('server-token', 'CONTRACTOR_EMPLOYEE');
  const init = fetch.mock.calls[0]?.[1];
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/demo/session/actor');
  expect(JSON.parse(init.body)).toEqual({ role_view: 'CONTRACTOR_EMPLOYEE' });
  expect(init.headers.Authorization).toBe('Bearer server-token');
  expect(init.headers['Idempotency-Key']).toBeTruthy();
});

test('start DemoRun sends canonical scenario and idempotency header', async () => {
  const run = {
    demo_run_id: '22222222-2222-4222-8222-222222222222',
    status: 'ACTIVE',
    primary_case_id: null,
    role_views: ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'],
  };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(run), { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  expect(await startDemoRun('server-token')).toEqual(run);
  const init = fetch.mock.calls[0]?.[1];
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/demo/runs');
  expect(JSON.parse(init.body)).toEqual({ scenario_key: 'primary-housing-demo' });
  expect(init.headers['Idempotency-Key']).toBeTruthy();
});
