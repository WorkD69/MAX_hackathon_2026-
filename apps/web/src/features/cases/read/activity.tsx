import type { ActivityItemOutput } from '@max-smart-city/contracts';
import { AttachmentList, type MaterialProps } from './materials.js';
import { displayName, formatMoscowTime, roleLabel, stageLabel } from './presentation.js';
import './case-read.css';

const eventLabels: Record<ActivityItemOutput['semantic_code'], string> = {
  EVT_001: 'Обращение создано', EVT_002: 'УК приняла обращение', EVT_003: 'УК выбрала подрядчика',
  EVT_004: 'Задание направлено подрядчику', EVT_005: 'Подрядчик принял работу', EVT_006: 'УК уточняет исполнителя',
  EVT_007: 'Комментарий', EVT_008: 'Подрядчик сообщил о выполнении', EVT_009: 'Загруженный материал',
  EVT_010: 'Житель подтвердил результат', EVT_011: 'Житель оставил замечание', EVT_012: 'УК запросила уточнение',
  EVT_013: 'УК вернула работу на доработку', EVT_014: 'Открыт следующий этап работ',
  EVT_015: 'УК зафиксировала отсутствие ответа', EVT_016: 'УК завершила обращение', EVT_017: 'УК завершила обращение с объяснением',
};
const legacyLabels: Partial<Record<ActivityItemOutput['semantic_code'], string>> = {
  EVT_001: 'Случай создан', EVT_002: 'УК приняла случай', EVT_004: 'Задание передано подрядчику',
  EVT_006: 'УК выбирает другого исполнителя', EVT_009: 'Добавлен материал работы',
  EVT_014: 'Началась новая итерация', EVT_016: 'УК завершила случай', EVT_017: 'УК завершила случай с объяснением',
};

function eventDetail(text: string, code: ActivityItemOutput['semantic_code']): string | null {
  for (const label of [eventLabels[code], legacyLabels[code]]) {
    if (!label) continue;
    if (text === label || text === code) return null;
    if (text.startsWith(`${label}: `)) return text.slice(label.length + 2);
  }
  return text;
}

export function orderedFacts(activity: readonly ActivityItemOutput[]): ActivityItemOutput[] {
  const seen = new Set<string>();
  return [...activity].sort((a, b) => a.event_seq - b.event_seq).filter(item => {
    if (seen.has(item.event_id)) return false;
    seen.add(item.event_id); return true;
  });
}

export function ActivityCard({ item, ...materialProps }: MaterialProps & { item: ActivityItemOutput }) {
  const { result, feedback, comment } = item.domain;
  const typedText = result?.description ?? comment?.body ?? feedback?.remark_text;
  const text = displayName(item.text);
  const title = feedback?.type === 'CONFIRMATION' ? eventLabels.EVT_010 : eventLabels[item.semantic_code];
  const genericDetail = eventDetail(text, item.semantic_code);
  const detail = typedText ?? genericDetail;
  // Distinct editorial/event context survives, but the exact domain body is printed only once.
  const duplicatesTyped = genericDetail === typedText || ['Результат', 'Обратная связь', 'Замечание', 'Комментарий']
    .some(prefix => genericDetail === `${prefix}: ${typedText}`);
  const additional = typedText && !duplicatesTyped ? genericDetail : null;
  const files = new Map((result ? result.attachments : item.attachments).map(file => [file.attachment_id, file]));
  return <article className="activity-card" data-actor-role={item.actor.role}>
    <header className="activity-card__header">
      <strong>{roleLabel(item.actor.role)} · {displayName(item.actor.display_name)}</strong>
      <time dateTime={item.occurred_at} data-testid={result ? 'result-submitted-at' : undefined}>{formatMoscowTime(item.occurred_at)}</time>
    </header>
    <h3>{title}</h3>
    {additional && <p>{additional}</p>}
    {detail && <p data-testid={result ? 'result-description' : undefined}>{detail}</p>}
    <small className="activity-card__stage">{stageLabel(item.iteration_no)}</small>
    {files.size > 0 && <AttachmentList attachments={[...files.values()]} {...materialProps} />}
  </article>;
}

export function CaseActivity({ activity, ...materialProps }: MaterialProps & {
  activity: readonly ActivityItemOutput[];
}) {
  const facts = orderedFacts(activity);
  return <section aria-label="История случая" className="case-activity"><h2>История</h2>
    {facts.length === 0 ? <p>Событий пока нет.</p> : <ol>{facts.map(item =>
      <li key={item.event_id} data-event-id={item.event_id}>
        <ActivityCard item={item} {...materialProps} />
      </li>)}</ol>}
  </section>;
}
