import { afterEach, expect, test } from 'vitest';
import type { ActivityItemOutput } from '@max-smart-city/contracts';
import { renderReactTree } from '../../../app/test-render.js';
import { queryClient } from '../../../app/query-client.js';
import { CaseActivity } from './case-read.js';
import * as presentation from './presentation.js';

const date = '2026-09-28T19:20:54.000Z';
const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
function event(code: ActivityItemOutput['semantic_code'], seq = 1): ActivityItemOutput {
  return { activity_id: uuid(seq), event_id: uuid(seq), event_seq: seq, semantic_code: code,
    occurred_at: date, iteration_no: seq, actor: { role: 'UK_EMPLOYEE', display_name: 'Анна' },
    text: 'Отдельный факт', state_transition: null,
    domain: { result: null, feedback: null, comment: null }, attachments: [] };
}
afterEach(() => queryClient.clear());

test('one Result event groups its immutable author, stage, description and Result-linked files without repeating text', () => {
  const result = event('EVT_008');
  result.actor = { role: 'CONTRACTOR_EMPLOYEE', display_name: '[SYNTHETIC] Подрядчик А' };
  result.text = 'я всё сделал';
  result.domain.result = { result_id: uuid(30), iteration_id: uuid(40), description: result.text,
    submitted_at: date, attachments: [{ attachment_id: uuid(50), file_name: 'proof-a.jpg', mime_type: 'image/jpeg', byte_size: 2048 }] };
  const view = renderReactTree(<CaseActivity activity={[result, result]} />);
  try {
    const card = view.container.querySelector('[data-event-id]')!;
    expect(view.container.querySelectorAll('[data-event-id]')).toHaveLength(1);
    expect(card.textContent?.match(/я всё сделал/g)).toHaveLength(1);
    expect(card.textContent).toContain('proof-a.jpg');
    expect(card.textContent).toContain('Подрядчик А');
    expect(card.textContent).toContain('Первичное выполнение');
    expect(card.textContent).toContain('28.09.2026, 22:20');
    expect(card.textContent).not.toMatch(/SYNTHETIC|Итерация|T19:20|байт/);
    expect(card.querySelector('input, select, [data-draft-material]')).toBeNull();
  } finally { view.unmount(); }
});

test.each(['EVT_010', 'EVT_011'] as const)('feedback %s is a distinct Resident card without enum or duplicate remark', code => {
  const item = event(code);
  item.actor = { role: 'RESIDENT', display_name: 'Ирина' };
  item.domain.feedback = { feedback_id: uuid(20), result_id: uuid(30), created_at: date,
    type: code === 'EVT_010' ? 'CONFIRMATION' : 'REMARK', remark_text: code === 'EVT_011' ? 'Стояк холодный' : null };
  item.text = item.domain.feedback.remark_text ?? 'Житель подтвердил результат';
  const view = renderReactTree(<CaseActivity activity={[item]} />);
  try {
    expect(view.container.textContent).toContain('Житель');
    expect(view.container.textContent).not.toMatch(/CONFIRMATION|REMARK/);
    expect(view.container.textContent?.match(new RegExp(item.text, 'g'))).toHaveLength(1);
  } finally { view.unmount(); }
});

test('A history remains labelled A when a later Result is attributed to B', () => {
  const items = [event('EVT_008', 1), event('EVT_008', 2)];
  items.forEach((item, i) => {
    item.actor = { role: 'CONTRACTOR_EMPLOYEE', display_name: `Подрядчик ${i ? 'Б' : 'А'}` };
    item.text = `Результат ${i + 1}`;
    item.domain.result = { result_id: uuid(20 + i), iteration_id: uuid(30 + i), description: item.text,
      submitted_at: date, attachments: [{ attachment_id: uuid(40 + i), file_name: `proof-${i ? 'b' : 'a'}.png`, mime_type: 'image/png', byte_size: 40 }] };
  });
  const view = renderReactTree(<CaseActivity activity={items} />);
  try {
    const cards = [...view.container.querySelectorAll('[data-event-id]')];
    expect(cards[0]!.textContent).toContain('Подрядчик А');
    expect(cards[0]!.textContent).not.toContain('Подрядчик Б');
    expect(cards[0]!.textContent).toContain('proof-a.png');
    expect(cards[1]!.textContent).toContain('Подрядчик Б');
    expect(cards[1]!.textContent).toContain('Доработка №1');
  } finally { view.unmount(); }
});

