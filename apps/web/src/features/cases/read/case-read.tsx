import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AllowedActionOutput, CaseSnapshotOutput, RoleOutput,
  AcceptCaseRequestInput, SelectContractorRequestInput, SendAssignmentRequestInput,
  AcceptAssignmentRequestInput, RejectAssignmentRequestInput, AddResultMaterialPayloadInput,
  SubmitResultRequestInput, ResidentConfirmationRequestInput, ResidentRemarkPayloadInput,
  RecordNoResidentFeedbackRequestInput, RequestClarificationRequestInput,
  ReturnToReworkRequestInput, CompleteCaseRequestInput, CompleteWithExplanationRequestInput,
  AddCommentPayloadInput,
} from '@max-smart-city/contracts';
import { usePlatform } from '../../../platform/platform-context.js';
import { statusLabel, responsibilityLabel, formatMoscowTime, stageLabel, caseReference, displayName } from './presentation.js';
import { CaseActivity } from './activity.js';
import { AttachmentList, type MaterialTransport } from './materials.js';
export { CaseActivity } from './activity.js';
import type { CaseReadTransport } from './read-transport.js';
import './case-read.css';

export interface ActionPayloadByCode {
  ACCEPT_CASE: AcceptCaseRequestInput;
  SELECT_CONTRACTOR: SelectContractorRequestInput;
  SEND_ASSIGNMENT: SendAssignmentRequestInput;
  ACCEPT_ASSIGNMENT: AcceptAssignmentRequestInput;
  REJECT_ASSIGNMENT: RejectAssignmentRequestInput;
  ADD_RESULT_MATERIAL: AddResultMaterialPayloadInput;
  SUBMIT_RESULT: SubmitResultRequestInput;
  RESIDENT_CONFIRM: ResidentConfirmationRequestInput;
  RESIDENT_REMARK: ResidentRemarkPayloadInput;
  RECORD_NO_RESIDENT_FEEDBACK: RecordNoResidentFeedbackRequestInput;
  REQUEST_CLARIFICATION: RequestClarificationRequestInput;
  RETURN_TO_REWORK: ReturnToReworkRequestInput;
  COMPLETE_CASE: CompleteCaseRequestInput;
  COMPLETE_WITH_EXPLANATION: CompleteWithExplanationRequestInput;
  ADD_COMMENT: AddCommentPayloadInput;
}

type ActionCode = AllowedActionOutput['code'];
export type ActionPayload = ActionPayloadByCode[ActionCode];
export type ActionRenderers = Partial<{ [K in ActionCode]: (
  action: Extract<AllowedActionOutput, { code: K }>,
  submit: (payload: ActionPayloadByCode[K]) => Promise<void>,
) => ReactNode }>;

const STALE_MESSAGE = 'Случай изменился с момента открытия. Данные обновлены.';
const LIST_KEY = ['case-read', 'list'] as const;
const ACTION_LABELS: Record<AllowedActionOutput['code'], string> = {
  ACCEPT_CASE: 'Принять случай',
  SELECT_CONTRACTOR: 'Выбрать подрядчика',
  SEND_ASSIGNMENT: 'Передать подрядчику',
  ACCEPT_ASSIGNMENT: 'Принять назначение',
  REJECT_ASSIGNMENT: 'Отклонить назначение',
  ADD_RESULT_MATERIAL: 'Добавить материал результата',
  SUBMIT_RESULT: 'Отправить результат',
  RESIDENT_CONFIRM: 'Подтвердить результат',
  RESIDENT_REMARK: 'Оставить замечание',
  RECORD_NO_RESIDENT_FEEDBACK: 'Зафиксировать отсутствие ответа',
  REQUEST_CLARIFICATION: 'Запросить уточнение',
  RETURN_TO_REWORK: 'Вернуть на доработку',
  COMPLETE_CASE: 'Завершить случай',
  COMPLETE_WITH_EXPLANATION: 'Завершить с объяснением',
  ADD_COMMENT: 'Добавить комментарий',
};

function useForegroundRefresh(refresh: () => void) {
  const platform = usePlatform();
  useEffect(() => platform.subscribeForeground(refresh), [platform, refresh]);
}

interface CaseListViewProps {
  transport: CaseReadTransport;
  contextKey: string;
  onOpen: (caseId: string) => void;
}

export function CaseListView({ transport, contextKey, onOpen }: CaseListViewProps) {
  const query = useQuery({ queryKey: [...LIST_KEY, contextKey], queryFn: () => transport.list(),
    retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false });
  const refresh = useCallback(() => { void query.refetch(); }, [query.refetch]);
  useForegroundRefresh(refresh);
  return <section className="case-read case-list" aria-label="Список случаев">
    <header className="case-read__header"><h1>Случаи</h1>
      <button type="button" data-testid="case-list-refresh" onClick={refresh}>Обновить</button></header>
    {query.isPending ? <p role="status">Загрузка случаев…</p>
      : query.isError ? <p role="alert">Не удалось загрузить случаи. Обновите список.</p>
        : query.data.items.length === 0 ? <p>Случаев пока нет.</p>
          : <ul className="case-list__items">{query.data.items.map((item) =>
            <li key={item.case_id} data-case-id={item.case_id} className="case-list__item">
              <button type="button" className="case-list__open" onClick={() => onOpen(item.case_id)}>
                <strong>Обращение {caseReference(item.display_number)}</strong><span className="status-badge" data-testid="case-status">{statusLabel(item.state)}</span>
                <span>{displayName(item.category)} · {item.location_label}</span><span>{displayName(item.responsibility)}</span>
                <time dateTime={item.updated_at}>Обновлено: {formatMoscowTime(item.updated_at)}</time>
              </button>
            </li>)}</ul>}
  </section>;
}

