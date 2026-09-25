import { Kysely, PostgresDialect } from 'kysely';
import { Pool, PoolClient } from 'pg';
import { expect, test } from 'vitest';
import { migrateToLatest, rollbackAll } from './index.js';

const DATABASE_URL = process.env.TG006_TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('MISSING_TG006_TEST_DATABASE_URL');

const parsed = new URL(DATABASE_URL);
const DB_NAME = decodeURIComponent(parsed.pathname.slice(1));
const SCHEMA = 'tg006_case_workflow';

function uuid(seed: number): string {
  return `00000000-0000-4000-a000-${seed.toString(16).padStart(12, '0')}`;
}

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
  if (!rows[0].db.endsWith('_tg006_test')) throw new Error('UNSAFE_TEST_DATABASE');
}

async function expectConstraintViolation(
  client: PoolClient,
  statement: string,
  params: unknown[],
  expectedCode: string,
  constraint: string,
): Promise<void> {
  await client.query('BEGIN');
  let violated = false;
  try {
    await client.query(statement, params);
  } catch (err: any) {
    violated = true;
    expect(err.code).toBe(expectedCode);
    expect(err.message).toContain(constraint);
  } finally {
    await client.query('ROLLBACK');
  }
  if (!violated) throw new Error(`Expected ${constraint} violation but insert succeeded`);
}

async function acceptInsert(client: PoolClient, statement: string, params: unknown[]): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(statement, params);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function queryOne(pool: Pool, sql: string, params: unknown[] = []): Promise<any> {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

test('clean migrate: 21 tables, exact catalog, rollback, idempotent re-up', async () => {
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
    const up = await migrateToLatest(db);
    expect(up.error).toBeUndefined();

    const tables = await catPool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
      [SCHEMA],
    );
    const appTables = tables.rows
      .map((r) => r.tablename as string)
      .filter((t) => !t.startsWith('kysely_migration'))
      .sort();
    expect(appTables).toHaveLength(21);

    const allNames = await catPool.query(
      `SELECT con.conname AS name, con.contype AS type FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
       WHERE con.connamespace = to_regnamespace($1)
         AND c.relname NOT IN ('kysely_migration', 'kysely_migration_lock')`,
      [SCHEMA],
    );
    const names = allNames.rows.map((r) => r.name as string);
    const types = allNames.rows.map((r) => r.type as string);
    expect(types.filter((t) => t === 'p')).toHaveLength(21);
    expect(types.filter((t) => t === 'u')).toBeGreaterThanOrEqual(13);
    expect(types.filter((t) => t === 'c')).toBeGreaterThanOrEqual(26);
    expect(types.filter((t) => t === 'f')).toBeGreaterThanOrEqual(54);

    const checkNames = allNames.rows.filter((r) => r.type === 'c').map((r) => r.name);
    const requiredChecks = [
      'ck_case_current_state', 'ck_case_result_requirement_snapshot', 'ck_case_closure_kind',
      'ck_case_closure_consistency', 'ck_case_revision', 'ck_case_last_event_seq',
      'ck_iteration_number', 'ck_iteration_start_reason', 'ck_assignment_decision',
      'ck_result_description_not_empty', 'ck_feedback_type', 'ck_feedback_remark',
      'ck_comment_kind', 'ck_comment_actor_role_snapshot', 'ck_event_type',
      'ck_event_actor_role_snapshot', 'ck_event_from_state', 'ck_event_to_state',
      'ck_event_evt015_result',
    ];
    for (const n of requiredChecks) expect(checkNames).toContain(n);

    const down = await rollbackAll(db);
    expect(down.error).toBeUndefined();
    const afterDown = await catPool.query(
      `SELECT count(*)::int AS c FROM pg_tables WHERE schemaname = $1 AND tablename NOT LIKE 'kysely_migration%'`,
      [SCHEMA],
    );
    expect(afterDown.rows[0].c).toBe(0);

    const up2 = await migrateToLatest(db);
    expect(up2.error).toBeUndefined();
    const afterUp = await catPool.query(
      `SELECT count(*)::int AS c FROM pg_tables WHERE schemaname = $1 AND tablename NOT LIKE 'kysely_migration%'`,
      [SCHEMA],
    );
    expect(afterUp.rows[0].c).toBe(21);
  } finally {
    await db.destroy();
    await catPool.end();
  }
}, 60000);

