import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { AllowedActionOutput, CaseSnapshotOutput } from '@max-smart-city/contracts';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import { residentSnapshot, IDS } from '../resident/fixtures.js';
import { UkActionControl, UkWorkflowFacts } from './uk-workflow.js';
import { waitForUi } from '../resident/test-helpers.js';

afterEach(() => queryClient.clear());
const select: AllowedActionOutput = { code: 'SELECT_CONTRACTOR', target: { iteration_id: IDS.iterationId }, input: {} };
function value(): CaseSnapshotOutput {
  const data = residentSnapshot({ state: 'REWORK' });
  data.case.current_executor = { contractor_id: IDS.contractorId, name: 'Подрядчик А' };
  data.case.assignment = { assignment_id: IDS.commandId, contractor: data.case.current_executor, decision: 'ACCEPTED' };
  data.case.allowed_actions = [select];
  return data;
}

test('same-A rework says A continues and requires an explicit replacement path before showing candidates', async () => {
  const data = value();
  const fetch = vi.fn().mockResolvedValue(Response.json({ iteration_id: IDS.iterationId,
    items: [{ contractor_id: IDS.categoryId, display_name: 'Подрядчик Б' }] }));
  const view = renderReactTree(<><UkWorkflowFacts snapshot={data} /><UkActionControl action={select}
    snapshot={data} submit={vi.fn()} authorizedFetch={fetch} caseId={IDS.caseId} contextKey="same-a" /></>);
  try {
    expect(view.container.textContent).toContain('Работу продолжает: Подрядчик А');
    expect(view.container.querySelector('select[name=contractor_id]')).toBeNull();
    const replace = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Сменить подрядчика')!;
    expect(replace).toBeTruthy();
    await act(async () => { replace.click(); });
    await waitForUi(() => expect(view.container.querySelector('select[name=contractor_id]')).not.toBeNull());
    await waitForUi(() => expect(view.container.textContent).toContain('Подрядчик Б'));
  } finally { view.unmount(); }
});

test('pending B selection is explicit and B cannot be selected as the same current choice again', async () => {
  const data = value();
  data.case.current_executor = null; data.case.assignment = null;
  data.case.selection = { selection_id: IDS.feedbackId, contractor: { contractor_id: IDS.categoryId, name: 'Подрядчик Б' } };
  data.case.allowed_actions.push({ code: 'SEND_ASSIGNMENT', target: { selection_id: IDS.feedbackId, iteration_id: IDS.iterationId }, input: {} });
  const fetch = vi.fn().mockResolvedValue(Response.json({ iteration_id: IDS.iterationId,
    items: [{ contractor_id: IDS.categoryId, display_name: 'Подрядчик Б' }] }));
  const view = renderReactTree(<><UkWorkflowFacts snapshot={data} /><UkActionControl action={select}
    snapshot={data} submit={vi.fn()} authorizedFetch={fetch} caseId={IDS.caseId} contextKey="selected-b" /></>);
  try {
    expect(view.container.textContent).toContain('Задание ещё не направлено');
    await waitForUi(() => expect(fetch).toHaveBeenCalledOnce());
    expect(view.container.querySelector(`option[value="${IDS.categoryId}"]`)).toBeNull();
    expect((view.container.querySelector('button[type=submit]') as HTMLButtonElement)?.disabled ?? true).toBe(true);
  } finally { view.unmount(); }
});

test('resident confirmation explains the separate UK completion and does not close automatically', () => {
  const data = residentSnapshot({ residentFeedback: true, feedbackType: 'CONFIRMATION' });
  const submit = vi.fn();
  const complete: AllowedActionOutput = { code: 'COMPLETE_CASE', target: { result_id: IDS.resultId }, input: {} };
  const view = renderReactTree(<UkActionControl action={complete} snapshot={data} submit={submit} />);
  try {
    expect(view.container.textContent).toContain('Житель подтвердил результат');
    expect(view.container.textContent).toContain('от имени УК');
    expect(view.container.textContent).toContain('Завершить обращение');
    expect(submit).not.toHaveBeenCalled();
  } finally { view.unmount(); }
});
