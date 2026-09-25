import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { CASE_STATES, ROLES, type AllowedActionOutput, type CaseSnapshotOutput, type CaseStateOutput } from '@max-smart-city/contracts';
import { renderReactTree } from '../../../app/test-render.js';
import { queryClient } from '../../../app/query-client.js';
import type { PlatformAdapter } from '../../../platform/platform-adapter.js';
import { CaseActivity, CaseListView, CaseDetailsView, type ActionRenderers } from './case-read.js';
import type { CaseReadTransport } from './read-transport.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const resultId = '22222222-2222-4222-8222-222222222222';
const iterationId = '33333333-3333-4333-8333-333333333333';
const eventA = '44444444-4444-4444-8444-444444444444';
const eventB = '55555555-5555-4555-8555-555555555555';
const date = '2026-09-25T00:00:00Z';
let foreground: (() => void) | undefined;
const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null,
  subscribeForeground: (listener) => { foreground = listener; return () => { foreground = undefined; }; },
};

function fixture(state: CaseStateOutput = 'CREATED'): CaseSnapshotOutput {
  return { case: {
    case_id: caseId, display_number: 'C-1', state, revision: 1,
    created_at: date, updated_at: date, description: 'Нет воды',
    location: { house: 'Дом 1', premises: 'Кв. 2' },
    category: { name: 'Вода', result_requirement: 'PHOTO' },
    current_iteration: { iteration_id: iterationId, number: 2 },
    responsibility: { semantic_code: 'SERVER_NEXT', text: 'УК проверит случай' },
    initial_attachments: [{ attachment_id: eventA, file_name: 'photo.jpg', mime_type: 'image/jpeg', byte_size: 123 }],
    selection: null, assignment: null, current_executor: null, current_result: null,
    resident_feedback: null, allowed_actions: [], activity: [
      { activity_id: eventB, event_id: eventB, event_seq: 2, semantic_code: 'EVT_008',
        occurred_at: '2026-09-24T00:00:00Z', iteration_no: 2,
        actor: { role: 'CONTRACTOR_EMPLOYEE', display_name: 'Мастер' }, text: 'Результат отправлен',
        state_transition: null,
        domain: { result: { result_id: resultId, iteration_id: iterationId,
          description: 'Работы выполнены', submitted_at: date, attachments: [] }, feedback: null, comment: null },
        attachments: [] },
      { activity_id: eventA, event_id: eventA, event_seq: 1, semantic_code: 'EVT_007',
        occurred_at: date, iteration_no: 1,
        actor: { role: 'UK_EMPLOYEE', display_name: 'УК' }, text: 'Ранее проведена проверка',
        state_transition: null, domain: { result: null, feedback: null,
          comment: { comment_id: eventA, body: 'История', created_at: date } }, attachments: [] },
    ],
  } };
}

function transport(snapshot = fixture()): CaseReadTransport {
  return {
    list: vi.fn().mockResolvedValue({ items: [{ case_id: caseId, display_number: 'C-1', state: snapshot.case.state,
      category: 'Вода', location_label: 'Дом 1', current_iteration_no: 2,
      updated_at: date, responsibility: 'УК' }], next_cursor: null }),
    snapshot: vi.fn().mockResolvedValue(snapshot),
  };
}

async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
afterEach(() => { queryClient.clear(); foreground = undefined; });

test('list handles loading, server-only items, empty, error and manual refresh', async () => {
  let resolveFirst!: (value: Awaited<ReturnType<CaseReadTransport['list']>>) => void;
  const api = transport();
  const item = await api.list();
  api.list = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
    .mockResolvedValueOnce({ items: [], next_cursor: null }).mockRejectedValueOnce(new Error('offline'));
  const view = renderReactTree(<CaseListView transport={api} contextKey="resident-run" onOpen={() => {}} />, { adapter });
  try {
    expect(view.container.textContent).toContain('Загрузка');
    await act(async () => { resolveFirst(item); });
    await flush();
    expect(view.container.textContent).toContain('C-1');
    expect(view.container.querySelectorAll('[data-case-id]')).toHaveLength(1);
    await act(async () => { (view.container.querySelector('[data-testid="case-list-refresh"]') as HTMLButtonElement).click(); });
    await flush();
    expect(view.container.textContent).toContain('Случаев пока нет');
    await act(async () => { (view.container.querySelector('[data-testid="case-list-refresh"]') as HTMLButtonElement).click(); });
    await flush();
    expect(view.container.textContent).toContain('Не удалось загрузить');
  } finally { view.unmount(); }
});

