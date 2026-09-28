import { DemoControls } from '../demo/demo-controls.js';
import { useSession } from './session-provider.js';
import { displayName, roleLabel } from '../cases/read/presentation.js';

export function SessionGate() {
  const { status, session, busy, retry } = useSession();
  if (status === 'pending' || busy) {
    return <section className="session-state" role="status" aria-live="polite">
      <h1>{busy ? 'Обновляем контекст…' : 'Подключаем MAX…'}</h1>
      <p>Проверяем текущую сессию приложения.</p>
    </section>;
  }
  if (status === 'error') {
    return <section className="session-state" role="alert">
      <h1>Не удалось открыть сессию</h1>
      <p>Откройте приложение в MAX и повторите попытку.</p>
      <button type="button" onClick={() => void retry()}>Повторить</button>
    </section>;
  }
  return <>
    <div className="session-identity" aria-label="Текущий пользователь">
      <span>{displayName(session?.real_max_identity.display_name ?? '')}</span>
      {session?.effective_actor.role && <strong className="role-badge">{roleLabel(session.effective_actor.role)}</strong>}
      <span>{displayName(session?.effective_actor.display_name ?? '')}</span>
    </div>
    <DemoControls />
  </>;
}
