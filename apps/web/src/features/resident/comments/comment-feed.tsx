import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AddCommentSuccessOutput, ResidentCaseSnapshotOutput } from '@max-smart-city/contracts';
import { MutationIntent, mutationError } from '../../../app/intent/mutation-intent.js';
import { isStaleResponse, type ResidentTransport } from '../resident-transport.js';
import './comment-feed.css';
import { displayName, formatMoscowTime, stageLabel } from '../../cases/read/presentation.js';

const STALE_MESSAGE = 'Обращение изменилось с момента открытия. Данные обновлены.';
const SEMANTIC_ERROR = 'Не удалось отправить сообщение. Обновите обращение и повторите.';

export interface ResidentCommentFeedProps {
  readonly transport: ResidentTransport;
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly onMutated: () => void | Promise<void>;
  readonly contextKey?: string;
  readonly composerOnly?: boolean;
}

interface FeedEntry {
  readonly comment_id: string;
  readonly body: string;
  readonly created_at: string;
  readonly actorName: string;
  readonly iterationNo: number;
}

/** One observable feed: coordination and clarification comments share a single ordered list. */
export function commentFeedEntries(snapshot: ResidentCaseSnapshotOutput): readonly FeedEntry[] {
  const seen = new Set<string>();
  return snapshot.case.activity
    .filter((item) => item.domain.comment !== null)
    .map((item) => ({ item, comment: item.domain.comment! }))
    .filter(({ item }) => !seen.has(item.event_id) && Boolean(seen.add(item.event_id)))
    .map(({ item, comment }) => ({
      comment_id: comment.comment_id,
      body: comment.body,
      created_at: comment.created_at,
      actorName: item.actor.display_name,
      iterationNo: item.iteration_no,
    }));
}

export function ResidentCommentFeed({ transport, snapshot, onMutated, contextKey = '', composerOnly = false }: ResidentCommentFeedProps) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const intent = useRef(new MutationIntent());
  const fileInput = useRef<HTMLInputElement>(null);
  const entries = commentFeedEntries(snapshot);
  const state = snapshot.case.state;
  const canComment = snapshot.case.allowed_actions.some((action) => action.code === 'ADD_COMMENT');
  const requiresTarget = state === 'REMARKS_REVIEW';
  const validTargets = snapshot.case.actionable_clarification_requests;
  const targetRequired = requiresTarget && validTargets.length === 0;
  const composerOpen = canComment && !targetRequired;

  const addComment = useMutation<AddCommentSuccessOutput, unknown, void>({
    mutationFn: async () => {
      const payload = {
        body: body.trim(),
        clarification_request_id: requiresTarget ? targetId || null : null,
      };
      const resolved = await intent.current.resolve({ operation: 'AddComment', method: 'POST',
        path: `/api/v1/cases/${snapshot.case.case_id}/comments`, context: contextKey,
        targets: { clarification_request_id: payload.clarification_request_id }, payload, files });
      return transport.addComment(snapshot.case.case_id, { payload, files, idempotencyKey: resolved.key });
    },
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canComment || targetRequired || body.trim() === '' || addComment.isPending) return;
    if (requiresTarget && !validTargets.some((target) => target.clarification_request_id === targetId)) {
      setError('Выберите запрос уточнения, на который отвечаете.');
      return;
    }
    setError(null);
    setStale(false);
    try {
      await addComment.mutateAsync();
      intent.current.close();
      setBody('');
      setFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      setTargetId('');
      await onMutated();
    } catch (cause) {
      if (isStaleResponse(cause)) {
        intent.current.close();
        setTargetId('');
        setStale(true);
        setError(null);
        await onMutated();
      } else if (mutationError(cause).code === 'IDEMPOTENCY_KEY_REUSE') {
        intent.current.close();
        setError('Запрос изменился. Данные обновлены; выберите действие заново.');
        await onMutated();
      } else {
        setError(SEMANTIC_ERROR);
      }
    }
  }

  if (composerOnly && !composerOpen && !targetRequired) return null;
  return <section className="resident-comments" aria-label="Комментарии по обращению">
    <h2>Комментарии</h2>
    {stale && <p role="alert" className="resident-comments__stale">{STALE_MESSAGE}</p>}
    {!composerOnly && (entries.length === 0 ? <p>Комментариев пока нет.</p> : <ol className="resident-comments__feed">
      {entries.map((entry) => <li key={entry.comment_id} data-comment-id={entry.comment_id} className="resident-comments__item">
        <time dateTime={entry.created_at}>{formatMoscowTime(entry.created_at)}</time>
        <p>{entry.body}</p>
        <small>{displayName(entry.actorName)} · {stageLabel(entry.iterationNo)}</small>
      </li>)}
    </ol>)}
    {targetRequired && <p role="alert" data-testid="clarification-required">
      Сейчас можно ответить только на запрос уточнения.
    </p>}
    {composerOpen && <form className="resident-comments__form" onSubmit={(event) => { void submit(event); }}>
      {requiresTarget && <div className="resident-comments__field">
        <label htmlFor="resident-clarification">Запрос уточнения</label>
        <select id="resident-clarification" data-testid="clarification-select" value={targetId} disabled={addComment.isPending}
          onChange={(event) => setTargetId(event.target.value)}>
          <option value="">Выберите запрос уточнения</option>
          {validTargets.map((target) => <option key={target.clarification_request_id} value={target.clarification_request_id}>
            {target.body}
          </option>)}
        </select>
      </div>}
      <div className="resident-comments__field">
        <label htmlFor="resident-comment">Сообщение по обращению</label>
        <textarea id="resident-comment" data-testid="comment-input" rows={3} value={body} disabled={addComment.isPending}
          onChange={(event) => setBody(event.target.value)} />
        <small>Сообщение увидят УК и назначенный подрядчик.</small>
      </div>
      <div className="resident-comments__field">
        <label htmlFor="resident-comment-files">Файлы к сообщению</label>
        <input id="resident-comment-files" data-testid="comment-files" type="file" multiple ref={fileInput}
          disabled={addComment.isPending} onChange={(event) => setFiles([...(event.target.files ?? [])])} />
        {files.length > 0 && <small>Выбрано файлов: {files.length}</small>}
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" data-testid="comment-submit" disabled={addComment.isPending || body.trim() === ''}>
        {addComment.isPending ? 'Отправка…' : 'Отправить'}
      </button>
      {addComment.isPending && <p role="status">Отправка сообщения…</p>}
    </form>}
  </section>;
}