test('Moscow time and stage/reference labels are deterministic presentation only', () => {
  expect(presentation.formatMoscowTime(date)).toBe('28.09.2026, 22:20');
  expect(presentation.formatMoscowTime('2026-09-28T22:30:00Z')).toBe('29.09.2026, 01:30');
  expect(presentation.stageLabel(1)).toBe('Первичное выполнение');
  expect(presentation.stageLabel(3)).toBe('Доработка №2');
  expect(presentation.caseReference('2bd09410-0000-4000-8000-000000000000')).toBe('№2BD09410');
  expect(presentation.caseReference('C-1001')).toBe('№1001');
  expect(presentation.caseReference('C-2bd09410-0000-4000-8000-000000000000')).toBe('№2BD09410');
});

test('representative activity cards have stable actor-centered snapshots and one item per event', () => {
  const items = ['EVT_003', 'EVT_004', 'EVT_005', 'EVT_006', 'EVT_008', 'EVT_010', 'EVT_011', 'EVT_013', 'EVT_016']
    .map((code, i) => event(code as ActivityItemOutput['semantic_code'], i + 1));
  for (const item of items) {
    item.iteration_no = item.semantic_code === 'EVT_016' ? 2 : 1;
    item.text = item.semantic_code;
    if (['EVT_005', 'EVT_006', 'EVT_008'].includes(item.semantic_code)) item.actor = { role: 'CONTRACTOR_EMPLOYEE', display_name: 'Подрядчик А' };
    if (['EVT_010', 'EVT_011'].includes(item.semantic_code)) {
      item.actor = { role: 'RESIDENT', display_name: 'Ирина' };
      item.domain.feedback = { feedback_id: uuid(60 + item.event_seq), result_id: uuid(30), created_at: date,
        type: item.semantic_code === 'EVT_010' ? 'CONFIRMATION' : 'REMARK',
        remark_text: item.semantic_code === 'EVT_011' ? 'Стояк всё ещё холодный' : null };
    }
    if (['EVT_003', 'EVT_004'].includes(item.semantic_code)) item.text = 'Подрядчик А';
    if (item.semantic_code === 'EVT_006') item.text = 'Подрядчик отказал: Нет свободной бригады';
    if (item.semantic_code === 'EVT_008') item.domain.result = { result_id: uuid(30), iteration_id: uuid(40),
      description: 'Восстановили отопление', submitted_at: date,
      attachments: [{ attachment_id: uuid(50), file_name: 'result-a.jpg', mime_type: 'image/jpeg', byte_size: 2048 }] };
  }
  const view = renderReactTree(<CaseActivity activity={items} />);
  try {
    expect(view.container.querySelectorAll('[data-event-id]')).toHaveLength(items.length);
    expect([...view.container.querySelectorAll('[data-event-id]')].map(card => card.textContent)).toMatchSnapshot();
  } finally { view.unmount(); }
});

test('generic old event wording and prefixed typed details do not repeat the same semantic fact', () => {
  const accepted = event('EVT_002'); accepted.text = 'УК приняла случай';
  const result = event('EVT_008', 2); result.text = 'Результат: Готово';
  result.domain.result = { result_id: uuid(20), iteration_id: uuid(30), description: 'Готово', submitted_at: date, attachments: [] };
  const view = renderReactTree(<CaseActivity activity={[accepted, result]} />);
  try {
    expect(view.container.textContent?.match(/УК приняла/g)).toHaveLength(1);
    expect(view.container.textContent?.match(/Готово/g)).toHaveLength(1);
  } finally { view.unmount(); }
});