test('deferred FK bootstrap: Case+Iteration#1 commit works; no Iteration#1 fails on commit; NULL current_iteration rejected', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);
    const ORG = uuid(1);
    const HOUSE = uuid(2);
    const PREM = uuid(3);
    const CAT = uuid(4);
    const USER = uuid(5);
    const DUR = uuid(6);

    await pool.query(`INSERT INTO organization (organization_id, name, active, created_at, updated_at) VALUES ($1, 'Test', true, now(), now())`, [ORG]);
    await pool.query(`INSERT INTO house (house_id, organization_id, address, display_label, active, created_at, updated_at) VALUES ($1, $2, 'Addr', NULL, true, now(), now())`, [HOUSE, ORG]);
    await pool.query(`INSERT INTO premises (premises_id, house_id, number_or_label, active, created_at, updated_at) VALUES ($1, $2, '1', true, now(), now())`, [PREM, HOUSE]);
    await pool.query(`INSERT INTO category (category_id, organization_id, name, requires_premises_access, result_requirement, active, config_revision, created_at, updated_at) VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT, ORG]);
    await pool.query(`INSERT INTO app_user (app_user_id, display_name, is_synthetic, active, created_at, updated_at) VALUES ($1, 'User', false, true, now(), now())`, [USER]);
    await pool.query(`INSERT INTO demo_run (demo_run_id, scenario_key, status, created_by_max_identity_id, notification_recipient_max_identity_id, created_at) VALUES ($1, 'demo', 'ACTIVE', $2, $2, now())`, [DUR, uuid(10)]);

    const client = await pool.connect();

    await acceptInsert(client, `INSERT INTO case_table (case_id, display_number, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, NULL, $2, $3, $4, $5, $6, 'Desc', now(), now(), $5, 'Cat', true, 'NONE', 'Addr', '1', 'CREATED', $7, 1, 0)`, [uuid(100), ORG, HOUSE, PREM, USER, CAT, uuid(200)]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [uuid(200), uuid(100), USER]);
    await client.query('COMMIT');

    const caseRow = await queryOne(pool, `SELECT current_iteration_id FROM case_table WHERE case_id = $1`, [uuid(100)]);
    expect(caseRow.current_iteration_id).toBe(uuid(200));

    const badCaseId = uuid(101);
    const badIterId = uuid(201);
    await expectConstraintViolation(
      client,
      `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'Desc', now(), now(), $5, 'Cat', true, 'NONE', 'Addr', '1', 'CREATED', $7, 1, 0)`,
      [badCaseId, ORG, HOUSE, PREM, USER, CAT, badIterId],
      '23503',
      'fk_case_current_iteration',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'Desc', now(), now(), $5, 'Cat', true, 'NONE', 'Addr', '1', 'CREATED', NULL, 1, 0)`,
      [uuid(102), ORG, HOUSE, PREM, USER, CAT],
      '23502',
      'current_iteration_id',
    );

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);

