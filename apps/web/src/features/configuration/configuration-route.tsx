import type { AppRouteModule } from '../../app/routes.js';
import { ConfigurationPage } from './configuration-page.js';

export const configurationRouteModule: AppRouteModule = {
  id: 'configuration',
  routes: [{ path: 'configuration', element: <ConfigurationPage /> }],
};
