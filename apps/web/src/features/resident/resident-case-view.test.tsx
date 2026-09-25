import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import type { PlatformAdapter } from '../../platform/platform-adapter.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { waitForUi } from './test-helpers.js';
import { IDS, residentSnapshot } from './fixtures.js';
import type { ResidentTransport } from './resident-transport.js';
import { ResidentCaseView } from './resident-case-view.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null, subscribeForeground: () => () => {},
};

function readTransport(overrides: Partial<CaseReadTransport> = {}): CaseReadTransport {
  return { list: vi.fn(), snapshot: vi.fn().mockResolvedValue(residentSnapshot()), ...overrides } as CaseReadTransport;
}

function residentTransport(overrides: Partial<ResidentTransport> = {}): ResidentTransport {
  return {
    createCaseOptions: vi.fn(), createCase: vi.fn(), addComment: vi.fn(), confirmResult: vi.fn(),
    remarkResult: vi.fn(), downloadCapability: vi.fn(),
    ...overrides,
  } as ResidentTransport;
}

function render(read: CaseReadTransport, resident = residentTransport(), caseId: string = IDS.caseId) {
  return renderReactTree(
    <ResidentCaseView caseId={caseId} readTransport={read} residentTransport={resident} contextKey="ctx-1" downloadBridge={null} />,
    { adapter });
}

async function waitForContent(container: HTMLElement) {
  await waitForUi(() => {
    expect(container.querySelector('[data-testid="resident-case-status"]')).not.toBeNull();
  });
}

afterEach(() => { queryClient.clear(); });

test('loads the resident snapshot and composes result, feedback and comments', async () => {
  const read = readTransport();
  const view = render(read);
  try {
    await waitForContent(view.container);
    expect(read.snapshot).toHaveBeenCalledWith(IDS.caseId, 'RESIDENT');
    expect(view.container.textContent).toContain('Обращение C-1001');
    expect(view.container.querySelector('[data-testid="result-description"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="feedback-absent"]')).not.toBeNull();
    expect(view.container.textContent).toContain('Уточните адрес');
  } finally { view.unmount(); }
});

test('snapshot failure is reported and no case content is invented', async () => {
  const read = readTransport({ snapshot: vi.fn().mockRejectedValue(new Error('offline')) });
  const view = render(read);
  try {
    await waitForUi(() => expect(view.container.textContent).toContain('Не удалось загрузить обращение'));
    expect(view.container.querySelector('[data-testid="resident-case-status"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="result-description"]')).toBeNull();
  } finally { view.unmount(); }
});

test('the snapshot is never retried automatically after a failure', async () => {
  const snapshot = vi.fn().mockRejectedValue(new Error('offline'));
  const view = render(readTransport({ snapshot }));
  try {
    await waitForUi(() => expect(view.container.textContent).toContain('Не удалось загрузить обращение'));
    expect(snapshot).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('manual refresh refetches the authoritative snapshot', async () => {
  const read = readTransport();
  const view = render(read);
  try {
    await waitForContent(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="resident-refresh"]') as HTMLButtonElement).click(); });
    await waitForUi(() => expect(read.snapshot).toHaveBeenCalledTimes(2));
  } finally { view.unmount(); }
});

test('refresh invalidates the list scope without refetching it', async () => {
  const read = readTransport();
  const list = vi.fn();
  await act(async () => {
    queryClient.setQueryData(['case-read', 'list', 'ctx-1', 'RESIDENT'], { cases: [] });
  });
  const view = render(read);
  try {
    await waitForContent(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="resident-refresh"]') as HTMLButtonElement).click(); });
    await waitForUi(() => expect(read.snapshot).toHaveBeenCalledTimes(2));
    expect(list).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['case-read', 'list', 'ctx-1', 'RESIDENT'])).toEqual({ cases: [] });
  } finally { view.unmount(); }
});

test('a case id change loads the new case instead of reusing the previous one', async () => {
  const read = readTransport();
  const view = render(read, residentTransport(), 'other-case');
  try {
    await waitForContent(view.container);
    expect(read.snapshot).toHaveBeenCalledWith('other-case', 'RESIDENT');
  } finally { view.unmount(); }
});

test('the resident view never reaches for a global fetch or session context', async () => {
  const fetchSpy = vi.fn();
  const original = globalThis.fetch;
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  const view = render(readTransport());
  try {
    await waitForContent(view.container);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    globalThis.fetch = original;
  }
});
