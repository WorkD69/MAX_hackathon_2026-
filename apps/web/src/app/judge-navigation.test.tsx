import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { SessionReadResponseOutput } from '@max-smart-city/contracts';
import { renderReactTree } from './test-render.js';
import { ProductNavigation } from './product-routes.js';
import { DemoControls } from '../features/demo/demo-controls.js';
import { queryClient } from './query-client.js';

const session: SessionReadResponseOutput = {
  real_max_identity: { max_identity_id: '11111111-0000-4000-8000-000000000000', display_name: 'Эксперт', outbound_max_ready: true },
  demo_mode: true, demo_run_id: '22222222-0000-4000-8000-000000000000', primary_case_id: '2bd09410-0000-4000-8000-000000000000',
  effective_actor: { app_user_id: '33333333-0000-4000-8000-000000000000', role: 'RESIDENT', display_name: 'Житель' },
};
vi.mock('../features/session/session-provider.js', () => ({ useSession: () => ({ session, status: 'ready', busy: false,
  actionError: null, revision: 0, startRun: vi.fn(), switchRole: vi.fn() }) }));
afterEach(() => { queryClient.clear(); session.demo_mode = true; });

test('existing primary Case is named current; production continues to offer new cases', () => {
  const demo = renderReactTree(<MemoryRouter><ProductNavigation /></MemoryRouter>);
  try {
    expect(demo.container.textContent).toContain('Текущее обращение');
    expect(demo.container.textContent).not.toContain('Создать обращение');
  } finally { demo.unmount(); }
  session.demo_mode = false;
  const normal = renderReactTree(<MemoryRouter><ProductNavigation /></MemoryRouter>);
  try { expect(normal.container.textContent).toContain('Создать обращение'); } finally { normal.unmount(); }
});

test('new DemoRun exits the old Case route', async () => {
  const oldRun = session.demo_run_id;
  const oldRole = session.effective_actor.role;
  function Harness() {
    const [, changed] = useState(0);
    const location = useLocation();
    return <><ProductNavigation /><span data-location>{location.pathname}</span><button data-switch onClick={() => {
      session.demo_run_id = '44444444-0000-4000-8000-000000000000'; changed(n => n + 1);
    }}>Новый прогон</button></>;
  }
  const view = renderReactTree(<MemoryRouter initialEntries={[`/cases/${session.primary_case_id}`]}><Harness /></MemoryRouter>);
  try {
    await act(async () => { (view.container.querySelector('[data-switch]') as HTMLButtonElement).click(); });
    expect(view.container.querySelector('[data-location]')?.textContent).toBe('/');
  } finally { view.unmount(); session.demo_run_id = oldRun; session.effective_actor.role = oldRole; }
});

test('demo clearly discloses synthetic data and admin meaning without raw run/case UUIDs', () => {
  const view = renderReactTree(<DemoControls />);
  try {
    expect(view.container.textContent).toContain('Демонстрационные данные');
    expect(view.container.textContent).toContain('Администратор УК · настройки');
    expect(view.container.textContent).toContain('Начать новый демо-прогон');
    expect(view.container.textContent).not.toContain('DemoRun');
    expect(view.container.textContent).not.toContain(session.primary_case_id);
    expect(view.container.querySelectorAll('[data-role-view]')).toHaveLength(4);
  } finally { view.unmount(); }
});
