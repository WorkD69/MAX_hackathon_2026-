import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  AllowedActionOutput, ResidentCaseSnapshotOutput, ResidentConfirmationSuccessOutput,
  ResidentRemarkSuccessOutput,
} from '@max-smart-city/contracts';
import { newIdempotencyKey } from '../idempotency.js';
import { isStaleResponse, type ResidentTransport } from '../resident-transport.js';
import './feedback-forms.css';

const STALE_MESSAGE = 'Случай изменился с момента открытия. Данные обновлены.';
const CONFIRMED_TEXT = 'Результат подтверждён. Ожидается решение УК';
const REMARK_SENT_TEXT = 'Ваше замечание передано в УК';
const CONFIRM_ERROR = 'Не удалось подтвердить результат. Обновите данные и повторите.';
const REMARK_ERROR = 'Не удалось отправить замечание. Обновите данные и повторите.';

type FeedbackAction = Extract<AllowedActionOutput, { code: 'RESIDENT_CONFIRM' | 'RESIDENT_REMARK' }>;

export interface ResidentFeedbackProps {
  readonly transport: ResidentTransport;
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly onMutated: () => void | Promise<void>;
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

export function ResidentFeedback({ transport, snapshot, onMutated }: ResidentFeedbackProps) {
  const [remarkText, setRemarkText] = useState('');
  const [remarkFiles, setRemarkFiles] = useState<readonly File[]>([]);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState<'confirm' | 'remark' | null>(null);

  const confirmAction = findAction(snapshot, 'RESIDENT_CONFIRM');
  const remarkAction = findAction(snapshot, 'RESIDENT_REMARK');
  const feedback = snapshot.case.resident_feedback;
  const currentFeedback = feedback !== null && feedback.result_id === snapshot.case.current_result?.result_id;
  const confirmed = currentFeedback && feedback.type === 'CONFIRMATION';
  const remarked = currentFeedback && feedback.type === 'REMARK';
  const confirmTargeted = !currentFeedback && confirmAction !== null && isCurrentTarget(snapshot, confirmAction);
  const remarkTargeted = !currentFeedback && remarkAction !== null && isCurrentTarget(snapshot, remarkAction);

  const confirm = useMutation<ResidentConfirmationSuccessOutput, unknown, void>({
    mutationFn: () => transport.confirmResult(snapshot.case.case_id, {
      request: { result_id: confirmAction!.target.result_id, iteration_id: confirmAction!.target.iteration_id },
      idempotencyKey: newIdempotencyKey(),
    }),
  });
  const remark = useMutation<ResidentRemarkSuccessOutput, unknown, void>({
    mutationFn: () => transport.remarkResult(snapshot.case.case_id, {
      request: {
        result_id: remarkAction!.target.result_id,
        iteration_id: remarkAction!.target.iteration_id,
        remark_text: remarkText.trim(),
      },
      files: remarkFiles,
      idempotencyKey: newIdempotencyKey(),
    }),
  });

  async function runConfirm() {
    if (!confirmTargeted || submitting.current) return;
    submitting.current = true;
    setPending('confirm');
    setStale(false);
    setError(null);
    try {
      await confirm.mutateAsync();
      await onMutated();
    } catch (cause) {
      if (isStaleResponse(cause)) {
        setStale(true);
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
      await onMutated();
      setRemarkText('');
      setRemarkFiles([]);
    } catch (cause) {
      if (isStaleResponse(cause)) {
        setStale(true);
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
      <input id="resident-remark-files" data-testid="remark-files" type="file" multiple
        disabled={pending !== null} onChange={(event) => setRemarkFiles([...(event.target.files ?? [])])} />
      {remarkFiles.length > 0 && <small>Выбрано файлов: {remarkFiles.length}</small>}
      <button type="submit" data-testid="remark-submit" disabled={pending !== null || remarkText.trim() === ''}>
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
