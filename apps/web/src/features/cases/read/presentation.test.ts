import { describe, expect, it } from 'vitest';
import { CASE_STATES, ROLES, type CaseStateOutput, type RoleOutput } from '@max-smart-city/contracts';
import { statusLabel, responsibilityLabel } from './presentation.js';

describe('TG-021 eight-state presentation', () => {
  const labels: Record<CaseStateOutput, string> = {
    CREATED: 'Обращение отправлено',
    ACCEPTED_BY_UK: 'УК приняла обращение',
    SENT_TO_CONTRACTOR: 'Задание отправлено подрядчику',
    EXECUTION: 'Подрядчик выполняет работу',
    AWAITING_RESULT_CHECK: 'Житель проверяет результат',
    REMARKS_REVIEW: 'УК рассматривает замечание',
    REWORK: 'Нужна повторная работа',
    COMPLETED: 'Обращение закрыто',
  };

  it.each(ROLES)('shows all eight states for %s without role-derived transitions', (role: RoleOutput) => {
    expect(CASE_STATES).toHaveLength(8);
    for (const state of CASE_STATES) expect(statusLabel(state)).toBe(labels[state]);
    expect(role).toBeTruthy();
  });

  it('uses server responsibility text without reassigning the next step to current contractor', () => {
    expect(responsibilityLabel({ semantic_code: 'ANY_SERVER_CODE', text: 'Житель проверяет результат' }))
      .toBe('Житель проверяет результат');
    expect(responsibilityLabel({ semantic_code: 'ANY_SERVER_CODE', text: 'Подрядчик выполняет работы' }))
      .toBe('Подрядчик выполняет работы');
    expect(responsibilityLabel({ semantic_code: 'RESIDENT_NEXT', text: 'Житель проверяет результат' }))
      .toBe('Житель проверяет результат');
  });
});
