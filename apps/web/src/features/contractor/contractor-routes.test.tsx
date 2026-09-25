import { expect, test } from 'vitest';
import { createContractorRouteModule } from './contractor-routes.js';

test('contractor feature contributes list and detail routes for TG-029 composition', () => {
  const module = createContractorRouteModule();
  expect(module.id).toBe('contractor');
  expect(module.routes.map((route) => route.path)).toEqual(['contractor/cases', 'contractor/cases/:caseId']);
});
