import { Outlet } from 'react-router-dom';
import { SessionProvider, useSession } from '../features/session/session-provider.js';
import { SessionGate } from '../features/session/session-gate.js';
import './session-demo.css';

function SessionOutlet() {
  const { status, busy, revision } = useSession();
  const hidden = status !== 'ready' || busy;
  return <div hidden={hidden} aria-hidden={hidden} data-testid="session-route">
    <Outlet key={revision} />
  </div>;
}

export function AppShell() {
  return (
    <SessionProvider>
      <div className="app-shell app-shell--session">
        <header className="app-shell__header">MAX Smart City</header>
        <main className="app-shell__main">
          <SessionGate />
          <SessionOutlet />
        </main>
      </div>
    </SessionProvider>
  );
}
