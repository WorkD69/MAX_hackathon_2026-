import { act } from 'react';
import { MemoryRouter, useNavigate, useRoutes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import type { SessionReadResponseOutput } from '@max-smart-city/contracts';
import { buildAppRoutes } from '../../app/routes.js';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import { setNativeValue } from '../resident/test-helpers.js';
import { createContractorRouteModule } from './contractor-routes.js';
import { executor, ids } from './fixtures.js';

const otherId = '55555555-5555-4555-8555-555555555555';
async function waitForUi(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assertion();
  });
}
const initial: SessionReadResponseOutput = {
  real_max_identity: { max_identity_id: ids.case, display_name: 'MAX', outbound_max_ready: true },
  demo_mode: true, demo_run_id: ids.iteration, primary_case_id: ids.case,
  effective_actor: { app_user_id: ids.contractor, role: 'CONTRACTOR_EMPLOYEE', display_name: 'Мастер' },
};

function Routed() { return useRoutes(buildAppRoutes([createContractorRouteModule()])); }
let navigate: ReturnType<typeof useNavigate>;
function NavigationProbe() { navigate = useNavigate(); return null; }

afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });

async function mount() {
  let session = structuredClone(initial);
  const foreground = new Set<() => void>();
  const mutations: { path: string; key: string; body: RequestInit['body'] }[] = [];
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/auth/max') return Response.json({ session_token: 'token',
      expires_at: '2030-01-01T00:00:00Z', session });
    if (path === '/api/v1/session') return Response.json(session);
    if (init?.method === 'POST') {
      mutations.push({ path, key: new Headers(init.headers).get('Idempotency-Key')!, body: init.body });
      throw new TypeError('network uncertain');
    }
    return Response.json(executor({ case_id: path.split('/').at(-1) }));
  });
  vi.stubGlobal('fetch', fetch);
  const view = renderReactTree(<MemoryRouter initialEntries={[`/contractor/cases/${ids.case}`]}>
    <NavigationProbe /><Routed />
  </MemoryRouter>, { adapter: { name: 'test', isMiniAppContext: true, getRawInitData: () => 'signed',
    subscribeForeground: (callback) => { foreground.add(callback); return () => foreground.delete(callback); } } });
  await waitForUi(() => expect(view.container.querySelector('[name=comment]')).not.toBeNull());
  return { ...view, mutations, fetch,
    refresh: async (next = session) => {
      session = structuredClone(next);
      await act(async () => { for (const callback of [...foreground]) callback(); });
      await waitForUi(() => expect(view.container.querySelector('[name=comment]')).not.toBeNull());
    },
  };
}

async function send(view: Awaited<ReturnType<typeof mount>>, kind: 'comment' | 'material', content = 'Работа начата') {
  const previous = view.mutations.length;
  await act(async () => {
    if (kind === 'comment') setNativeValue(view.container.querySelector('[name=comment]') as HTMLTextAreaElement, content);
    else {
      const input = view.container.querySelector('[name=resultFile]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true,
        value: [new File([content], 'work.jpg', { type: 'image/jpeg', lastModified: 1 })] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await act(async () => { (view.container.querySelector(`[data-testid=${kind === 'comment' ? 'send-comment' : 'upload-material'}]`) as HTMLButtonElement).click(); });
  await waitForUi(() => {
    expect(view.mutations).toHaveLength(previous + 1);
    expect(view.container.textContent).toContain('Не удалось выполнить действие');
  });
}

test.each(['comment', 'material'] as const)('%s keeps uncertain key after foreground rerender and revision remount', async (kind) => {
  const view = await mount();
  try {
    await send(view, kind);
    const input = view.container.querySelector('[name=comment]');
    await view.refresh();
    expect(view.container.querySelector('[name=comment]')).toBe(input);
    expect(view.mutations).toHaveLength(1);
    await send(view, kind);
    await view.refresh({ ...initial, real_max_identity: { ...initial.real_max_identity, display_name: 'Обновлённый MAX' } });
    await waitForUi(() => expect(view.container.querySelector('[name=comment]')).not.toBe(input));
    expect(view.mutations).toHaveLength(2);
    await send(view, kind);
    expect(view.mutations.map((call) => call.key)).toEqual([view.mutations[0]!.key, view.mutations[0]!.key, view.mutations[0]!.key]);
    expect(view.mutations[0]!.body).toBeInstanceOf(FormData);
  } finally { view.unmount(); }
});

test.each([
  ['actor', 'comment'], ['run', 'comment'], ['Case', 'comment'],
  ['actor', 'material'], ['run', 'material'], ['Case', 'material'],
] as const)('%s change invalidates uncertain %s, including return to old scope', async (scope, kind) => {
  const view = await mount();
  try {
    await send(view, kind);
    if (scope === 'Case') await act(async () => { await navigate(`/contractor/cases/${otherId}`); });
    else await view.refresh(scope === 'actor'
      ? { ...initial, effective_actor: { ...initial.effective_actor, app_user_id: otherId } }
      : { ...initial, demo_run_id: otherId });
    await waitForUi(() => expect(view.container.querySelector('[name=comment]')).not.toBeNull());
    await send(view, kind);
    if (scope === 'Case') await act(async () => { await navigate(`/contractor/cases/${ids.case}`); });
    else await view.refresh(initial);
    await waitForUi(() => expect(view.container.querySelector('[name=comment]')).not.toBeNull());
    await send(view, kind);
    expect(new Set(view.mutations.map((call) => call.key)).size).toBe(3);
  } finally { view.unmount(); }
});

test.each(['comment', 'material'] as const)('changed %s payload/bytes starts a new intent after refresh', async (kind) => {
  const view = await mount();
  try {
    await send(view, kind, 'aaa');
    await view.refresh();
    await send(view, kind, 'bbb');
    expect(view.mutations[1]!.key).not.toBe(view.mutations[0]!.key);
  } finally { view.unmount(); }
});
