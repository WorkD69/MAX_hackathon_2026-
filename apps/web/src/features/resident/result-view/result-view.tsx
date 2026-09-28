import type { ActivityItemOutput, ResidentCaseSnapshotOutput } from '@max-smart-city/contracts';
import { ActivityCard, CaseActivity } from '../../cases/read/activity.js';
import { AttachmentList } from '../../cases/read/materials.js';
import type { NativeDownloadBridge } from './download-capability.js';
import type { ResidentTransport } from '../resident-transport.js';
import './result-view.css';

const REQUIREMENT_LABELS = {
  NONE: 'Результат без материалов', PHOTO: 'Требуется фотография', FILE: 'Требуется файл',
} as const;

export interface ResidentResultViewProps {
  readonly transport: ResidentTransport;
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly downloadBridge?: NativeDownloadBridge | null;
  readonly contextKey?: string;
  readonly onStale?: () => void | Promise<void>;
  readonly showHistory?: boolean;
}

export function ResidentResultView({ transport, snapshot, downloadBridge, contextKey = '', onStale, showHistory = true }: ResidentResultViewProps) {
  const { current_result: result, activity, initial_attachments: initial } = snapshot.case;
  const event = result ? activity.find(item => item.domain.result?.result_id === result.result_id) : null;
  // An imported snapshot without the original event must never invent authorship from current_executor.
  const current: ActivityItemOutput | null = result ? event ? { ...event, domain: { ...event.domain, result } } : {
    activity_id: result.result_id, event_id: result.result_id, event_seq: 0, semantic_code: 'EVT_008',
    occurred_at: result.submitted_at, iteration_no: snapshot.case.current_iteration.number,
    actor: { role: 'CONTRACTOR_EMPLOYEE', display_name: 'Исполнитель результата' }, text: result.description,
    state_transition: null, domain: { result, feedback: null, comment: null }, attachments: [],
  } : null;
  const materials = { transport, downloadBridge, contextKey, onStale };
  return <section className="resident-result" aria-label="Результат по обращению">
    {initial.length > 0 && <section aria-label="Исходные вложения" className="resident-result__materials">
      <h2>Исходные вложения</h2><AttachmentList attachments={initial} {...materials} />
    </section>}
    <h2>Результат</h2>
    <p data-testid="result-requirement">{REQUIREMENT_LABELS[snapshot.case.category.result_requirement]}</p>
    {!current ? <p data-testid="result-absent">Результат пока не поступил.</p> :
      <section aria-label="Материалы результата" data-event-id={current.event_id} className="resident-result__materials">
        <ActivityCard item={current} {...materials} />
        {result!.attachments.length === 0 && <p>Материалы не приложены.</p>}
      </section>}
    {showHistory && <section aria-label="Вложения истории">
      <CaseActivity activity={activity.filter(item => item.event_id !== current?.event_id)} {...materials} />
    </section>}
  </section>;
}