test('cross-Case negative matrix: foreign keys reject cross-Case pointers', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);

    const ORG1 = uuid(1), ORG2 = uuid(2);
    const HOUSE1 = uuid(3), HOUSE2 = uuid(4);
    const PREM1 = uuid(5), PREM2 = uuid(6);
    const CAT1 = uuid(7), CAT2 = uuid(8);
    const USER1 = uuid(9), USER2 = uuid(10);
    const CONTRACTOR1 = uuid(11), CONTRACTOR2 = uuid(12);
    const CASE1 = uuid(13), CASE2 = uuid(14);
    const ITER1 = uuid(15), ITER2 = uuid(16);
    const SEL1 = uuid(17), SEL2 = uuid(18);
    const ASGN1 = uuid(19), ASGN2 = uuid(20);
    const RES1 = uuid(21), RES2 = uuid(22);
    const FB1 = uuid(23);
    const EVT1 = uuid(24), EVT2 = uuid(25);
    const CMT1 = uuid(26);

    const seeds: Array<[string, unknown[]]> = [
      [`INSERT INTO organization (organization_id, name, active, created_at, updated_at) VALUES ($1, 'Org1', true, now(), now())`, [ORG1]],
      [`INSERT INTO organization (organization_id, name, active, created_at, updated_at) VALUES ($1, 'Org2', true, now(), now())`, [ORG2]],
      [`INSERT INTO contractor (contractor_id, display_name, active, created_at, updated_at) VALUES ($1, 'C1', true, now(), now())`, [CONTRACTOR1]],
      [`INSERT INTO contractor (contractor_id, display_name, active, created_at, updated_at) VALUES ($1, 'C2', true, now(), now())`, [CONTRACTOR2]],
      [`INSERT INTO app_user (app_user_id, display_name, is_synthetic, active, created_at, updated_at) VALUES ($1, 'U1', false, true, now(), now())`, [USER1]],
      [`INSERT INTO app_user (app_user_id, display_name, is_synthetic, active, created_at, updated_at) VALUES ($1, 'U2', false, true, now(), now())`, [USER2]],
      [`INSERT INTO house (house_id, organization_id, address, display_label, active, created_at, updated_at) VALUES ($1, $2, 'A', NULL, true, now(), now())`, [HOUSE1, ORG1]],
      [`INSERT INTO house (house_id, organization_id, address, display_label, active, created_at, updated_at) VALUES ($1, $2, 'B', NULL, true, now(), now())`, [HOUSE2, ORG2]],
      [`INSERT INTO premises (premises_id, house_id, number_or_label, active, created_at, updated_at) VALUES ($1, $2, '1', true, now(), now())`, [PREM1, HOUSE1]],
      [`INSERT INTO premises (premises_id, house_id, number_or_label, active, created_at, updated_at) VALUES ($1, $2, '2', true, now(), now())`, [PREM2, HOUSE2]],
      [`INSERT INTO category (category_id, organization_id, name, requires_premises_access, result_requirement, active, config_revision, created_at, updated_at) VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT1, ORG1]],
      [`INSERT INTO category (category_id, organization_id, name, requires_premises_access, result_requirement, active, config_revision, created_at, updated_at) VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT2, ORG2]],
    ];
    for (const [s, p] of seeds) await pool.query(s, p);

    const client = await pool.connect();

    await acceptInsert(client, `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'Desc', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0)`, [CASE1, ORG1, HOUSE1, PREM1, USER1, CAT1, ITER1]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [ITER1, CASE1, USER1]);
    await acceptInsert(client, `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'Desc', now(), now(), $5, 'Cat', true, 'NONE', 'B', '2', 'CREATED', $7, 1, 0)`, [CASE2, ORG2, HOUSE2, PREM2, USER2, CAT2, ITER2]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [ITER2, CASE2, USER2]);

    await expectConstraintViolation(
      client,
      `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 2, 'REWORK', now(), $3)`,
      [ITER2, CASE1, USER1],
      '23503',
      'fk_iteration_case_id',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO contractor_selection (selection_id, case_id, created_iteration_id, contractor_id, selected_by_user_id, selected_at, selection_no) VALUES ($1, $2, $3, $4, $5, now(), 1)`,
      [SEL1, CASE2, ITER1, CONTRACTOR1, USER1],
      '23503',
      'fk_selection_case_id',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO result (result_id, case_id, iteration_id, assignment_id, contractor_id, author_user_id, description, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, 'Desc', now())`,
      [RES1, CASE1, ITER2, ASGN1, CONTRACTOR1, USER1],
      '23503',
      'fk_result_case_id',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, actor_user_id, description, command_id) VALUES ($1, $2, $3, 'EVT_001', now(), NULL, 'test', 'cmd-1')`,
      [EVT1, CASE1, 1],
      '23503',
      'fk_event_case_id',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO comment (comment_id, case_id, iteration_id, author_user_id, actor_role_snapshot, comment_kind, body, created_at) VALUES ($1, $2, $3, $4, 'WORKING', 'WORKING', 'body', now())`,
      [CMT1, CASE2, ITER1, USER1],
      '23503',
      'fk_comment_case_id',
    );

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);

