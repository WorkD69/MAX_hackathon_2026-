import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AddCommentSuccessOutput, ResidentCaseSnapshotOutput } from '@max-smart-city/contracts';
import { newIdempotencyKey } from '../idempotency.js';
import { isStaleResponse, type ResidentTransport } from '../resident-transport.js';
import './comment-feed.css';

const STALE_MESSAGE = 'Случай изменился с момента открытия. Данные обновлены.';
const SEMANTIC_ERROR = 'Не удалось отправить сообщение. Обновите случай и повторите.';

export interface ClarificationTarget {
  /** Machine-checkable clarification_request_id echoed into the command payload. */
  readonly commentId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface ResidentCommentFeedProps {
  readonly transport: ResidentTransport;
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly clarificationTargets?: readonly ClarificationTarget[];
  readonly onMutated: () => void | Promise<void>;
}

interface FeedEntry {
  readonly comment_id: string;
  readonly body: string;
  readonly created_at: string;
  readonly actorName: string;
  readonly iterationNo: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function ResidentCommentFeed({ transport, snapshot, clarificationTargets = [], onMutated }: ResidentCommentFeedProps) {
  const [body, setBody] = useState('');
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const entries = commentFeedEntries(snapshot);
  const state = snapshot.case.state;
  const canComment = snapshot.case.allowed_actions.some((action) => action.code === 'ADD_COMMENT');
  const requiresTarget = state === 'REMARKS_REVIEW';
  const validTargets = clarificationTargets.filter((target) => UUID_PATTERN.test(target.commentId));
  const targetRequired = requiresTarget && validTargets.length === 0;
  const composerOpen = canComment && !targetRequired;

  const addComment = useMutation<AddCommentSuccessOutput, unknown, void>({
    mutationFn: () => transport.addComment(snapshot.case.case_id, {
      payload: {
        body: body.trim(),
        clarification_request_id: requiresTarget ? targetId || null : null,
      },
      idempotencyKey: newIdempotencyKey(),
    }),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canComment || targetRequired || body.trim() === '' || addComment.isPending) return;
    if (requiresTarget && !UUID_PATTERN.test(targetId)) {
      setError('Выберите запрос уточнения, на который отвечаете.');
      return;
    }
    setError(null);
    setStale(false);
    try {
      await addComment.mutateAsync();
      setBody('');
      setTargetId('');
      await onMutated();
    } catch (cause) {
      if (isStaleResponse(cause)) {
        setStale(true);
        setError(STALE_MESSAGE);
        await onMutated();
      } else {
        setError(SEMANTIC_ERROR);
      }
    }
  }

  return <section className="resident-comments" aria-label="Комментарии по обращению">
    <h2>Комментарии</h2>
    {stale && <p role="alert" className="resident-comments__stale">{STALE_MESSAGE}</p>}
    {entries.length === 0 ? <p>Комментариев пока нет.</p> : <ol className="resident-comments__feed">
      {entries.map((entry) => <li key={entry.comment_id} data-comment-id={entry.comment_id} className="resident-comments__item">
        <time dateTime={entry.created_at}>{entry.created_at}</time>
        <p>{entry.body}</p>
        <small>{entry.actorName} · итерация {entry.iterationNo}</small>
      </li>)}
    </ol>}
    {targetRequired && <p role="alert" data-testid="clarification-required">
      Сейчас можно ответить только на запрос уточнения.
    </p>}
    {composerOpen && <form className="resident-comments__form" onSubmit={(event) => { void submit(event); }}>
      {requiresTarget && <div className="resident-comments__field">
        <label htmlFor="resident-clarification">Запрос уточнения</label>
        <select id="resident-clarification" data-testid="clarification-select" value={targetId}
          onChange={(event) => setTargetId(event.target.value)}>
          <option value="">Выберите запрос уточнения</option>
          {validTargets.map((target) => <option key={target.commentId} value={target.commentId}>
            {target.body}
          </option>)}
        </select>
      </div>}
      <div className="resident-comments__field">
        <label htmlFor="resident-comment">Сообщение</label>
        <textarea id="resident-comment" data-testid="comment-input" rows={3} value={body}
          onChange={(event) => setBody(event.target.value)} />
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" data-testid="comment-submit" disabled={addComment.isPending || body.trim() === ''}>
        {addComment.isPending ? 'Отправка…' : 'Отправить'}
      </button>
      {addComment.isPending && <p role="status">Отправка сообщения…</p>}
    </form>}
  </section>;
}
