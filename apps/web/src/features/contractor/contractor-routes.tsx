import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { AppRouteModule } from '../../app/routes.js';
import { useSession } from '../session/session-provider.js';
import { createHttpCaseReadTransport } from '../cases/read/read-transport.js';
import { useContractorCommands } from './contractor-command-provider.js';
import { ContractorCaseList, ContractorCaseView } from './contractor-case.js';

function contextKey(session: ReturnType<typeof useSession>): string {
  const actor = session.session?.effective_actor;
  return [actor?.app_user_id, actor?.role, session.session?.demo_run_id, session.revision].join(':');
}

export function createContractorRouteModule(): AppRouteModule {
  function ListRoute() {
    const session = useSession();
    const navigate = useNavigate();
    const location = useLocation();
    if (session.status !== 'ready') return <p role="status">Ожидание сессии…</p>;
    if (session.session?.effective_actor.role !== 'CONTRACTOR_EMPLOYEE') {
      return <p role="alert">Назначения недоступны.</p>;
    }
    return <ContractorCaseList contextKey={contextKey(session)}
      read={createHttpCaseReadTransport(session.authorizedFetch)}
      notice={location.state && typeof location.state === 'object' && 'notice' in location.state
        && typeof location.state.notice === 'string' ? location.state.notice : undefined}
      onOpen={(caseId) => { void navigate(`/contractor/cases/${encodeURIComponent(caseId)}`); }} />;
  }

  function DetailsRoute() {
    const session = useSession();
    const navigate = useNavigate();
    const { caseId } = useParams();
    const commands = useContractorCommands();
    if (session.status !== 'ready') return <p role="status">Ожидание сессии…</p>;
    if (session.session?.effective_actor.role !== 'CONTRACTOR_EMPLOYEE' || !caseId) {
      return <p role="alert">Обращение недоступно.</p>;
    }
    return <ContractorCaseView caseId={caseId} contextKey={contextKey(session)}
      read={createHttpCaseReadTransport(session.authorizedFetch)}
      commands={commands} onRejected={() => {
        void navigate('/contractor/cases', { replace: true,
          state: { notice: 'Отказ отправлен. Обращение возвращено в УК.' } });
      }} />;
  }

  return { id: 'contractor', routes: [
    { path: 'contractor/cases', element: <ListRoute /> },
    { path: 'contractor/cases/:caseId', element: <DetailsRoute /> },
  ] };
}
