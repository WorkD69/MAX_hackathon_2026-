/** Server messages are diagnostic data, never display copy. */
export function safeMutationErrorText(code: string | null, requestId: string | null = null): string {
  switch (code) {
    case 'FORBIDDEN': return 'Недостаточно прав для этого действия.';
    case 'RESOURCE_NOT_FOUND': return 'Запись не найдена или недоступна.';
    case 'INVALID_STATE':
    case 'TERMINAL_CASE':
    case 'STALE_ASSIGNMENT':
    case 'STALE_ITERATION':
    case 'STALE_RESULT':
    case 'STALE_SELECTION': return 'Данные изменились. Обновите их и выберите действие заново.';
    case 'IDEMPOTENCY_KEY_REUSE': return 'Запрос изменился. Обновите данные и выберите действие заново.';
    case 'RESULT_MATERIAL_REQUIRED': return 'Добавьте обязательный материал результата.';
    case 'RESULT_MATERIAL_INVALID': return 'Выбранный материал не подходит для результата.';
    case 'REJECT_REASON_REQUIRED': return 'Укажите причину отказа.';
    case 'CATEGORY_INACTIVE': return 'Категория больше недоступна.';
    case 'CONTRACTOR_NOT_AVAILABLE': return 'Подрядчик сейчас недоступен.';
    case 'VALIDATION_FAILED':
    case 'MALFORMED_REQUEST': return 'Проверьте введённые данные.';
    default: return `Не удалось выполнить действие.${requestId ? ` Номер запроса: ${requestId}.` : ''}`;
  }
}
