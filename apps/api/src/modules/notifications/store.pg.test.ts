import { randomBytes } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/load-config.js';
import { PostgresNotificationStore } from './store.js';

const DATABASE_URL = (() => {
  try {
    const config = loadConfig();
    return config.APP_ENV === 'test' && new URL(config.DATABASE_URL).pathname.endsWith('_tg019_test')
      ? config.DATABASE_URL : undefined;
  } catch { return undefined; }
})();
const SCHEMA = `tg019_notification_${randomBytes(6).toString('hex')}`;
const uuid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = {
  org: uuid(1), house: uuid(2), premises: uuid(3), category: uuid(4),
  user: uuid(10), maxIdentity: uuid(20), contractor: uuid(30),
  caseId: uuid(100), iteration: uuid(110), selection: uuid(120),
  assignment: uuid(130), result: uuid(140), command: uuid(170), event: uuid(180),
  intent: uuid(400), token1: uuid(410), token2: uuid(411), token3: uuid(412),
};

describe.skipIf(!DATABASE_URL)('TG-019 notification store with real PostgreSQL', () => {
  let pool: Pool;
  let db: Kysely<import('@max-smart-city/db').Database>;
  let store: PostgresNotificationStore;

  beforeAll(async () => {
    const parsed = new URL(DATABASE_URL!);
    if (!decodeURIComponent(parsed.pathname).endsWith('_tg019_test')) throw new Error('UNSAFE_TEST_DATABASE');
    const admin = new Pool({ connectionString: DATABASE_URL, max: 1 });
    try {
      const actual = await admin.query('SELECT current_database() AS db');
      if (!String(actual.rows[0].db).endsWith('_tg019_test')) throw new Error('UNSAFE_TEST_DATABASE');
      await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    } finally {
      await admin.end();
    }
    pool = new Pool({ connectionString: DATABASE_URL, max: 6, options: `-c search_path=${SCHEMA}` });
    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    for (const name of ['0001_foundation', '0002_case_workflow', '0003_operational_persistence']) {
      const moduleUrl = new URL(`../../../../../packages/db/migrations/${name}.ts`, import.meta.url);
      const migration = await import(moduleUrl.href) as { up(db: Kysely<import('@max-smart-city/db').Database>): Promise<void> };
      await migration.up(db);
    }
    store = new PostgresNotificationStore(pool);

    await pool.query(`INSERT INTO organization VALUES ($1, 'Org', true, now(), now())`, [ids.org]);
    await pool.query(`INSERT INTO house VALUES ($1, $2, 'Address', NULL, true, now(), now())`, [ids.house, ids.org]);
    await pool.query(`INSERT INTO premises VALUES ($1, $2, '1', true, now(), now())`, [ids.premises, ids.house]);
    await pool.query(`INSERT INTO category (category_id, organization_id, name, requires_premises_access, result_requirement, active, config_revision, created_at, updated_at) VALUES ($1, $2, 'Category', true, 'PHOTO', true, 1, now(), now())`, [ids.category, ids.org]);
    await pool.query(`INSERT INTO app_user VALUES ($1, 'Resident', false, true, now(), now())`, [ids.user]);
    await pool.query(`INSERT INTO max_identity VALUES ($1, 'mini-1', 'chat-1', 'private', 'bot-1', 'LINKED_CONFIRMED', $2, now(), now(), now())`, [ids.maxIdentity, ids.user]);
    await pool.query(`INSERT INTO contractor VALUES ($1, 'Contractor', true, now(), now())`, [ids.contractor]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'Case', now(), now(), $5, 'Category', true, 'PHOTO', 'Address', '1', 'CREATED', $7, 1, 0)`, [ids.caseId, ids.org, ids.house, ids.premises, ids.user, ids.category, ids.iteration]);
      await client.query(`INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [ids.iteration, ids.caseId, ids.user]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await pool.query(`INSERT INTO contractor_selection (selection_id, case_id, created_iteration_id, contractor_id, selected_by_user_id, selected_at, selection_no) VALUES ($1, $2, $3, $4, $5, now(), 1)`, [ids.selection, ids.caseId, ids.iteration, ids.contractor, ids.user]);
    await pool.query(`INSERT INTO assignment (assignment_id, case_id, selection_id, contractor_id, created_iteration_id, assignment_no, sent_by_user_id, sent_at, decision_status, accepted_at, accepted_by_user_id) VALUES ($1, $2, $3, $4, $5, 1, $6, now(), 'ACCEPTED', now(), $6)`, [ids.assignment, ids.caseId, ids.selection, ids.contractor, ids.iteration, ids.user]);
    await pool.query(`INSERT INTO result (result_id, case_id, iteration_id, assignment_id, contractor_id, author_user_id, description, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, 'Result', now())`, [ids.result, ids.caseId, ids.iteration, ids.assignment, ids.contractor, ids.user]);
    await pool.query(`INSERT INTO command_execution (command_id, principal_type, app_user_id, idempotency_key, command_type, case_id, request_hash, execution_status, http_status, response_body, created_at, completed_at) VALUES ($1, 'APP_USER', $2, 'seed-1', 'SEED', $3, repeat('a', 64), 'SUCCEEDED', 200, '{}'::jsonb, now(), now())`, [ids.command, ids.user, ids.caseId]);
    await pool.query(`INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, iteration_id, result_id, description, command_id) VALUES ($1, $2, 1, 'EVT_008', now(), $3, $4, 'Result ready', $5)`, [ids.event, ids.caseId, ids.iteration, ids.result, ids.command]);
    await pool.query(`INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, next_attempt_at, created_at) VALUES ($1, $2, $3, $4, 'chat-1', 'private', 'RESULT_READY', 'result-ready-1', '{}'::jsonb, 'PENDING', now() - interval '1 minute', now())`, [ids.intent, ids.caseId, ids.result, ids.maxIdentity]);
  }, 60000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (DATABASE_URL) {
      const admin = new Pool({ connectionString: DATABASE_URL, max: 1 });
      try { await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); }
      finally { await admin.end(); }
    }
  });

  it('atomically claims once, requires current token and reclaims expired lease', async () => {
    const at = new Date();
    const options = { claimedAt: at, leaseExpiresAt: new Date(at.getTime() + 5000), maxAttempts: 3 };
    const claims = await Promise.all([
      store.claimNext({ ...options, claimToken: ids.token1 }),
      store.claimNext({ ...options, claimToken: ids.token2 }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    expect(first).toMatchObject({ notification_intent_id: ids.intent, status: 'CLAIMED', attempt_count: 1 });
    const oldToken = first.claim_token!;
    expect(await store.markDelivered(ids.intent, ids.token3, at, 'wrong')).toBeUndefined();

    const reclaimed = await store.claimNext({ claimToken: ids.token3,
      claimedAt: new Date(at.getTime() + 5001), leaseExpiresAt: new Date(at.getTime() + 10001), maxAttempts: 3 });
    expect(reclaimed).toMatchObject({ notification_intent_id: ids.intent, attempt_count: 2, claim_token: ids.token3 });
    expect(await store.markDelivered(ids.intent, oldToken, at, 'late')).toBeUndefined();
    const retry = await store.scheduleRetry(ids.intent, ids.token3, new Date(at.getTime() + 20000), {
      code: 'MAX_HTTP_429', message: 'MAX notification delivery failed',
    });
    expect(retry).toMatchObject({ status: 'RETRY', attempt_count: 2, last_error_code: 'MAX_HTTP_429' });
  });

  it('recovers exhausted claim without send, redrives same intent, and preserves business rows', async () => {
    const at = new Date();
    const last = await store.claimNext({ claimToken: ids.token1,
      claimedAt: new Date(at.getTime() + 20001), leaseExpiresAt: new Date(at.getTime() + 25001), maxAttempts: 3 });
    expect(last).toMatchObject({ status: 'CLAIMED', attempt_count: 3 });
    const exhausted = await store.recoverExpiredExhausted(new Date(at.getTime() + 25002), 3);
    expect(exhausted).toMatchObject({ status: 'PERMANENT_FAILURE', last_error_code: 'ATTEMPTS_EXHAUSTED' });
    expect(await store.markDelivered(ids.intent, ids.token1, at, 'late')).toBeUndefined();
    const previousLastAttempt = exhausted!.last_attempt_at;
    const redriven = await store.redrive(ids.intent, new Date(at.getTime() + 30000));
    expect(redriven).toMatchObject({ previousAttemptCount: 3, intent: {
      notification_intent_id: ids.intent, status: 'RETRY', attempt_count: 0, operational_redrive_count: 1,
      last_attempt_at: previousLastAttempt,
    } });
    expect(await store.redrive(ids.intent, at)).toBeUndefined();
    const next = await store.claimNext({ claimToken: ids.token2,
      claimedAt: new Date(at.getTime() + 30001), leaseExpiresAt: new Date(at.getTime() + 35001), maxAttempts: 3 });
    expect(next).toMatchObject({ notification_intent_id: ids.intent, status: 'CLAIMED', attempt_count: 1 });
    expect(await store.markDelivered(ids.intent, ids.token2, new Date(at.getTime() + 30002), 'mid.1'))
      .toMatchObject({ status: 'DELIVERED', provider_message_id: 'mid.1' });
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM result) AS results,
      (SELECT count(*)::int FROM case_event WHERE event_type = 'EVT_008') AS events,
      (SELECT count(*)::int FROM notification_intent) AS intents`);
    expect(counts.rows[0]).toEqual({ results: 1, events: 1, intents: 1 });
  });
});
