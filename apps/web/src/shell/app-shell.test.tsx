import { act } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from './app-shell.js';
import { renderReactTree } from '../app/test-render.js';
import type { PlatformAdapter } from '../platform/platform-adapter.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => 'signed=raw',
  subscribeForeground: () => () => {},
};
const id = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllGlobals());

test('TG-020 shell shows bootstrap error and retry without a session in direct browser', async () => {
  const router = createMemoryRouter([
    { path: '/', element: <AppShell />, children: [{ index: true, element: <p data-testid="outlet">Ready</p> }] },
  ]);
  const view = renderReactTree(<RouterProvider router={router} />);
  try {
    expect(view.container.querySelector('.app-shell__header')?.textContent).toContain('MAX Smart City');
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('.app-shell__main [data-testid="outlet"]')).not.toBeNull();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Не удалось');
    expect(view.container.querySelector('button')?.textContent).toContain('Повторить');
    expect(view.container.querySelector('[data-testid="demo-controls"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="session-route"]')?.hasAttribute('hidden')).toBe(true);
  } finally {
    view.unmount();
    router.dispose();
  }
});

test('TG-020 trusted shell renders outlet and server-enabled demo controls', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
    session_token: 'server-token', expires_at: '2030-01-01T00:00:00Z',
    session: {
      real_max_identity: { max_identity_id: id, display_name: 'Эксперт', outbound_max_ready: true },
      demo_mode: true, demo_run_id: id, primary_case_id: null,
      effective_actor: { app_user_id: id, role: 'RESIDENT', display_name: 'Житель' },
    },
  }), { status: 200 }))));
  const router = createMemoryRouter([
    { path: '/', element: <AppShell />, children: [{ index: true, element: <p data-testid="outlet">Ready</p> }] },
  ]);
  const view = renderReactTree(<RouterProvider router={router} />, { adapter });
  try {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.container.querySelector('[data-testid="outlet"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="demo-controls"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="session-route"]')?.hasAttribute('hidden')).toBe(false);
  } finally { view.unmount(); router.dispose(); }
});

test('TG-020 shell keeps session and four role controls in mobile and web viewports', async () => {
  const originalWidth = window.innerWidth;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
    session_token: 'server-token', expires_at: '2030-01-01T00:00:00Z',
    session: {
      real_max_identity: { max_identity_id: id, display_name: 'Эксперт', outbound_max_ready: true },
      demo_mode: true, demo_run_id: id, primary_case_id: null,
      effective_actor: { app_user_id: id, role: 'RESIDENT', display_name: 'Житель' },
    },
  }), { status: 200 }))));
  try {
    for (const width of [375, 1024]) {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
      const router = createMemoryRouter([{ path: '/', element: <AppShell /> }]);
      const view = renderReactTree(<RouterProvider router={router} />, { adapter });
      try {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        expect(view.container.querySelector('.app-shell--session')).not.toBeNull();
        expect(view.container.querySelectorAll('[data-role-view]')).toHaveLength(4);
      } finally { view.unmount(); router.dispose(); }
    }
  } finally {
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
  }
});
