import { expect, test } from 'vitest';
import { createCaseReadRouteModule } from './case-read-routes.js';

test('feature-owned case read routes are ready for central composition', () => {
  const module = createCaseReadRouteModule();
  expect(module.id).toBe('case-read');
  expect(module.routes.map((route) => route.path)).toEqual(['cases', 'cases/:caseId']);
});
