import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractorCaseSnapshotOutput } from '@max-smart-city/contracts';
import { usePlatform } from '../../platform/platform-context.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { ContractorCommandError, type ContractorCommandTransport } from './command-transport.js';
import { safeMutationErrorText } from '../../app/intent/safe-error.js';
import { contractorSurface, type ContractorSurface } from './surface.js';
import { CaseActivity } from '../cases/read/activity.js';
import { AttachmentList, type MaterialTransport } from '../cases/read/materials.js';
import { caseReference, displayName, responsibilityLabel, stageLabel, statusLabel } from '../cases/read/presentation.js';
import './contractor-case.css';

type Case = ContractorCaseSnapshotOutput['case'];
type Operation = 'accept' | 'reject' | 'comment' | 'upload' | 'submit';
const messages: Record<Operation, string> = {
  accept: 'Назначение принято.', reject: 'Отказ отправлен.',
  comment: 'Комментарий добавлен.',
  upload: 'Материал добавлен. Случай не завершён.',
  submit: 'Результат отправлен на проверку. Случай не завершён. Доставка MAX ожидается.',
};

function isHttpStatus(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status;
}

function Details({ value, materialTransport, contextKey }: { value: Case; materialTransport?: MaterialTransport | undefined; contextKey: string }) {
  return <section className="contractor-case__details" aria-label="Контекст назначения">
    <h2>Обращение {caseReference(value.display_number)}</h2>
    <p><span className="status-badge" data-testid="contractor-case-status">{statusLabel(value.state)}</span></p>
    <p className="next-action"><strong>Следующий шаг:</strong> {responsibilityLabel(value.responsibility)}</p>
    {value.current_executor && <p><strong>{value.state === 'REWORK' ? 'Работу продолжает:' : 'Текущий исполнитель:'}</strong> {displayName(value.current_executor.name)}</p>}
    <dl>
      <div><dt>Адрес</dt><dd>{value.location.house}, {value.location.premises}</dd></div>
      <div><dt>Категория</dt><dd>{displayName(value.category.name)}</dd></div>
      <div><dt>Описание</dt><dd>{value.description}</dd></div>
      <div><dt>Этап работ</dt><dd>{stageLabel(value.current_iteration.number)}</dd></div>
      <div><dt>Требование к результату</dt><dd>{requirement(value.category.result_requirement)}</dd></div>
    </dl>
    {value.initial_attachments.length > 0 && <div>
      <h3>Исходные материалы</h3>
      <AttachmentList attachments={value.initial_attachments} transport={materialTransport} contextKey={contextKey} />
    </div>}
  </section>;
}

function requirement(value: Case['category']['result_requirement']): string {
  switch (value) {
    case 'PHOTO': return 'Нужна фотография результата';
    case 'FILE': return 'Нужен файл результата';
    case 'NONE': return 'Дополнительные материалы не обязательны';
  }
}

export function ContractorCaseList({ contextKey, read, onOpen }: {
  contextKey: string; read: CaseReadTransport; onOpen: (caseId: string) => void;
}) {
  const platform = usePlatform();
  const query = useQuery({ queryKey: ['case-read', 'list', contextKey], queryFn: () => read.list(),
    retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false });
  const refresh = useCallback(() => { void query.refetch(); }, [query.refetch]);
  useEffect(() => platform.subscribeForeground(refresh), [platform, refresh]);
  return <section className="contractor-case contractor-case__list" aria-label="Назначения подрядчика">
    <header><h1>Назначения</h1><button type="button" onClick={refresh}>Обновить</button></header>
    {query.isPending ? <p role="status">Загрузка назначений…</p>
      : query.isError ? <p role="alert">Не удалось загрузить назначения.</p>
        : query.data.items.length === 0 ? <p>Назначений пока нет.</p>
          : <ul>{query.data.items.map((item) => <li key={item.case_id} data-case-id={item.case_id}>
            <button type="button" onClick={() => onOpen(item.case_id)}>
              <strong>Обращение {caseReference(item.display_number)}</strong><span>{displayName(item.category)} · {item.location_label}</span>
              <span>{stageLabel(item.current_iteration_no)}</span><span>{displayName(item.responsibility)}</span>
            </button>
          </li>)}</ul>}
  </section>;
}

type Run = (kind: Operation, command: () => Promise<void>) => Promise<void>;

