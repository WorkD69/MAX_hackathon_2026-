import type { AppRouteModule } from '../../../app/routes.js';
import type { AllowedActionOutput } from '@max-smart-city/contracts';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../session/session-provider.js';
import { CaseDetailsView, CaseListView, type ActionRenderers } from './case-read.js';
import { createHttpCaseReadTransport } from './read-transport.js';

interface CaseReadIntegration {
  readonly actionRenderers?: ActionRenderers;
  readonly executeAction?: (action: AllowedActionOutput, context: {
    caseId: string;
    authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>;
  }) => Promise<unknown>;
}

function contextKey(session: ReturnType<typeof useSession>): string {
  const actor = session.session?.effective_actor;
  return [actor?.app_user_id, actor?.role, session.session?.demo_run_id, session.revision].join(':');
}

export function createCaseReadRouteModule(integration: CaseReadIntegration = {}): AppRouteModule {
  function ListRoute() {
    const session = useSession();
    const navigate = useNavigate();
    if (session.status !== 'ready' || !session.session?.effective_actor.role) {
      return <p role="status">Ожидание сессии…</p>;
    }
    return <CaseListView contextKey={contextKey(session)}
      transport={createHttpCaseReadTransport(session.authorizedFetch)}
      onOpen={(caseId) => { void navigate(`/cases/${encodeURIComponent(caseId)}`); }} />;
  }

  function DetailsRoute() {
    const session = useSession();
    const { caseId } = useParams();
    if (session.status !== 'ready' || !session.session?.effective_actor.role || !caseId) {
      return <p role="status">Ожидание сессии…</p>;
    }
    const executor = integration.executeAction;
    return <CaseDetailsView caseId={caseId} role={session.session.effective_actor.role}
      contextKey={contextKey(session)} transport={createHttpCaseReadTransport(session.authorizedFetch)}
      {...(integration.actionRenderers ? { actionRenderers: integration.actionRenderers } : {})}
      {...(executor ? { executeAction: (action: AllowedActionOutput) =>
        executor(action, { caseId, authorizedFetch: session.authorizedFetch }) } : {})} />;
  }

  return { id: 'case-read', routes: [
    { path: 'cases', element: <ListRoute /> },
    { path: 'cases/:caseId', element: <DetailsRoute /> },
  ] };
}
