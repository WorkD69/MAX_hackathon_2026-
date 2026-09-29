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
import { caseReference, displayName, fileSize, responsibilityLabel, stageLabel, statusLabel } from '../cases/read/presentation.js';
import './contractor-case.css';

type Case = ContractorCaseSnapshotOutput['case'];
type Operation = 'accept' | 'reject' | 'comment' | 'upload' | 'submit';
const messages: Record<Operation, string> = {
  accept: 'Назначение принято.', reject: 'Отказ отправлен.',
  comment: 'Комментарий добавлен.',
  upload: 'Файл загружен. Работа ещё не отправлена на проверку.',
  submit: 'Результат отправлен. Житель сможет его проверить.',
};

function isHttpStatus(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status;
}

function Details({ value, materialTransport, contextKey }: { value: Case; materialTransport?: MaterialTransport | undefined; contextKey: string }) {
  return <section className="contractor-case__details" aria-label="Контекст назначения">
    <h2>Обращение {caseReference(value.display_number)}</h2>
    <p><span className="status-badge" data-testid="contractor-case-status">{statusLabel(value.state)}</span></p>
    <p><strong>Сейчас отвечает:</strong> {responsibilityLabel(value.responsibility)}</p>
    <p><strong>Что происходит:</strong> {statusLabel(value.state)}</p>
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
    case 'PHOTO': return 'Для подтверждения результата добавьте хотя бы одну фотографию JPG или PNG.';
    case 'FILE': return 'Для подтверждения результата добавьте файл: PDF, TXT, JPG, PNG, WEBP, GIF, HEIC, HEIF, ZIP, DOC, DOCX, XLS или XLSX.';
    case 'NONE': return 'Фото или файл необязательны';
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
  const exclusionKey = `result-excluded:${caseId}:${surface.iteration.iteration_id}`;
  const excluded = () => {
    try { return new Set<string>(JSON.parse(sessionStorage.getItem(exclusionKey) ?? '[]') as string[]); }
    catch { return new Set<string>(); }
  };
  const fromActivity = (): UploadedMaterial[] => [...new Map(surface.value.activity
    .filter(item => item.semantic_code === 'EVT_009' && item.iteration_no === surface.iteration.number)
    .flatMap(item => item.attachments).map(file => [file.attachment_id,
      { id: file.attachment_id, name: file.file_name, mime: file.mime_type, selected: !excluded().has(file.attachment_id) }])).values()];
  const [materials, setMaterials] = useState<UploadedMaterial[]>(fromActivity);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const [validation, setValidation] = useState('');
  const assignmentId = surface.value.assignment!.assignment_id;
  const iterationId = surface.iteration.iteration_id;
  const requirementValue = surface.value.category.result_requirement;
  const selected = materials.filter((material) => material.selected);
  const hasRequiredMaterial = requirementValue === 'NONE' || selected.some((item) =>
    requirementValue === 'FILE' || item.mime === 'image/jpeg' || item.mime === 'image/png')
    || Boolean(file && (requirementValue === 'FILE' || file.type === 'image/jpeg' || file.type === 'image/png'));
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
    {surface.comment && <details className="contractor-case__comment" open={!draftOpen}><summary>Сообщение жителю и УК</summary><div className="contractor-case__field">
      <label htmlFor="contractor-comment">Сообщение жителю и УК</label>
      <textarea id="contractor-comment" name="comment" value={comment}
        onChange={(event) => setComment(event.target.value)} />
      <button type="button" data-testid="send-comment" disabled={busy || !comment.trim()}
        onClick={() => { void run('comment', async () => {
          await commands.comment(caseId, comment.trim()); setComment('');
        }); }}>Добавить комментарий</button>
    </div></details>}
    {draftOpen && <div className="contractor-case__field">
      <label htmlFor="contractor-result-description">Описание результата</label>
      <textarea id="contractor-result-description" name="resultDescription" value={description} ref={descriptionInput}
        aria-invalid={validation === 'Опишите выполненную работу.'} aria-describedby={validation ? 'contractor-result-error' : undefined}
        onChange={(event) => { setDescription(event.target.value); setValidation(''); }} />
    </div>}
    {surface.material && draftOpen && <div className="contractor-case__field">
      <p>{requirement(requirementValue)}</p>
      <label htmlFor="contractor-result-file">Фото или файл результата</label>
      <input id="contractor-result-file" name="resultFile" type="file" ref={fileInput} disabled={busy}
        aria-invalid={Boolean(validation && file)} aria-describedby="contractor-file-help"
        accept={requirementValue === 'PHOTO' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : undefined}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <label htmlFor="contractor-result-file" className="file-picker">Добавить фото или файл</label>
      <small id="contractor-file-help">Каждый файл — до 10 МиБ.</small>
      {file && <div className="material-row" aria-label="Файл перед загрузкой"><span>{file.name}<small>{file.type || 'Тип не указан'} · {fileSize(file.size)}</small></span>
        <button type="button" data-testid="remove-local-material" disabled={busy} aria-label={`Убрать ${file.name} перед загрузкой`}
          onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}>Убрать ×</button></div>}
      <button type="button" data-testid="upload-material" disabled={busy || !file}
        onClick={() => { if (!file) return;
          if (file.size > 10 * 1024 * 1024) { setValidation('Размер файла — не больше 10 МиБ.'); return; }
          if (requirementValue === 'PHOTO' && !['image/jpeg', 'image/png'].includes(file.type)) {
            setValidation('Добавьте фотографию JPG или PNG.'); return;
          }
          setValidation(''); void run('upload', async () => {
          const result = await commands.upload(caseId, assignmentId, iterationId, file);
          setMaterials((current) => [...current, {
            id: result.created.attachment_id, name: file.name, mime: file.type, selected: true,
          }]);
          setFile(null);
          if (fileInput.current) fileInput.current.value = '';
        }); }}>Загрузить материал</button>
    </div>}
    {draftOpen && materials.length > 0 && <details className="contractor-case__uploaded" aria-label="Загруженные материалы">
      <summary>Загруженные материалы · {materials.length}</summary>
      <p>Загруженные файлы сохраняются в истории. Состав результата можно настроить отдельно.</p>
      {materials.map(material => <div key={material.id} className="material-row" data-draft-material>
        <span>{material.name}<small>Загруженный материал · {material.selected ? 'Включён в результат' : 'Не включён в результат'}</small></span>
        <button type="button" data-testid="toggle-draft-material" disabled={busy} aria-pressed={material.selected}
          onClick={() => setMaterials(current => {
            const next = current.map(item => item.id === material.id ? { ...item, selected: !item.selected } : item);
            sessionStorage.setItem(exclusionKey, JSON.stringify(next.filter(item => !item.selected).map(item => item.id)));
            return next;
          })}>
          {material.selected ? 'Не включать в результат' : 'Включить в результат'}</button>
      </div>)}
    </details>}
    {draftOpen && <div className="contractor-case__field">
      <p>Файл можно загрузить заранее. Работа поступит на проверку после отправки результата.</p>
      {validation && <p role="alert" id="contractor-result-error">{validation}</p>}
      <button type="button" data-testid="submit-result" disabled={busy}
        onClick={() => {
          if (!description.trim()) { setValidation('Опишите выполненную работу.'); descriptionInput.current?.focus(); return; }
          if (file && file.size > 10 * 1024 * 1024) { setValidation('Размер файла — не больше 10 МиБ.'); fileInput.current?.focus(); return; }
          if (file && requirementValue === 'PHOTO' && !['image/jpeg', 'image/png'].includes(file.type)) {
            setValidation('Добавьте фотографию JPG или PNG.'); fileInput.current?.focus(); return;
          }
          if (!hasRequiredMaterial) { setValidation(requirementValue === 'PHOTO' ? 'Добавьте фотографию JPG или PNG.' : 'Добавьте обязательный файл результата.'); fileInput.current?.focus(); return; }
          void run('submit', async () => {
            const materialIds = selected.map(item => item.id);
            if (file) {
              const created = await commands.upload(caseId, assignmentId, iterationId, file);
              materialIds.push(created.created.attachment_id);
              setMaterials(current => [...current, { id: created.created.attachment_id, name: file.name, mime: file.type, selected: true }]);
              setFile(null);
              if (fileInput.current) fileInput.current.value = '';
            }
            await commands.submit(caseId, {
            assignment_id: assignmentId, iteration_id: iterationId,
            description: description.trim(), material_attachment_ids: materialIds,
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
      if (fresh.isError) setError('Действие выполнено, но не удалось обновить данные обращения. Обновите страницу.');
    } catch (cause) {
      if (isHttpStatus(cause, 409)) {
        setStale(true);
        await queryClient.invalidateQueries({ queryKey: ['case-read', 'list', contextKey] });
        await query.refetch();
      } else if (isHttpStatus(cause, 403) || isHttpStatus(cause, 404)) {
        await queryClient.invalidateQueries({ queryKey: ['case-read', 'list', contextKey] });
        await query.refetch();
        setError('Обращение недоступно.');
      } else {
        setError(cause instanceof ContractorCommandError
          ? safeMutationErrorText(cause.code, cause.requestId) : 'Не удалось выполнить действие. Обновите обращение.');
      }
    } finally {
      active.current = false;
      setBusy(false);
    }
  };

  const surface = query.isSuccess ? contractorSurface(query.data as ContractorCaseSnapshotOutput) : null;
  return <article className="contractor-case" aria-label="Обращение подрядчика">
    <header><h1>Назначение подрядчика</h1><button type="button" onClick={refresh}>Обновить</button></header>
    {busy && <p role="status">Выполняется действие…</p>}
    {stale && <p role="alert">Обращение изменилось. Данные обновлены; выберите действие заново.</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {query.isPending ? <p role="status">Загрузка обращения…</p>
      : query.isError || !surface || surface.kind === 'hidden'
        ? <p role="alert">Обращение недоступно.</p>
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