test.each(ROLES)('list renders only the response supplied for %s', async (role) => {
  const api = transport();
  api.list = vi.fn().mockResolvedValue({ items: [{ case_id: caseId,
    display_number: role, state: 'CREATED', category: 'Вода', location_label: 'Дом 1',
    current_iteration_no: 1, updated_at: date, responsibility: 'УК' }], next_cursor: null });
  const view = renderReactTree(<CaseListView transport={api} contextKey={role} onOpen={() => {}} />, { adapter });
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.querySelectorAll('[data-case-id]')).toHaveLength(1));
    expect(view.container.querySelectorAll('[data-case-id]')).toHaveLength(1);
    expect(view.container.textContent).toContain(role);
    expect(api.list).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test.each(ROLES)('details show all eight state labels for %s with server next step', async (role) => {
  for (const state of CASE_STATES) {
    const view = renderReactTree(<CaseDetailsView caseId={caseId} role={role}
      transport={transport(fixture(state))} contextKey={`${role}-${state}`} />, { adapter });
    try {
      await flush();
      await vi.waitFor(() => expect(view.container.querySelector('[data-testid="case-status"]')?.textContent).toBeTruthy());
      expect(view.container.textContent).toContain('УК проверит случай');
      expect(view.container.textContent).toContain('photo.jpg');
      expect(view.container.textContent).toContain('История');
      expect(view.container.querySelectorAll('[data-event-id]')).toHaveLength(2);
      const events = [...view.container.querySelectorAll('[data-event-id]')].map((node) => node.getAttribute('data-event-id'));
      expect(events).toEqual([eventA, eventB]);
      expect(view.container.textContent?.match(/Результат отправлен/g)).toHaveLength(1);
    } finally { view.unmount(); }
  }
});

test('allowed action registry renders only server actions and 409 refetches without retry or retarget', async () => {
  const action: AllowedActionOutput = { code: 'ACCEPT_ASSIGNMENT', target: { assignment_id: eventA }, input: {} };
  const nextAction: AllowedActionOutput = { code: 'ACCEPT_ASSIGNMENT', target: { assignment_id: eventB }, input: {} };
  const initial = fixture('SENT_TO_CONTRACTOR'); initial.case.allowed_actions = [action];
  const fresh = fixture('EXECUTION'); fresh.case.allowed_actions = [nextAction];
  const api = transport(initial);
  api.snapshot = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(fresh);
  const execute = vi.fn().mockRejectedValue(Object.assign(new Error('stale'), { status: 409 }));
  const payload = { assignment_id: eventA };
  const renderers: ActionRenderers = { ACCEPT_ASSIGNMENT: (value, submit) =>
    <button type="button" data-testid="accept-action" onClick={() => { void submit(payload); }}>{value.code}</button> };
  const view = renderReactTree(<CaseDetailsView caseId={caseId} role="CONTRACTOR_EMPLOYEE"
    transport={api} contextKey="contractor-run" executeAction={execute} actionRenderers={renderers} />, { adapter });
  try {
    await flush();
    expect(view.container.querySelectorAll('[data-testid="accept-action"]')).toHaveLength(1);
    await act(async () => { (view.container.querySelector('[data-testid="accept-action"]') as HTMLButtonElement).click(); });
    await flush();
    expect(view.container.textContent).toContain('Случай изменился с момента открытия. Данные обновлены.');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(action, payload);
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain('Исполнение');
  } finally { view.unmount(); }
});