test('closed-domain CHECK fixtures: all new constraints reject invalid values', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);

    const ORG = uuid(1), HOUSE = uuid(2), PREM = uuid(3), CAT = uuid(4), USER = uuid(5), CONTRACTOR = uuid(6);
    const seeds: Array<[string, unknown[]]> = [
      [`INSERT INTO organization (organization_id, name, active, created_at, updated_at) VALUES ($1, 'Test', true, now(), now())`, [ORG]],
      [`INSERT INTO house (house_id, organization_id, address, display_label, active, created_at, updated_at) VALUES ($1, $2, 'A', NULL, true, now(), now())`, [HOUSE, ORG]],
      [`INSERT INTO premises (premises_id, house_id, number_or_label, active, created_at, updated_at) VALUES ($1, $2, '1', true, now(), now())`, [PREM, HOUSE]],
      [`INSERT INTO category (category_id, organization_id, name, requires_premises_access, result_requirement, active, config_revision, created_at, updated_at) VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT, ORG]],
      [`INSERT INTO app_user (app_user_id, display_name, is_synthetic, active, created_at, updated_at) VALUES ($1, 'U', false, true, now(), now())`, [USER]],
      [`INSERT INTO contractor (contractor_id, display_name, active, created_at, updated_at) VALUES ($1, 'C', true, now(), now())`, [CONTRACTOR]],
    ];
    for (const [s, p] of seeds) await pool.query(s, p);

    const client = await pool.connect();

    await acceptInsert(client, `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0)`, [uuid(100), ORG, HOUSE, PREM, USER, CAT, uuid(200)]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [uuid(200), uuid(100), USER]);
    await acceptInsert(client, `INSERT INTO contractor_selection (selection_id, case_id, created_iteration_id, contractor_id, selected_by_user_id, selected_at, selection_no) VALUES ($1, $2, $3, $4, $5, now(), 1)`, [uuid(300), uuid(100), uuid(200), CONTRACTOR, USER]);
    await acceptInsert(client, `INSERT INTO assignment (assignment_id, case_id, selection_id, contractor_id, created_iteration_id, assignment_no, sent_by_user_id, sent_at) VALUES ($1, $2, $3, $4, $5, 1, $5, now())`, [uuid(400), uuid(100), uuid(300), CONTRACTOR, uuid(200), USER]);

    await expectConstraintViolation(
      client,
      `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'BAD', 'A', '1', 'CREATED', $7, 1, 0)`,
      [uuid(101), ORG, HOUSE, PREM, USER, CAT, uuid(201)],
      '23514',
      'ck_case_result_requirement_snapshot',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'BADSTATE', $7, 1, 0)`,
      [uuid(102), ORG, HOUSE, PREM, USER, CAT, uuid(202)],
      '23514',
      'ck_case_current_state',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq, closed_at, closed_by_user_id, closure_kind, closure_explanation) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'COMPLETED', $7, 1, 0, now(), $5, 'DISPUTED_WITH_EXPLANATION', '')`,
      [uuid(103), ORG, HOUSE, PREM, USER, CAT, uuid(203)],
      '23514',
      'ck_case_closure_consistency',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO comment (comment_id, case_id, iteration_id, author_user_id, actor_role_snapshot, comment_kind, body, created_at) VALUES ($1, $2, $3, $4, 'BAD_ROLE', 'WORKING', 'body', now())`,
      [uuid(6), uuid(100), uuid(200), USER],
      '23514',
      'ck_comment_actor_role_snapshot',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, description, command_id) VALUES ($1, $2, $3, 'EVT_999', now(), 'test', 'cmd-1')`,
      [uuid(600), uuid(100), 1],
      '23514',
      'ck_event_type',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO resident_feedback (feedback_id, case_id, iteration_id, result_id, resident_user_id, type, remark_text, created_at) VALUES ($1, $2, $3, $4, $5, 'CONFIRMATION', 'has text', now())`,
      [uuid(700), uuid(100), uuid(200), uuid(6), USER],
      '23514',
      'ck_feedback_remark',
    );

    await acceptInsert(
      client,
      `INSERT INTO resident_feedback (feedback_id, case_id, iteration_id, result_id, resident_user_id, type, remark_text, created_at) VALUES ($1, $2, $3, $4, $5, 'CONFIRMATION', NULL, now())`,
      [uuid(701), uuid(100), uuid(200), uuid(7), USER],
    );
    await acceptInsert(
      client,
      `INSERT INTO resident_feedback (feedback_id, case_id, iteration_id, result_id, resident_user_id, type, remark_text, created_at) VALUES ($1, $2, $3, $4, $5, 'CONFIRMATION', '', now())`,
      [uuid(702), uuid(100), uuid(200), uuid(800), USER],
    );

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);

