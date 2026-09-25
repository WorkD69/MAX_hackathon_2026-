import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../../app/test-render.js';
import { queryClient } from '../../../app/query-client.js';
import type { PlatformAdapter } from '../../../platform/platform-adapter.js';
import { ResidentHttpError, type ResidentTransport } from '../resident-transport.js';
import { waitForUi } from '../test-helpers.js';
import {
  IDS, confirmationSuccessFixture, remarkSuccessFixture, residentSnapshot, withAllowedActions,
} from '../fixtures.js';
import { ResidentFeedback } from './feedback-forms.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null, subscribeForeground: () => () => {},
};

const currentTarget = { result_id: IDS.resultId, iteration_id: IDS.iterationId } as const;
const confirmAction = { code: 'RESIDENT_CONFIRM', target: currentTarget, input: {} } as const;
const remarkAction = { code: 'RESIDENT_REMARK', target: currentTarget, input: {} } as const;
const OTHER_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function transport(overrides: Partial<ResidentTransport> = {}): ResidentTransport {
  return {
    createCaseOptions: vi.fn(), createCase: vi.fn(), addComment: vi.fn(),
    confirmResult: vi.fn().mockResolvedValue(confirmationSuccessFixture),
    remarkResult: vi.fn().mockResolvedValue(remarkSuccessFixture),
    downloadCapability: vi.fn(),
    ...overrides,
  } as ResidentTransport;
}

/** React 19 tracks controlled values, so the native setter must be used to trigger onChange. */
function setValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function confirm(view: { container: HTMLElement }) {
  await act(async () => { (view.container.querySelector('[data-testid="confirm-submit"]') as HTMLButtonElement).click(); });
}

async function remark(view: { container: HTMLElement }, text: string) {
  await act(async () => { setValue(view.container.querySelector('[data-testid="remark-input"]') as HTMLTextAreaElement, text); });
  await act(async () => { (view.container.querySelector('[data-testid="remark-submit"]') as HTMLButtonElement).click(); });
}

function render(snapshot = residentSnapshot(), api = transport(), onMutated = vi.fn()) {
  const view = renderReactTree(<ResidentFeedback transport={api} snapshot={snapshot} onMutated={onMutated} />, { adapter });
  return { view, api, onMutated };
}

afterEach(() => { queryClient.clear(); });

test('no feedback actions means no branch is offered', () => {
  const { view } = render();
  try {
    expect(view.container.querySelector('[data-testid="feedback-absent"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="confirm-submit"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="remark-submit"]')).toBeNull();
  } finally { view.unmount(); }
});

test('confirmation sends the exact server action target and reports progress', async () => {
  const { view, api, onMutated } = render(withAllowedActions(residentSnapshot(), [confirmAction]));
  try {
    await confirm(view);
    await waitForUi(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(api.confirmResult).toHaveBeenCalledWith(IDS.caseId, {
      request: { result_id: IDS.resultId, iteration_id: IDS.iterationId },
      idempotencyKey: expect.any(String),
    });
    expect(view.container.querySelector('[data-testid="confirm-success"]')?.textContent)
      .toContain('Ожидается решение УК');
  } finally { view.unmount(); }
});

test('confirmation never claims that the case is closed', async () => {
  const { view } = render(withAllowedActions(residentSnapshot(), [confirmAction]));
  try {
    await confirm(view);
    await waitForUi(() => expect(view.container.querySelector('[data-testid="confirm-success"]')).not.toBeNull());
    expect(view.container.textContent).not.toMatch(/закрыт/i);
  } finally { view.unmount(); }
});

test('remark sends result, iteration and trimmed text', async () => {
  const { view, api, onMutated } = render(withAllowedActions(residentSnapshot(), [remarkAction]));
  try {
    await remark(view, '  Протечка осталась  ');
    await waitForUi(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(api.remarkResult).toHaveBeenCalledWith(IDS.caseId, {
      request: { result_id: IDS.resultId, iteration_id: IDS.iterationId, remark_text: 'Протечка осталась' },
      idempotencyKey: expect.any(String),
    });
    expect(view.container.querySelector('[data-testid="remark-success"]')?.textContent)
      .toContain('передано в УК');
  } finally { view.unmount(); }
});

test('blank remark is never submitted', () => {
  const { view, api } = render(withAllowedActions(residentSnapshot(), [remarkAction]));
  try {
    expect((view.container.querySelector('[data-testid="remark-submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(api.remarkResult).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('confirmation and remark branches are mutually exclusive', () => {
  const { view } = render(withAllowedActions(residentSnapshot(), [confirmAction, remarkAction]));
  try {
    expect(view.container.querySelector('[data-testid="feedback-inconsistent"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="confirm-submit"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="remark-submit"]')).toBeNull();
  } finally { view.unmount(); }
});

test('an action aimed at another result is not offered and never retargeted', () => {
  const stale = { code: 'RESIDENT_CONFIRM', target: { result_id: OTHER_UUID, iteration_id: IDS.iterationId }, input: {} } as const;
  const { view } = render(withAllowedActions(residentSnapshot(), [stale]));
  try {
    expect(view.container.querySelector('[data-testid="confirm-submit"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="feedback-absent"]')).not.toBeNull();
  } finally { view.unmount(); }
});

test('an action aimed at another iteration is not offered', () => {
  const stale = { code: 'RESIDENT_REMARK', target: { result_id: IDS.resultId, iteration_id: OTHER_UUID }, input: {} } as const;
  const { view } = render(withAllowedActions(residentSnapshot(), [stale]));
  try {
    expect(view.container.querySelector('[data-testid="remark-submit"]')).toBeNull();
  } finally { view.unmount(); }
});

test('409 refetches authoritative state and never retargets the action', async () => {
  const api = transport({ confirmResult: vi.fn().mockRejectedValue(new ResidentHttpError(409, 'stale')) });
  const { view, onMutated } = render(withAllowedActions(residentSnapshot(), [confirmAction]), api);
  try {
    await confirm(view);
    await waitForUi(() => expect(view.container.textContent).toContain('Данные обновлены'));
    expect(onMutated).toHaveBeenCalledTimes(1);
    expect(api.confirmResult).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[data-testid="confirm-success"]')).toBeNull();
  } finally { view.unmount(); }
});

test('semantic failure keeps the branch and reports a retryable error', async () => {
  const api = transport({ confirmResult: vi.fn().mockRejectedValue(new Error('offline')) });
  const { view, onMutated } = render(withAllowedActions(residentSnapshot(), [confirmAction]), api);
  try {
    await confirm(view);
    await waitForUi(() => expect(view.container.textContent).toContain('Не удалось подтвердить результат'));
    expect(onMutated).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="confirm-success"]')).toBeNull();
  } finally { view.unmount(); }
});

test('remark semantic failure is reported separately from confirmation', async () => {
  const api = transport({ remarkResult: vi.fn().mockRejectedValue(new Error('offline')) });
  const { view, onMutated } = render(withAllowedActions(residentSnapshot(), [remarkAction]), api);
  try {
    await remark(view, 'Протечка осталась');
    await waitForUi(() => expect(view.container.textContent).toContain('Не удалось отправить замечание'));
    expect(onMutated).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('a pending case without a result offers no feedback branch', () => {
  const { view } = render(withAllowedActions(residentSnapshot({ withResult: false }), [confirmAction]));
  try {
    expect(view.container.querySelector('[data-testid="confirm-submit"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="feedback-absent"]')).not.toBeNull();
  } finally { view.unmount(); }
});
