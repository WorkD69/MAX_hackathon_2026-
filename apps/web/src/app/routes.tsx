import type { RouteObject } from 'react-router-dom';
import { ErrorState } from '../components/ui/error-state.js';
import { AppShell } from '../shell/app-shell.js';

export interface AppRouteModule {
  readonly id: string;
  readonly routes: RouteObject[];
}

function HomeRoute() {
  return <section data-testid="home-placeholder" aria-label="Главная" />;
}

export function buildAppRoutes(modules: readonly AppRouteModule[] = []): RouteObject[] {
  return [
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <HomeRoute /> },
        ...modules.flatMap((module) => module.routes),
      ],
    },
    { path: '*', element: <ErrorState message="Маршрут не найден" /> },
  ];
}
