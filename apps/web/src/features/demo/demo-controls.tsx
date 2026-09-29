import { ROLES, type RoleOutput } from '@max-smart-city/contracts';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { useSession } from '../session/session-provider.js';
import { caseReference } from '../cases/read/presentation.js';
import { useDirtyForm } from '../../app/dirty-form.js';

export const ROLE_VIEWS = ROLES;

const labels: Record<RoleOutput, string> = {
  RESIDENT: 'Житель',
  UK_EMPLOYEE: 'Сотрудник УК',
  UK_ADMIN: 'Администратор УК · настройки',
  CONTRACTOR_EMPLOYEE: 'Сотрудник подрядчика',
};

export function DemoControls() {
  return useInRouterContext() ? <RoutedDemoControls /> : <DemoControlsContent pathname={window.location.pathname} />;
}

function RoutedDemoControls() {
  const { pathname } = useLocation();
  return <DemoControlsContent pathname={pathname} />;
}

function DemoControlsContent({ pathname }: { pathname: string }) {
  const { status, session, busy, actionError, startRun, switchRole } = useSession();
  const { guard } = useDirtyForm();
  if (status !== 'ready' || !session?.demo_mode) return null;

  const hasRun = session.demo_run_id !== null;
  const showIntro = pathname === '/';
  return <section className="demo-controls" data-testid="demo-controls" aria-labelledby="demo-title">
    {showIntro && <div className="demo-controls__intro">
      <p>Одно обращение связывает жителя, управляющую компанию и подрядчика.</p>
      <p>На каждом этапе видно, кто отвечает сейчас и что будет дальше.</p>
      <small>Работа с обращением и уведомления — в одном сценарии внутри MAX.</small>
    </div>}
    <details className="demo-controls__details" key={hasRun ? 'active' : 'new'} open={!hasRun}>
      <summary>{hasRun ? `Демо · Сейчас: ${session.effective_actor.role ? labels[session.effective_actor.role] : 'роль не выбрана'}` : 'Подготовить демонстрацию'}</summary>
    <div className="demo-controls__heading">
      <div>
        <span className="demo-controls__badge">Демонстрационные данные</span>
        <h2 id="demo-title">Основной демо-сценарий</h2>
      </div>
      <button
        type="button"
        data-testid="demo-start"
        disabled={busy || !session.real_max_identity.outbound_max_ready}
        onClick={() => guard(() => { void startRun(); })}
      >Начать новую проверку</button>
    </div>
    {!session.real_max_identity.outbound_max_ready &&
      <p role="status">MAX уведомления недоступны для этого контекста.</p>}
    <p className="demo-controls__context">
      {session.primary_case_id ? `Текущее обращение ${caseReference(session.primary_case_id)}`
        : hasRun ? 'Выберите роль жителя и создайте обращение.' : 'Начните демо-прогон, затем выберите роль жителя.'}
    </p>
    <p className="demo-controls__disclosure">Новая проверка создаёт новый демонстрационный сценарий. Вымышленные участники и адреса; один сценарий — одно обращение. История предыдущего сохранится.</p>
    <fieldset className="demo-controls__roles" disabled={!hasRun || busy}>
      <legend>Роль в демонстрации</legend>
      <div className="demo-controls__role-list">
        {ROLE_VIEWS.map((role) => <button
          key={role}
          type="button"
          data-role-view={role}
          aria-pressed={session.effective_actor.role === role}
          onClick={() => guard(() => { void switchRole(role); })}
        >{labels[role]}</button>)}
      </div>
    </fieldset>
    {actionError && <p role="alert">{actionError}</p>}
    </details>
  </section>;
}
