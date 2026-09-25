import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityItemOutput, AllowedActionOutput, CaseSnapshotOutput, RoleOutput } from '@max-smart-city/contracts';
import { usePlatform } from '../../../platform/platform-context.js';
import { statusLabel, responsibilityLabel } from './presentation.js';
import type { CaseReadTransport } from './read-transport.js';
import './case-read.css';

export type ActionRenderers = Partial<Record<AllowedActionOutput['code'],
  (action: AllowedActionOutput, submit: () => Promise<void>) => ReactNode>>;

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
                <strong>{item.display_number}</strong><span data-testid="case-status">{statusLabel(item.state)}</span>
                <span>{item.category} · {item.location_label}</span><span>{item.responsibility}</span>
                <time dateTime={item.updated_at}>Обновлено: {item.updated_at}</time>
              </button>
            </li>)}</ul>}
  </section>;
}

function orderedFacts(activity: readonly ActivityItemOutput[]): ActivityItemOutput[] {
  const seen = new Set<string>();
  return [...activity].sort((a, b) => a.event_seq - b.event_seq).filter((item) => {
    if (seen.has(item.event_id)) return false;
    seen.add(item.event_id);
    return true;
  });
}

type Attachment = CaseSnapshotOutput['case']['initial_attachments'][number];
function AttachmentList({ attachments }: { attachments: readonly Attachment[] }) {
  return <ul className="case-attachments">{attachments.map((file) =>
    <li key={file.attachment_id}>{file.file_name} · {file.mime_type} · {file.byte_size} байт</li>)}</ul>;
}

export function CaseActivity({ activity }: { activity: readonly ActivityItemOutput[] }) {
  const facts = orderedFacts(activity);
  return <section aria-label="История случая" className="case-activity"><h2>История</h2>
    {facts.length === 0 ? <p>Событий пока нет.</p> : <ol>{facts.map((item) =>
      <li key={item.event_id} data-event-id={item.event_id}>
        <time dateTime={item.occurred_at}>{item.occurred_at}</time><p>{item.text}</p>
        <small>Итерация {item.iteration_no} · {item.actor.display_name}</small>
        {item.domain.comment && <p>{item.domain.comment.body}</p>}
        {item.domain.result && <p>Результат: {item.domain.result.description}</p>}
        {item.domain.feedback && <p>Обратная связь: {item.domain.feedback.remark_text ?? item.domain.feedback.type}</p>}
        {item.attachments.length > 0 && <AttachmentList attachments={item.attachments} />}
      </li>)}</ol>}
  </section>;
}

interface CaseDetailsViewProps {
  caseId: string;
  role: RoleOutput;
  transport: CaseReadTransport;
  contextKey: string;
  executeAction?: (action: AllowedActionOutput) => Promise<unknown>;
  actionRenderers?: ActionRenderers;
}

export function CaseDetailsView({ caseId, role, transport, contextKey, executeAction,
  actionRenderers = {} }: CaseDetailsViewProps) {
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

  const run = useCallback(async (action: AllowedActionOutput) => {
    if (!executeAction || active.current) return;
    active.current = true;
    setPending(true);
    setCommandError(null);
    try {
      await executeAction(action);
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
    <header className="case-read__header"><h1>Случай {query.data?.case.display_number ?? ''}</h1>
      <button type="button" data-testid="case-details-refresh" onClick={refresh}>Обновить</button></header>
    {stale && <p role="alert" className="case-read__stale">{STALE_MESSAGE}</p>}
    {commandError && <p role="alert">{commandError}</p>}
    {pending && <p role="status">Выполняется действие…</p>}
    {query.isPending ? <p role="status">Загрузка случая…</p>
      : query.isError ? <p role="alert">Не удалось загрузить случай. Обновите данные.</p>
        : <CaseDetailsContent snapshot={query.data} executeAction={executeAction}
          actionRenderers={actionRenderers} run={run} />}
  </article>;
}

function CaseDetailsContent({ snapshot, executeAction, actionRenderers, run }: {
  snapshot: CaseSnapshotOutput;
  executeAction: CaseDetailsViewProps['executeAction'];
  actionRenderers: ActionRenderers;
  run: (action: AllowedActionOutput) => Promise<void>;
}) {
  const value = snapshot.case;
  const next = responsibilityLabel(value.responsibility);
  return <>
    <section className="case-details__summary">
      <p><strong>Статус:</strong> <span data-testid="case-status">{statusLabel(value.state)}</span></p>
      <p><strong>Ответственный и следующий шаг:</strong> {next}</p>
      <p><strong>Адрес:</strong> {value.location.house}, {value.location.premises}</p>
      <p><strong>Категория:</strong> {value.category.name}</p>
      <p><strong>Описание:</strong> {value.description}</p>
      <p><strong>Итерация:</strong> {value.current_iteration.number}</p>
      {value.assignment && <p><strong>Назначение:</strong> {value.assignment.contractor.name}</p>}
      {value.current_executor && <p><strong>Текущий исполнитель:</strong> {value.current_executor.name}</p>}
      {value.current_result && <p><strong>Текущий результат:</strong> {value.current_result.description}</p>}
    </section>
    {value.initial_attachments.length > 0 && <section aria-label="Исходные материалы">
      <h2>Исходные материалы</h2><AttachmentList attachments={value.initial_attachments} />
    </section>}
    <CaseActivity activity={value.activity} />
    <section aria-label="Доступные действия" className="case-actions"><h2>Доступные действия</h2>
      {value.allowed_actions.length === 0 ? <p>Сейчас действий нет.</p>
        : <ul>{value.allowed_actions.map((action, index) => {
          const renderer = actionRenderers[action.code];
          return <li key={`${action.code}-${index}`}>
            {renderer && executeAction ? renderer(action, () => run(action)) : <span>{ACTION_LABELS[action.code]}</span>}
          </li>;
        })}</ul>}
    </section>
  </>;
}
