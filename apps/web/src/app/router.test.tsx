import { act } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, test } from 'vitest';
import { createAppRouter } from './router.js';
import { buildAppRoutes } from './routes.js';
import { renderReactTree } from './test-render.js';

test('TG-004 browser router uses the shared route builder', () => {
  const router = createAppRouter();
  try {
    expect(router.routes[0]?.path).toBe('/');
    expect(router.routes[0]?.children?.[0]?.index).toBe(true);
  } finally {
    router.dispose();
  }
});

test('TG-004 memory router renders home and contributed route', async () => {
  const routes = buildAppRoutes([
    { id: 'x', routes: [{ path: 'module', element: <p data-testid="module-route">Module</p> }] },
  ]);
  const router = createMemoryRouter(routes);
  const view = renderReactTree(<RouterProvider router={router} />);
  try {
    expect(view.container.querySelector('[data-testid="home-placeholder"]')).not.toBeNull();
    await act(async () => {
      await router.navigate('/module');
    });
    expect(view.container.querySelector('[data-testid="module-route"]')).not.toBeNull();
  } finally {
    view.unmount();
    router.dispose();
  }
});
