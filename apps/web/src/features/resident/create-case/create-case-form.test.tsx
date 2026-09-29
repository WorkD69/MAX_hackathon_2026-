import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../../app/test-render.js';
import { queryClient } from '../../../app/query-client.js';
import type { PlatformAdapter } from '../../../platform/platform-adapter.js';
import { CreateCaseForm } from './create-case-form.js';
import type { CreateCaseOptions, ResidentTransport } from '../resident-transport.js';
import { ResidentHttpError } from '../resident-transport.js';
import { waitForUi } from '../test-helpers.js';
import { createCaseSuccessFixture, createCaseOptionsFixture, premiseFixture, inactivePremiseFixture,
  inactiveCategoryFixture, IDS } from '../fixtures.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null, subscribeForeground: () => () => {},
};

function transport(overrides: Partial<ResidentTransport> = {}): ResidentTransport {
  return {
    createCaseOptions: vi.fn(async (premisesId?: string) => premisesId
      ? createCaseOptionsFixture : { premises: [premiseFixture], selected_premises_id: null, categories: [] }),
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
    setValue(container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement, IDS.premisesId);
  });
  await waitForUi(() => expect((container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).options.length).toBe(2));
  await act(async () => {
    setValue(container.querySelector('[data-testid="category-select"]') as HTMLSelectElement, IDS.categoryId);
    setValue(container.querySelector('[data-testid="description-input"]') as HTMLTextAreaElement, 'Не греет стояк');
  });
}

async function refetchSelectedOptions() {
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: ['resident', 'create-case-options', '', IDS.premisesId], exact: true });
  });
  await flush();
}

for (const status of [404, 401, 403]) {
  test(`failed ${status} options refresh removes stale choices and prevents CreateCase`, async () => {
    let selectedRequests = 0;
    const api = transport({ createCaseOptions: vi.fn(async (id?: string) => {
      if (!id) return { premises: [premiseFixture], selected_premises_id: null, categories: [] };
      selectedRequests += 1;
      if (selectedRequests > 1) throw new ResidentHttpError(status, 'options unavailable');
      return createCaseOptionsFixture;
    }) });
    const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
    try {
      await waitForForm(view.container);
      await fillForm(view.container);
      expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(false);
      await refetchSelectedOptions();
      await waitForUi(() => {
        expect((view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement).value).toBe('');
        expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value).toBe('');
      });
      expect(view.container.textContent).not.toContain('Дом 1 · Кв. 2');
      expect(view.container.textContent).not.toContain('Отопление / стояк');
      const submit = view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      await act(async () => {
        submit.click();
        submit.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(api.createCase).not.toHaveBeenCalled();
    } finally { view.unmount(); }
  });
}

test('failed initial options refresh clears a selected case even after the list recovers', async () => {
  let initialRequests = 0;
  const api = transport({ createCaseOptions: vi.fn(async (id?: string) => {
    if (id) return createCaseOptionsFixture;
    initialRequests += 1;
    if (initialRequests === 2) throw new ResidentHttpError(401, 'session expired');
    return { premises: [premiseFixture], selected_premises_id: null, categories: [] };
  }) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['resident', 'create-case-options', '', 'initial'], exact: true });
    });
    await waitForUi(() => expect(view.container.textContent).toContain('Не удалось загрузить категории и адреса'));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['resident', 'create-case-options', '', 'initial'], exact: true });
    });
    await waitForForm(view.container);
    expect((view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement).value).toBe('');
    expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value).toBe('');
    expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(api.createCase).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('after a failed selected refresh, choosing the address and category again is explicit', async () => {
  let selectedRequests = 0;
  const api = transport({ createCaseOptions: vi.fn(async (id?: string) => {
    if (!id) return { premises: [premiseFixture], selected_premises_id: null, categories: [] };
    selectedRequests += 1;
    if (selectedRequests === 2) throw new ResidentHttpError(404, 'hidden');
    return createCaseOptionsFixture;
  }) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await refetchSelectedOptions();
    await waitForUi(() => expect(view.container.textContent).toContain('Обновить список'));
    await act(async () => {
      (view.container.querySelector('button[type="button"]') as HTMLButtonElement).click();
    });
    await waitForUi(() => expect((view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement).options.length).toBe(2));
    await act(async () => {
      setValue(view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement, IDS.premisesId);
    });
    await waitForUi(() => expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).options.length).toBe(2));
    expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value).toBe('');
    expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      setValue(view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement, IDS.categoryId);
    });
    expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(false);
  } finally { view.unmount(); }
});

