import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UuidSchema, type AllowedActionOutput, type CaseSnapshotOutput, type RoleOutput } from '@max-smart-city/contracts';
import { CaseDetailsView, type ActionPayload, type ActionRenderers } from '../cases/read/case-read.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { createUkActionExecutor, UkCommandError } from './uk-transport.js';
import './uk-workflow.css';

type Submit = (payload: ActionPayload) => Promise<void>;

function semanticErrorText(error: UkCommandError): string {
  switch (error.code) {
    case 'INVALID_STATE': return 'Действие больше недоступно. Обновите случай.';
    case 'CONTRACTOR_NOT_AVAILABLE': return 'Подрядчик сейчас недоступен. Выберите другого.';
    case 'TERMINAL_CASE': return 'Случай уже завершён.';
    case 'FORBIDDEN': return 'Недостаточно прав для этого действия.';
    case 'VALIDATION_FAILED': return 'Проверьте введённые данные.';
    default: return error.code ? `Действие отклонено (${error.code}).` : 'Действие отклонено сервером.';
  }
}

export function noFeedbackEventId(snapshot: CaseSnapshotOutput, resultId: string): string | null {
  const value = snapshot.case;
  if (value.current_result?.result_id !== resultId || value.resident_feedback) return null;
  return value.activity.findLast((item) => item.semantic_code === 'EVT_015'
    && item.iteration_no === value.current_iteration.number)?.event_id ?? null;
}

export function UkWorkflowFacts({ snapshot }: { snapshot: CaseSnapshotOutput }) {
  const value = snapshot.case;
  return <section className="uk-workflow__facts" aria-label="Назначение подрядчика">
    <h2>Назначение подрядчика</h2>
    {value.selection && <p><strong>Выбран:</strong> {value.selection.contractor.name}
      {!value.assignment && '. Выбор ещё не означает отправку.'}</p>}
    {value.assignment?.decision === 'PENDING' &&
      <p><strong>Отправлено:</strong> {value.assignment.contractor.name}. Ожидается принятие.</p>}
    {value.assignment?.decision === 'ACCEPTED' &&
      <p><strong>Принято подрядчиком:</strong> {value.assignment.contractor.name}</p>}
    {value.assignment?.decision === 'REJECTED' && <>
      <p><strong>Отклонено подрядчиком:</strong> {value.assignment.contractor.name}</p>
      {value.assignment.reject_reason && <p><strong>Причина отклонения:</strong> {value.assignment.reject_reason}</p>}
    </>}
    {value.current_executor && <p><strong>Текущий исполнитель:</strong> {value.current_executor.name}</p>}
  </section>;
}

