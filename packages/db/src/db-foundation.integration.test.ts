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
  'case_table',
  'case_iteration',
  'contractor_selection',
  'assignment',
  'result',
  'resident_feedback',
  'comment',
  'case_event',
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

const TG006_CHECK_CONSTRAINTS = [
  'ck_case_current_state',
  'ck_case_result_requirement_snapshot',
  'ck_case_closure_kind',
  'ck_case_closure_consistency',
  'ck_case_revision',
  'ck_case_last_event_seq',
  'ck_iteration_number',
  'ck_iteration_start_reason',
  'ck_assignment_decision',
  'ck_result_description_not_empty',
  'ck_feedback_type',
  'ck_feedback_remark',
  'ck_comment_kind',
  'ck_comment_actor_role_snapshot',
  'ck_event_type',
  'ck_event_actor_role_snapshot',
  'ck_event_from_state',
  'ck_event_to_state',
  'ck_event_evt015_result',
];

const TG006_UNIQUE_CONSTRAINTS = [
  'uq_case_demo_run_case',
  'cq_iteration_case_iteration',
  'cq_iteration_case_no',
  'cq_selection_case_selection',
  'cq_selection_case_no',
  'cq_assignment_case_assignment',
  'cq_assignment_case_no',
  'uq_assignment_selection_id',
  'uq_result_iteration_id',
  'cq_result_case_result',
  'uq_feedback_result_id',
  'cq_feedback_case_feedback',
  'cq_comment_case_comment',
  'uq_event_case_seq',
  'cq_event_case_event',
];

const TG006_PK_CONSTRAINTS = [
  'pk_case_table',
  'pk_case_iteration',
  'pk_contractor_selection',
  'pk_assignment',
  'pk_result',
  'pk_resident_feedback',
  'pk_comment',
  'pk_case_event',
];

const TG006_FK_CONSTRAINTS = [
  'fk_case_organization_house',
  'fk_case_house_premises',
  'fk_case_organization_category',
  'fk_case_demo_run_id',
  'fk_case_current_iteration',
  'fk_case_current_selection',
  'fk_case_current_assignment',
  'fk_case_current_result',
  'fk_case_resident_user_id',
  'fk_case_category_id',
  'fk_case_created_by_user_id',
  'fk_case_default_contractor_snapshot_id',
  'fk_case_closed_by_user_id',
  'fk_case_current_executor_contractor_id',
  'fk_iteration_case_id',
  'fk_iteration_started_by_user_id',
  'fk_iteration_source_result_id',
  'fk_iteration_source_feedback_id',
  'fk_iteration_started_by_event_id',
  'fk_selection_case_id',
  'fk_selection_created_iteration_id',
  'fk_selection_contractor_id',
  'fk_selection_selected_by_user_id',
  'fk_assignment_case_id',
  'fk_assignment_selection_id',
  'fk_assignment_created_iteration_id',
  'fk_assignment_contractor_id',
  'fk_assignment_sent_by_user_id',
  'fk_assignment_accepted_by_user_id',
  'fk_assignment_rejected_by_user_id',
  'fk_result_case_id',
  'fk_result_iteration_id',
  'fk_result_assignment_id',
  'fk_result_contractor_id',
  'fk_result_author_user_id',
  'fk_feedback_case_id',
  'fk_feedback_iteration_id',
  'fk_feedback_result_id',
  'fk_feedback_resident_user_id',
  'fk_comment_case_id',
  'fk_comment_iteration_id',
  'fk_comment_author_user_id',
  'fk_comment_context_result_id',
  'fk_comment_context_feedback_id',
  'fk_comment_in_reply_to_comment_id',
  'fk_event_case_id',
  'fk_event_iteration_id',
  'fk_event_selection_id',
  'fk_event_assignment_id',
  'fk_event_result_id',
  'fk_event_feedback_id',
  'fk_event_comment_id',
  'fk_event_caused_by_event_id',
  'fk_event_actor_user_id',
  'fk_demo_run_primary_case',
];

const TG006_PARTIAL_INDEXES = [
  'uq_case_display_number',
  'uq_case_demo_run_case',
  'uq_result_iteration_id',
  'uq_feedback_result_id',
  'uq_event_case_seq',
  'uq_evt015_per_result',
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

test('clean migrate to latest creates 21 tables with exact catalog; rollback empties; re-up is idempotent', async () => {
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
    expect(types.filter((t) => t === 'p')).toHaveLength(21);
    const allCheckNames = [...CHECK_CONSTRAINTS, ...TG006_CHECK_CONSTRAINTS];
    const allUniqueNames = [...UNIQUE_CONSTRAINTS, ...TG006_UNIQUE_CONSTRAINTS];
    const allFkNames = [...FK_CONSTRAINTS, ...TG006_FK_CONSTRAINTS];
    const allPkNames = [...COMPOSITE_PKS, ...TG006_PK_CONSTRAINTS];
    expect(types.filter((t) => t === 'u')).toHaveLength(allUniqueNames.length);
    expect(types.filter((t) => t === 'c')).toHaveLength(allCheckNames.length);
    expect(types.filter((t) => t === 'f')).toHaveLength(allFkNames.length);
    expect(names).toEqual(expect.arrayContaining(allCheckNames));
    expect(names).toEqual(expect.arrayContaining(allUniqueNames));
    expect(names).toEqual(expect.arrayContaining(allFkNames));
    expect(names).toEqual(expect.arrayContaining(allPkNames));

    const allPartialIndexes = [...PARTIAL_INDEXES, ...TG006_PARTIAL_INDEXES];
    const indexes = await catPool.query(
      `SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS def
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`,
      [SCHEMA, allPartialIndexes],
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
    expect(indexDefs['uq_evt015_per_result']).toBeDefined();

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
      [SCHEMA, allPartialIndexes],
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
