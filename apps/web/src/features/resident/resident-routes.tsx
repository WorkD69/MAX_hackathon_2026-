import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AppRouteModule } from '../../app/routes.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { CreateCaseForm } from './create-case/create-case-form.js';
import { ResidentCaseView } from './resident-case-view.js';
import type { ResidentTransport } from './resident-transport.js';
import { useSession } from '../session/session-provider.js';

export interface ResidentRouteDependencies {
  readonly residentTransport: ResidentTransport;
  readonly readTransport: CaseReadTransport;
  readonly contextKey: string;
}

export function createResidentRouteModule(dependencies: ResidentRouteDependencies): AppRouteModule {
  const { residentTransport, readTransport, contextKey } = dependencies;

  function CreateCaseRoute() {
    const navigate = useNavigate();
    const { session, refreshSession } = useSession();
    const [awaitingPrimary, setAwaitingPrimary] = useState(false);
    useEffect(() => {
      if (awaitingPrimary && session?.primary_case_id) {
        navigate(`/resident/cases/${encodeURIComponent(session.primary_case_id)}`);
      }
    }, [awaitingPrimary, session?.primary_case_id, navigate]);
    const onCreated = useCallback((caseId: string) => {
      navigate(`/resident/cases/${encodeURIComponent(caseId)}`);
    }, [navigate]);
    return <CreateCaseForm transport={residentTransport} onCreated={onCreated} contextKey={contextKey}
      onPrimaryCaseExists={async () => { await refreshSession(); setAwaitingPrimary(true); }} />;
  }

  function ResidentCaseRoute() {
    const { caseId } = useParams();
    if (!caseId) return <p role="alert">Обращение не найдено.</p>;
    return <ResidentCaseView caseId={caseId} readTransport={readTransport}
      residentTransport={residentTransport} contextKey={contextKey} />;
  }

  return {
    id: 'resident',
    routes: [
      { path: 'resident/cases/new', element: <CreateCaseRoute /> },
      { path: 'resident/cases/:caseId', element: <ResidentCaseRoute /> },
    ],
  };
}