test('uniqueness constraints: duplicate inserts rejected with 23505', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);

    const ORG = uuid(1), HOUSE = uuid(2), PREM = uuid(3), CAT = uuid(4), USER = uuid(5), CONTRACTOR = uuid(6);
    const seeds: Array<[string, unknown[]]> = [
      [`INSERT INTO organization (organization_id, name, active, created_at, updated_at) VALUES ($1, 'T', true, now(), now())`, [ORG]],
      [`INSERT INTO house (house_id, organization_id, address, display_label, active, created_at, updated_at) VALUES ($1, $2, 'A', NULL, true, now(), now())`, [HOUSE, ORG]],
      [`INSERT INTO premises (premises_id, house_id, number_or_label, active, created_at, updated_at) VALUES ($1, $2, '1', true, now(), now())`, [PREM, HOUSE]],
      [`INSERT INTO category (category_id, organization_id, name, requires_premises_access, result_requirement, active, config_revision, created_at, updated_at) VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT, ORG]],
      [`INSERT INTO app_user (app_user_id, display_name, is_synthetic, active, created_at, updated_at) VALUES ($1, 'U', false, true, now(), now())`, [USER]],
      [`INSERT INTO contractor (contractor_id, display_name, active, created_at, updated_at) VALUES ($1, 'C', true, now(), now())`, [CONTRACTOR]],
    ];
    for (const [s, p] of seeds) await pool.query(s, p);

    const client = await pool.connect();
    await acceptInsert(client, `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0)`, [uuid(100), ORG, HOUSE, PREM, USER, CAT, uuid(200)]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [uuid(200), uuid(100), USER]);

    await expectConstraintViolation(
      client,
      `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 2, 'REWORK', now(), $3)`,
      [uuid(201), uuid(100), USER],
      '23505',
      'cq_iteration_case_no',
    );

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);

test('EVT-015: null result_id rejected, duplicate EVT-015 on same result rejected', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);
    const ORG = uuid(1), HOUSE = uuid(2), PREM = uuid(3), CAT = uuid(4), USER = uuid(5);
    for (const [s, p] of [
      [`INSERT INTO organization VALUES ($1, 'T', true, now(), now())`, [ORG]],
      [`INSERT INTO house VALUES ($1, $2, 'A', NULL, true, now(), now())`, [HOUSE, ORG]],
      [`INSERT INTO premises VALUES ($1, $2, '1', true, now(), now())`, [PREM, HOUSE]],
      [`INSERT INTO category VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT, ORG]],
      [`INSERT INTO app_user VALUES ($1, 'U', false, true, now(), now())`, [USER]],
    ]) await pool.query(s, p);

    const client = await pool.connect();
    await acceptInsert(client, `INSERT INTO case_table VALUES ($1, NULL, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0, NULL, NULL, NULL, NULL, 1, 0)`, [uuid(100), ORG, HOUSE, PREM, USER, CAT, uuid(200)]);
    await acceptInsert(client, `INSERT INTO case_iteration VALUES ($1, $2, 1, 'INITIAL', now(), $3, NULL, NULL, NULL)`, [uuid(200), uuid(100), USER]);

    await expectConstraintViolation(
      client,
      `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, description, command_id) VALUES ($1, $2, $3, 'EVT_015', now(), 'test', 'cmd-1')`,
      [uuid(300), uuid(100), 1],
      '23514',
      'ck_event_evt015_result',
    );

    await acceptInsert(
      client,
      `INSERT INTO result VALUES ($1, $2, $3, $4, $5, $6, 'R', now())`,
      [uuid(400), uuid(100), uuid(200), uuid(500), CONTRACTOR, USER],
    );

    await acceptInsert(
      client,
      `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, result_id, description, command_id) VALUES ($1, $2, $3, 'EVT_015', now(), $4, 'test', 'cmd-1')`,
      [uuid(301), uuid(100), 1, uuid(400)],
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, result_id, description, command_id) VALUES ($1, $2, $4, 'EVT_015', now(), $3, 'test', 'cmd-2')`,
      [uuid(302), uuid(100), uuid(400)],
      '23505',
      'uq_evt015_per_result',
    );

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);

test('immutability: UPDATE/DELETE on immutable tables rejected; stored facts unchanged', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);
    const ORG = uuid(1), HOUSE = uuid(2), PREM = uuid(3), CAT = uuid(4), USER = uuid(5), CONTRACTOR = uuid(6);
    for (const [s, p] of [
      [`INSERT INTO organization VALUES ($1, 'T', true, now(), now())`, [ORG]],
      [`INSERT INTO house VALUES ($1, $2, 'A', NULL, true, now(), now())`, [HOUSE, ORG]],
      [`INSERT INTO premises VALUES ($1, $2, '1', true, now(), now())`, [PREM, HOUSE]],
      [`INSERT INTO category VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT, ORG]],
      [`INSERT INTO app_user VALUES ($1, 'U', false, true, now(), now())`, [USER]],
      [`INSERT INTO contractor VALUES ($1, 'C', true, now(), now())`, [CONTRACTOR]],
    ]) await pool.query(s, p);

    const client = await pool.connect();
    const CASE_ID = uuid(100);
    const ITER_ID = uuid(200);
    const RESULT_ID = uuid(300);

    await acceptInsert(client, `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0)`, [CASE_ID, ORG, HOUSE, PREM, USER, CAT, ITER_ID]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [ITER_ID, CASE_ID, USER]);
    await acceptInsert(client, `INSERT INTO result (result_id, case_id, iteration_id, assignment_id, contractor_id, author_user_id, description, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, 'R', now())`, [RESULT_ID, CASE_ID, ITER_ID, uuid(500), CONTRACTOR, USER]);

    await expectConstraintViolation(
      client,
      `UPDATE case_iteration SET iteration_no = 2 WHERE iteration_id = $1`,
      [ITER_ID],
      '42501',
      'cannot',
    );

    const iterAfter = await queryOne(pool, `SELECT iteration_no FROM case_iteration WHERE iteration_id = $1`, [ITER_ID]);
    expect(iterAfter.iteration_no).toBe(1);

    await expectConstraintViolation(
      client,
      `UPDATE result SET description = 'Modified' WHERE result_id = $1`,
      [RESULT_ID],
      '42501',
      'cannot',
    );

    const resultAfter = await queryOne(pool, `SELECT description FROM result WHERE result_id = $1`, [RESULT_ID]);
    expect(resultAfter.description).toBe('R');

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);

