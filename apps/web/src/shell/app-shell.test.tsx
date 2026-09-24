import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, test } from 'vitest';
import { AppShell } from './app-shell.js';
import { renderReactTree } from '../app/test-render.js';

test('TG-004 shell renders static header and route outlet', () => {
  const router = createMemoryRouter([
    { path: '/', element: <AppShell />, children: [{ index: true, element: <p data-testid="outlet">Ready</p> }] },
  ]);
  const view = renderReactTree(<RouterProvider router={router} />);
  try {
    expect(view.container.querySelector('.app-shell__header')?.textContent).toContain('MAX Smart City');
    expect(view.container.querySelector('.app-shell__main [data-testid="outlet"]')).not.toBeNull();
  } finally {
    view.unmount();
    router.dispose();
  }
});
