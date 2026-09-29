import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  AllowedActionOutput, ResidentCaseSnapshotOutput, ResidentConfirmationSuccessOutput,
  ResidentRemarkSuccessOutput,
} from '@max-smart-city/contracts';
import { MutationIntent, mutationError } from '../../../app/intent/mutation-intent.js';
import { isStaleResponse, type ResidentTransport } from '../resident-transport.js';
import './feedback-forms.css';

const STALE_MESSAGE = 'Обращение изменилось с момента открытия. Данные обновлены.';
const CONFIRMED_TEXT = 'Результат подтверждён. Ожидается решение УК';
const REMARK_SENT_TEXT = 'Ваше замечание передано в УК';
const CONFIRM_ERROR = 'Не удалось подтвердить результат. Обновите данные и повторите.';
const REMARK_ERROR = 'Не удалось отправить замечание. Обновите данные и повторите.';

type FeedbackAction = Extract<AllowedActionOutput, { code: 'RESIDENT_CONFIRM' | 'RESIDENT_REMARK' }>;

export interface ResidentFeedbackProps {
  readonly transport: ResidentTransport;
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly onMutated: () => void | Promise<void>;
  readonly contextKey?: string;
}

function findAction(snapshot: ResidentCaseSnapshotOutput, code: FeedbackAction['code']): FeedbackAction | null {
  return snapshot.case.allowed_actions.find((action): action is FeedbackAction => action.code === code) ?? null;
}

/** The action target is sent verbatim: the client never retargets a stale action. */
function isCurrentTarget(snapshot: ResidentCaseSnapshotOutput, action: FeedbackAction): boolean {
  const result = snapshot.case.current_result;
  return result !== null
    && action.target.result_id === result.result_id
    && action.target.iteration_id === snapshot.case.current_iteration.iteration_id;
}

