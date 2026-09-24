import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { useQueryClient } from '@tanstack/react-query';
import { renderReactTree } from '../../app/test-render.js';
import type { PlatformAdapter } from '../../platform/platform-adapter.js';
import { SessionProvider, useSession } from './session-provider.js';

const maxAdapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => 'signed=raw',
  subscribeForeground: () => () => {},
};
const browserAdapter: PlatformAdapter = {
  ...maxAdapter, name: 'browser', isMiniAppContext: false,
};
const id = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
function context(overrides: Record<string, unknown> = {}) {
  return {
    real_max_identity: { max_identity_id: id, display_name: 'Эксперт MAX', outbound_max_ready: true },
    demo_mode: true, demo_run_id: runId, primary_case_id: caseId,
    effective_actor: { app_user_id: id, role: 'RESIDENT', display_name: 'Житель' },
    ...overrides,
  };
}
function auth(session = context(), token = 'server-token') {
  return { session_token: token, expires_at: '2030-01-01T00:00:00Z', session };
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
function Probe() {
  const { status, session, retry, startRun, switchRole, actionError, authorizedFetch } = useSession();
  const queryClient = useQueryClient();
  return <div>
    <span data-testid="status">{status}</span>
    <span data-testid="run">{session?.demo_run_id ?? ''}</span>
    <span data-testid="case">{session?.primary_case_id ?? ''}</span>
    <span data-testid="role">{session?.effective_actor.role ?? ''}</span>
    <span data-testid="action-error">{actionError ?? ''}</span>
    <button onClick={() => void retry()}>Retry</button>
    <button onClick={() => void startRun()}>Start</button>
    <button onClick={() => void switchRole('UK_ADMIN')}>Switch</button>
    <button onClick={() => void authorizedFetch('/api/v1/session')}>Protected</button>
    <button onClick={() => queryClient.setQueryData(['case', caseId], { allowed_actions: ['complete'] })}>Cache</button>
    <span data-testid="cache">{String(queryClient.getQueryData(['case', caseId]) !== undefined)}</span>
  </div>;
}
function mount(adapter: PlatformAdapter) {
  return renderReactTree(<SessionProvider><Probe /></SessionProvider>, { adapter });
}
async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
function click(view: ReturnType<typeof mount>, label: string) {
  const button = Array.from(view.container.querySelectorAll('button')).find((node) => node.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  act(() => button.click());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('trusted Bridge fixture bootstraps and restores run and primary Case without starting a run', async () => {
  const fetch = vi.fn().mockResolvedValue(json(auth()));
  vi.stubGlobal('fetch', fetch);
  const view = mount(maxAdapter);
  try {
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('pending');
    await flush();
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('ready');
    expect(view.container.querySelector('[data-testid="run"]')?.textContent).toBe(runId);
    expect(view.container.querySelector('[data-testid="case"]')?.textContent).toBe(caseId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/auth/max');
  } finally { view.unmount(); }
});

test('direct browser cannot bootstrap even if client fixture supplies raw data', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const view = mount(browserAdapter);
  try {
    await flush();
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(fetch).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('auth error exposes retry without a local fake session', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ error: { code: 'MAX_INIT_DATA_INVALID_SIGNATURE' } }, 401))
    .mockResolvedValueOnce(json(auth()));
  vi.stubGlobal('fetch', fetch);
  const view = mount(maxAdapter);
  try {
    await flush();
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(view.container.querySelector('[data-testid="role"]')?.textContent).toBe('');
    click(view, 'Retry');
    await flush();
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('ready');
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); }
});

test('full remount authenticates again and never persists token in browser storage', async () => {
  const fetch = vi.fn().mockResolvedValue(json(auth()));
  vi.stubGlobal('fetch', fetch);
  const local = vi.spyOn(localStorage, 'setItem');
  const sessionSet = vi.spyOn(sessionStorage, 'setItem');
  const cookieBefore = document.cookie;
  const indexedOpen = vi.fn();
  vi.stubGlobal('indexedDB', { open: indexedOpen });
  const first = mount(maxAdapter);
  await flush();
  first.unmount();
  const second = mount(maxAdapter);
  try {
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(local).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect(indexedOpen).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookieBefore);
  } finally { second.unmount(); }
});

