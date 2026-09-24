import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, test } from 'vitest';
import { buildAppRoutes } from './app/routes.js';
import { renderReactTree } from './app/test-render.js';

test('TG-004 React bootstrap renders one home shell', () => {
  const router = createMemoryRouter(buildAppRoutes());
  const view = renderReactTree(<RouterProvider router={router} />);
  try {
    expect(view.container.querySelector('[data-testid="home-placeholder"]')).not.toBeNull();
    expect(view.container.querySelectorAll('.app-shell')).toHaveLength(1);
  } finally {
    view.unmount();
    router.dispose();
  }
});
