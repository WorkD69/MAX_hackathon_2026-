import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import type { PlatformAdapter } from '../../platform/platform-adapter.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { setNativeValue, waitForUi } from './test-helpers.js';
import { IDS, confirmationSuccessFixture, remarkSuccessFixture, residentSnapshot, withAllowedActions } from './fixtures.js';
import { ResidentHttpError, type ResidentTransport } from './resident-transport.js';
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

const feedbackActions = [
  { code: 'RESIDENT_CONFIRM', target: { result_id: IDS.resultId, iteration_id: IDS.iterationId }, input: {} },
  { code: 'RESIDENT_REMARK', target: { result_id: IDS.resultId, iteration_id: IDS.iterationId }, input: {} },
] as const;

test.each(['confirm', 'remark'] as const)('%s success refetches and renders only authoritative feedback', async (choice) => {
  const initial = withAllowedActions(residentSnapshot(), [...feedbackActions]);
  const updated = residentSnapshot({
    residentFeedback: true, feedbackType: choice === 'confirm' ? 'CONFIRMATION' : 'REMARK',
    state: choice === 'confirm' ? 'AWAITING_RESULT_CHECK' : 'REMARKS_REVIEW',
  });
  let finishRefetch!: () => void;
  const refetch = new Promise<void>((resolve) => { finishRefetch = resolve; });
  const read = readTransport({ snapshot: vi.fn().mockResolvedValueOnce(initial).mockImplementation(async () => {
    await refetch;
    return updated;
  }) });
  const resident = residentTransport({
    confirmResult: vi.fn().mockResolvedValue(confirmationSuccessFixture),
    remarkResult: vi.fn().mockResolvedValue(remarkSuccessFixture),
  });
  const view = render(read, resident);
  try {
    await waitForContent(view.container);
    if (choice === 'remark') {
      await act(async () => { setNativeValue(view.container.querySelector('[data-testid="remark-input"]') as HTMLTextAreaElement, 'Протечка осталась'); });
    }
    await act(async () => { (view.container.querySelector(`[data-testid="${choice}-submit"]`) as HTMLButtonElement).click(); });
    await waitForUi(() => expect(read.snapshot).toHaveBeenCalledTimes(2));
    expect(view.container.querySelector(`[data-testid="${choice}-success"]`)).toBeNull();
    expect((view.container.querySelector('[data-testid="confirm-submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect((view.container.querySelector('[data-testid="remark-submit"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finishRefetch(); });
    await waitForUi(() => expect(view.container.querySelector(`[data-testid="${choice}-success"]`)).not.toBeNull());
    expect(view.container.querySelector('[data-testid="confirm-submit"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="remark-submit"]')).toBeNull();
    expect(read.snapshot).toHaveBeenLastCalledWith(IDS.caseId, 'RESIDENT');
    expect(resident.confirmResult).toHaveBeenCalledTimes(choice === 'confirm' ? 1 : 0);
    expect(resident.remarkResult).toHaveBeenCalledTimes(choice === 'remark' ? 1 : 0);
  } finally {
    await act(async () => { finishRefetch(); });
    view.unmount();
  }
});

test.each(['confirm', 'remark'] as const)('%s 409 refetches new targets without automatically submitting them', async (choice) => {
  const initial = withAllowedActions(residentSnapshot(), [...feedbackActions]);
  const next = structuredClone(initial);
  const nextResultId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  next.case.current_result!.result_id = nextResultId;
  next.case.allowed_actions = feedbackActions.map((action) => ({ ...action, target: { ...action.target, result_id: nextResultId } }));
  const read = readTransport({ snapshot: vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(next) });
  const resident = residentTransport({
    confirmResult: vi.fn().mockRejectedValue(new ResidentHttpError(409, 'stale')),
    remarkResult: vi.fn().mockRejectedValue(new ResidentHttpError(409, 'stale')),
  });
  const view = render(read, resident);
  try {
    await waitForContent(view.container);
    if (choice === 'remark') {
      await act(async () => { setNativeValue(view.container.querySelector('[data-testid="remark-input"]') as HTMLTextAreaElement, 'Протечка осталась'); });
    }
    await act(async () => { (view.container.querySelector(`[data-testid="${choice}-submit"]`) as HTMLButtonElement).click(); });
    await waitForUi(() => {
      expect(read.snapshot).toHaveBeenCalledTimes(2);
      expect((view.container.querySelector('[data-testid="confirm-submit"]') as HTMLButtonElement).disabled).toBe(false);
    });
    const command = choice === 'confirm' ? resident.confirmResult : resident.remarkResult;
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith(IDS.caseId, {
      request: { result_id: IDS.resultId, iteration_id: IDS.iterationId, ...(choice === 'remark' ? { remark_text: 'Протечка осталась' } : {}) },
      idempotencyKey: expect.any(String),
    });
    expect(view.container.querySelector(`[data-testid="${choice}-success"]`)).toBeNull();
  } finally { view.unmount(); }
});

test('clarification text and a historical comment ID never fabricate a current target', async () => {
  const snapshot = withAllowedActions(residentSnapshot({ state: 'REMARKS_REVIEW' }), [
    { code: 'ADD_COMMENT', target: {}, input: {} },
  ]);
  const resident = residentTransport();
  const view = render(readTransport({ snapshot: vi.fn().mockResolvedValue(snapshot) }), resident);
  try {
    await waitForContent(view.container);
    expect(view.container.textContent).toContain('Уточните адрес');
    expect(view.container.querySelector('[data-testid="clarification-required"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="comment-input"]')).toBeNull();
    expect(resident.addComment).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});
