import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { migrateToLatest, rollbackAll } from './index.js';

const DATABASE_URL = process.env.TG005_TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('MISSING_TG005_TEST_DATABASE_URL');

const parsed = new URL(DATABASE_URL);
const DB_NAME = decodeURIComponent(parsed.pathname.slice(1));
const SCHEMA = 'tg005_foundation';

const APP_TABLES = [
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
].sort();

const COMPOSITE_PKS = [
  'pk_resident_premises_access',
  'pk_uk_house_access',
  'pk_organization_contractor',
  'pk_demo_run_actor',
];

const UNIQUE_CONSTRAINTS = [
  'cq_house_organization_house',
  'cq_premises_house_premises',
  'cq_category_organization_category',
  'uq_demo_run_actor_role_alias',
];

const CHECK_CONSTRAINTS = [
  'ck_user_role_binding_role',
  'ck_user_role_binding_shape',
  'ck_max_identity_link_status',
  'ck_max_identity_readiness',
  'ck_demo_run_status',
  'ck_demo_run_actor_role',
  'ck_category_result_requirement',
];

const FK_CONSTRAINTS = [
  'fk_house_organization_id',
  'fk_premises_house_id',
  'fk_category_organization_id',
  'fk_category_default_contractor_id',
  'fk_category_updated_by_user_id',
  'fk_user_role_binding_app_user_id',
  'fk_user_role_binding_organization_id',
  'fk_user_role_binding_contractor_id',
  'fk_resident_premises_access_app_user_id',
  'fk_resident_premises_access_premises_id',
  'fk_uk_house_access_app_user_id',
  'fk_uk_house_access_house_id',
  'fk_max_identity_app_user_id',
  'fk_demo_run_created_by_max_identity_id',
  'fk_demo_run_notification_recipient_max_identity_id',
  'fk_demo_run_actor_demo_run_id',
  'fk_demo_run_actor_app_user_id',
  'fk_organization_contractor_organization_id',
  'fk_organization_contractor_contractor_id',
];

const PARTIAL_INDEXES = [
  'uq_max_identity_mini_app_user_id',
  'uq_max_identity_bot_user_id',
  'uq_max_identity_app_user_id',
  'uq_demo_run_active_per_identity',
];

function cfg(schema: string, max = 4) {
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: DB_NAME,
    max,
    options: `-c search_path=${schema}`,
  };
}

function quoteIdent(id: string): string {
  return '"' + id.replace(/"/g, '""') + '"';
}

async function dropAllUserSchemas(pool: Pool) {
  const { rows } = await pool.query(
    `SELECT nspname FROM pg_namespace
      WHERE nspname <> 'public'
        AND nspname <> 'information_schema'
        AND nspname NOT LIKE 'pg\\_%'`,
  );
  for (const row of rows) {
    await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdent(row.nspname)} CASCADE`);
  }
}

async function guardDatabase(pool: Pool) {
  const { rows } = await pool.query('SELECT current_database() AS db');
  if (!rows[0].db.endsWith('_tg005_test')) throw new Error('UNSAFE_TEST_DATABASE');
}

test('clean migrate to latest creates 13 tables with exact catalog; rollback empties; re-up is idempotent', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const catPool = new Pool({ ...cfg('public', 2), options: `-c search_path=${SCHEMA}` });
  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    const up1 = await migrateToLatest(db);
    expect(up1.error).toBeUndefined();

    const tables = await catPool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
      [SCHEMA],
    );
    const appTables = tables.rows
      .map((r) => r.tablename as string)
      .filter((t) => !t.startsWith('kysely_migration'))
      .sort();
    expect(appTables).toEqual(APP_TABLES);

    const constraints = await catPool.query(
      `SELECT con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
        WHERE con.connamespace = to_regnamespace($1)
          AND c.relname NOT IN ('kysely_migration', 'kysely_migration_lock')`,
      [SCHEMA],
    );
    const types = constraints.rows.map((r) => r.type as string);
    const names = constraints.rows.map((r) => r.name as string);
    expect(types.filter((t) => t === 'p')).toHaveLength(13);
    expect(types.filter((t) => t === 'u')).toHaveLength(4);
    expect(types.filter((t) => t === 'c')).toHaveLength(7);
    expect(types.filter((t) => t === 'f')).toHaveLength(19);
    expect(names).toEqual(expect.arrayContaining(COMPOSITE_PKS));
    expect(names).toEqual(expect.arrayContaining(UNIQUE_CONSTRAINTS));
    expect(names).toEqual(expect.arrayContaining(CHECK_CONSTRAINTS));
    expect(names).toEqual(expect.arrayContaining(FK_CONSTRAINTS));

    const indexes = await catPool.query(
      `SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS def
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`,
      [SCHEMA, PARTIAL_INDEXES],
    );
    const indexDefs = Object.fromEntries(indexes.rows.map((r) => [r.name as string, r.def as string]));
    expect(indexDefs['uq_max_identity_mini_app_user_id']).toBe(
      `CREATE UNIQUE INDEX uq_max_identity_mini_app_user_id ON ${SCHEMA}.max_identity USING btree (mini_app_user_id) WHERE (mini_app_user_id IS NOT NULL)`,
    );
    expect(indexDefs['uq_max_identity_bot_user_id']).toBe(
      `CREATE UNIQUE INDEX uq_max_identity_bot_user_id ON ${SCHEMA}.max_identity USING btree (bot_user_id) WHERE (bot_user_id IS NOT NULL)`,
    );
    expect(indexDefs['uq_max_identity_app_user_id']).toBe(
      `CREATE UNIQUE INDEX uq_max_identity_app_user_id ON ${SCHEMA}.max_identity USING btree (app_user_id) WHERE (app_user_id IS NOT NULL)`,
    );
    expect(indexDefs['uq_demo_run_active_per_identity']).toBe(
      `CREATE UNIQUE INDEX uq_demo_run_active_per_identity ON ${SCHEMA}.demo_run USING btree (created_by_max_identity_id) WHERE (status = 'ACTIVE'::text)`,
    );

    const down = await rollbackAll(db);
    expect(down.error).toBeUndefined();

    const afterDownTables = await catPool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
      [SCHEMA],
    );
    const afterDownApps = afterDownTables.rows
      .map((r) => r.tablename as string)
      .filter((t) => !t.startsWith('kysely_migration'));
    expect(afterDownApps).toHaveLength(0);

    const afterDownIndexes = await catPool.query(
      `SELECT c.relname AS name
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`,
      [SCHEMA, PARTIAL_INDEXES],
    );
    expect(afterDownIndexes.rows).toHaveLength(0);

    const up2 = await migrateToLatest(db);
    expect(up2.error).toBeUndefined();

    const afterUpTables = await catPool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
      [SCHEMA],
    );
    const afterUpApps = afterUpTables.rows
      .map((r) => r.tablename as string)
      .filter((t) => !t.startsWith('kysely_migration'))
      .sort();
    expect(afterUpApps).toEqual(APP_TABLES);

    for (const table of APP_TABLES) {
      const { rows } = await catPool.query(
        `SELECT count(*)::int AS c FROM ${quoteIdent(SCHEMA)}.${quoteIdent(table)}`,
      );
      expect(rows[0].c).toBe(0);
    }

    const up3 = await migrateToLatest(db);
    expect(up3.error).toBeUndefined();
  } finally {
    await db.destroy();
    await catPool.end();
  }
}, 60000);