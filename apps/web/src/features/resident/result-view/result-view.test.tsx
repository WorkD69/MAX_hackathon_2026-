import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../../app/test-render.js';
import { queryClient } from '../../../app/query-client.js';
import type { PlatformAdapter } from '../../../platform/platform-adapter.js';
import type { ResidentTransport } from '../resident-transport.js';
import { waitForUi } from '../test-helpers.js';
import { IDS, downloadCapabilityFixture, residentSnapshot } from '../fixtures.js';
import { ResidentResultView } from './result-view.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null, subscribeForeground: () => () => {},
};

function transport(overrides: Partial<ResidentTransport> = {}): ResidentTransport {
  return {
    createCaseOptions: vi.fn(), createCase: vi.fn(), addComment: vi.fn(), confirmResult: vi.fn(),
    remarkResult: vi.fn(), downloadCapability: vi.fn().mockResolvedValue(downloadCapabilityFixture),
    ...overrides,
  } as ResidentTransport;
}

function render(snapshot = residentSnapshot(), bridge: Parameters<typeof ResidentResultView>[0]['downloadBridge'] = null) {
  return renderReactTree(<ResidentResultView transport={transport()} snapshot={snapshot} downloadBridge={bridge} />, { adapter });
}

afterEach(() => { queryClient.clear(); });

test('renders the server requirement and the current result', () => {
  const view = render();
  try {
    expect(view.container.querySelector('[data-testid="result-requirement"]')?.textContent).toBe('Требуется фотография');
    expect(view.container.querySelector('[data-testid="result-description"]')?.textContent).toBe('Стояк заменён');
    expect(view.container.textContent).toContain('report.jpg');
  } finally { view.unmount(); }
});

test('missing result is reported instead of rendering empty materials', () => {
  const view = render(residentSnapshot({ withResult: false }));
  try {
    expect(view.container.querySelector('[data-testid="result-absent"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="result-description"]')).toBeNull();
    expect(view.container.querySelector('[data-attachment-id]')).toBeNull();
  } finally { view.unmount(); }
});

test('download requests a capability for the specific attachment only', async () => {
  const api = transport();
  const downloadFile = vi.fn();
  const view = renderReactTree(
    <ResidentResultView transport={api} snapshot={residentSnapshot()} downloadBridge={{ downloadFile }} />, { adapter });
  try {
    await act(async () => {
      (view.container.querySelector(`[data-testid="download-${IDS.attachmentId}"]`) as HTMLButtonElement).click();
    });
    await waitForUi(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    expect(api.downloadCapability).toHaveBeenCalledWith(IDS.attachmentId);
    expect(downloadFile).toHaveBeenCalledWith(downloadCapabilityFixture.download_url, downloadCapabilityFixture.file_name);
  } finally { view.unmount(); }
});

test('the opaque capability url is never rendered into the dom', async () => {
  const downloadFile = vi.fn();
  const view = renderReactTree(
    <ResidentResultView transport={transport()} snapshot={residentSnapshot()} downloadBridge={{ downloadFile }} />, { adapter });
  try {
    await act(async () => {
      (view.container.querySelector(`[data-testid="download-${IDS.attachmentId}"]`) as HTMLButtonElement).click();
    });
    await waitForUi(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    expect(view.container.innerHTML).not.toContain(downloadCapabilityFixture.download_url);
    expect(view.container.querySelector('a')).toBeNull();
  } finally { view.unmount(); }
});

test('failed capability request shows a semantic error and does not deliver a file', async () => {
  const downloadFile = vi.fn();
  const api = transport({ downloadCapability: vi.fn().mockRejectedValue(new Error('offline')) });
  const view = renderReactTree(
    <ResidentResultView transport={api} snapshot={residentSnapshot()} downloadBridge={{ downloadFile }} />, { adapter });
  try {
    await act(async () => {
      (view.container.querySelector(`[data-testid="download-${IDS.attachmentId}"]`) as HTMLButtonElement).click();
    });
    await waitForUi(() => expect(view.container.textContent).toContain('Не удалось получить ссылку на файл'));
    expect(downloadFile).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('requirement NONE is shown as its own semantic label', () => {
  const view = render(residentSnapshot({ resultRequirement: 'NONE' }));
  try {
    expect(view.container.querySelector('[data-testid="result-requirement"]')?.textContent).toBe('Результат без материалов');
  } finally { view.unmount(); }
});

test('result without attachments reports it instead of an empty list', () => {
  const base = residentSnapshot();
  const result = { ...base.case.current_result!, attachments: [] };
  const snapshot = { ...base, case: { ...base.case, current_result: result } };
  const view = render(snapshot);
  try {
    expect(view.container.textContent).toContain('Материалы не приложены');
    expect(view.container.querySelector('[data-attachment-id]')).toBeNull();
  } finally { view.unmount(); }
});
