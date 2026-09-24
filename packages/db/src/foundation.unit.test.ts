import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ColumnType, Generated } from 'kysely';
import type { Migration } from 'kysely/migration';
import * as foundation from '../dist/migrations/0001_foundation.js';
import { resolveMigrationsDir } from './index.js';
import type {
  AppUserTable,
  CategoryTable,
  Database,
  DemoRunStatus,
  MaxIdentityLinkStatus,
  ResultRequirement,
  Role,
} from './index.js';
import { expect, expectTypeOf, test } from 'vitest';

test('TG-005 foundation migration exports up and down as migration functions', () => {
  expect(typeof foundation.up).toBe('function');
  expect(typeof foundation.down).toBe('function');
  expectTypeOf(foundation).toMatchTypeOf<Migration>();
});

test('TG-005 foundation migration declares exactly the 13 canonical tables', async () => {
  const text = await fs.readFile(new URL('../migrations/0001_foundation.ts', import.meta.url), 'utf8');
  const createTableCount = (text.match(/\bCREATE TABLE\b/g) ?? []).length;
  expect(createTableCount).toBe(13);
  const normalized = text.replace(/\s+/g, ' ');
  for (const table of [
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
  ]) {
    expect(normalized).toContain(`CREATE TABLE ${table} (`);
  }
});

test('TG-005 foundation migration declares exactly the 4 partial unique indexes with exact predicates', async () => {
  const text = await fs.readFile(new URL('../migrations/0001_foundation.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  const createIndexCount = (normalized.match(/\bCREATE UNIQUE INDEX\b/g) ?? []).length;
  expect(createIndexCount).toBe(4);
  expect(normalized).toContain('CREATE UNIQUE INDEX uq_max_identity_mini_app_user_id ON max_identity (mini_app_user_id) WHERE mini_app_user_id IS NOT NULL');
  expect(normalized).toContain('CREATE UNIQUE INDEX uq_max_identity_bot_user_id ON max_identity (bot_user_id) WHERE bot_user_id IS NOT NULL');
  expect(normalized).toContain('CREATE UNIQUE INDEX uq_max_identity_app_user_id ON max_identity (app_user_id) WHERE app_user_id IS NOT NULL');
  expect(normalized).toContain("CREATE UNIQUE INDEX uq_demo_run_active_per_identity ON demo_run (created_by_max_identity_id) WHERE status = 'ACTIVE'");
});

test('TG-005 resolveMigrationsDir src and dist anchors', () => {
  expect(resolveMigrationsDir(path.join('packages', 'db', 'src'))).toBe(path.join('packages', 'db', 'migrations'));
  expect(resolveMigrationsDir(path.join('packages', 'db', 'dist'))).toBe(
    path.join('packages', 'db', 'dist', 'migrations'),
  );
});

test('TG-005 exact Kysely type surface', () => {
  expectTypeOf<keyof Database>().toEqualTypeOf<
    | 'organization'
    | 'house'
    | 'premises'
    | 'app_user'
    | 'user_role_binding'
    | 'resident_premises_access'
    | 'uk_house_access'
    | 'max_identity'
    | 'category'
    | 'contractor'
    | 'organization_contractor'
    | 'demo_run'
    | 'demo_run_actor'
  >();
  expectTypeOf<Role>().toEqualTypeOf<'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE'>();
  expectTypeOf<ResultRequirement>().toEqualTypeOf<'NONE' | 'PHOTO' | 'FILE'>();
  expectTypeOf<DemoRunStatus>().toEqualTypeOf<'ACTIVE' | 'ARCHIVED'>();
  expectTypeOf<MaxIdentityLinkStatus>().toEqualTypeOf<'UNLINKED' | 'LINKED_CONFIRMED'>();
  expectTypeOf<CategoryTable['config_revision']>().toEqualTypeOf<
    ColumnType<string, number | string, number | string>
  >();
  expectTypeOf<AppUserTable['is_synthetic']>().toEqualTypeOf<Generated<boolean>>();
});