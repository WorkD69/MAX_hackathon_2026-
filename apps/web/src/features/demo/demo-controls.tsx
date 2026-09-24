import { ROLES, type RoleOutput } from '@max-smart-city/contracts';
import { useSession } from '../session/session-provider.js';

export const ROLE_VIEWS = ROLES;

const labels: Record<RoleOutput, string> = {
  RESIDENT: 'Житель',
  UK_EMPLOYEE: 'Сотрудник УК',
  UK_ADMIN: 'Администратор УК',
  CONTRACTOR_EMPLOYEE: 'Сотрудник подрядчика',
};

export function DemoControls() {
  const { status, session, busy, actionError, startRun, switchRole } = useSession();
  if (status !== 'ready' || !session?.demo_mode) return null;

  const hasRun = session.demo_run_id !== null;
  return <section className="demo-controls" data-testid="demo-controls" aria-labelledby="demo-title">
    <div className="demo-controls__heading">
      <div>
        <span className="demo-controls__badge">ДЕМО · ТОЛЬКО ДЛЯ ТЕСТА</span>
        <h2 id="demo-title">Текущий демо-сценарий</h2>
      </div>
      <button
        type="button"
        data-testid="demo-start"
        disabled={busy || !session.real_max_identity.outbound_max_ready}
        onClick={() => void startRun()}
      >Начать новый запуск</button>
    </div>
    {!session.real_max_identity.outbound_max_ready &&
      <p role="status">MAX уведомления недоступны для этого контекста.</p>}
    <p className="demo-controls__context">
      {hasRun ? `DemoRun: ${session.demo_run_id}` : 'Активного DemoRun пока нет.'}
      {session.primary_case_id && <> <span>Основное обращение: {session.primary_case_id}</span></>}
    </p>
    <fieldset className="demo-controls__roles" disabled={!hasRun || busy}>
      <legend>Роль просмотра</legend>
      <div className="demo-controls__role-list">
        {ROLE_VIEWS.map((role) => <button
          key={role}
          type="button"
          data-role-view={role}
          aria-pressed={session.effective_actor.role === role}
          onClick={() => void switchRole(role)}
        >{labels[role]}</button>)}
      </div>
    </fieldset>
    {actionError && <p role="alert">{actionError}</p>}
  </section>;
}
