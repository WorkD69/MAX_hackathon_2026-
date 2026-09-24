import { Kysely, PostgresDialect } from 'kysely';
import { Pool, PoolClient } from 'pg';
import { expect, test } from 'vitest';
import { migrateToLatest } from './index.js';

const DATABASE_URL = process.env.TG005_TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('MISSING_TG005_TEST_DATABASE_URL');

const parsed = new URL(DATABASE_URL);
const DB_NAME = decodeURIComponent(parsed.pathname.slice(1));
const SCHEMA = 'tg005_constraints';

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
  if (!rows[0].db.endsWith('_tg005_test')) throw new Error('UNSAFE_TEST_DATABASE');
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

test('negative constraint fixtures reject with exact SQLSTATE and constraint name; positives accept', async () => {
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
    const CONTRACTOR = uuid(2);
    const APP_USER = uuid(3);
    const HOUSE = uuid(4);
    const PREMISES = uuid(5);
    const IDENTITY_A = uuid(10);
    const IDENTITY_B = uuid(11);

    const seeds: Array<[string, unknown[]]> = [
      [
        `INSERT INTO organization (organization_id, name, active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
        [ORG, 'Verification Org'],
      ],
      [
        `INSERT INTO contractor (contractor_id, display_name, active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
        [CONTRACTOR, 'Verification Contractor'],
      ],
      [
        `INSERT INTO app_user (app_user_id, display_name, is_synthetic, active, created_at, updated_at) VALUES ($1, $2, false, true, now(), now())`,
        [APP_USER, 'Verification Resident'],
      ],
      [
        `INSERT INTO house (house_id, organization_id, address, display_label, active, created_at, updated_at) VALUES ($1, $2, $3, NULL, true, now(), now())`,
        [HOUSE, ORG, 'Verification Street 1'],
      ],
      [
        `INSERT INTO premises (premises_id, house_id, number_or_label, active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())`,
        [PREMISES, HOUSE, 'Flat 1'],
      ],
      [
        `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, $3, $4, $5, 'LINKED_CONFIRMED', $6, now(), now(), now())`,
        [IDENTITY_A, 'mini-alice', 'tchat-alice', 'private', 'bot-alice', APP_USER],
      ],
      [
        `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, NULL, NULL, $3, 'UNLINKED', NULL, now(), now(), NULL)`,
        [IDENTITY_B, 'mini-bob', 'bot-bob'],
      ],
    ];
    for (const [statement, params] of seeds) {
      await pool.query(statement, params);
    }

    const client = await pool.connect();

    const roleBinding = (seed: number) => uuid(30 + seed);
    const rolePositives: Array<[string, string | null, string | null]> = [
      ['RESIDENT', null, null],
      ['UK_EMPLOYEE', ORG, null],
      ['UK_ADMIN', ORG, null],
      ['CONTRACTOR_EMPLOYEE', null, CONTRACTOR],
    ];
    let bindSeq = 0;
    for (const [role, organizationId, contractorId] of rolePositives) {
      await acceptInsert(
        client,
        `INSERT INTO user_role_binding (role_binding_id, app_user_id, role, organization_id, contractor_id, active, created_at) VALUES ($1, $2, $3, $4, $5, true, now())`,
        [roleBinding(bindSeq++), APP_USER, role, organizationId, contractorId],
      );
    }

    const roleNegatives: Array<[string, string | null, string | null]> = [
      ['RESIDENT', ORG, null],
      ['RESIDENT', null, CONTRACTOR],
      ['UK_EMPLOYEE', null, null],
      ['UK_EMPLOYEE', ORG, CONTRACTOR],
      ['UK_ADMIN', null, null],
      ['UK_ADMIN', ORG, CONTRACTOR],
      ['CONTRACTOR_EMPLOYEE', null, null],
      ['CONTRACTOR_EMPLOYEE', ORG, CONTRACTOR],
    ];
    for (const [role, organizationId, contractorId] of roleNegatives) {
      await expectConstraintViolation(
        client,
        `INSERT INTO user_role_binding (role_binding_id, app_user_id, role, organization_id, contractor_id, active, created_at) VALUES ($1, $2, $3, $4, $5, true, now())`,
        [roleBinding(bindSeq++), APP_USER, role, organizationId, contractorId],
        '23514',
        'ck_user_role_binding_shape',
      );
    }

    const maxIdentity = (seed: number) => uuid(40 + seed);
    await expectConstraintViolation(
      client,
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, NULL, $3, $4, 'LINKED_CONFIRMED', NULL, now(), now(), NULL)`,
      [maxIdentity(0), 'mini-ready-a', 'private', 'bot-ready-a'],
      '23514',
      'ck_max_identity_readiness',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, $3, NULL, $4, 'LINKED_CONFIRMED', NULL, now(), now(), NULL)`,
      [maxIdentity(1), 'mini-ready-b', 'tchat-ready-b', 'bot-ready-b'],
      '23514',
      'ck_max_identity_readiness',
    );

    await acceptInsert(
      client,
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, $3, $4, $5, 'LINKED_CONFIRMED', NULL, now(), now(), now())`,
      [maxIdentity(2), 'mini-ready-ok', 'tchat-ready-ok', 'group', 'bot-ready-ok'],
    );

    await acceptInsert(
      client,
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, NULL, NULL, $3, 'UNLINKED', NULL, now(), now(), NULL)`,
      [maxIdentity(3), 'mini-unlinked', 'bot-unlinked'],
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, $3, $4, $5, 'LINKED_CONFIRMED', $6, now(), now(), now())`,
      [maxIdentity(4), 'mini-dup-app', 'tchat-dup-app', 'private', 'bot-dup-app', APP_USER],
      '23505',
      'uq_max_identity_app_user_id',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, $3, $4, $5, 'LINKED_CONFIRMED', NULL, now(), now(), NULL)`,
      [maxIdentity(5), 'mini-alice', 'tchat-dup-mini', 'private', 'bot-dup-mini'],
      '23505',
      'uq_max_identity_mini_app_user_id',
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at) VALUES ($1, $2, $3, $4, $5, 'LINKED_CONFIRMED', NULL, now(), now(), NULL)`,
      [maxIdentity(6), 'mini-dup-bot', 'tchat-dup-bot', 'private', 'bot-alice'],
      '23505',
      'uq_max_identity_bot_user_id',
    );

    await acceptInsert(
      client,
      `INSERT INTO demo_run (demo_run_id, scenario_key, status, created_by_max_identity_id, notification_recipient_max_identity_id, primary_case_id, created_at, archived_at) VALUES ($1, $2, 'ACTIVE', $3, $3, NULL, now(), NULL)`,
      [uuid(20), 'smoke-telemetry', IDENTITY_A],
    );

    await expectConstraintViolation(
      client,
      `INSERT INTO demo_run (demo_run_id, scenario_key, status, created_by_max_identity_id, notification_recipient_max_identity_id, primary_case_id, created_at, archived_at) VALUES ($1, $2, 'ACTIVE', $3, $3, NULL, now(), NULL)`,
      [uuid(21), 'smoke-telemetry', IDENTITY_A],
      '23505',
      'uq_demo_run_active_per_identity',
    );

    await acceptInsert(
      client,
      `INSERT INTO demo_run (demo_run_id, scenario_key, status, created_by_max_identity_id, notification_recipient_max_identity_id, primary_case_id, created_at, archived_at) VALUES ($1, $2, 'ACTIVE', $3, $4, NULL, now(), NULL)`,
      [uuid(22), 'smoke-telemetry', IDENTITY_B, IDENTITY_A],
    );
    await acceptInsert(
      client,
      `INSERT INTO demo_run (demo_run_id, scenario_key, status, created_by_max_identity_id, notification_recipient_max_identity_id, primary_case_id, created_at, archived_at) VALUES ($1, $2, 'ARCHIVED', $3, $4, NULL, now(), now())`,
      [uuid(23), 'smoke-telemetry', IDENTITY_B, IDENTITY_A],
    );

    const catalog = await pool.query(
      `SELECT con.conname AS name, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
        WHERE con.connamespace = to_regnamespace($1)
          AND con.conname = ANY($2::text[])
        ORDER BY con.conname`,
      [SCHEMA, ['cq_house_organization_house', 'cq_premises_house_premises', 'cq_category_organization_category', 'pk_organization_contractor']],
    );
    const got = Object.fromEntries(catalog.rows.map((r) => [r.name as string, r.def as string]));
    expect(got['cq_house_organization_house']).toBe('UNIQUE (organization_id, house_id)');
    expect(got['cq_premises_house_premises']).toBe('UNIQUE (house_id, premises_id)');
    expect(got['cq_category_organization_category']).toBe('UNIQUE (organization_id, category_id)');
    expect(got['pk_organization_contractor']).toBe('PRIMARY KEY (organization_id, contractor_id)');

    await acceptInsert(
      client,
      `INSERT INTO organization_contractor (organization_id, contractor_id, active, created_at) VALUES ($1, $2, true, now())`,
      [ORG, CONTRACTOR],
    );
    await expectConstraintViolation(
      client,
      `INSERT INTO organization_contractor (organization_id, contractor_id, active, created_at) VALUES ($1, $2, true, now())`,
      [ORG, CONTRACTOR],
      '23505',
      'pk_organization_contractor',
    );

    client.release();
  } finally {
    await db.destroy();
  }
}, 60000);