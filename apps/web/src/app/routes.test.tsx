import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, test } from 'vitest';
import { buildAppRoutes, type AppRouteModule } from './routes.js';
import { renderReactTree } from './test-render.js';

test('TG-004 route modules flatten into layout children', () => {
  const module: AppRouteModule = {
    id: 'x',
    routes: [{ path: 'first', element: <p>First</p> }, { path: 'second', element: <p>Second</p> }],
  };
  const routes = buildAppRoutes([module]);
  expect(routes[0]?.children).toHaveLength(3);
  expect(routes[0]?.children?.[1]?.path).toBe('first');
  expect(routes[0]?.children?.[2]?.path).toBe('second');
});

test('TG-004 unknown route displays catch-all alert', () => {
  const router = createMemoryRouter(buildAppRoutes(), { initialEntries: ['/missing'] });
  const view = renderReactTree(<RouterProvider router={router} />);
  try {
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Маршрут не найден');
  } finally {
    view.unmount();
    router.dispose();
  }
});
