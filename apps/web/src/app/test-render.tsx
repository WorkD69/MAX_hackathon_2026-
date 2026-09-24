import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app-providers.js';
import type { PlatformAdapter } from '../platform/platform-adapter.js';

export function renderReactTree(
  ui: ReactNode,
  options: { adapter?: PlatformAdapter } = {},
): { container: HTMLDivElement; unmount: () => void } {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
  });
  const container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<AppProviders {...options}>{ui}</AppProviders>);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
