import type { CaseStateOutput } from '@max-smart-city/contracts';

const STATUS_LABELS: Record<CaseStateOutput, string> = {
  CREATED: 'Создано',
  ACCEPTED_BY_UK: 'Принято УК',
  SENT_TO_CONTRACTOR: 'Передано подрядчику',
  EXECUTION: 'Исполнение',
  AWAITING_RESULT_CHECK: 'Ожидается проверка результата',
  REMARKS_REVIEW: 'Замечания рассматриваются',
  REWORK: 'Доработка',
  COMPLETED: 'Завершено',
};

export function statusLabel(state: CaseStateOutput): string {
  return STATUS_LABELS[state];
}

export function responsibilityLabel(responsibility: { semantic_code: string; text: string }): string {
  return responsibility.text;
}
