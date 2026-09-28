import { createBrowserRouter } from 'react-router-dom';
import { buildAppRoutes, type AppRouteModule } from './routes.js';
import { productRouteModules } from './product-routes.js';

export function createAppRouter(
  modules: readonly AppRouteModule[] = productRouteModules,
): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(buildAppRoutes(modules));
}
