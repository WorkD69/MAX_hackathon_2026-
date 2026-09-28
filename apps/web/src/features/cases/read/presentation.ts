import type { CaseStateOutput, RoleOutput } from '@max-smart-city/contracts';

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
  return displayName(responsibility.text);
}

const moscowTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function formatMoscowTime(utc: string): string {
  const date = new Date(utc);
  return Number.isFinite(date.getTime()) ? moscowTime.format(date) : 'Дата недоступна';
}

export function stageLabel(number: number): string {
  return number <= 1 ? 'Первичное выполнение' : `Доработка №${number - 1}`;
}

export function caseReference(number: string): string {
  const match = /^(?:C-)?([0-9a-f]{8})-[0-9a-f-]{27}$/i.exec(number);
  return match ? `№${match[1]!.toUpperCase()}` : number;
}

export function displayName(name: string): string {
  return name.replace(/\[SYNTHETIC\]\s*/g, '').replace(/\bDemo\s*/g, 'Демо ');
}

export function roleLabel(role: RoleOutput): string {
  return { RESIDENT: 'Житель', UK_EMPLOYEE: 'Сотрудник УК', UK_ADMIN: 'Администратор УК · настройки',
    CONTRACTOR_EMPLOYEE: 'Подрядчик' }[role];
}

export function fileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024 * 10) / 10} КБ` : `${Math.round(bytes / 1024 / 1024 * 10) / 10} МБ`;
}

export function fileType(mime: string): string {
  return mime.startsWith('image/') ? 'Фото' : mime === 'application/pdf' ? 'PDF' : 'Файл';
}
