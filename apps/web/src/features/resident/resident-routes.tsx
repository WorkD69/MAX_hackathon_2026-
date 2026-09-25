import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AppRouteModule } from '../../app/routes.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { CreateCaseForm } from './create-case/create-case-form.js';
import { ResidentCaseView } from './resident-case-view.js';
import type { ResidentTransport } from './resident-transport.js';

export interface ResidentRouteDependencies {
  readonly residentTransport: ResidentTransport;
  readonly readTransport: CaseReadTransport;
  readonly contextKey: string;
}

export function createResidentRouteModule(dependencies: ResidentRouteDependencies): AppRouteModule {
  const { residentTransport, readTransport, contextKey } = dependencies;

  function CreateCaseRoute() {
    const navigate = useNavigate();
    const onCreated = useCallback((caseId: string) => {
      navigate(`/resident/cases/${encodeURIComponent(caseId)}`);
    }, [navigate]);
    return <CreateCaseForm transport={residentTransport} onCreated={onCreated} />;
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
