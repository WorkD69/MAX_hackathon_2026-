import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import type { ContractorCommandTransport } from './command-transport.js';
import { ContractorCaseList, ContractorCaseView } from './contractor-case.js';
import { executor, ids, snapshot } from './fixtures.js';

const date = '2026-09-25T00:00:00Z';
const read = (value = snapshot()): CaseReadTransport => ({
  list: vi.fn().mockResolvedValue({ items: [{ case_id: ids.case, display_number: 'C-1',
    state: value.case.state, category: 'Вода', location_label: 'Дом 1',
    current_iteration_no: value.case.current_iteration.number, updated_at: date,
    responsibility: 'Подрядчик' }], next_cursor: null }),
  snapshot: vi.fn().mockResolvedValue(value),
});
const commands = (): ContractorCommandTransport => ({
  accept: vi.fn().mockResolvedValue(undefined), reject: vi.fn().mockResolvedValue(undefined),
  comment: vi.fn().mockResolvedValue(undefined), upload: vi.fn().mockResolvedValue({
    command_id: ids.case, case_id: ids.case, state: 'EXECUTION', revision: 3,
    event_ids: [ids.case], created: { attachment_id: ids.case },
  }), submit: vi.fn().mockResolvedValue({
    command_id: ids.case, case_id: ids.case, state: 'AWAITING_RESULT_CHECK', revision: 4,
    event_ids: [ids.case], created: { result_id: ids.case, notification_intent_id: ids.assignment },
    notification: { status: 'QUEUED' },
  }),
});
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
function change(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
afterEach(() => queryClient.clear());

test('selected-only list and detail show no LIVE Case', async () => {
  const api = read();
  api.list = vi.fn().mockResolvedValue({ items: [], next_cursor: null });
  api.snapshot = vi.fn().mockRejectedValue({ status: 404 });
  const list = renderReactTree(<ContractorCaseList contextKey="selected-list" read={api} onOpen={() => {}} />);
  const detail = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey="selected-detail" read={api} commands={commands()} />);
  try {
    await flush();
    await vi.waitFor(() => expect(detail.container.textContent).toContain('Случай недоступен'));
    expect(list.container.querySelectorAll('[data-case-id]')).toHaveLength(0);
    expect(detail.container.textContent).toContain('Случай недоступен');
    expect(detail.container.textContent).not.toContain('Протечка');
  } finally { list.unmount(); detail.unmount(); }
});

test('pending shows limited context, accept, and validated rejection reason', async () => {
  const api = read(snapshot({ current_result: { result_id: ids.case, iteration_id: ids.iteration,
    description: 'Скрытый результат', submitted_at: date, attachments: [] } }));
  const cmd = commands();
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey="pending" read={api} commands={cmd} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.querySelector('[data-testid=reject-assignment]')).not.toBeNull());
    expect(view.container.textContent).toContain('Протечка');
    expect(view.container.textContent).not.toContain('Скрытый результат');
    expect(view.container.querySelector('[name=resultDescription]')).toBeNull();
    await act(async () => { (view.container.querySelector('[data-testid=reject-assignment]') as HTMLButtonElement).click(); });
    expect(cmd.reject).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('Укажите причину');
    await act(async () => { change(view.container.querySelector('[name=rejectReason]') as HTMLTextAreaElement, 'Нет специалистов'); });
    await act(async () => { (view.container.querySelector('[data-testid=reject-assignment]') as HTMLButtonElement).click(); });
    await flush();
    expect(cmd.reject).toHaveBeenCalledWith(ids.case, ids.assignment, 'Нет специалистов');
    await act(async () => { (view.container.querySelector('[data-testid=accept-assignment]') as HTMLButtonElement).click(); });
    await flush();
    expect(cmd.accept).toHaveBeenCalledWith(ids.case, ids.assignment);
  } finally { view.unmount(); }
});

test('current executor sees server actions, comments, material requirement, and no UK completion', async () => {
  const value = executor({ activity: [{ activity_id: ids.case, event_id: ids.case, event_seq: 1,
    semantic_code: 'EVT_007', occurred_at: date, iteration_no: 1,
    actor: { role: 'CONTRACTOR_EMPLOYEE', display_name: 'Мастер' }, text: 'Рабочий комментарий',
    state_transition: null, domain: { result: null, feedback: null,
      comment: { comment_id: ids.case, body: 'Буду в 18:00', created_at: date } }, attachments: [] }] });
  const cmd = commands();
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey="current" read={read(value)} commands={cmd} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.textContent).toContain('Буду в 18:00'));
    expect(view.container.textContent).toContain('Буду в 18:00');
    expect(view.container.textContent).toContain('фотограф');
    expect(view.container.textContent).not.toContain('Завершить случай');
    await act(async () => { change(view.container.querySelector('[name=comment]') as HTMLTextAreaElement, 'Работа начата'); });
    await act(async () => { (view.container.querySelector('[data-testid=send-comment]') as HTMLButtonElement).click(); });
    await flush();
    expect(cmd.comment).toHaveBeenCalledWith(ids.case, 'Работа начата');
  } finally { view.unmount(); }
});