function PendingAssignment({ surface, commands, caseId, run, busy }: {
  surface: Extract<ContractorSurface, { kind: 'pending' }>;
  commands: ContractorCommandTransport; caseId: string; run: Run; busy: boolean;
}) {
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState(false);
  const assignmentId = surface.value.assignment!.assignment_id;
  return <section aria-label="Назначение подрядчика" className="contractor-case__panel">
    <h2>Ожидается ответ на назначение</h2>
    {surface.accept && <button type="button" data-testid="accept-assignment" disabled={busy}
      onClick={() => { void run('accept', () => commands.accept(caseId, assignmentId)); }}>Принять назначение</button>}
    {surface.reject && <div className="contractor-case__field">
      <label htmlFor="contractor-reject-reason">Причина отказа</label>
      <textarea id="contractor-reject-reason" name="rejectReason" value={reason}
        onChange={(event) => { setReason(event.target.value); setValidation(false); }} />
      {validation && <p role="alert">Укажите причину отказа.</p>}
      <button type="button" data-testid="reject-assignment" disabled={busy} onClick={() => {
        if (!reason.trim()) { setValidation(true); return; }
        void run('reject', () => commands.reject(caseId, assignmentId, reason.trim()));
      }}>Отклонить назначение</button>
    </div>}
  </section>;
}

interface UploadedMaterial { id: string; name: string; mime: string; selected: boolean }

function WorkPanel({ surface, commands, caseId, run, busy }: {
  surface: Extract<ContractorSurface, { kind: 'current' }>;
  commands: ContractorCommandTransport; caseId: string; run: Run; busy: boolean;
}) {
  const [comment, setComment] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fromActivity = (): UploadedMaterial[] => [...new Map(surface.value.activity
    .filter(item => item.semantic_code === 'EVT_009' && item.iteration_no === surface.iteration.number)
    .flatMap(item => item.attachments).map(file => [file.attachment_id,
      { id: file.attachment_id, name: file.file_name, mime: file.mime_type, selected: true }])).values()];
  const [materials, setMaterials] = useState<UploadedMaterial[]>(fromActivity);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState('');
  const assignmentId = surface.value.assignment!.assignment_id;
  const iterationId = surface.iteration.iteration_id;
  const requirementValue = surface.value.category.result_requirement;
  const selected = materials.filter((material) => material.selected);
  const hasRequiredMaterial = requirementValue === 'NONE' || selected.some((item) =>
    requirementValue === 'FILE' || item.mime.startsWith('image/'));
  useEffect(() => {
    setMaterials(current => {
      const missing = fromActivity().filter(file => !current.some(item => item.id === file.id));
      return missing.length ? [...current, ...missing] : current;
    });
  }, [surface.value.activity, surface.iteration.number]);
  const draftOpen = Boolean(surface.submit) && !submitted;
  if (!surface.comment && !draftOpen) return null;

  return <section aria-label="Работа подрядчика" className="contractor-case__panel">
    <h2>{stageLabel(surface.iteration.number)}</h2>
    {surface.comment && <div className="contractor-case__field">
      <label htmlFor="contractor-comment">Рабочий комментарий</label>
      <textarea id="contractor-comment" name="comment" value={comment}
        onChange={(event) => setComment(event.target.value)} />
      <button type="button" data-testid="send-comment" disabled={busy || !comment.trim()}
        onClick={() => { void run('comment', async () => {
          await commands.comment(caseId, comment.trim()); setComment('');
        }); }}>Добавить комментарий</button>
    </div>}
    {surface.material && draftOpen && <div className="contractor-case__field">
      <label htmlFor="contractor-result-file">Материал результата</label>
      <input id="contractor-result-file" name="resultFile" type="file" ref={fileInput} disabled={busy}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      {file && <div className="material-row" aria-label="Файл перед загрузкой"><span>{file.name}</span>
        <button type="button" data-testid="remove-local-material" disabled={busy} aria-label={`Убрать ${file.name} перед загрузкой`}
          onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}>Убрать ×</button></div>}
      <button type="button" data-testid="upload-material" disabled={busy || !file}
        onClick={() => { if (!file) return; void run('upload', async () => {
          const result = await commands.upload(caseId, assignmentId, iterationId, file);
          setMaterials((current) => [...current, {
            id: result.created.attachment_id, name: file.name, mime: file.type, selected: true,
          }]);
          setFile(null);
          if (fileInput.current) fileInput.current.value = '';
        }); }}>Загрузить материал</button>
    </div>}
    {draftOpen && materials.length > 0 && <div aria-label="Загруженные материалы">
      <h3>Загруженные материалы</h3>
      <p>Загрузка сохранена в истории. Здесь можно изменить только состав ещё не отправленного результата.</p>
      {materials.map(material => <div key={material.id} className="material-row" data-draft-material>
        <span>{material.name}<small>Загруженный материал · {material.selected ? 'Включён в результат' : 'Не включён в результат'}</small></span>
        <button type="button" data-testid="toggle-draft-material" disabled={busy} aria-pressed={material.selected}
          onClick={() => setMaterials(current => current.map(item => item.id === material.id ? { ...item, selected: !item.selected } : item))}>
          {material.selected ? 'Не включать в результат' : 'Включить в результат'}</button>
      </div>)}
    </div>}
    {draftOpen && <div className="contractor-case__field">
      <label htmlFor="contractor-result-description">Описание результата</label>
      <textarea id="contractor-result-description" name="resultDescription" value={description}
        onChange={(event) => { setDescription(event.target.value); setValidation(''); }} />
      <p>{requirement(requirementValue)}. Загрузка материала сама по себе не завершает работу.</p>
      {validation && <p role="alert">{validation}</p>}
      <button type="button" data-testid="submit-result" disabled={busy}
        onClick={() => {
          if (!description.trim()) { setValidation('Опишите выполненную работу.'); return; }
          if (!hasRequiredMaterial) { setValidation('Добавьте обязательный материал результата.'); return; }
          void run('submit', async () => { await commands.submit(caseId, {
            assignment_id: assignmentId, iteration_id: iterationId,
            description: description.trim(), material_attachment_ids: selected.map((item) => item.id),
          }); setSubmitted(true); });
        }}>Отправить результат</button>
    </div>}
  </section>;
}