export function UkActionControl({ action, submit, snapshot }: {
  action: AllowedActionOutput; submit: Submit; snapshot?: CaseSnapshotOutput | undefined;
}) {
  const [contractorId, setContractorId] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [basisNote, setBasisNote] = useState('');
  const [processReference, setProcessReference] = useState('');
  const [explanation, setExplanation] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    switch (action.code) {
      case 'ACCEPT_CASE': void submit({}); return;
      case 'SELECT_CONTRACTOR':
        if (UuidSchema.safeParse(contractorId.trim()).success) {
          void submit({ contractor_id: contractorId.trim(), iteration_id: action.target.iteration_id });
        }
        return;
      case 'SEND_ASSIGNMENT':
        void submit({ selection_id: action.target.selection_id, iteration_id: action.target.iteration_id }); return;
      case 'ADD_COMMENT':
        if (body.trim() || files.length) {
          const payload = { body: body.trim(), clarification_request_id: null, files };
          void submit(payload);
        }
        return;
      case 'REQUEST_CLARIFICATION':
        if (message.trim()) {
          const payload = { result_id: action.target.result_id, feedback_id: action.target.feedback_id,
            message: message.trim(), files };
          void submit(payload);
        }
        return;
      case 'RETURN_TO_REWORK':
        void submit({ result_id: action.target.result_id, feedback_id: action.target.feedback_id }); return;
      case 'RECORD_NO_RESIDENT_FEEDBACK':
        if (confirmed && basisNote.trim()) void submit({ result_id: action.target.result_id,
          iteration_id: action.target.iteration_id, basis_confirmed: true, basis_note: basisNote.trim() });
        return;
      case 'COMPLETE_CASE': {
        if (snapshot?.case.resident_feedback?.type === 'CONFIRMATION'
          && snapshot.case.resident_feedback.result_id === action.target.result_id) {
          void submit({ result_id: action.target.result_id,
            basis: { type: 'RESIDENT_CONFIRMATION', feedback_id: snapshot.case.resident_feedback.feedback_id } });
          return;
        }
        const eventId = snapshot && noFeedbackEventId(snapshot, action.target.result_id);
        if (eventId && confirmed && processReference.trim()) void submit({ result_id: action.target.result_id,
          basis: { type: 'NO_RESIDENT_FEEDBACK', event_id: eventId,
            completion_basis: { confirmed: true, process_reference: processReference.trim() } } });
        return;
      }
      case 'COMPLETE_WITH_EXPLANATION':
        if (explanation.trim()) void submit({ result_id: action.target.result_id,
          feedback_id: action.target.feedback_id, explanation: explanation.trim() });
        return;
      default: return;
    }
  };

  if (action.code === 'COMPLETE_CASE' && !(
    snapshot?.case.resident_feedback?.type === 'CONFIRMATION'
    && snapshot.case.resident_feedback.result_id === action.target.result_id
  ) && !(snapshot && noFeedbackEventId(snapshot, action.target.result_id))) {
    return <p>Для завершения требуется подтверждение жителя или вручную зафиксированный факт отсутствия ответа.</p>;
  }

  return <form className="uk-workflow__form" onSubmit={onSubmit}>
    {action.code === 'SELECT_CONTRACTOR' && <label>Идентификатор подрядчика
      <input name="contractor_id" type="text" required value={contractorId}
        onChange={(event) => setContractorId(event.target.value)} placeholder="UUID подрядчика" />
    </label>}
    {action.code === 'ADD_COMMENT' && <>
      <label>Комментарий<textarea name="body" value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <label>Вложение (необязательно)<input name="files" type="file" multiple
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
    </>}
    {action.code === 'REQUEST_CLARIFICATION' && <>
      <label>Запрос уточнения<textarea name="message" required value={message}
        onChange={(event) => setMessage(event.target.value)} /></label>
      <label>Вложение (необязательно)<input name="files" type="file" multiple
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
    </>}
    {action.code === 'RECORD_NO_RESIDENT_FEEDBACK' && <>
      <label>Основание по процессу УК<textarea name="basis_note" required value={basisNote}
        onChange={(event) => setBasisNote(event.target.value)} /></label>
      <label className="uk-workflow__check"><input name="basis_confirmed" type="checkbox" checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)} />Подтверждаю основание вручную</label>
    </>}
    {action.code === 'COMPLETE_CASE' && snapshot?.case.resident_feedback?.type !== 'CONFIRMATION' && <>
      <p>Факт отсутствия ответа уже зафиксирован. Завершение — отдельное решение УК.</p>
      <label>Ссылка на процесс УК<input name="process_reference" required value={processReference}
        onChange={(event) => setProcessReference(event.target.value)} /></label>
      <label className="uk-workflow__check"><input name="completion_confirmed" type="checkbox" checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)} />Подтверждаю основание завершения вручную</label>
    </>}
    {action.code === 'COMPLETE_WITH_EXPLANATION' && <label>Объяснение решения
      <textarea name="explanation" required value={explanation} onChange={(event) => setExplanation(event.target.value)} />
    </label>}
    <button type="submit">{{
      ACCEPT_CASE: 'Принять случай', SELECT_CONTRACTOR: 'Выбрать подрядчика',
      SEND_ASSIGNMENT: 'Отправить назначение', ADD_COMMENT: 'Добавить комментарий',
      REQUEST_CLARIFICATION: 'Запросить уточнение', RETURN_TO_REWORK: 'Вернуть на доработку',
      RECORD_NO_RESIDENT_FEEDBACK: 'Зафиксировать отсутствие ответа',
      COMPLETE_CASE: 'Завершить случай', COMPLETE_WITH_EXPLANATION: 'Завершить с объяснением',
      ACCEPT_ASSIGNMENT: '', REJECT_ASSIGNMENT: '', ADD_RESULT_MATERIAL: '', SUBMIT_RESULT: '',
      RESIDENT_CONFIRM: '', RESIDENT_REMARK: '',
    }[action.code]}</button>
  </form>;
}

function renderers(snapshot: CaseSnapshotOutput | undefined): ActionRenderers {
  const render = (action: AllowedActionOutput, submit: Submit) =>
    <UkActionControl key={`${snapshot?.case.case_id}:${snapshot?.case.revision}:${action.code}:${JSON.stringify(action.target)}`}
      action={action} submit={submit} snapshot={snapshot} />;
  return {
    ACCEPT_CASE: (action, submit) => render(action, submit as Submit),
    SELECT_CONTRACTOR: (action, submit) => render(action, submit as Submit),
    SEND_ASSIGNMENT: (action, submit) => render(action, submit as Submit),
    ADD_COMMENT: (action, submit) => render(action, submit as Submit),
    REQUEST_CLARIFICATION: (action, submit) => render(action, submit as Submit),
    RETURN_TO_REWORK: (action, submit) => render(action, submit as Submit),
    RECORD_NO_RESIDENT_FEEDBACK: (action, submit) => render(action, submit as Submit),
    COMPLETE_CASE: (action, submit) => render(action, submit as Submit),
    COMPLETE_WITH_EXPLANATION: (action, submit) => render(action, submit as Submit),
  };
}

export function UkWorkflowCaseView({ caseId, role, contextKey, transport, authorizedFetch }: {
  caseId: string; role: Extract<RoleOutput, 'UK_EMPLOYEE' | 'UK_ADMIN'>; contextKey: string;
  transport: CaseReadTransport;
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const query = useQuery({ queryKey: ['case-read', 'snapshot', contextKey, caseId, role],
    queryFn: () => transport.snapshot(caseId, role), retry: false, staleTime: 0,
    refetchOnMount: 'always', refetchOnWindowFocus: false });
  const [success, setSuccess] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const execute = createUkActionExecutor();
  return <div className="uk-workflow">
    {query.data && <UkWorkflowFacts snapshot={query.data} />}
    {success && <p role="status">Команда принята. Обновляем данные случая.</p>}
    {semanticError && <p role="alert">{semanticError}</p>}
    <CaseDetailsView caseId={caseId} role={role} contextKey={contextKey} transport={transport}
      actionRenderers={renderers(query.data)} executeAction={async (action, payload) => {
        setSuccess(false);
        setSemanticError(null);
        try {
          await execute(action, payload, { caseId, authorizedFetch });
          setSuccess(true);
        } catch (error) {
          if (error instanceof UkCommandError && error.status !== 409) {
            setSemanticError(semanticErrorText(error));
          }
          throw error;
        }
      }} />
  </div>;
}