test('same-contractor N+1 Result fixture: accepted Assignment iteration 1 legitimates Result iteration 2', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);
    const ORG = uuid(1), HOUSE = uuid(2), PREM = uuid(3), CAT = uuid(4), USER = uuid(5), CONTRACTOR = uuid(6);
    for (const [s, p] of [
      [`INSERT INTO organization VALUES ($1, 'T', true, now(), now())`, [ORG]],
      [`INSERT INTO house VALUES ($1, $2, 'A', NULL, true, now(), now())`, [HOUSE, ORG]],
      [`INSERT INTO premises VALUES ($1, $2, '1', true, now(), now())`, [PREM, HOUSE]],
      [`INSERT INTO category VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT, ORG]],
      [`INSERT INTO app_user VALUES ($1, 'U', false, true, now(), now())`, [USER]],
      [`INSERT INTO contractor VALUES ($1, 'C', true, now(), now())`, [CONTRACTOR]],
    ]) await pool.query(s, p);

    const client = await pool.connect();
    const CASE_ID = uuid(100), ITER1 = uuid(200), ITER2 = uuid(201), SEL = uuid(300), ASGN = uuid(400), RES1 = uuid(500), RES2 = uuid(501);

    await acceptInsert(client, `INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0)`, [CASE_ID, ORG, HOUSE, PREM, USER, CAT, ITER1]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [ITER1, CASE_ID, USER]);
    await acceptInsert(client, `INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 2, 'REWORK', now(), $3)`, [ITER2, CASE_ID, USER]);
    await acceptInsert(client, `INSERT INTO contractor_selection (selection_id, case_id, created_iteration_id, contractor_id, selected_by_user_id, selected_at, selection_no) VALUES ($1, $2, $3, $4, $5, now(), 1)`, [SEL, CASE_ID, ITER1, CONTRACTOR, USER]);
    await acceptInsert(client, `INSERT INTO assignment (assignment_id, case_id, selection_id, contractor_id, created_iteration_id, assignment_no, sent_by_user_id, sent_at, decision_status, accepted_at, accepted_by_user_id) VALUES ($1, $2, $3, $4, $5, 1, $5, now(), 'ACCEPTED', now(), $5)`, [ASGN, CASE_ID, SEL, CONTRACTOR, ITER1, USER]);

    await acceptInsert(client, `INSERT INTO result (result_id, case_id, iteration_id, assignment_id, contractor_id, author_user_id, description, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, 'R2', now())`, [RES2, CASE_ID, ITER2, ASGN, CONTRACTOR, USER]);

    const resCheck = await queryOne(pool, `SELECT count(*)::int AS c FROM result WHERE iteration_id = $1`, [ITER2]);
    expect(resCheck.c).toBe(1);

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);

test('demo_run FK: primary_case_id from different demo_run rejected; same-run accepted', async () => {
  const adminPool = new Pool(cfg('public', 1));
  try {
    await guardDatabase(adminPool);
    await dropAllUserSchemas(adminPool);
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool(cfg(SCHEMA, 4));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  try {
    await migrateToLatest(db);
    const ID1 = uuid(10), ID2 = uuid(11), USER = uuid(12);
    await pool.query(`INSERT INTO max_identity VALUES ($1, 'm1', 't1', 't1', 'b1', 'LINKED_CONFIRMED', $2, now(), now(), now())`, [ID1, USER]);
    await pool.query(`INSERT INTO max_identity VALUES ($1, 'm2', 't2', 't2', 'b2', 'LINKED_CONFIRMED', $2, now(), now(), now())`, [ID2, USER]);
    await pool.query(`INSERT INTO demo_run VALUES ($1, 'd1', 'ACTIVE', $2, $3, NULL, now(), NULL)`, [uuid(1), ID1, ID1]);
    await pool.query(`INSERT INTO demo_run VALUES ($1, 'd2', 'ACTIVE', $2, $3, NULL, now(), NULL)`, [uuid(2), ID2, ID2]);
    const ORG = uuid(3), HOUSE = uuid(4), PREM = uuid(5), CAT = uuid(6);
    await pool.query(`INSERT INTO organization VALUES ($1, 'T', true, now(), now())`, [ORG]);
    await pool.query(`INSERT INTO house VALUES ($1, $2, 'A', NULL, true, now(), now())`, [HOUSE, ORG]);
    await pool.query(`INSERT INTO premises VALUES ($1, $2, '1', true, now(), now())`, [PREM, HOUSE]);
    await pool.query(`INSERT INTO category VALUES ($1, $2, 'Cat', true, 'NONE', true, 1, now(), now())`, [CAT, ORG]);
    const CASE1 = uuid(7), CASE2 = uuid(8);
    await pool.query(`INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq, demo_run_id) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0, $8)`, [CASE1, ORG, HOUSE, PREM, USER, CAT, uuid(20), uuid(1)]);
    await pool.query(`INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq, demo_run_id) VALUES ($1, $2, $3, $4, $5, $6, 'D', now(), now(), $5, 'Cat', true, 'NONE', 'A', '1', 'CREATED', $7, 1, 0, $8)`, [CASE2, ORG, HOUSE, PREM, USER, CAT, uuid(21), uuid(2)]);
    await pool.query(`INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [uuid(20), CASE1, USER]);
    await pool.query(`INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [uuid(21), CASE2, USER]);

    const client = await pool.connect();

    await expectConstraintViolation(
      client,
      `UPDATE demo_run SET primary_case_id = $1 WHERE demo_run_id = $2`,
      [CASE2, uuid(1)],
      '23503',
      'fk_demo_run_primary_case',
    );

    await acceptInsert(
      client,
      `UPDATE demo_run SET primary_case_id = $1 WHERE demo_run_id = $2`,
      [CASE1, uuid(1)],
    );

    client.release();
  } finally {
    await db.destroy();
    await pool.end();
  }
}, 60000);
