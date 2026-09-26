import * as boundary from './index.js';
import type { DB, Database } from './index.js';
import { expect, test } from 'vitest';

const databaseKeys: readonly (keyof Database)[] = [
  'organization',
  'house',
  'premises',
  'app_user',
  'user_role_binding',
  'resident_premises_access',
  'uk_house_access',
  'max_identity',
  'category',
  'contractor',
  'organization_contractor',
  'demo_run',
  'demo_run_actor',
  'case_table',
  'case_iteration',
  'contractor_selection',
  'assignment',
  'result',
  'resident_feedback',
  'comment',
  'case_event',
  'attachment',
  'case_initial_attachment',
  'work_material_attachment',
  'result_attachment',
  'feedback_attachment',
  'comment_attachment',
  'command_execution',
  'notification_intent',
  'configuration_change',
];

test('TG-005 db boundary surface', () => {
  expect(typeof boundary.createMigrator).toBe('function');
  expect(typeof boundary.migrateToLatest).toBe('function');
  expect(typeof boundary.rollbackAll).toBe('function');
  expect(typeof boundary.resolveMigrationsDir).toBe('function');
  expect(typeof boundary.createOperationalRepositories).toBe('function');
  expect(typeof boundary.MIGRATIONS_DIR).toBe('string');
  expect(boundary.MIGRATIONS_DIR.endsWith('migrations')).toBe(true);
  expect(databaseKeys).toHaveLength(30);
});

const _dbAlias: DB = null as unknown as Database;
