import { createBrowserRouter } from 'react-router-dom';
import { buildAppRoutes, type AppRouteModule } from './routes.js';

export function createAppRouter(
  modules: readonly AppRouteModule[] = [],
): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(buildAppRoutes(modules));
}
