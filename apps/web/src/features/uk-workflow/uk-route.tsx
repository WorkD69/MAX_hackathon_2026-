import { useParams } from 'react-router-dom';
import { useSession } from '../session/session-provider.js';
import { createHttpCaseReadTransport } from '../cases/read/read-transport.js';
import { UkWorkflowCaseView } from './uk-workflow.js';

// TG-029 owns registration of this route in the central navigation.
export function UkWorkflowDetailsRoute() {
  const session = useSession();
  const { caseId } = useParams();
  const role = session.session?.effective_actor.role;
  if (session.status !== 'ready' || !session.session || !caseId
    || (role !== 'UK_EMPLOYEE' && role !== 'UK_ADMIN')) {
    return <p role="status">Ожидание рабочего контекста УК…</p>;
  }
  const actor = session.session.effective_actor;
  const contextKey = [actor.app_user_id, role, session.session.demo_run_id, session.revision].join(':');
  return <UkWorkflowCaseView caseId={caseId} role={role} contextKey={contextKey}
    transport={createHttpCaseReadTransport(session.authorizedFetch)}
    authorizedFetch={session.authorizedFetch} />;
}
