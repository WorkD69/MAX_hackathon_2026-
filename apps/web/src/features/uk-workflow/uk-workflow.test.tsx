import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { UuidSchema, type AllowedActionOutput, type CaseSnapshotOutput } from '@max-smart-city/contracts';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import type { PlatformAdapter } from '../../platform/platform-adapter.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { UkActionControl, UkWorkflowCaseView, UkWorkflowFacts,
  noFeedbackEventId } from './uk-workflow.js';

const id = (digit: number) => {
  const d = String(digit);
  return `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}`;
};
const caseId = id(1), iterationId = id(2), resultId = id(3), feedbackId = id(4);
const selectionId = id(5), contractorId = id(6), eventId = id(7);
const adapter: PlatformAdapter = { name: 'test', isMiniAppContext: true, getRawInitData: () => null,
  subscribeForeground: () => () => {} };
const action = <T extends AllowedActionOutput['code']>(code: T, target: Extract<AllowedActionOutput, { code: T }>['target']) =>
  ({ code, target, input: {} }) as Extract<AllowedActionOutput, { code: T }>;
const date = '2026-09-25T00:00:00Z';

function snapshot(state: CaseSnapshotOutput['case']['state'] = 'CREATED'): CaseSnapshotOutput {
  return { case: {
    case_id: caseId, display_number: 'C-1', state, revision: 1, created_at: date, updated_at: date,
    description: 'Нет воды', location: { house: 'Дом', premises: 'Кв. 1' },
    category: { name: 'Вода', result_requirement: 'NONE' },
    current_iteration: { iteration_id: iterationId, number: 2 },
    responsibility: { semantic_code: 'SERVER', text: 'Решение УК' }, initial_attachments: [],
    selection: null, assignment: null, current_executor: null, current_result: null,
    resident_feedback: null, activity: [], allowed_actions: [],
  } };
}

function event(code: 'EVT_015' | 'EVT_007', number = 2): CaseSnapshotOutput['case']['activity'][number] {
  return { event_id: eventId, activity_id: eventId, event_seq: 1, semantic_code: code,
    occurred_at: date, iteration_no: number, actor: { role: 'UK_EMPLOYEE', display_name: 'УК' },
    text: code, state_transition: null, domain: { result: null, feedback: null, comment: null },
    attachments: [] };
}