export function ResidentFeedback({ transport, snapshot, onMutated, contextKey = '' }: ResidentFeedbackProps) {
  const [remarkText, setRemarkText] = useState('');
  const [remarkFiles, setRemarkFiles] = useState<readonly File[]>([]);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const confirmIntent = useRef(new MutationIntent());
  const remarkIntent = useRef(new MutationIntent());
  const remarkFileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<'confirm' | 'remark' | null>(null);

  const confirmAction = findAction(snapshot, 'RESIDENT_CONFIRM');
  const remarkAction = findAction(snapshot, 'RESIDENT_REMARK');
  const feedback = snapshot.case.resident_feedback;
  const currentFeedback = feedback !== null && feedback.result_id === snapshot.case.current_result?.result_id;
  const confirmed = currentFeedback && feedback.type === 'CONFIRMATION';
  const remarked = currentFeedback && feedback.type === 'REMARK';
  const confirmTargeted = !currentFeedback && confirmAction !== null && isCurrentTarget(snapshot, confirmAction);
  const remarkTargeted = !currentFeedback && remarkAction !== null && isCurrentTarget(snapshot, remarkAction);
  useEffect(() => { if (currentFeedback) { setStale(false); setError(null); } }, [currentFeedback]);

  const confirm = useMutation<ResidentConfirmationSuccessOutput, unknown, void>({
    mutationFn: async () => {
      const request = { result_id: confirmAction!.target.result_id, iteration_id: confirmAction!.target.iteration_id };
      const resolved = await confirmIntent.current.resolve({ operation: 'ResidentConfirmation', method: 'POST',
        path: `/api/v1/cases/${snapshot.case.case_id}/commands/resident-confirmation`,
        context: contextKey, targets: request, payload: request });
      return transport.confirmResult(snapshot.case.case_id, { request, idempotencyKey: resolved.key });
    },
  });
  const remark = useMutation<ResidentRemarkSuccessOutput, unknown, void>({
    mutationFn: async () => {
      const request = {
        result_id: remarkAction!.target.result_id,
        iteration_id: remarkAction!.target.iteration_id,
        remark_text: remarkText.trim(),
      };
      const resolved = await remarkIntent.current.resolve({ operation: 'ResidentRemark', method: 'POST',
        path: `/api/v1/cases/${snapshot.case.case_id}/commands/resident-remark`,
        context: contextKey, targets: remarkAction!.target, payload: request, files: remarkFiles });
      return transport.remarkResult(snapshot.case.case_id, { request, files: remarkFiles, idempotencyKey: resolved.key });
    },
  });

  async function runConfirm() {
    if (!confirmTargeted || submitting.current) return;
    submitting.current = true;
    setPending('confirm');
    setStale(false);
    setError(null);
    try {
      await confirm.mutateAsync();
      confirmIntent.current.close();
      await onMutated();
    } catch (cause) {
      if (isStaleResponse(cause)) {
        confirmIntent.current.close();
        setStale(true);
        setError(null);
        await onMutated();
      } else if (mutationError(cause).code === 'IDEMPOTENCY_KEY_REUSE') {
        confirmIntent.current.close();
        setError(STALE_MESSAGE);
        await onMutated();
      } else {
        setError(CONFIRM_ERROR);
      }
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  async function runRemark(event: React.FormEvent) {
    event.preventDefault();
    if (!remarkTargeted || submitting.current || remarkText.trim() === '') return;
    submitting.current = true;
    setPending('remark');
    setStale(false);
    setError(null);
    try {
      await remark.mutateAsync();
      remarkIntent.current.close();
      await onMutated();
      setRemarkText('');
      setRemarkFiles([]);
      if (remarkFileInput.current) remarkFileInput.current.value = '';
    } catch (cause) {
      if (isStaleResponse(cause)) {
        remarkIntent.current.close();
        setStale(true);
        setError(null);
        await onMutated();
      } else if (mutationError(cause).code === 'IDEMPOTENCY_KEY_REUSE') {
        remarkIntent.current.close();
        setError(STALE_MESSAGE);
        await onMutated();
      } else {
        setError(REMARK_ERROR);
      }
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  return <section className="resident-feedback" aria-label="Обратная связь по результату">
    <h2>Обратная связь</h2>
    {stale && <p role="alert" className="resident-feedback__stale">{STALE_MESSAGE}</p>}
    {error && <p role="alert">{error}</p>}

    {confirmTargeted && <div className="resident-feedback__branch" data-testid="confirmation-branch">
      <p>Подтвердите, что результат выполнен.</p>
      <button type="button" data-testid="confirm-submit" onClick={() => { void runConfirm(); }}
        disabled={pending !== null}>
        {pending === 'confirm' ? 'Подтверждение…' : 'Подтвердить результат'}
      </button>
      {pending === 'confirm' && <p role="status">Подтверждение результата…</p>}
    </div>}

    {remarkTargeted && <form className="resident-feedback__branch" data-testid="remark-branch"
      onSubmit={(event) => { void runRemark(event); }}>
      <p>Оставьте замечание по актуальному результату — его рассмотрит УК.</p>
      <label htmlFor="resident-remark">Замечание</label>
      <textarea id="resident-remark" data-testid="remark-input" rows={4} value={remarkText}
        disabled={pending !== null} onChange={(event) => setRemarkText(event.target.value)} />
      <label htmlFor="resident-remark-files">Файлы к замечанию</label>
      <input id="resident-remark-files" data-testid="remark-files" type="file" multiple ref={remarkFileInput}
        disabled={pending !== null} onChange={(event) => setRemarkFiles([...(event.target.files ?? [])])} />
      {remarkFiles.length > 0 && <small>Выбрано файлов: {remarkFiles.length}</small>}
      <button type="submit" data-testid="remark-submit" className={confirmTargeted ? 'button-secondary' : undefined}
        disabled={pending !== null || remarkText.trim() === ''}>
        {pending === 'remark' ? 'Отправка…' : 'Оставить замечание'}
      </button>
      {pending === 'remark' && <p role="status">Отправка замечания…</p>}
    </form>}

    {confirmed && <p role="status" data-testid="confirm-success">{CONFIRMED_TEXT}.</p>}
    {remarked && <p role="status" data-testid="remark-success">{REMARK_SENT_TEXT}.</p>}
    {!confirmTargeted && !remarkTargeted && !currentFeedback && <p data-testid="feedback-absent">
      Сейчас обратная связь по результату недоступна.
    </p>}
  </section>;
}