test('upload does not complete Case; SubmitResult uses exact target once and says check pending', async () => {
  const initial = executor();
  const submitted = executor({ state: 'AWAITING_RESULT_CHECK', allowed_actions: [] });
  const api = read(initial);
  api.snapshot = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(initial).mockResolvedValue(submitted);
  const cmd = commands();
  let finish!: (value: unknown) => void;
  cmd.submit = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey="upload-submit" read={api} commands={cmd} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.querySelector('[name=resultFile]')).not.toBeNull());
    const file = new File(['photo'], 'work.jpg', { type: 'image/jpeg' });
    const input = view.container.querySelector('[name=resultFile]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { (view.container.querySelector('[data-testid=upload-material]') as HTMLButtonElement).click(); });
    await flush();
    expect(cmd.upload).toHaveBeenCalledWith(ids.case, ids.assignment, ids.iteration, file);
    expect(view.container.textContent).not.toContain('Случай завершён');
    await act(async () => { change(view.container.querySelector('[name=resultDescription]') as HTMLTextAreaElement, 'Устранено'); });
    await act(async () => {
      const button = view.container.querySelector('[data-testid=submit-result]') as HTMLButtonElement;
      button.click(); button.click();
    });
    expect(cmd.submit).toHaveBeenCalledTimes(1);
    expect(cmd.submit).toHaveBeenCalledWith(ids.case, { assignment_id: ids.assignment,
      iteration_id: ids.iteration, description: 'Устранено', material_attachment_ids: [ids.case] });
    await act(async () => { finish({ state: 'AWAITING_RESULT_CHECK', notification: { status: 'QUEUED' } }); });
    await flush();
    expect(view.container.textContent).toContain('Результат отправлен на проверку');
    expect(view.container.textContent).not.toContain('доставлено');
    expect(view.container.textContent).not.toContain('Случай завершён');
  } finally { view.unmount(); }
});

test('409 refetch removes old A surface without retry or retarget', async () => {
  const initial = executor();
  const api = read(initial);
  let hidden = false;
  api.snapshot = vi.fn().mockImplementation(() => hidden ? Promise.reject({ status: 404 }) : Promise.resolve(initial));
  const cmd = commands();
  cmd.comment = vi.fn().mockImplementation(() => { hidden = true; return Promise.reject({ status: 409, code: 'STALE_ASSIGNMENT' }); });
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey="stale" read={api} commands={cmd} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.querySelector('[name=comment]')).not.toBeNull());
    await act(async () => { change(view.container.querySelector('[name=comment]') as HTMLTextAreaElement, 'Привет'); });
    await act(async () => { (view.container.querySelector('[data-testid=send-comment]') as HTMLButtonElement).click(); });
    await flush();
    expect(cmd.comment).toHaveBeenCalledTimes(1);
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain('Случай недоступен');
    expect(view.container.querySelector('[name=resultDescription]')).toBeNull();
  } finally { view.unmount(); }
});

test('same contractor rework offers N+1 work without another acceptance', async () => {
  const value = executor({ state: 'REWORK', current_iteration: { iteration_id: ids.iteration, number: 2 } });
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey="same-rework" read={read(value)} commands={commands()} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.textContent).toContain('Работа по итерации 2'));
    expect(view.container.querySelector('[data-testid=accept-assignment]')).toBeNull();
    expect(view.container.querySelector('[data-testid=submit-result]')).not.toBeNull();
  } finally { view.unmount(); }
});

test.each([
  ['NONE', 'Дополнительные материалы не обязательны'],
  ['PHOTO', 'Нужна фотография результата'],
  ['FILE', 'Нужен файл результата'],
] as const)('authoritative %s requirement is rendered', async (requirement, label) => {
  const value = executor({ category: { name: 'Вода', result_requirement: requirement } });
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey={`requirement-${requirement}`}
    read={read(value)} commands={commands()} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.textContent).toContain(label));
  } finally { view.unmount(); }
});

test('semantic SubmitResult error never announces success', async () => {
  const cmd = commands();
  cmd.submit = vi.fn().mockRejectedValue(Object.assign(new Error('Материал не подходит'),
    { status: 422, code: 'RESULT_MATERIAL_INVALID' }));
  const value = executor({ category: { name: 'Вода', result_requirement: 'NONE' } });
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey="semantic-error" read={read(value)} commands={cmd} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.querySelector('[name=resultDescription]')).not.toBeNull());
    await act(async () => { change(view.container.querySelector('[name=resultDescription]') as HTMLTextAreaElement, 'Сделано'); });
    await act(async () => { (view.container.querySelector('[data-testid=submit-result]') as HTMLButtonElement).click(); });
    await flush();
    expect(cmd.submit).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Материал не подходит');
    expect(view.container.textContent).not.toContain('Результат отправлен на проверку');
  } finally { view.unmount(); }
});

test.each([375, 1024])('contractor layout renders at %ipx', async (width) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const view = renderReactTree(<ContractorCaseView caseId={ids.case} contextKey={`width-${width}`} read={read(executor())} commands={commands()} />);
  try {
    await flush();
    await vi.waitFor(() => expect(view.container.querySelector('[data-testid=submit-result]')).not.toBeNull());
    expect(view.container.querySelector('.contractor-case')).not.toBeNull();
    expect(view.container.querySelector('[data-testid=submit-result]')).not.toBeNull();
  } finally { view.unmount(); }
});
