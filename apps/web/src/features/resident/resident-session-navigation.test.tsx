import { act, useEffect } from 'react';
import { MemoryRouter, useLocation, useRoutes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import type { SessionReadResponseOutput } from '@max-smart-city/contracts';
import { buildAppRoutes, type AppRouteModule } from '../../app/routes.js';
import { queryClient } from '../../app/query-client.js';
import { renderReactTree } from '../../app/test-render.js';
import { useSession } from '../session/session-provider.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { createResidentRouteModule } from './resident-routes.js';
import { ResidentHttpError, type ResidentTransport } from './resident-transport.js';
import { createCaseOptionsFixture, createCaseSuccessFixture, IDS, residentSnapshot } from './fixtures.js';
import { fillCreateCaseForm } from './test-helpers.js';

const primaryId = '11111111-1111-4111-8111-111111111111';
async function waitForUi(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assertion();
  });
}
const initial: SessionReadResponseOutput = {
  real_max_identity: { max_identity_id: primaryId, display_name: 'MAX', outbound_max_ready: true },
  demo_mode: true, demo_run_id: primaryId, primary_case_id: null,
  effective_actor: { app_user_id: primaryId, role: 'RESIDENT', display_name: 'Житель' },
};
let location = '';
let navigationCount = 0;
const revisions: number[] = [];
function LocationProbe() {
  const { pathname, key } = useLocation();
  useEffect(() => { location = pathname; navigationCount++; }, [pathname, key]);
  return null;
}
function RevisionProbe() {
  const { revision } = useSession();
  // Record only mounts: revision 1 must reach a fresh route instance, not just a rerender.
  useEffect(() => { revisions.push(revision); }, []);
  return null;
}
function Routed({ module }: { module: AppRouteModule }) {
  const routes = buildAppRoutes([module]);
  // Mount the probe with each resident route so revision/remount evidence is independent of the form.
  routes[0]!.children = module.routes.map((route) => ({ ...route, element: <><RevisionProbe />{route.element}</> }));
  return useRoutes(routes);
}
afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); location = ''; navigationCount = 0; revisions.length = 0; });

async function mount(code: string | null, primaryCaseId: string | null = primaryId, preexisting = false) {
  let session = { ...initial, primary_case_id: preexisting ? primaryCaseId : null };
  const foreground = new Set<() => void>();
  const fetch = vi.fn(async (path: string) => {
    if (path === '/api/v1/auth/max') return Response.json({ session_token: 'token', expires_at: '2030-01-01T00:00:00Z', session });
    if (path === '/api/v1/session') return Response.json(session);
    throw new Error(`Unexpected fetch: ${path}`);
  });
  vi.stubGlobal('fetch', fetch);
  const createCase = vi.fn(async () => {
    if (code) {
      if (code === 'DEMO_PRIMARY_CASE_EXISTS') session = { ...initial, primary_case_id: primaryCaseId,
        real_max_identity: { ...initial.real_max_identity, display_name: 'Свежая сессия' } };
      throw new ResidentHttpError(409, 'conflict', code);
    }
    return createCaseSuccessFixture;
  });
  const transport = { createCaseOptions: vi.fn().mockResolvedValue(createCaseOptionsFixture), createCase,
    addComment: vi.fn(), confirmResult: vi.fn(), remarkResult: vi.fn(), downloadCapability: vi.fn() } as ResidentTransport;
  const read = { list: vi.fn(), snapshot: vi.fn().mockResolvedValue(residentSnapshot()) } as CaseReadTransport;
  const module = createResidentRouteModule({ residentTransport: transport, readTransport: read, contextKey: 'ctx' });
  const view = renderReactTree(<MemoryRouter initialEntries={['/resident/cases/new']}>
    <LocationProbe /><Routed module={module} />
  </MemoryRouter>, { adapter: { name: 'test', isMiniAppContext: true, getRawInitData: () => 'signed',
    subscribeForeground: (callback) => { foreground.add(callback); return () => foreground.delete(callback); } } });
  return { ...view, createCase, read, fetch,
    refresh: async () => {
      session = { ...session, real_max_identity: { ...session.real_max_identity,
        display_name: `${session.real_max_identity.display_name}!` } };
      await act(async () => { for (const callback of [...foreground]) callback(); });
    },
  };
}

async function submit(view: Awaited<ReturnType<typeof mount>>) {
  await waitForUi(() => expect(view.container.querySelector('[data-testid=category-select]')).not.toBeNull());
  await fillCreateCaseForm(view.container);
  await act(async () => { (view.container.querySelector('[data-testid=create-case-submit]') as HTMLButtonElement).click(); });
}

test('canonical primary conflict refreshes REAL SessionProvider, remounts route and navigates once', async () => {
  const view = await mount('DEMO_PRIMARY_CASE_EXISTS');
  try {
    await submit(view);
    await waitForUi(() => expect(location).toBe(`/resident/cases/${primaryId}`));
    expect(revisions).toContain(1);
    expect(view.createCase).toHaveBeenCalledTimes(1);
    expect(view.read.snapshot).toHaveBeenCalledWith(primaryId, 'RESIDENT');
    const count = navigationCount;
    await view.refresh();
    await waitForUi(() => expect(revisions).toContain(2));
    await view.refresh();
    await waitForUi(() => expect(revisions).toContain(3));
    expect(location).toBe(`/resident/cases/${primaryId}`);
    expect(navigationCount).toBe(count);
    expect(view.createCase).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('normal create success navigates to created Case with real provider', async () => {
  const view = await mount(null);
  try {
    await submit(view);
    await waitForUi(() => expect(location).toBe(`/resident/cases/${IDS.caseId}`));
    expect(view.createCase).toHaveBeenCalledTimes(1);
    expect(view.fetch.mock.calls.filter(([path]) => path === '/api/v1/session')).toHaveLength(0);
  } finally { view.unmount(); }
});

test.each(['STALE_ASSIGNMENT', 'DEMO_PRIMARY_CASE_EXISTS'])('%s without authoritative primary ID stays on create route', async (code) => {
  const view = await mount(code, null);
  try {
    await submit(view);
    if (code === 'STALE_ASSIGNMENT') await waitForUi(() => expect(view.container.textContent).toContain('Данные обновлены'));
    else await waitForUi(() => {
      expect(revisions).toContain(1);
      expect(view.container.querySelector('[data-testid=category-select]')).not.toBeNull();
    });
    expect(location).toBe('/resident/cases/new');
    expect(view.createCase).toHaveBeenCalledTimes(1);
    expect(view.read.snapshot).not.toHaveBeenCalled();
    if (code === 'STALE_ASSIGNMENT') expect(view.fetch.mock.calls.filter(([path]) => path === '/api/v1/session')).toHaveLength(0);
    else expect(revisions).toContain(1);
  } finally { view.unmount(); }
});

test('authoritative existing primary on create route redirects without a CreateCase call', async () => {
  const view = await mount(null, primaryId, true);
  try {
    await waitForUi(() => expect(location).toBe(`/resident/cases/${primaryId}`));
    expect(view.createCase).not.toHaveBeenCalled();
    const count = navigationCount;
    await view.refresh();
    await waitForUi(() => expect(revisions).toContain(1));
    expect(navigationCount).toBe(count);
  } finally { view.unmount(); }
});