export function ContractorCaseView({ caseId, contextKey, read, commands, materialTransport }: {
  caseId: string; contextKey: string; read: CaseReadTransport; commands: ContractorCommandTransport;
  materialTransport?: MaterialTransport | undefined;
}) {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const queryKey = ['contractor', 'snapshot', contextKey, caseId] as const;
  const query = useQuery({ queryKey, queryFn: () => read.snapshot(caseId, 'CONTRACTOR_EMPLOYEE'),
    retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const active = useRef(false);
  const refresh = useCallback(() => { void query.refetch(); }, [query.refetch]);
  useEffect(() => platform.subscribeForeground(refresh), [platform, refresh]);

  const run: Run = async (kind, command) => {
    if (active.current) return;
    active.current = true;
    setBusy(true); setNotice(''); setError(''); setStale(false);
    try {
      await command();
      setNotice(messages[kind]);
      await queryClient.invalidateQueries({ queryKey: ['case-read', 'list', contextKey] });
      const fresh = await query.refetch();
      if (fresh.isError) setError('Действие выполнено, но не удалось обновить данные случая. Обновите страницу.');
    } catch (cause) {
      if (isHttpStatus(cause, 409)) {
        setStale(true);
        await queryClient.invalidateQueries({ queryKey: ['case-read', 'list', contextKey] });
        await query.refetch();
      } else if (isHttpStatus(cause, 403) || isHttpStatus(cause, 404)) {
        await queryClient.invalidateQueries({ queryKey: ['case-read', 'list', contextKey] });
        await query.refetch();
        setError('Случай недоступен.');
      } else {
        setError(cause instanceof ContractorCommandError
          ? safeMutationErrorText(cause.code, cause.requestId) : 'Не удалось выполнить действие. Обновите случай.');
      }
    } finally {
      active.current = false;
      setBusy(false);
    }
  };

  const surface = query.isSuccess ? contractorSurface(query.data as ContractorCaseSnapshotOutput) : null;
  return <article className="contractor-case" aria-label="Случай подрядчика">
    <header><h1>Назначение подрядчика</h1><button type="button" onClick={refresh}>Обновить</button></header>
    {busy && <p role="status">Выполняется действие…</p>}
    {stale && <p role="alert">Случай изменился. Данные обновлены; выберите действие заново.</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {query.isPending ? <p role="status">Загрузка случая…</p>
      : query.isError || !surface || surface.kind === 'hidden'
        ? <p role="alert">Случай недоступен.</p>
        : <>
          <Details value={surface.value} materialTransport={materialTransport} contextKey={contextKey} />
          {surface.kind === 'pending'
            ? <PendingAssignment key={surface.value.assignment!.assignment_id} surface={surface}
              commands={commands} caseId={caseId} run={run} busy={busy} />
            : <WorkPanel key={`${surface.value.assignment!.assignment_id}:${surface.iteration.iteration_id}`}
              surface={surface} commands={commands} caseId={caseId} run={run} busy={busy} />}
          <CaseActivity activity={surface.value.activity} transport={materialTransport} contextKey={contextKey} />
        </>}
  </article>;
}
