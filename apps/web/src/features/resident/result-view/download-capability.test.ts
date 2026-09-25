import { afterEach, expect, test, vi } from 'vitest';
import { downloadCapabilityFixture } from '../fixtures.js';
import { deliverDownload, nativeDownloadBridge } from './download-capability.js';

test('capability url is handed to the native bridge when MAX provides one', () => {
  const downloadFile = vi.fn();
  const bridge = nativeDownloadBridge({ WebApp: { downloadFile } });
  expect(bridge).not.toBeNull();
  deliverDownload(downloadCapabilityFixture, bridge);
  expect(downloadFile).toHaveBeenCalledWith(downloadCapabilityFixture.download_url, downloadCapabilityFixture.file_name);
});

test('no bridge is reported outside a native context', () => {
  expect(nativeDownloadBridge({})).toBeNull();
  expect(nativeDownloadBridge(undefined)).toBeNull();
});

test('a non-callable bridge is never treated as native', () => {
  expect(nativeDownloadBridge({ WebApp: { downloadFile: 'nope' } })).toBeNull();
});

test('browser fallback triggers a temporary anchor and cleans it up', () => {
  const click = vi.fn();
  const anchor = document.createElement('a');
  const append = vi.spyOn(document.body, 'appendChild');
  append.mockImplementation((node) => node);
  const remove = vi.spyOn(anchor, 'remove');
  const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
  anchor.click = click;

  try {
    deliverDownload(downloadCapabilityFixture, null);
    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.getAttribute('href')).toBe(downloadCapabilityFixture.download_url);
    expect(anchor.getAttribute('download')).toBe(downloadCapabilityFixture.file_name);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    createElement.mockRestore();
    append.mockRestore();
    remove.mockRestore();
  }
});

afterEach(() => { vi.restoreAllMocks(); });
