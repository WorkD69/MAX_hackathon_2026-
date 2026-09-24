import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../app/test-render.js';
import type { PlatformAdapter } from '../../platform/platform-adapter.js';
import { SessionProvider } from '../session/session-provider.js';
import { DemoControls, ROLE_VIEWS } from './demo-controls.js';

const id = '11111111-1111-4111-8111-111111111111';
const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => 'signed=raw',
  subscribeForeground: () => () => {},
};
function response(demoMode: boolean) {
  return new Response(JSON.stringify({
    session_token: 'server-token', expires_at: '2030-01-01T00:00:00Z',
    session: {
      real_max_identity: { max_identity_id: id, display_name: 'Эксперт', outbound_max_ready: true },
      demo_mode: demoMode, demo_run_id: id, primary_case_id: null,
      effective_actor: { app_user_id: id, role: 'RESIDENT', display_name: 'Житель' },
    },
  }), { status: 200 });
}
async function mount(demoMode: boolean) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(demoMode)));
  const view = renderReactTree(<SessionProvider><DemoControls /></SessionProvider>, { adapter });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return view;
}
afterEach(() => vi.unstubAllGlobals());

test('demo view list contains exactly four canonical roles', () => {
  expect(ROLE_VIEWS).toEqual(['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE']);
});

test('authoritative demo context reveals test-only controls and four role buttons', async () => {
  const view = await mount(true);
  try {
    expect(view.container.textContent).toContain('ДЕМО · ТОЛЬКО ДЛЯ ТЕСТА');
    expect(view.container.querySelectorAll('[data-role-view]')).toHaveLength(4);
    expect(view.container.querySelector('[data-testid="demo-start"]')).not.toBeNull();
  } finally { view.unmount(); }
});

test('normal server context hides controls despite the same client fixture', async () => {
  const view = await mount(false);
  try {
    expect(view.container.querySelector('[data-testid="demo-controls"]')).toBeNull();
    expect(view.container.querySelector('[data-role-view]')).toBeNull();
  } finally { view.unmount(); }
});
