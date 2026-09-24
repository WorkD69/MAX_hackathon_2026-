import { Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">MAX Smart City</header>
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}