function control(value: AllowedActionOutput, data = snapshot()) {
  const submit = vi.fn().mockResolvedValue(undefined);
  const view = renderReactTree(<UkActionControl action={value} submit={submit} snapshot={data} />, { adapter });
  return { view, submit };
}
function input(view: ReturnType<typeof control>['view'], name: string, value: string) {
  const field = view.container.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement;
  act(() => { const setter = Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
    setter.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true })); });
}
function check(view: ReturnType<typeof control>['view'], name: string) {
  const field = view.container.querySelector(`[name="${name}"]`) as HTMLInputElement;
  act(() => { field.click(); });
}
async function send(view: ReturnType<typeof control>['view']) {
  await act(async () => { (view.container.querySelector('form') as HTMLFormElement)
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
afterEach(() => { queryClient.clear(); });

test('accept, select and send are separate exact-target actions', async () => {
  const accept = control(action('ACCEPT_CASE', {}));
  await send(accept.view); expect(accept.submit).toHaveBeenCalledWith({}); accept.view.unmount();
  const select = control(action('SELECT_CONTRACTOR', { iteration_id: iterationId }));
  expect(UuidSchema.safeParse(contractorId).success).toBe(true);
  input(select.view, 'contractor_id', contractorId);
  expect((select.view.container.querySelector('[name="contractor_id"]') as HTMLInputElement).value).toBe(contractorId);
  await send(select.view);
  expect(select.submit).toHaveBeenCalledWith({ contractor_id: contractorId, iteration_id: iterationId });
  select.view.unmount();
  const assignment = control(action('SEND_ASSIGNMENT', { selection_id: selectionId, iteration_id: iterationId }));
  await send(assignment.view);
  expect(assignment.submit).toHaveBeenCalledWith({ selection_id: selectionId, iteration_id: iterationId });
  assignment.view.unmount();
});

test('selected, sent and accepted labels and rejected reason follow server projection', () => {
  const data = snapshot('ACCEPTED_BY_UK');
  data.case.selection = { selection_id: selectionId, contractor: { contractor_id: contractorId, name: 'Б' } };
  const view = renderReactTree(<UkWorkflowFacts snapshot={data} />, { adapter });
  expect(view.container.textContent).toContain('Выбран: Б');
  expect(view.container.textContent).not.toContain('Отправлено'); view.unmount();
  data.case.assignment = { assignment_id: id(8), contractor: { contractor_id: contractorId, name: 'Б' }, decision: 'PENDING' };
  const sent = renderReactTree(<UkWorkflowFacts snapshot={data} />, { adapter });
  expect(sent.container.textContent).toContain('Отправлено: Б');
  expect(sent.container.textContent).not.toContain('Принято подрядчиком'); sent.unmount();
  data.case.assignment.decision = 'ACCEPTED';
  const accepted = renderReactTree(<UkWorkflowFacts snapshot={data} />, { adapter });
  expect(accepted.container.textContent).toContain('Принято подрядчиком: Б'); accepted.unmount();
  data.case.assignment.decision = 'REJECTED'; data.case.assignment.reject_reason = 'Нет мастера';
  const rejected = renderReactTree(<UkWorkflowFacts snapshot={data} />, { adapter });
  expect(rejected.container.textContent).toContain('Причина отклонения: Нет мастера'); rejected.unmount();
});

test('comment, clarification and remark decisions keep distinct targets', async () => {
  const comment = control(action('ADD_COMMENT', {}));
  input(comment.view, 'body', 'Работы проверены'); await send(comment.view);
  expect(comment.submit).toHaveBeenCalledWith({ body: 'Работы проверены', clarification_request_id: null, files: [] });
  comment.view.unmount();
  const clarification = control(action('REQUEST_CLARIFICATION', { result_id: resultId, feedback_id: feedbackId }));
  input(clarification.view, 'message', 'Где течёт?'); await send(clarification.view);
  expect(clarification.submit).toHaveBeenCalledWith({ result_id: resultId, feedback_id: feedbackId,
    message: 'Где течёт?', files: [] }); clarification.view.unmount();
  const rework = control(action('RETURN_TO_REWORK', { result_id: resultId, feedback_id: feedbackId }));
  await send(rework.view);
  expect(rework.submit).toHaveBeenCalledWith({ result_id: resultId, feedback_id: feedbackId }); rework.view.unmount();
});

test.each(['COMPLETED', 'EXECUTION'] as const)('%s without ADD_COMMENT has no comment form', async (state) => {
  const data = snapshot(state);
  const api: CaseReadTransport = { list: vi.fn(), snapshot: vi.fn().mockResolvedValue(data) };
  const view = renderReactTree(<UkWorkflowCaseView caseId={caseId} role="UK_EMPLOYEE"
    contextKey={state} transport={api} authorizedFetch={vi.fn()} />, { adapter });
  try {
    await vi.waitFor(() => expect(view.container.textContent)
      .toContain(state === 'COMPLETED' ? 'Завершено' : 'Исполнение'));
    expect(view.container.querySelector('[name="body"]')).toBeNull();
  } finally { view.unmount(); }
});

test('no-feedback event is current only and completion remains a second manual step', async () => {
  const data = snapshot('AWAITING_RESULT_CHECK');
  data.case.current_result = { result_id: resultId, iteration_id: iterationId, description: 'Готово',
    submitted_at: date, attachments: [] };
  data.case.activity = [event('EVT_015', 1)];
  expect(noFeedbackEventId(data, resultId)).toBeNull();
  const record = control(action('RECORD_NO_RESIDENT_FEEDBACK', { result_id: resultId, iteration_id: iterationId }), data);
  input(record.view, 'basis_note', 'Регламент УК');
  check(record.view, 'basis_confirmed');
  await send(record.view);
  expect(record.submit).toHaveBeenCalledWith({ result_id: resultId, iteration_id: iterationId,
    basis_confirmed: true, basis_note: 'Регламент УК' }); record.view.unmount();
  data.case.activity = [event('EVT_015')];
  expect(noFeedbackEventId(data, resultId)).toBe(eventId);
  const complete = control(action('COMPLETE_CASE', { result_id: resultId }), data);
  input(complete.view, 'process_reference', 'Регламент 14'); check(complete.view, 'completion_confirmed');
  await send(complete.view);
  expect(complete.submit).toHaveBeenCalledWith({ result_id: resultId, basis: {
    type: 'NO_RESIDENT_FEEDBACK', event_id: eventId,
    completion_basis: { confirmed: true, process_reference: 'Регламент 14' } } });
  complete.view.unmount();
});

test('normal and disputed completion use current feedback and require explanation', async () => {
  const normal = snapshot('AWAITING_RESULT_CHECK');
  normal.case.current_result = { result_id: resultId, iteration_id: iterationId, description: 'Готово', submitted_at: date, attachments: [] };
  normal.case.resident_feedback = { feedback_id: feedbackId, result_id: resultId,
    type: 'CONFIRMATION', remark_text: null, created_at: date };
  const confirmed = control(action('COMPLETE_CASE', { result_id: resultId }), normal);
  await send(confirmed.view);
  expect(confirmed.submit).toHaveBeenCalledWith({ result_id: resultId,
    basis: { type: 'RESIDENT_CONFIRMATION', feedback_id: feedbackId } }); confirmed.view.unmount();
  const disputed = control(action('COMPLETE_WITH_EXPLANATION', { result_id: resultId, feedback_id: feedbackId }),
    snapshot('REMARKS_REVIEW'));
  await send(disputed.view); expect(disputed.submit).not.toHaveBeenCalled();
  input(disputed.view, 'explanation', 'Результат принят по акту'); await send(disputed.view);
  expect(disputed.submit).toHaveBeenCalledWith({ result_id: resultId, feedback_id: feedbackId,
    explanation: 'Результат принят по акту' }); disputed.view.unmount();
});

test.each([390, 1280])('UK controls remain available at %i px viewport', async (width) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const view = control(action('SELECT_CONTRACTOR', { iteration_id: iterationId }));
  expect(view.view.container.querySelector('form')).not.toBeNull();
  expect(view.view.container.querySelector('[name="contractor_id"]')).not.toBeNull();
  view.view.unmount();
});

test('rework A to B keeps backend N+1, removes A actions and leaves B pending after send', async () => {
  const remark = snapshot('REMARKS_REVIEW');
  remark.case.current_executor = { contractor_id: id(8), name: 'А' };
  remark.case.current_result = { result_id: resultId, iteration_id: id(9), description: 'Сделано',
    submitted_at: date, attachments: [] };
  remark.case.resident_feedback = { feedback_id: feedbackId, result_id: resultId,
    type: 'REMARK', remark_text: 'Повторить', created_at: date };
  remark.case.allowed_actions = [action('RETURN_TO_REWORK', { result_id: resultId, feedback_id: feedbackId })];
  const rework = snapshot('REWORK');
  rework.case.current_iteration.number = 3;
  rework.case.current_executor = { contractor_id: id(8), name: 'А' };
  rework.case.allowed_actions = [action('SELECT_CONTRACTOR', { iteration_id: iterationId })];
  const selected = snapshot('REWORK');
  selected.case.current_iteration.number = 3;
  selected.case.selection = { selection_id: selectionId, contractor: { contractor_id: contractorId, name: 'Б' } };
  selected.case.allowed_actions = [action('SEND_ASSIGNMENT', { selection_id: selectionId, iteration_id: iterationId })];
  const sent = snapshot('SENT_TO_CONTRACTOR');
  sent.case.current_iteration.number = 3;
  sent.case.selection = selected.case.selection;
  sent.case.assignment = { assignment_id: id(8), contractor: { contractor_id: contractorId, name: 'Б' },
    decision: 'PENDING' };
  sent.case.allowed_actions = [];
  const api: CaseReadTransport = { list: vi.fn(), snapshot: vi.fn()
    .mockResolvedValueOnce(remark).mockResolvedValueOnce(rework)
    .mockResolvedValueOnce(selected).mockResolvedValue(sent) };
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  const view = renderReactTree(<UkWorkflowCaseView caseId={caseId} role="UK_EMPLOYEE"
    contextKey="rework" transport={api} authorizedFetch={fetch} />, { adapter });
  try {
    await vi.waitFor(() => expect(view.container.textContent).toContain('Вернуть на доработку'));
    await act(async () => { (view.container.querySelector('form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await vi.waitFor(() => expect(view.container.querySelector('[name="contractor_id"]')).not.toBeNull());
    expect(view.container.textContent).toContain('Итерация: 3');
    expect(view.container.textContent).not.toContain('Вернуть на доработку');
    input(view, 'contractor_id', contractorId);
    await send(view);
    await vi.waitFor(() => expect(view.container.textContent).toContain('Отправить назначение'));
    expect(view.container.textContent).toContain('Итерация: 3');
    expect(view.container.textContent).toContain('Выбран: Б');
    expect(view.container.textContent).not.toContain('Текущий исполнитель: А');
    expect(view.container.textContent).not.toContain('Отправлено: Б');
    await send(view);
    await vi.waitFor(() => expect(view.container.textContent).toContain('Отправлено: Б'));
    expect(view.container.textContent).toContain('Ожидается принятие');
    expect(view.container.textContent).not.toContain('Принято подрядчиком: Б');
    expect(view.container.textContent).toContain('Итерация: 3');
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally { view.unmount(); }
});

test('semantic rejection is visible and does not change business state', async () => {
  const data = snapshot('CREATED');
  data.case.allowed_actions = [action('ACCEPT_CASE', {})];
  const api: CaseReadTransport = { list: vi.fn(), snapshot: vi.fn().mockResolvedValue(data) };
  const response = { error: { code: 'INVALID_STATE', message: 'Invalid', request_id: id(8) } };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 422 }));
  const view = renderReactTree(<UkWorkflowCaseView caseId={caseId} role="UK_EMPLOYEE"
    contextKey="semantic" transport={api} authorizedFetch={fetch} />, { adapter });
  try {
    await vi.waitFor(() => expect(view.container.textContent).toContain('Принять случай'));
    await send(view);
    await vi.waitFor(() => expect(view.container.textContent).toContain('Действие больше недоступно'));
    expect(view.container.textContent).toContain('Создано');
    expect(api.snapshot).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

test('409 refetch removes stale form and never retries or retargets it', async () => {
  const old = snapshot('ACCEPTED_BY_UK');
  old.case.allowed_actions = [action('SELECT_CONTRACTOR', { iteration_id: iterationId })];
  const fresh = snapshot('REWORK');
  fresh.case.current_iteration = { iteration_id: id(9), number: 3 };
  fresh.case.allowed_actions = [action('SELECT_CONTRACTOR', { iteration_id: id(9) })];
  const api: CaseReadTransport = { list: vi.fn(), snapshot: vi.fn()
    .mockResolvedValueOnce(old).mockResolvedValue(fresh) };
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 409 }));
  const view = renderReactTree(<UkWorkflowCaseView caseId={caseId} role="UK_EMPLOYEE"
    contextKey="stale" transport={api} authorizedFetch={fetch} />, { adapter });
  try {
    await vi.waitFor(() => expect(view.container.querySelector('[name="contractor_id"]')).not.toBeNull());
    input(view, 'contractor_id', contractorId); await send(view);
    await vi.waitFor(() => expect(view.container.textContent).toContain('Случай изменился'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ contractor_id: contractorId, iteration_id: iterationId });
    expect(api.snapshot).toHaveBeenCalledTimes(2);
    expect((view.container.querySelector('[name="contractor_id"]') as HTMLInputElement).value).toBe('');
    expect(view.container.textContent).toContain('Итерация: 3');
  } finally { view.unmount(); }
});

test('comment attachment remains in one activity feed after success refetch', async () => {
  const initial = snapshot('EXECUTION');
  initial.case.allowed_actions = [action('ADD_COMMENT', {})];
  const fresh = snapshot('EXECUTION');
  fresh.case.allowed_actions = [action('ADD_COMMENT', {})];
  fresh.case.activity = [{ ...event('EVT_007'), text: 'Комментарий УК',
    domain: { result: null, feedback: null, comment: { comment_id: id(8), body: 'Фото приложено', created_at: date } },
    attachments: [{ attachment_id: id(9), file_name: 'photo.jpg', mime_type: 'image/jpeg', byte_size: 5 }] }];
  const api: CaseReadTransport = { list: vi.fn(), snapshot: vi.fn()
    .mockResolvedValueOnce(initial).mockResolvedValue(fresh) };
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  const view = renderReactTree(<UkWorkflowCaseView caseId={caseId} role="UK_EMPLOYEE"
    contextKey="comment" transport={api} authorizedFetch={fetch} />, { adapter });
  try {
    await vi.waitFor(() => expect(view.container.querySelector('[name="body"]')).not.toBeNull());
    input(view, 'body', 'Фото приложено');
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const field = view.container.querySelector('[name="files"]') as HTMLInputElement;
    Object.defineProperty(field, 'files', { configurable: true, value: [file] });
    act(() => { field.dispatchEvent(new Event('change', { bubbles: true })); });
    await send(view);
    await vi.waitFor(() => expect(view.container.querySelectorAll('[data-event-id]')).toHaveLength(1));
    const request = fetch.mock.calls[0]![1] as RequestInit;
    expect((request.body as FormData).getAll('files[]')).toEqual([file]);
    expect(view.container.textContent).toContain('Фото приложено');
    expect(view.container.textContent).toContain('photo.jpg');
  } finally { view.unmount(); }
});
