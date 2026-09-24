import { expect, test, vi } from 'vitest';
import { createPlatformAdapter } from './platform-adapter.js';

test('TG-004 browser adapter exposes only the raw platform seam', () => {
  const adapter = createPlatformAdapter();
  expect(adapter.name).toBe('browser');
  expect(adapter.isMiniAppContext).toBe(false);
  expect(adapter.getRawInitData()).toBeNull();
});

test('TG-004 foreground subscription calls listener and unsubscribes', () => {
  const listener = vi.fn();
  const unsubscribe = createPlatformAdapter().subscribeForeground(listener);
  window.dispatchEvent(new Event('focus'));
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  window.dispatchEvent(new Event('focus'));
  expect(listener).toHaveBeenCalledTimes(1);
});