test('removed category stays cleared when a later options response restores it', async () => {
  let selectedRequests = 0;
  const api = transport({ createCaseOptions: vi.fn(async (id?: string) => {
    if (!id) return { premises: [premiseFixture], selected_premises_id: null, categories: [] };
    selectedRequests += 1;
    return selectedRequests === 2 ? { ...createCaseOptionsFixture, categories: [] } : createCaseOptionsFixture;
  }) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await refetchSelectedOptions();
    await waitForUi(() => expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value).toBe(''));
    await refetchSelectedOptions();
    const category = view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement;
    await waitForUi(() => expect([...category.options].map((option) => option.value)).toEqual(['', IDS.categoryId]));
    expect(category.value).toBe('');
    expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { setValue(category, IDS.categoryId); });
    expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(false);
  } finally { view.unmount(); }
});

test('successful options refresh removes a disappeared premises and its category', async () => {
  let selectedRequests = 0;
  const api = transport({ createCaseOptions: vi.fn(async (id?: string) => {
    if (!id) return { premises: [premiseFixture], selected_premises_id: null, categories: [] };
    selectedRequests += 1;
    return selectedRequests === 2 ? { premises: [], selected_premises_id: id, categories: [] }
      : createCaseOptionsFixture;
  }) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await refetchSelectedOptions();
    await waitForUi(() => expect((view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement).value).toBe(''));
    expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value).toBe('');
    expect((view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).disabled).toBe(true);
  } finally { view.unmount(); }
});

test('offers only public server-provided premises and selected categories', async () => {
  const view = renderReactTree(<CreateCaseForm transport={transport()} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    const categories = view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement;
    const premises = view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement;
    expect([...categories.options].map((option) => option.value)).toEqual(['']);
    expect([...premises.options].map((option) => option.value)).toEqual(['', IDS.premisesId]);
    expect(view.container.textContent).not.toContain('Подрядчик');
    await fillForm(view.container);
    expect([...categories.options].map((option) => option.value)).toEqual(['', IDS.categoryId]);
  } finally { view.unmount(); }
});

test('premises from multiple organizations have no tenant selector or default contractor', async () => {
  const options: CreateCaseOptions = { premises: [premiseFixture, inactivePremiseFixture],
    selected_premises_id: null, categories: [] };
  const api = transport({ createCaseOptions: vi.fn(async (id?: string) => id
    ? { ...options, selected_premises_id: id, categories: [createCaseOptionsFixture.categories[0]!] } : options) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    const premises = view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement;
    expect([...premises.options].map((option) => option.textContent)).toEqual([
      'Выберите адрес', 'Дом 1 · Кв. 2', 'Дом 9 · Кв. 9',
    ]);
    expect(view.container.querySelector('[name="organization_id"]')).toBeNull();
    expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).disabled).toBe(true);
    expect(view.container.textContent).toContain('Сначала выберите адрес');
    expect(view.container.textContent).not.toContain('Подрядчик');
  } finally { view.unmount(); }
});

test('the sole authoritative address is selected and its categories are loaded', async () => {
  const api = transport();
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    await waitForUi(() => expect((view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement).value).toBe(IDS.premisesId));
    await waitForUi(() => expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).options.length).toBe(2));
    expect(api.createCaseOptions).toHaveBeenCalledWith(IDS.premisesId);
    const fields = [...view.container.querySelectorAll('form > .resident-create-case__field label')].map(label => label.textContent);
    expect(fields.slice(0, 4)).toEqual(['Адрес', 'Категория', 'Описание проблемы', 'Фото и файлы']);
  } finally { view.unmount(); }
});

