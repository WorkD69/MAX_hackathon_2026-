import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../../app/test-render.js';
import { queryClient } from '../../../app/query-client.js';
import type { PlatformAdapter } from '../../../platform/platform-adapter.js';
import type { ResidentTransport } from '../resident-transport.js';
import { ResidentHttpError } from '../resident-transport.js';
import { waitForUi } from '../test-helpers.js';
import {
  IDS, addCommentSuccessFixture, residentSnapshot, withAllowedActions,
} from '../fixtures.js';
import { ResidentCommentFeed, type ClarificationTarget } from './comment-feed.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null, subscribeForeground: () => () => {},
};

const addCommentAction = { code: 'ADD_COMMENT', target: {}, input: {} } as const;

function transport(overrides: Partial<ResidentTransport> = {}): ResidentTransport {
  return {
    createCaseOptions: vi.fn(), createCase: vi.fn(), confirmResult: vi.fn(), remarkResult: vi.fn(),
    downloadCapability: vi.fn(), addComment: vi.fn().mockResolvedValue(addCommentSuccessFixture),
    ...overrides,
  } as ResidentTransport;
}

const target: ClarificationTarget = { commentId: IDS.commentId, body: 'Уточните адрес', createdAt: '2026-09-25T00:00:00Z' };

/** React 19 tracks controlled values, so the native setter must be used to trigger onChange. */
function setValue(element: HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function type(container: HTMLElement, value: string) {
  await act(async () => { setValue(container.querySelector('[data-testid="comment-input"]') as HTMLTextAreaElement, value); });
}

async function submit(container: HTMLElement) {
  await act(async () => { (container.querySelector('[data-testid="comment-submit"]') as HTMLButtonElement).click(); });
}

async function selectFile(container: HTMLElement, file: File) {
  await act(async () => {
    const input = container.querySelector('[data-testid="comment-files"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

afterEach(() => { queryClient.clear(); });

test('coordination and clarification comments render as one ordered feed', () => {
  const snapshot = withAllowedActions(residentSnapshot(), [addCommentAction]);
  const view = renderReactTree(<ResidentCommentFeed transport={transport()} snapshot={snapshot} onMutated={() => {}} />, { adapter });
  try {
    const feed = view.container.querySelector('ol');
    expect(feed).not.toBeNull();
    const items = [...view.container.querySelectorAll('[data-comment-id]')];
    expect(items.map((item) => item.getAttribute('data-comment-id'))).toEqual([IDS.commentId]);
    expect(view.container.textContent).toContain('Уточните адрес');
    expect(view.container.textContent).toContain('УК');
  } finally { view.unmount(); }
});

test('duplicate events do not duplicate feed entries', () => {
  const base = residentSnapshot();
  const duplicated = {
    ...base,
    case: { ...base.case, activity: [...base.case.activity, base.case.activity[0]!] },
  };
  const view = renderReactTree(
    <ResidentCommentFeed transport={transport()} snapshot={duplicated} onMutated={() => {}} />, { adapter });
  try {
    expect(view.container.querySelectorAll('[data-comment-id]')).toHaveLength(1);
  } finally { view.unmount(); }
});

test('empty feed is reported without breaking the section', () => {
  const base = residentSnapshot();
  const empty = { ...base, case: { ...base.case, activity: [] } };
  const view = renderReactTree(
    <ResidentCommentFeed transport={transport()} snapshot={empty} onMutated={() => {}} />, { adapter });
  try {
    expect(view.container.textContent).toContain('Комментариев пока нет');
  } finally { view.unmount(); }
});

test('composer is hidden when the server did not allow adding a comment', () => {
  const snapshot = residentSnapshot();
  const view = renderReactTree(<ResidentCommentFeed transport={transport()} snapshot={snapshot} onMutated={() => {}} />, { adapter });
  try {
    expect(view.container.querySelector('[data-testid="comment-submit"]')).toBeNull();
  } finally { view.unmount(); }
});

test('remarks review without clarification targets offers no composer', () => {
  const snapshot = withAllowedActions(residentSnapshot({ state: 'REMARKS_REVIEW', feedbackType: 'REMARK', residentFeedback: true }), [addCommentAction]);
  const view = renderReactTree(<ResidentCommentFeed transport={transport()} snapshot={snapshot} onMutated={() => {}} />, { adapter });
  try {
    expect(view.container.querySelector('[data-testid="clarification-required"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="comment-submit"]')).toBeNull();
  } finally { view.unmount(); }
});

test('remarks review with targets sends the chosen clarification_request_id', async () => {
  const api = transport();
  const onMutated = vi.fn();
  const snapshot = withAllowedActions(residentSnapshot({ state: 'REMARKS_REVIEW', feedbackType: 'REMARK', residentFeedback: true }), [addCommentAction]);
  const view = renderReactTree(
    <ResidentCommentFeed transport={api} snapshot={snapshot} clarificationTargets={[target]} onMutated={onMutated} />, { adapter });
  try {
    await type(view.container, 'Ответ на уточнение');
    await act(async () => {
      setValue(view.container.querySelector('[data-testid="clarification-select"]') as HTMLSelectElement, IDS.commentId);
    });
    await submit(view.container);
    await waitForUi(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(api.addComment).toHaveBeenCalledWith(IDS.caseId, {
      payload: { body: 'Ответ на уточнение', clarification_request_id: IDS.commentId },
      files: [],
      idempotencyKey: expect.any(String),
    });
  } finally { view.unmount(); }
});

test('ordinary comment omits clarification_request_id', async () => {
  const api = transport();
  const onMutated = vi.fn();
  const snapshot = withAllowedActions(residentSnapshot(), [addCommentAction]);
  const view = renderReactTree(<ResidentCommentFeed transport={api} snapshot={snapshot} onMutated={onMutated} />, { adapter });
  try {
    await type(view.container, 'Дополнение');
    await submit(view.container);
    await waitForUi(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(api.addComment).toHaveBeenCalledWith(IDS.caseId, {
      payload: { body: 'Дополнение', clarification_request_id: null },
      files: [],
      idempotencyKey: expect.any(String),
    });
  } finally { view.unmount(); }
});

test('selected comment attachments are sent with the canonical comment payload', async () => {
  const api = transport();
  const snapshot = withAllowedActions(residentSnapshot(), [addCommentAction]);
  const view = renderReactTree(<ResidentCommentFeed transport={api} snapshot={snapshot} onMutated={() => {}} />, { adapter });
  try {
    const file = new File(['photo'], 'comment.jpg', { type: 'image/jpeg' });
    await type(view.container, 'Дополнение');
    await selectFile(view.container, file);
    await submit(view.container);
    await waitForUi(() => expect(api.addComment).toHaveBeenCalledTimes(1));
    expect(api.addComment).toHaveBeenCalledWith(IDS.caseId, {
      payload: { body: 'Дополнение', clarification_request_id: null },
      files: [file], idempotencyKey: expect.any(String),
    });
  } finally { view.unmount(); }
});

test('non-uuid clarification target is never offered or sent', async () => {
  const api = transport();
  const snapshot = withAllowedActions(residentSnapshot({ state: 'REMARKS_REVIEW', feedbackType: 'REMARK', residentFeedback: true }), [addCommentAction]);
  const unsafe = { ...target, commentId: 'not-a-uuid' };
  const view = renderReactTree(
    <ResidentCommentFeed transport={api} snapshot={snapshot} clarificationTargets={[unsafe]} onMutated={() => {}} />, { adapter });
  try {
    expect(view.container.querySelector('[data-testid="clarification-required"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="comment-submit"]')).toBeNull();
  } finally { view.unmount(); }
});

test('failed comment shows a semantic error and adds no optimistic entry', async () => {
  const api = transport({ addComment: vi.fn().mockRejectedValue(new Error('offline')) });
  const onMutated = vi.fn();
  const snapshot = withAllowedActions(residentSnapshot(), [addCommentAction]);
  const view = renderReactTree(<ResidentCommentFeed transport={api} snapshot={snapshot} onMutated={onMutated} />, { adapter });
  try {
    const before = view.container.querySelectorAll('[data-comment-id]').length;
    await type(view.container, 'Дополнение');
    await submit(view.container);
    await waitForUi(() => expect(view.container.textContent).toContain('Не удалось отправить сообщение'));
    expect(view.container.querySelectorAll('[data-comment-id]')).toHaveLength(before);
    expect(onMutated).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('409 triggers an authoritative refetch and reports the stale case', async () => {
  const api = transport({ addComment: vi.fn().mockRejectedValue(new ResidentHttpError(409, 'stale case')) });
  const onMutated = vi.fn();
  const snapshot = withAllowedActions(residentSnapshot(), [addCommentAction]);
  const view = renderReactTree(<ResidentCommentFeed transport={api} snapshot={snapshot} onMutated={onMutated} />, { adapter });
  try {
    await type(view.container, 'Дополнение');
    await submit(view.container);
    await waitForUi(() => expect(view.container.textContent).toContain('Данные обновлены'));
    expect(onMutated).toHaveBeenCalledTimes(1);
    expect(api.addComment).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('blank comment is never submitted', async () => {
  const api = transport();
  const snapshot = withAllowedActions(residentSnapshot(), [addCommentAction]);
  const view = renderReactTree(<ResidentCommentFeed transport={api} snapshot={snapshot} onMutated={() => {}} />, { adapter });
  try {
    expect((view.container.querySelector('[data-testid="comment-submit"]') as HTMLButtonElement).disabled).toBe(true);
    await type(view.container, '   ');
    expect((view.container.querySelector('[data-testid="comment-submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(api.addComment).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('stale 409 closes the old key before a new explicit action', async () => {
  const addComment = vi.fn().mockRejectedValueOnce(new ResidentHttpError(409, 'stale'))
    .mockResolvedValueOnce(addCommentSuccessFixture);
  const onMutated = vi.fn();
  const view = renderReactTree(<ResidentCommentFeed transport={transport({ addComment })}
    snapshot={withAllowedActions(residentSnapshot(), [addCommentAction])} onMutated={onMutated} />, { adapter });
  try {
    await type(view.container, 'Течь');
    await submit(view.container);
    expect(onMutated).toHaveBeenCalledTimes(1);
    await submit(view.container);
    expect(addComment.mock.calls[0]![1].idempotencyKey).not.toBe(addComment.mock.calls[1]![1].idempotencyKey);
  } finally { view.unmount(); }
});

test('key reuse conflict refetches and does not automatically resubmit', async () => {
  const addComment = vi.fn().mockRejectedValue(new ResidentHttpError(409, 'reuse', 'IDEMPOTENCY_KEY_REUSE'));
  const onMutated = vi.fn();
  const view = renderReactTree(<ResidentCommentFeed transport={transport({ addComment })}
    snapshot={withAllowedActions(residentSnapshot(), [addCommentAction])} onMutated={onMutated} />, { adapter });
  try {
    await type(view.container, 'Течь');
    await submit(view.container);
    expect(onMutated).toHaveBeenCalledTimes(1);
    expect(addComment).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('unchanged comment retry keeps its key; edited text creates a new key', async () => {
  const addComment = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new ResidentHttpError(503, 'uncertain'))
    .mockResolvedValueOnce(addCommentSuccessFixture);
  const view = renderReactTree(<ResidentCommentFeed transport={transport({ addComment })}
    snapshot={withAllowedActions(residentSnapshot(), [addCommentAction])} onMutated={() => {}} />, { adapter });
  try {
    await type(view.container, 'Течь');
    await submit(view.container);
    await submit(view.container);
    expect(addComment.mock.calls[0]![1].idempotencyKey).toBe(addComment.mock.calls[1]![1].idempotencyKey);
    await type(view.container, 'Течь сильнее');
    await submit(view.container);
    expect(addComment.mock.calls[2]![1].idempotencyKey).not.toBe(addComment.mock.calls[1]![1].idempotencyKey);
  } finally { view.unmount(); }
});

test('file input clears only after confirmed comment success', async () => {
  const addComment = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(addCommentSuccessFixture);
  const onMutated = vi.fn();
  const view = renderReactTree(<ResidentCommentFeed transport={transport({ addComment })}
    snapshot={withAllowedActions(residentSnapshot(), [addCommentAction])} onMutated={onMutated} />, { adapter });
  try {
    await type(view.container, 'Фото');
    const input = view.container.querySelector('[data-testid="comment-files"]') as HTMLInputElement;
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'C:\\fakepath\\proof.jpg' });
    await selectFile(view.container, new File(['one'], 'proof.jpg'));
    await submit(view.container);
    // The click's act() does not await the file digest or the async command.
    await waitForUi(() => expect(addComment).toHaveBeenCalledTimes(1));
    expect(view.container.textContent).toContain('Не удалось отправить сообщение');
    expect(onMutated).not.toHaveBeenCalled();
    expect(input.value).toContain('proof.jpg');
    expect(view.container.textContent).toContain('Выбрано файлов: 1');
    await submit(view.container);
    await waitForUi(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('');
    expect(view.container.textContent).not.toContain('Выбрано файлов: 1');
    expect(addComment.mock.calls[0]![1].idempotencyKey).toBe(addComment.mock.calls[1]![1].idempotencyKey);
  } finally { view.unmount(); }
});