test('form payload with exact target reaches executor and success refetches', async () => {
  const action: AllowedActionOutput = { code: 'SELECT_CONTRACTOR', target: { iteration_id: iterationId }, input: {} };
  const initial = fixture('ACCEPTED_BY_UK'); initial.case.allowed_actions = [action];
  const fresh = fixture('ACCEPTED_BY_UK'); fresh.case.allowed_actions = [];
  const api = transport(initial);
  api.snapshot = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(fresh);
  const payload = { contractor_id: eventA, iteration_id: iterationId };
  const execute = vi.fn().mockResolvedValue({});
  const renderers: ActionRenderers = { SELECT_CONTRACTOR: (_value, submit) =>
    <button type="button" data-testid="select-contractor" onClick={() => { void submit(payload); }}>Выбрать</button> };
  const view = renderReactTree(<CaseDetailsView caseId={caseId} role="UK_EMPLOYEE"
    transport={api} contextKey="select-run" executeAction={execute} actionRenderers={renderers} />, { adapter });
  try {
    await flush();
    await act(async () => { (view.container.querySelector('[data-testid="select-contractor"]') as HTMLButtonElement).click(); });
    await flush();
    expect(execute).toHaveBeenCalledExactlyOnceWith(action, payload);
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('[data-testid="select-contractor"]')).toBeNull();
  } finally { view.unmount(); }
});

test('focus and manual refresh fetch current snapshot', async () => {
  const api = transport();
  const view = renderReactTree(<CaseDetailsView caseId={caseId} role="RESIDENT"
    transport={api} contextKey="focus-run" />, { adapter });
  try {
    await flush();
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    await act(async () => { foreground?.(); });
    await flush();
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    await act(async () => { (view.container.querySelector('[data-testid="case-details-refresh"]') as HTMLButtonElement).click(); });
    await flush();
    expect(api.snapshot).toHaveBeenCalledTimes(3);
  } finally { view.unmount(); }
});

test('command success leaves business state unchanged until authoritative refetch', async () => {
  const action: AllowedActionOutput = { code: 'ACCEPT_CASE', target: {}, input: {} };
  const initial = fixture('CREATED'); initial.case.allowed_actions = [action];
  const fresh = fixture('ACCEPTED_BY_UK'); fresh.case.allowed_actions = [];
  const api = transport(initial);
  api.snapshot = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(fresh);
  let finish!: () => void;
  const execute = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const renderers: ActionRenderers = { ACCEPT_CASE: (_value, submit) =>
    <button type="button" data-testid="accept-case" onClick={() => { void submit({}); }}>Принять</button> };
  const view = renderReactTree(<CaseDetailsView caseId={caseId} role="UK_EMPLOYEE"
    transport={api} contextKey="success-run" executeAction={execute} actionRenderers={renderers} />, { adapter });
  try {
    await flush();
    await act(async () => { (view.container.querySelector('[data-testid="accept-case"]') as HTMLButtonElement).click(); });
    expect(view.container.querySelector('[data-testid="case-status"]')?.textContent).toBe('Создано');
    expect(view.container.textContent).toContain('Выполняется действие');
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await flush();
    expect(view.container.querySelector('[data-testid="case-status"]')?.textContent).toBe('Принято УК');
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('history keeps old results by iteration and renders one item per event id', () => {
  const facts = fixture().case.activity;
  const oldResult = { ...facts[0]!, event_id: eventA, activity_id: eventA,
    event_seq: 1, iteration_no: 1, text: 'Старый результат',
    domain: { ...facts[0]!.domain, result: { ...facts[0]!.domain.result!, description: 'Первый ремонт' } } };
  const current = { ...facts[0]!, event_seq: 2, occurred_at: '2026-09-24T00:00:00Z' };
  const view = renderReactTree(<CaseActivity activity={[current, oldResult, { ...oldResult }]} />, { adapter });
  try {
    expect(view.container.querySelectorAll('[data-event-id]')).toHaveLength(2);
    expect(view.container.textContent).toContain('Первый ремонт');
    expect(view.container.textContent).toContain('Работы выполнены');
    expect([...view.container.querySelectorAll('[data-event-id]')].map((node) => node.getAttribute('data-event-id')))
      .toEqual([eventA, eventB]);
  } finally { view.unmount(); }
});