test('changing premises clears category and discards a late response for the old premises', async () => {
  const initial: CreateCaseOptions = { premises: [premiseFixture, inactivePremiseFixture],
    selected_premises_id: null, categories: [] };
  let resolveFirst!: (value: CreateCaseOptions) => void;
  const first = new Promise<CreateCaseOptions>((resolve) => { resolveFirst = resolve; });
  const api = transport({ createCaseOptions: vi.fn((id?: string) => id === IDS.premisesId ? first
    : Promise.resolve(id === IDS.inactivePremisesId
      ? { premises: initial.premises, selected_premises_id: id, categories: [inactiveCategoryFixture] }
      : initial)) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    const premises = view.container.querySelector('[data-testid="premise-select"]') as HTMLSelectElement;
    await act(async () => { setValue(premises, IDS.premisesId); });
    await act(async () => { setValue(premises, IDS.inactivePremisesId); });
    await waitForUi(() => expect(view.container.textContent).toContain(inactiveCategoryFixture.name));
    await act(async () => { setValue(view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement,
      IDS.inactiveCategoryId); });
    await act(async () => { resolveFirst({ premises: initial.premises, selected_premises_id: IDS.premisesId,
      categories: createCaseOptionsFixture.categories }); });
    expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value)
      .toBe(IDS.inactiveCategoryId);
    expect(view.container.textContent).not.toContain(createCaseOptionsFixture.categories[0]!.name);
    await act(async () => { setValue(premises, IDS.premisesId); });
    expect((view.container.querySelector('[data-testid="category-select"]') as HTMLSelectElement).value).toBe('');
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

test('rapid submits start only one active CreateCase request', async () => {
  let finish!: (value: typeof createCaseSuccessFixture) => void;
  const createCase = vi.fn(() => new Promise<typeof createCaseSuccessFixture>((resolve) => { finish = resolve; }));
  const view = renderReactTree(<CreateCaseForm transport={transport({ createCase })} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    const form = view.container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(createCase).toHaveBeenCalledTimes(1);
    await act(async () => { finish(createCaseSuccessFixture); });
  } finally { view.unmount(); }
});

test('create page has a top-level heading', async () => {
  const view = renderReactTree(<CreateCaseForm transport={transport()} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    expect(view.container.querySelector('h1')?.textContent).toBe('Создание обращения');
  } finally { view.unmount(); }
});

test('primary-case conflict invokes the provider refresh seam without retrying create', async () => {
  const onCreated = vi.fn();
  const onPrimaryCaseExists = vi.fn().mockResolvedValue(undefined);
  const api = transport({
    createCase: vi.fn().mockRejectedValue(new ResidentHttpError(409, 'exists', 'DEMO_PRIMARY_CASE_EXISTS')),
  });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={onCreated}
    onPrimaryCaseExists={onPrimaryCaseExists} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).click(); });
    await waitForUi(() => expect(onPrimaryCaseExists).toHaveBeenCalledTimes(1));
    expect(onCreated).not.toHaveBeenCalled();
    expect(api.createCase).toHaveBeenCalledTimes(1);
    expect(api.createCaseOptions).toHaveBeenCalledTimes(2);
  } finally { view.unmount(); }
});

test('other 409 does not open a case or read the primary session', async () => {
  const onCreated = vi.fn();
  const api = transport({
    createCase: vi.fn().mockRejectedValue(new ResidentHttpError(409, 'reuse', 'IDEMPOTENCY_KEY_REUSE')),
  });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={onCreated} />, { adapter });
  try {
    await waitForForm(view.container);
    await fillForm(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).click(); });
    await waitForUi(() => expect(view.container.textContent).toContain('Данные обновлены'));
    expect(onCreated).not.toHaveBeenCalled();
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
  const api = transport({ createCaseOptions: vi.fn().mockResolvedValue({ categories: [], premises: [], selected_premises_id: null }) });
  const view = renderReactTree(<CreateCaseForm transport={api} onCreated={() => {}} />, { adapter });
  try {
    await waitForForm(view.container);
    expect(view.container.textContent).toContain('нет доступных адресов');
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
