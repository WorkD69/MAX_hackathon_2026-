import { useState } from 'react';
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
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [remarked, setRemarked] = useState(false);

  const confirmAction = findAction(snapshot, 'RESIDENT_CONFIRM');
  const remarkAction = findAction(snapshot, 'RESIDENT_REMARK');
  const inconsistent = confirmAction !== null && remarkAction !== null;
  const confirmTargeted = confirmAction !== null && isCurrentTarget(snapshot, confirmAction);
  const remarkTargeted = remarkAction !== null && isCurrentTarget(snapshot, remarkAction);

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
      idempotencyKey: newIdempotencyKey(),
    }),
  });

  async function runConfirm() {
    if (!confirmTargeted || confirm.isPending) return;
    setStale(false);
    setError(null);
    try {
      await confirm.mutateAsync();
      setConfirmed(true);
      await onMutated();
    } catch (cause) {
      if (isStaleResponse(cause)) {
        setStale(true);
        setError(STALE_MESSAGE);
        await onMutated();
      } else {
        setError(CONFIRM_ERROR);
      }
    }
  }

  async function runRemark(event: React.FormEvent) {
    event.preventDefault();
    if (!remarkTargeted || remark.isPending || remarkText.trim() === '') return;
    setStale(false);
    setError(null);
    try {
      await remark.mutateAsync();
      setRemarked(true);
      setRemarkText('');
      await onMutated();
    } catch (cause) {
      if (isStaleResponse(cause)) {
        setStale(true);
        setError(STALE_MESSAGE);
        await onMutated();
      } else {
        setError(REMARK_ERROR);
      }
    }
  }

  if (inconsistent) {
    return <section className="resident-feedback" aria-label="Обратная связь по результату">
      <p role="alert" data-testid="feedback-inconsistent">
        Доступные действия противоречат друг другу. Обновите обращение.
      </p>
    </section>;
  }

  return <section className="resident-feedback" aria-label="Обратная связь по результату">
    <h2>Обратная связь</h2>
    {stale && <p role="alert" className="resident-feedback__stale">{STALE_MESSAGE}</p>}
    {error && <p role="alert">{error}</p>}

    {confirmTargeted && <div className="resident-feedback__branch" data-testid="confirmation-branch">
      <p>Подтвердите, что результат выполнен.</p>
      <button type="button" data-testid="confirm-submit" onClick={() => { void runConfirm(); }}
        disabled={confirm.isPending}>
        {confirm.isPending ? 'Подтверждение…' : 'Подтвердить результат'}
      </button>
      {confirm.isPending && <p role="status">Подтверждение результата…</p>}
      {confirmed && <p role="status" data-testid="confirm-success">{CONFIRMED_TEXT}.</p>}
    </div>}

    {remarkTargeted && <form className="resident-feedback__branch" data-testid="remark-branch"
      onSubmit={(event) => { void runRemark(event); }}>
      <p>Оставьте замечание по актуальному результату — его рассмотрит УК.</p>
      <label htmlFor="resident-remark">Замечание</label>
      <textarea id="resident-remark" data-testid="remark-input" rows={4} value={remarkText}
        onChange={(event) => setRemarkText(event.target.value)} />
      <button type="submit" data-testid="remark-submit" disabled={remark.isPending || remarkText.trim() === ''}>
        {remark.isPending ? 'Отправка…' : 'Оставить замечание'}
      </button>
      {remark.isPending && <p role="status">Отправка замечания…</p>}
      {remarked && <p role="status" data-testid="remark-success">{REMARK_SENT_TEXT}.</p>}
    </form>}

    {!confirmTargeted && !remarkTargeted && <p data-testid="feedback-absent">
      Сейчас обратная связь по результату недоступна.
    </p>}
  </section>;
}
