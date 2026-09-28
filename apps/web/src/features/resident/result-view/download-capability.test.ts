import { afterEach, expect, test, vi } from 'vitest';
import { downloadCapabilityFixture } from '../fixtures.js';
import { deliverDownload, nativeDownloadBridge } from './download-capability.js';

test('capability url is handed to the native bridge when MAX provides one', () => {
  const downloadFile = vi.fn();
  const bridge = nativeDownloadBridge({ WebApp: { platform: 'ios', downloadFile } });
  expect(bridge).not.toBeNull();
  deliverDownload(downloadCapabilityFixture, bridge);
  expect(downloadFile).toHaveBeenCalledWith(downloadCapabilityFixture.download_url, downloadCapabilityFixture.file_name);
});

test('no bridge is reported outside a native context', () => {
  expect(nativeDownloadBridge({})).toBeNull();
  expect(nativeDownloadBridge(undefined)).toBeNull();
  expect(nativeDownloadBridge({ WebApp: { platform: 'web', downloadFile: vi.fn() } })).toBeNull();
  expect(nativeDownloadBridge({ WebApp: { downloadFile: vi.fn() } })).toBeNull();
});

test('a non-callable bridge is never treated as native', () => {
  expect(nativeDownloadBridge({ WebApp: { downloadFile: 'nope' } })).toBeNull();
});

test('browser fallback fetches bytes, uses only a blob href, then revokes it', async () => {
  const seenHrefs: string[] = [];
  const anchor = document.createElement('a');
  const append = vi.spyOn(document.body, 'appendChild');
  append.mockImplementation((node) => node);
  const remove = vi.spyOn(anchor, 'remove');
  const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
  anchor.click = () => { seenHrefs.push(anchor.href); };
  const fetchBytes = vi.fn().mockResolvedValue(new Response('file bytes'));
  const urlApi = { createObjectURL: vi.fn().mockReturnValue('blob:https://app.example/temporary'), revokeObjectURL: vi.fn() };

  try {
    await deliverDownload(downloadCapabilityFixture, null, document, fetchBytes, urlApi);
    expect(fetchBytes).toHaveBeenCalledWith(downloadCapabilityFixture.download_url, {
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
    expect(createElement).toHaveBeenCalledWith('a');
    expect(seenHrefs).toEqual(['blob:https://app.example/temporary']);
    expect(anchor.getAttribute('href')).not.toBe(downloadCapabilityFixture.download_url);
    expect(anchor.getAttribute('download')).toBe(downloadCapabilityFixture.file_name);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:https://app.example/temporary');
  } finally {
    createElement.mockRestore();
    append.mockRestore();
    remove.mockRestore();
  }
});

afterEach(() => { vi.restoreAllMocks(); });
