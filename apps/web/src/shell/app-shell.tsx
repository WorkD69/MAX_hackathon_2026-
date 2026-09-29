import { Outlet } from 'react-router-dom';
import { SessionProvider, useSession } from '../features/session/session-provider.js';
import { SessionGate } from '../features/session/session-gate.js';
import { ContractorCommandProvider } from '../features/contractor/contractor-command-provider.js';
import './session-demo.css';
import { ProductNavigation } from '../app/product-routes.js';
import { DirtyFormProvider } from '../app/dirty-form.js';

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
      <DirtyFormProvider><div className="app-shell app-shell--session">
        <header className="app-shell__header">Обращения по дому <span>в MAX</span></header>
        <main className="app-shell__main">
          <SessionGate />
          <ProductNavigation />
          <ContractorCommandProvider><SessionOutlet /></ContractorCommandProvider>
        </main>
      </div></DirtyFormProvider>
    </SessionProvider>
  );
}
