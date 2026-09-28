import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AppRouteModule } from './routes.js';
import { useSession } from '../features/session/session-provider.js';
import { createHttpCaseReadTransport } from '../features/cases/read/read-transport.js';
import { CaseListView } from '../features/cases/read/case-read.js';
import { createHttpResidentTransport } from '../features/resident/resident-transport.js';
import { CreateCaseForm } from '../features/resident/create-case/create-case-form.js';
import { ResidentCaseView } from '../features/resident/resident-case-view.js';
import { UkWorkflowCaseView } from '../features/uk-workflow/uk-workflow.js';
import { ContractorCaseView } from '../features/contractor/contractor-case.js';
import { useContractorCommands } from '../features/contractor/contractor-command-provider.js';
import { configurationRouteModule } from '../features/configuration/configuration-route.js';

function useProductContext() {
  const session = useSession();
  const read = useMemo(() => createHttpCaseReadTransport(session.authorizedFetch), [session.authorizedFetch]);
  const resident = useMemo(() => createHttpResidentTransport(session.authorizedFetch), [session.authorizedFetch]);
  const actor = session.session?.effective_actor;
  return { session, read, resident, role: actor?.role,
    key: [actor?.app_user_id, actor?.role, session.session?.demo_run_id, session.revision].join(':') };
}

export function ProductHome() {
  const { session } = useSession();
  if (!session?.effective_actor.role) return <p>Начните демо и выберите роль для работы со случаем.</p>;
  return <section><h1>Обращения по дому</h1><p>Создавайте обращения, отслеживайте работу и проверяйте результат.</p>
    <Link to="/cases">Открыть список случаев</Link></section>;
}

export function ProductNavigation() {
  const { session } = useSession();
  const role = session?.effective_actor.role;
  if (!role) return null;
  return <nav aria-label="Разделы приложения" className="product-navigation">
    <Link to="/cases">Случаи</Link>
    {session?.primary_case_id && <Link to={`/cases/${session.primary_case_id}`}>Основной случай</Link>}
    {role === 'RESIDENT' && !session?.primary_case_id && <Link to="/resident/cases/new">Создать обращение</Link>}
    {role === 'UK_ADMIN' && <Link to="/configuration">Настройки</Link>}
  </nav>;
}

function ListRoute() {
  const { read, key, role } = useProductContext();
  const navigate = useNavigate();
  if (!role) return <p>Выберите роль.</p>;
  return <CaseListView transport={read} contextKey={key} onOpen={id => { void navigate(`/cases/${id}`); }} />;
}

function DetailsRoute() {
  const { read, resident, key, role, session } = useProductContext();
  const commands = useContractorCommands();
  const { caseId } = useParams();
  if (!role || !caseId) return <p>Выберите роль для просмотра случая.</p>;
  if (role === 'RESIDENT') return <ResidentCaseView caseId={caseId} readTransport={read} residentTransport={resident} contextKey={key} />;
  if (role === 'CONTRACTOR_EMPLOYEE') return <ContractorCaseView caseId={caseId} read={read} commands={commands} contextKey={key} />;
  return <UkWorkflowCaseView caseId={caseId} role={role} transport={read} contextKey={key} authorizedFetch={session.authorizedFetch} />;
}

function CreateRoute() {
  const { resident, key, role, session } = useProductContext();
  const navigate = useNavigate();
  if (role !== 'RESIDENT') return <p>Создание обращения доступно жителю.</p>;
  if (session.session?.primary_case_id) return <Link to={`/cases/${session.session.primary_case_id}`}>Открыть основной случай</Link>;
  return <CreateCaseForm transport={resident} contextKey={key} onPrimaryCaseExists={session.refreshSession}
    onCreated={id => { void navigate(`/cases/${id}`); void session.refreshSession(); }} />;
}

export const productRouteModules: readonly AppRouteModule[] = [
  { id: 'product', routes: [
    { path: 'cases', element: <ListRoute /> },
    { path: 'cases/:caseId', element: <DetailsRoute /> },
    { path: 'resident/cases/new', element: <CreateRoute /> },
    { path: 'resident/cases/:caseId', element: <DetailsRoute /> },
    { path: 'contractor/cases', element: <ListRoute /> },
    { path: 'contractor/cases/:caseId', element: <DetailsRoute /> },
  ] }, configurationRouteModule,
];
