import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../../app/test-render.js';
import { queryClient } from '../../../app/query-client.js';
import type { PlatformAdapter } from '../../../platform/platform-adapter.js';
import { CreateCaseForm } from './create-case-form.js';
import type { ResidentTransport } from '../resident-transport.js';
import { waitForUi } from '../test-helpers.js';
import {
  createCaseSuccessFixture, inactiveCategoryFixture, inactivePremiseFixture, optionsWithInactiveFixture,
} from '../fixtures.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null, subscribeForeground: () => () => {},
};

function transport(overrides: Partial<ResidentTransport> = {}): ResidentTransport {
  return {
    createCaseOptions: vi.fn().mockResolvedValue(optionsWithInactiveFixture),
    createCase: vi.fn().mockResolvedValue(createCaseSuccessFixture),
    addComment: vi.fn(), confirmResult: vi.fn(), remarkResult: vi.fn(), downloadCapability: vi.fn(),
    ...overrides,
  } as ResidentTransport;
}

async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

afterEach(() => { queryClient.clear(); });

/** React 19 tracks controlled values, so the native setter must be used to trigger onChange. */
function setValue(element: HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

/** vi.waitFor must run inside act(), otherwise React warns about unwrapped state updates. */
async function waitForForm(container: HTMLElement) {
  await waitForUi(() => {
    expect(container.querySelector('[data-testid="create-case-submit"]')).not.toBeNull();
  });
}

async function fillForm(container: HTMLElement) {
  await act(async () => {
    setValue(container.querySelector('[data-testid="category-select"]') as HTMLSelectElement, optionsWithInactiveFixture.categories[0]!.categoryId);
    setValue(container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement, optionsWithInactiveFixture.premises[0]!.premisesId);
    setValue(container.querySelector('[data-testid="description-input"]') as HTMLTextAreaElement, 'Не греет стояк');
  });
}

test('offers only active server-provided options and never hardcodes them', async () => {
  const view = renderReactTree(<CreateCaseForm transport={transport()} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    const categories = view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement;
    const premises = view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement;
    expect([...categories.options].map((option) => option.value)).toEqual(['', optionsWithInactiveFixture.categories[0]!.categoryId]);
    expect([...premises.options].map((option) => option.value)).toEqual(['', optionsWithInactiveFixture.premises[0]!.premisesId]);
    expect(view.container.textContent).not.toContain(inactiveCategoryFixture.name);
    expect(view.container.textContent).not.toContain(inactivePremiseFixture.label);
  } finally { view.unmount(); }
});

test('surfaces the server result_requirement for the chosen category', async () => {
  const view = renderReactTree(<CreateCaseForm transport={transport()} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    expect(view.container.querySelector('[data-testid="category-requirement"]')?.textContent).toBe('Нужна фотография');
  } finally { view.unmount(); }
});

test('submit stays disabled until required fields are filled', async () => {
  const view = renderReactTree(<CreateCaseForm transport={transport()} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    const submit = view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await fillForm(view.container);
    expect(submit.disabled).toBe(false);
  } finally { view.unmount(); }
});

test('successful create calls onCreated with the authoritative case id', async () => {
  const onCreated = vi.fn();
  const api = transport();
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={onCreated} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).click(); });
    await waitForUi(() => expect(onCreated).toHaveBeenCalledWith(createCaseSuccessFixture.case_id));
    expect(api.createCase).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('failed create shows a semantic error and creates no local case', async () => {
  const onCreated = vi.fn();
  const api = transport({ createCase: vi.fn().mockRejectedValue(new Error('server refused')) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={onCreated} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).click(); });
    await waitForUi(() => {
      expect(view.container.textContent).toContain('Не удалось создать обращение');
    });
    expect(onCreated).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-case-id]')).toBeNull();
  } finally { view.unmount(); }
});

test('failed create can be retried after a semantic error', async () => {
  const createCase = vi.fn()
    .mockRejectedValueOnce(new Error('server refused'))
    .mockResolvedValueOnce(createCaseSuccessFixture);
  const onCreated = vi.fn();
  const view = renderReactTree(<CreateCaseForm transport={transport({ createCase })} onCreated={onCreated} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).click(); });
    await waitForUi(() => {
      expect(view.container.textContent).toContain('Не удалось создать обращение');
    });
    expect(onCreated).not.toHaveBeenCalled();
    await act(async () => { (view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).click(); });
    await waitForUi(() => expect(onCreated).toHaveBeenCalledWith(createCaseSuccessFixture.case_id));
  } finally { view.unmount(); }
});

test('empty option set is reported instead of offering a hardcoded fallback', async () => {
  const api = transport({ createCaseOptions: vi.fn().mockResolvedValue({ categories: [], premises: [] }) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    expect(view.container.textContent).toContain('нет доступных категорий');
    expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(true);
  } finally { view.unmount(); }
});

test('option load failure is reported without inventing options', async () => {
  const api = transport({ createCaseOptions: vi.fn().mockRejectedValue(new Error('offline')) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForUi(() => {
      expect(view.container.textContent).toContain('Не удалось загрузить категории и адреса');
    });
    expect(view.container.querySelector('[data-testid="category-select"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="create-case-submit"]')).toBeNull();
  } finally { view.unmount(); }
});
