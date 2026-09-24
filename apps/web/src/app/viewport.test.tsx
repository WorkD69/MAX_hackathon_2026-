import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { buildAppRoutes } from './routes.js';
import { renderReactTree } from './test-render.js';

const originalWidth = window.innerWidth;
afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
});

for (const width of [375, 1024]) {
  test(`TG-004 shell renders at ${width}px viewport`, () => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    const router = createMemoryRouter(buildAppRoutes());
    const view = renderReactTree(<RouterProvider router={router} />);
    try {
      expect(window.innerWidth).toBe(width);
      expect(view.container.id).toBe('root');
      expect(document.querySelector('#root .app-shell')).not.toBeNull();
      expect(view.container.querySelector('[data-testid="home-placeholder"]')).not.toBeNull();
    } finally {
      view.unmount();
      router.dispose();
    }
  });
}