test('401 from protected request clears runtime session and enters safe error flow', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json(auth())).mockResolvedValueOnce(json({}, 401));
  vi.stubGlobal('fetch', fetch);
  const view = mount(maxAdapter);
  try {
    await flush();
    click(view, 'Protected');
    await flush();
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(view.container.querySelector('[data-testid="role"]')?.textContent).toBe('');
    expect(fetch.mock.calls[1]?.[1]?.headers.get('Authorization')).toBe('Bearer server-token');
  } finally { view.unmount(); }
});

test('starting a run reads authoritative session after server success', async () => {
  const newRun = '44444444-4444-4444-8444-444444444444';
  const fetch = vi.fn().mockResolvedValueOnce(json(auth(context({ demo_run_id: null, primary_case_id: null }))))
    .mockResolvedValueOnce(json({ demo_run_id: newRun, status: 'ACTIVE', primary_case_id: null, role_views: ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'] }, 201))
    .mockResolvedValueOnce(json(context({ demo_run_id: newRun, primary_case_id: null })));
  vi.stubGlobal('fetch', fetch);
  const view = mount(maxAdapter);
  try {
    await flush();
    click(view, 'Start');
    await flush();
    expect(view.container.querySelector('[data-testid="run"]')?.textContent).toBe(newRun);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(['/api/v1/auth/max', '/api/v1/demo/runs', '/api/v1/session']);
  } finally { view.unmount(); }
});

test('DemoRun conflict refetches authoritative session without inventing a run', async () => {
  const initial = context({ demo_run_id: null, primary_case_id: null });
  const fetch = vi.fn().mockResolvedValueOnce(json(auth(initial)))
    .mockResolvedValueOnce(json({ error: { code: 'DEMO_RUN_MISMATCH' } }, 409))
    .mockResolvedValueOnce(json(initial));
  vi.stubGlobal('fetch', fetch);
  const view = mount(maxAdapter);
  try {
    await flush();
    click(view, 'Start');
    await flush();
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(['/api/v1/auth/max', '/api/v1/demo/runs', '/api/v1/session']);
    expect(view.container.querySelector('[data-testid="run"]')?.textContent).toBe('');
    expect(view.container.querySelector('[data-testid="action-error"]')?.textContent).not.toBe('');
  } finally { view.unmount(); }
});

test('malformed successful DemoRun response returns to safe bootstrap error', async () => {
  const initial = context({ demo_run_id: null, primary_case_id: null });
  const fetch = vi.fn().mockResolvedValueOnce(json(auth(initial)))
    .mockResolvedValueOnce(json({ status: 'ACTIVE' }, 201))
    .mockResolvedValueOnce(json(initial));
  vi.stubGlobal('fetch', fetch);
  const view = mount(maxAdapter);
  try {
    await flush();
    click(view, 'Start');
    await flush();
    expect(view.container.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(view.container.querySelector('[data-testid="run"]')?.textContent).toBe('');
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); }
});

test('switch replaces session, clears cached actions and refetches server session', async () => {
  const switched = context({ effective_actor: { app_user_id: id, role: 'UK_ADMIN', display_name: 'Администратор' } });
  const fetch = vi.fn().mockResolvedValueOnce(json(auth()))
    .mockResolvedValueOnce(json(auth(switched, 'new-token')))
    .mockResolvedValueOnce(json(switched));
  vi.stubGlobal('fetch', fetch);
  const view = mount(maxAdapter);
  try {
    await flush();
    click(view, 'Cache');
    click(view, 'Switch');
    await flush();
    expect(view.container.querySelector('[data-testid="role"]')?.textContent).toBe('UK_ADMIN');
    expect(fetch.mock.calls[2]?.[0]).toBe('/api/v1/session');
    expect(fetch.mock.calls[2]?.[1]?.headers.Authorization).toBe('Bearer new-token');
    expect(view.container.querySelector('[data-testid="cache"]')?.textContent).toBe('false');
  } finally { view.unmount(); }
});