interface CaseDetailsViewProps {
  caseId: string;
  role: RoleOutput;
  transport: CaseReadTransport;
  contextKey: string;
  executeAction?: (action: AllowedActionOutput, payload: ActionPayload) => Promise<unknown>;
  actionRenderers?: ActionRenderers;
  materialTransport?: MaterialTransport | undefined;
  summaryExtra?: ReactNode;
}

export function CaseDetailsView({ caseId, role, transport, contextKey, executeAction,
  actionRenderers = {}, materialTransport, summaryExtra }: CaseDetailsViewProps) {
  const queryClient = useQueryClient();
  const queryKey = ['case-read', 'snapshot', contextKey, caseId, role] as const;
  const query = useQuery({ queryKey, queryFn: () => transport.snapshot(caseId, role),
    retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false });
  const [stale, setStale] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const refresh = useCallback(() => { void query.refetch(); }, [query.refetch]);
  useForegroundRefresh(refresh);

  const run = useCallback(async (action: AllowedActionOutput, payload: ActionPayload) => {
    if (!executeAction || active.current) return;
    active.current = true;
    setPending(true);
    setCommandError(null);
    try {
      await executeAction(action, payload);
      setStale(false);
      await queryClient.invalidateQueries({ queryKey: LIST_KEY, refetchType: 'none' });
      await queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      await query.refetch();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
        setStale(true);
        await queryClient.invalidateQueries({ queryKey: LIST_KEY, refetchType: 'none' });
        await queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
        await query.refetch();
      } else setCommandError('Не удалось выполнить действие. Обновите случай и повторите вручную.');
    } finally {
      active.current = false;
      setPending(false);
    }
  }, [executeAction, queryClient, query.refetch, contextKey, caseId, role]);

  return <article className="case-read case-details" aria-label="Карточка случая">
    <header className="case-read__header"><h1>Обращение {caseReference(query.data?.case.display_number ?? '')}</h1>
      <button type="button" data-testid="case-details-refresh" onClick={refresh}>Обновить</button></header>
    {stale && <p role="alert" className="case-read__stale">{STALE_MESSAGE}</p>}
    {commandError && <p role="alert">{commandError}</p>}
    {pending && <p role="status">Выполняется действие…</p>}
    {query.isPending ? <p role="status">Загрузка случая…</p>
      : query.isError ? <p role="alert">Не удалось загрузить случай. Обновите данные.</p>
        : <CaseDetailsContent snapshot={query.data} executeAction={executeAction}
          actionRenderers={actionRenderers} run={run} materialTransport={materialTransport} contextKey={contextKey} summaryExtra={summaryExtra} />}
  </article>;
}

function CaseDetailsContent({ snapshot, executeAction, actionRenderers, run, materialTransport, contextKey, summaryExtra }: {
  snapshot: CaseSnapshotOutput;
  executeAction: CaseDetailsViewProps['executeAction'];
  actionRenderers: ActionRenderers;
  run: (action: AllowedActionOutput, payload: ActionPayload) => Promise<void>;
  materialTransport?: MaterialTransport | undefined;
  contextKey: string;
  summaryExtra?: ReactNode;
}) {
  const value = snapshot.case;
  const next = responsibilityLabel(value.responsibility);
  return <>
    <section className="case-details__summary">
      <p><span className="status-badge" data-testid="case-status">{statusLabel(value.state)}</span></p>
      <p className="next-action"><strong>Следующий шаг:</strong> {next}</p>
      {summaryExtra}
      <p><strong>Адрес:</strong> {value.location.house}, {value.location.premises}</p>
      <p><strong>Категория:</strong> {displayName(value.category.name)}</p>
      <p><strong>Описание:</strong> {value.description}</p>
      <p><strong>Этап работ:</strong> {stageLabel(value.current_iteration.number)}</p>
    </section>
    {value.initial_attachments.length > 0 && <section aria-label="Исходные материалы">
      <h2>Исходные материалы</h2><AttachmentList attachments={value.initial_attachments} transport={materialTransport} contextKey={contextKey} />
    </section>}
    <section aria-label="Доступные действия" className="case-actions"><h2>Доступные действия</h2>
      {value.allowed_actions.length === 0 ? <p>Сейчас действий нет.</p>
        : <ul>{value.allowed_actions.filter(action => !(value.resident_feedback?.type === 'CONFIRMATION'
          && value.resident_feedback.result_id === value.current_result?.result_id && action.code === 'ADD_COMMENT')).map((action, index) => {
          const renderer = actionRenderers[action.code] as
            ((value: AllowedActionOutput, submit: (payload: ActionPayload) => Promise<void>) => ReactNode) | undefined;
          return <li key={`${action.code}-${index}`}>
            {renderer && executeAction ? renderer(action, (payload) => run(action, payload))
              : <span>{ACTION_LABELS[action.code]}</span>}
          </li>;
        })}</ul>}
    </section>
    <CaseActivity activity={value.activity} transport={materialTransport} contextKey={contextKey} />
  </>;
}
