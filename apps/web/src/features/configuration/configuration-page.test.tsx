import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import { ConfigurationPage } from './configuration-page.js';

const id = '11111111-1111-4111-8111-111111111111';
const contractorId = '22222222-2222-4222-8222-222222222222';
const context = vi.hoisted(() => ({ role: 'UK_ADMIN' as string }));
vi.mock('../session/session-provider.js', () => ({ useSession: () => ({
  status: 'ready', session: { effective_actor: { role: context.role } },
  authorizedFetch: (path: string, init?: RequestInit) => fetch(path, init),
}) }));

const data: Record<string, unknown> = {
  '/api/v1/config/organization': { organization_id: id, name: 'УК', active: true },
  '/api/v1/config/houses': [{ house_id: id, address: 'Дом 1', display_label: null, active: true }],
  '/api/v1/config/categories': [{ category_id: id, name: 'Отопление', description: null, default_contractor_id: contractorId, requires_premises_access: true, result_requirement: 'PHOTO', active: true }],
  '/api/v1/config/contractors': [{ contractor: { contractor_id: contractorId, display_name: 'Подрядчик', active: true }, organization_contractor: { organization_id: id, contractor_id: contractorId, active: true } }],
  '/api/v1/config/users': [{ app_user: { app_user_id: id, display_name: 'Тестовый сотрудник', active: true }, role_bindings: [], uk_house_access: [] }],
};
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function flush() { for (let step = 0; step < 5; step += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function change(element: Element, value: string) {
  const input = element as HTMLInputElement;
  act(() => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
}
afterEach(() => { vi.unstubAllGlobals(); queryClient.clear(); context.role = 'UK_ADMIN'; });

test('UK_ADMIN sees approved sections, four roles and three result requirements', async () => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => response(data[path])));
  const view = renderReactTree(<ConfigurationPage />);
  try {
    await flush();
    expect(view.container.textContent).toContain('Настройка организации');
    for (const label of ['Организация', 'Дома', 'Категории', 'Подрядчики', 'Пользователи и роли']) expect(view.container.textContent).toContain(label);
    expect([...view.container.querySelectorAll('[data-role-option]')].map((x) => x.getAttribute('value'))).toEqual(['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE']);
    expect([...view.container.querySelectorAll('[data-requirement-option]')].slice(0, 3).map((x) => x.getAttribute('value'))).toEqual(['NONE', 'PHOTO', 'FILE']);
    expect(view.container.textContent).toContain('Существующие случаи и история не переписываются');
    expect(view.container.textContent).not.toMatch(/пригласить|пароль|увольнение|CRM|HR|редактировать случай/i);
  } finally { view.unmount(); }
});

test('non-admin receives no read or mutation surface', async () => {
  context.role = 'UK_EMPLOYEE';
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const view = renderReactTree(<ConfigurationPage />);
  try {
    expect(view.container.textContent).toContain('Недоступно');
    expect(view.container.querySelector('form')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});

test('organization form submits canonical payload and refetches authoritative data', async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return response(data[path]);
    return response(data[path]);
  });
  vi.stubGlobal('fetch', fetcher);
  const view = renderReactTree(<ConfigurationPage />);
  try {
    await flush();
    const form = view.container.querySelector('[data-testid="organization-form"]')!;
    change(form.querySelector('input[name="name"]')!, 'УК Новая');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    const write = fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(write?.[0]).toBe('/api/v1/config/organization');
    expect(JSON.parse(write?.[1]?.body as string)).toEqual({ name: 'УК Новая' });
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/v1/config/organization').length).toBeGreaterThan(1);
    expect(view.container.textContent).toContain('Сохранено');
  } finally { view.unmount(); }
});

test('server semantic error is shown and retry is available', async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => init?.method === 'PATCH'
    ? response({ error: { code: 'RESOURCE_NOT_FOUND', message: 'hidden', request_id: id } }, 404)
    : response(data[path]));
  vi.stubGlobal('fetch', fetcher);
  const view = renderReactTree(<ConfigurationPage />);
  try {
    await flush();
    const form = view.container.querySelector('[data-testid="organization-form"]')!;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(view.container.textContent).toContain('Запись не найдена или недоступна');
    expect(view.container.textContent).toContain('Повторить');
  } finally { view.unmount(); }
});

test('house, category, contractor, binding and pre-created user controls send approved requests', async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => response(data[path]));
  vi.stubGlobal('fetch', fetcher);
  const view = renderReactTree(<ConfigurationPage />);
  try {
    await flush();
    for (const selector of ['[data-testid="house-create-form"]', '[data-testid="category-edit-form"]', '[data-testid="contractor-create-form"]', '[data-testid="user-role-form"]']) {
      const form = view.container.querySelector(selector)!;
      if (selector.includes('house-create')) change(form.querySelector('input[name="address"]')!, 'Дом 2');
      if (selector.includes('contractor-create')) change(form.querySelector('input[name="display_name"]')!, 'Подрядчик Б');
      await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await flush();
    }
    const binding = [...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Деактивировать связь'))!;
    await act(async () => { binding.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method) as [string, RequestInit][];
    expect(writes.map(([path]) => path)).toEqual([
      '/api/v1/config/houses', `/api/v1/config/categories/${id}`, '/api/v1/config/contractors',
      `/api/v1/config/users/${id}/role-binding`, `/api/v1/config/contractors/${contractorId}/binding`,
    ]);
    expect(JSON.parse(writes[1]![1].body as string)).toMatchObject({ default_contractor_id: contractorId, result_requirement: 'PHOTO' });
    expect(JSON.parse(writes[3]![1].body as string)).toEqual({ role: 'RESIDENT', contractor_id: null, house_ids: [], active: true });
    expect(JSON.parse(writes[4]![1].body as string)).toEqual({ active: false });
  } finally { view.unmount(); }
});

test('validation error stays local and does not send a mutation', async () => {
  const fetcher = vi.fn(async (path: string, _init?: RequestInit) => response(data[path]));
  vi.stubGlobal('fetch', fetcher);
  const view = renderReactTree(<ConfigurationPage />);
  try {
    await flush();
    const form = view.container.querySelector('[data-testid="organization-form"]')!;
    change(form.querySelector('input[name="name"]')!, '');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(view.container.textContent).toContain('Проверьте обязательные поля');
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  } finally { view.unmount(); }
});

test('pending write does not replace authoritative configuration before server success', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') { await pending; return response(data[path]); }
    return response(data[path]);
  });
  vi.stubGlobal('fetch', fetcher);
  const view = renderReactTree(<ConfigurationPage />);
  try {
    await flush();
    const form = view.container.querySelector('[data-testid="organization-form"]')!;
    change(form.querySelector('input[name="name"]')!, 'Новое название');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    await flush();
    expect(view.container.textContent).toContain('Сохраняем');
    expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(view.container.querySelector('#config-organization')?.textContent).toBe('Организация');
    release();
    await flush();
    expect(view.container.textContent).toContain('Сохранено');
  } finally { view.unmount(); }
});

for (const width of [375, 1024]) {
  test(`configuration forms remain available at ${width}px viewport`, async () => {
    const previous = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    vi.stubGlobal('fetch', vi.fn(async (path: string) => response(data[path])));
    const view = renderReactTree(<ConfigurationPage />);
    try {
      await flush();
      expect(view.container.querySelectorAll('.config-card')).toHaveLength(5);
      expect(view.container.querySelector('[data-testid="category-create-form"]')).not.toBeNull();
    } finally {
      view.unmount();
      Object.defineProperty(window, 'innerWidth', { value: previous, configurable: true });
    }
  });
}
