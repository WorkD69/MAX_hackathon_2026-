import { createHash } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { expect, test } from 'vitest';
import { createOperationalRepositories, migrateToLatest, rollbackAll } from './index.js';

const DATABASE_URL = process.env.TG007_TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('MISSING_TG007_TEST_DATABASE_URL');

const parsed = new URL(DATABASE_URL);
const DB_NAME = decodeURIComponent(parsed.pathname.slice(1));
const SCHEMA = 'tg007_operational';

const uuid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = {
  org: uuid(1), house: uuid(2), premises: uuid(3), category: uuid(4),
  user1: uuid(10), user2: uuid(11), max1: uuid(20), max2: uuid(21), contractor: uuid(30),
  case1: uuid(100), case2: uuid(101), iteration1: uuid(110), iteration2: uuid(111),
  selection1: uuid(120), selection2: uuid(121), assignment1: uuid(130), assignment2: uuid(131),
  result1: uuid(140), result2: uuid(141), feedback1: uuid(150), comment1: uuid(160),
  seedCommand1: uuid(170), seedCommand2: uuid(171), event1: uuid(180), event2: uuid(181),
};

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

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function resetSchema(): Promise<void> {
  const pool = new Pool(cfg('public', 1));
  try {
    const current = await pool.query('SELECT current_database() AS db');
    if (!String(current.rows[0].db).endsWith('_tg007_test')) throw new Error('UNSAFE_TEST_DATABASE');
    await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdent(SCHEMA)} CASCADE`);
    await pool.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
  } finally {
    await pool.end();
  }
}

async function createHarness() {
  await resetSchema();
  const pool = new Pool(cfg(SCHEMA, 6));
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  await migrateToLatest(db);
  return { pool, db };
}

async function expectDbError(
  client: Pool | PoolClient,
  statement: string,
  params: unknown[],
  code: string,
  marker: string,
): Promise<void> {
  try {
    await client.query(statement, params);
    throw new Error('EXPECTED_DATABASE_ERROR');
  } catch (error) {
    const dbError = error as { code?: string; constraint?: string; message?: string };
    expect(dbError.code).toBe(code);
    expect(`${dbError.constraint ?? ''} ${dbError.message ?? ''}`).toContain(marker);
  }
}

async function seedBusinessGraph(pool: Pool): Promise<void> {
  await pool.query(`INSERT INTO organization VALUES ($1, 'Org', true, now(), now())`, [ids.org]);
  await pool.query(`INSERT INTO house VALUES ($1, $2, 'Address', NULL, true, now(), now())`, [ids.house, ids.org]);
  await pool.query(`INSERT INTO premises VALUES ($1, $2, '1', true, now(), now())`, [ids.premises, ids.house]);
  await pool.query(`INSERT INTO category (category_id, organization_id, name, requires_premises_access, result_requirement, active, config_revision, created_at, updated_at) VALUES ($1, $2, 'Category', true, 'PHOTO', true, 1, now(), now())`, [ids.category, ids.org]);
  await pool.query(`INSERT INTO app_user VALUES ($1, 'User 1', false, true, now(), now()), ($2, 'User 2', false, true, now(), now())`, [ids.user1, ids.user2]);
  await pool.query(`INSERT INTO max_identity VALUES ($1, 'mini-1', 'chat-1', 'private', 'bot-1', 'LINKED_CONFIRMED', $3, now(), now(), now()), ($2, 'mini-2', 'chat-2', 'private', 'bot-2', 'LINKED_CONFIRMED', $4, now(), now(), now())`, [ids.max1, ids.max2, ids.user1, ids.user2]);
  await pool.query(`INSERT INTO contractor VALUES ($1, 'Contractor', true, now(), now())`, [ids.contractor]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [caseId, iterationId, resident] of [[ids.case1, ids.iteration1, ids.user1], [ids.case2, ids.iteration2, ids.user2]]) {
      await client.query(`INSERT INTO case_table (case_id, organization_id, house_id, premises_id, resident_user_id, category_id, description, created_at, updated_at, created_by_user_id, category_name_snapshot, requires_access_snapshot, result_requirement_snapshot, house_address_snapshot, premises_label_snapshot, current_state, current_iteration_id, revision, last_event_seq) VALUES ($1, $2, $3, $4, $5, $6, 'Case', now(), now(), $5, 'Category', true, 'PHOTO', 'Address', '1', 'CREATED', $7, 1, 0)`, [caseId, ids.org, ids.house, ids.premises, resident, ids.category, iterationId]);
      await client.query(`INSERT INTO case_iteration (iteration_id, case_id, iteration_no, start_reason, started_at, started_by_user_id) VALUES ($1, $2, 1, 'INITIAL', now(), $3)`, [iterationId, caseId, resident]);
    }
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  const branches = [
    [ids.case1, ids.iteration1, ids.selection1, ids.assignment1, ids.result1, ids.user1],
    [ids.case2, ids.iteration2, ids.selection2, ids.assignment2, ids.result2, ids.user2],
  ];
  for (const [caseId, iterationId, selectionId, assignmentId, resultId, userId] of branches) {
    await pool.query(`INSERT INTO contractor_selection (selection_id, case_id, created_iteration_id, contractor_id, selected_by_user_id, selected_at, selection_no) VALUES ($1, $2, $3, $4, $5, now(), 1)`, [selectionId, caseId, iterationId, ids.contractor, userId]);
    await pool.query(`INSERT INTO assignment (assignment_id, case_id, selection_id, contractor_id, created_iteration_id, assignment_no, sent_by_user_id, sent_at, decision_status, accepted_at, accepted_by_user_id) VALUES ($1, $2, $3, $4, $5, 1, $6, now(), 'ACCEPTED', now(), $6)`, [assignmentId, caseId, selectionId, ids.contractor, iterationId, userId]);
    await pool.query(`INSERT INTO result (result_id, case_id, iteration_id, assignment_id, contractor_id, author_user_id, description, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, 'Result', now())`, [resultId, caseId, iterationId, assignmentId, ids.contractor, userId]);
  }
  await pool.query(`INSERT INTO resident_feedback (feedback_id, case_id, iteration_id, result_id, resident_user_id, type, remark_text, created_at) VALUES ($1, $2, $3, $4, $5, 'CONFIRMATION', NULL, now())`, [ids.feedback1, ids.case1, ids.iteration1, ids.result1, ids.user1]);
  await pool.query(`INSERT INTO comment (comment_id, case_id, iteration_id, author_user_id, actor_role_snapshot, comment_kind, body, created_at) VALUES ($1, $2, $3, $4, 'RESIDENT', 'WORKING', 'Comment', now())`, [ids.comment1, ids.case1, ids.iteration1, ids.user1]);
  await pool.query(`INSERT INTO command_execution (command_id, principal_type, app_user_id, idempotency_key, command_type, case_id, request_hash, execution_status, http_status, response_body, created_at, completed_at) VALUES ($1, 'APP_USER', $2, 'seed-1', 'SEED', $3, repeat('a', 64), 'SUCCEEDED', 200, '{}'::jsonb, now(), now()), ($4, 'APP_USER', $5, 'seed-2', 'SEED', $6, repeat('b', 64), 'SUCCEEDED', 200, '{}'::jsonb, now(), now())`, [ids.seedCommand1, ids.user1, ids.case1, ids.seedCommand2, ids.user2, ids.case2]);
  await pool.query(`INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, iteration_id, description, command_id) VALUES ($1, $2, 1, 'EVT_001', now(), $3, 'Event 1', $4), ($5, $6, 1, 'EVT_001', now(), $7, 'Event 2', $8)`, [ids.event1, ids.case1, ids.iteration1, ids.seedCommand1, ids.event2, ids.case2, ids.iteration2, ids.seedCommand2]);
}

test('clean migrations through TG-007, catalog, rollback and re-up', async () => {
  const { pool, db } = await createHarness();
  try {
    const tables = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename NOT LIKE 'kysely_migration%' ORDER BY tablename`, [SCHEMA]);
    expect(tables.rows.map((row) => row.tablename)).toHaveLength(30);
    for (const table of ['attachment', 'command_execution', 'notification_intent', 'configuration_change']) {
      expect(tables.rows.map((row) => row.tablename)).toContain(table);
    }
    const catalog = await pool.query(`SELECT conname FROM pg_constraint WHERE connamespace = to_regnamespace($1)`, [SCHEMA]);
    const names = catalog.rows.map((row) => row.conname);
    for (const constraint of [
      'fk_event_command_id', 'fk_event_attachment_id', 'uq_notification_intent_dedupe_key',
      'uq_notification_intent_result_kind', 'ck_notification_intent_status_shape',
      'fk_configuration_change_command', 'cq_attachment_case_attachment',
    ]) expect(names).toContain(constraint);
    const indexes = await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = $1`, [SCHEMA]);
    const indexNames = indexes.rows.map((row) => row.indexname);
    expect(indexNames).toContain('uq_command_execution_app_user_key');
    expect(indexNames).toContain('uq_command_execution_max_identity_key');

    await rollbackAll(db);
    const empty = await pool.query(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = $1 AND tablename NOT LIKE 'kysely_migration%'`, [SCHEMA]);
    expect(empty.rows[0].count).toBe(0);
    await migrateToLatest(db);
    const migrations = await pool.query(`SELECT count(*)::int AS count FROM kysely_migration`);
    expect(migrations.rows[0].count).toBe(3);
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}, 60000);

test('Attachment typed links enforce same Case, byte hash persistence and association immutability', async () => {
  const { pool, db } = await createHarness();
  try {
    await seedBusinessGraph(pool);
    const content = Buffer.from('authoritative bytes');
    const hash = createHash('sha256').update(content).digest('hex');
    const attachmentId = uuid(200);
    await pool.query(`INSERT INTO attachment VALUES ($1, $2, $3, 'proof.jpg', 'image/jpeg', $4, $5, $6, now())`, [attachmentId, ids.case1, ids.user1, content.length, hash, content]);
    await pool.query(`INSERT INTO case_initial_attachment VALUES ($1, $2)`, [ids.case1, attachmentId]);
    const stored = await pool.query(`SELECT file_name, mime_type, byte_size::int AS byte_size, sha256, content FROM attachment WHERE attachment_id = $1`, [attachmentId]);
    expect(stored.rows[0]).toMatchObject({ file_name: 'proof.jpg', mime_type: 'image/jpeg', byte_size: content.length, sha256: hash });
    expect(Buffer.compare(stored.rows[0].content, content)).toBe(0);

    await expectDbError(pool, `INSERT INTO case_initial_attachment VALUES ($1, $2)`, [ids.case2, attachmentId], '23503', 'fk_case_initial_attachment_attachment');
    const workAttachmentId = uuid(201);
    const feedbackAttachmentId = uuid(202);
    const commentAttachmentId = uuid(203);
    for (const id of [workAttachmentId, feedbackAttachmentId, commentAttachmentId]) {
      await pool.query(`INSERT INTO attachment VALUES ($1, $2, $3, 'typed.bin', 'application/octet-stream', $4, $5, $6, now())`, [id, ids.case1, ids.user1, content.length, hash, content]);
    }
    const materialEventId = uuid(204);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO work_material_attachment VALUES ($1,$2,$3,$4,$5)`, [ids.case1, ids.iteration1, ids.assignment1, workAttachmentId, materialEventId]);
      await client.query(`INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, iteration_id, assignment_id, attachment_id, description, command_id) VALUES ($1,$2,2,'EVT_009',now(),$3,$4,$5,'Material added',$6)`, [materialEventId, ids.case1, ids.iteration1, ids.assignment1, workAttachmentId, ids.seedCommand1]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await pool.query(`INSERT INTO result_attachment VALUES ($1,$2,$3)`, [ids.case1, ids.result1, workAttachmentId]);
    await pool.query(`INSERT INTO feedback_attachment VALUES ($1,$2,$3)`, [ids.case1, ids.feedback1, feedbackAttachmentId]);
    await pool.query(`INSERT INTO comment_attachment VALUES ($1,$2,$3)`, [ids.case1, ids.comment1, commentAttachmentId]);
    expect((await pool.query(`SELECT count(*)::int AS count FROM work_material_attachment`)).rows[0].count).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM result_attachment`)).rows[0].count).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM feedback_attachment`)).rows[0].count).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM comment_attachment`)).rows[0].count).toBe(1);
    await expectDbError(pool, `INSERT INTO work_material_attachment VALUES ($1,$2,$3,$4,$5)`, [ids.case2, ids.iteration2, ids.assignment2, feedbackAttachmentId, ids.event2], '23503', 'fk_work_material_attachment_attachment');
    await expectDbError(pool, `INSERT INTO result_attachment VALUES ($1,$2,$3)`, [ids.case2, ids.result2, feedbackAttachmentId], '23503', 'fk_result_attachment_attachment');
    await expectDbError(pool, `INSERT INTO feedback_attachment VALUES ($1,$2,$3)`, [ids.case2, ids.feedback1, commentAttachmentId], '23503', 'fk_feedback_attachment_feedback');
    await expectDbError(pool, `INSERT INTO comment_attachment VALUES ($1,$2,$3)`, [ids.case2, ids.comment1, feedbackAttachmentId], '23503', 'fk_comment_attachment_comment');
    const mutations: Array<[string, unknown[]]> = [
      [`UPDATE attachment SET file_name = 'changed.jpg' WHERE attachment_id = $1`, [attachmentId]],
      [`UPDATE attachment SET mime_type = 'application/octet-stream' WHERE attachment_id = $1`, [attachmentId]],
      [`UPDATE attachment SET sha256 = repeat('0', 64) WHERE attachment_id = $1`, [attachmentId]],
      [`UPDATE attachment SET content = $2, byte_size = $3 WHERE attachment_id = $1`, [attachmentId, Buffer.from('changed'), 7]],
      [`DELETE FROM attachment WHERE attachment_id = $1`, [attachmentId]],
    ];
    for (const [statement, params] of mutations) {
      await expectDbError(pool, statement, params, 'P0001', 'tg007_attachment_immutable');
      const unchanged = await pool.query(`SELECT file_name, mime_type, byte_size::int AS byte_size, sha256, content FROM attachment WHERE attachment_id = $1`, [attachmentId]);
      expect(unchanged.rows[0].file_name).toBe('proof.jpg');
      expect(unchanged.rows[0].mime_type).toBe('image/jpeg');
      expect(unchanged.rows[0].byte_size).toBe(content.length);
      expect(unchanged.rows[0].sha256).toBe(hash);
      expect(Buffer.compare(unchanged.rows[0].content, content)).toBe(0);
    }
    await expectDbError(pool, `DELETE FROM case_initial_attachment WHERE attachment_id = $1`, [attachmentId], 'P0001', 'tg007_append_only');
    await expectDbError(pool, `UPDATE case_initial_attachment SET case_id = $2 WHERE attachment_id = $1`, [attachmentId, ids.case2], 'P0001', 'tg007_append_only');
    expect((await pool.query(`SELECT count(*)::int AS count FROM case_initial_attachment WHERE attachment_id = $1`, [attachmentId])).rows[0].count).toBe(1);
  } finally {
    await db.destroy();
  }
}, 60000);

test('CommandExecution reservation, discriminated uniqueness, success transition and immutable canonical response', async () => {
  const { pool, db } = await createHarness();
  try {
    await seedBusinessGraph(pool);
    const command = uuid(300);
    await pool.query(`INSERT INTO command_execution (command_id, principal_type, app_user_id, idempotency_key, command_type, case_id, request_hash, execution_status, created_at) VALUES ($1, 'APP_USER', $2, 'same-key', 'ACCEPT_CASE', $3, repeat('c', 64), 'IN_PROGRESS', now())`, [command, ids.user1, ids.case1]);
    await pool.query(`INSERT INTO command_execution (command_id, principal_type, app_user_id, idempotency_key, command_type, request_hash, execution_status, created_at) VALUES ($1, 'APP_USER', $2, 'same-key', 'OTHER', repeat('d', 64), 'IN_PROGRESS', now())`, [uuid(301), ids.user2]);
    await pool.query(`INSERT INTO command_execution (command_id, principal_type, max_identity_id, idempotency_key, command_type, request_hash, execution_status, created_at) VALUES ($1, 'MAX_IDENTITY', $2, 'same-key', 'DEMO', repeat('e', 64), 'IN_PROGRESS', now())`, [uuid(302), ids.max1]);
    await expectDbError(pool, `INSERT INTO command_execution (command_id, principal_type, app_user_id, idempotency_key, command_type, request_hash, execution_status, created_at) VALUES ($1, 'APP_USER', $2, 'same-key', 'DUP', repeat('f', 64), 'IN_PROGRESS', now())`, [uuid(303), ids.user1], '23505', 'uq_command_execution_app_user_key');
    await expectDbError(pool, `INSERT INTO command_execution (command_id, principal_type, app_user_id, max_identity_id, idempotency_key, command_type, request_hash, execution_status, created_at) VALUES ($1, 'APP_USER', $2, $3, 'bad', 'BAD', repeat('0', 64), 'IN_PROGRESS', now())`, [uuid(304), ids.user1, ids.max1], '23514', 'ck_command_execution_principal_shape');

    for (const statement of [
      `UPDATE command_execution SET idempotency_key = 'changed' WHERE command_id = $1`,
      `UPDATE command_execution SET request_hash = repeat('1', 64) WHERE command_id = $1`,
      `UPDATE command_execution SET command_type = 'CHANGED' WHERE command_id = $1`,
      `UPDATE command_execution SET case_id = NULL WHERE command_id = $1`,
      `UPDATE command_execution SET app_user_id = '${ids.user2}' WHERE command_id = $1`,
      `UPDATE command_execution SET principal_type = 'MAX_IDENTITY', app_user_id = NULL, max_identity_id = '${ids.max1}' WHERE command_id = $1`,
      `UPDATE command_execution SET command_id = '${uuid(399)}' WHERE command_id = $1`,
    ]) {
      await expectDbError(pool, statement, [command], 'P0001', 'tg007_command_execution_immutable');
      const unchanged = await pool.query(`SELECT idempotency_key, request_hash, command_type, case_id, execution_status FROM command_execution WHERE command_id = $1`, [command]);
      expect(unchanged.rows[0]).toMatchObject({ idempotency_key: 'same-key', request_hash: 'c'.repeat(64), command_type: 'ACCEPT_CASE', case_id: ids.case1, execution_status: 'IN_PROGRESS' });
    }

    const response = { command_id: command, revision: 2 };
    await pool.query(`UPDATE command_execution SET execution_status = 'SUCCEEDED', http_status = 200, response_body = $2::jsonb, completed_at = now() WHERE command_id = $1`, [command, JSON.stringify(response)]);
    const succeeded = await pool.query(`SELECT execution_status, http_status, response_body, completed_at FROM command_execution WHERE command_id = $1`, [command]);
    expect(succeeded.rows[0].execution_status).toBe('SUCCEEDED');
    expect(succeeded.rows[0].http_status).toBe(200);
    expect(succeeded.rows[0].response_body).toEqual(response);
    expect(succeeded.rows[0].completed_at).not.toBeNull();

    for (const statement of [
      `UPDATE command_execution SET response_body = '{"changed":true}'::jsonb WHERE command_id = $1`,
      `UPDATE command_execution SET execution_status = 'SUCCEEDED' WHERE command_id = $1`,
      `DELETE FROM command_execution WHERE command_id = $1`,
    ]) {
      await expectDbError(pool, statement, [command], 'P0001', 'tg007_command_execution');
      const unchanged = await pool.query(`SELECT execution_status, http_status, response_body, completed_at FROM command_execution WHERE command_id = $1`, [command]);
      expect(unchanged.rows[0].execution_status).toBe('SUCCEEDED');
      expect(unchanged.rows[0].http_status).toBe(200);
      expect(unchanged.rows[0].response_body).toEqual(response);
      expect(unchanged.rows[0].completed_at.toISOString()).toBe(succeeded.rows[0].completed_at.toISOString());
    }
  } finally {
    await db.destroy();
  }
}, 60000);

test('NotificationIntent validates status/lease shape, dedupe, claim token, expired reclaim and same-row redrive', async () => {
  const { pool, db } = await createHarness();
  try {
    await seedBusinessGraph(pool);
    const repos = createOperationalRepositories(db);
    const now = new Date();
    const intent1 = uuid(400);
    await repos.notificationIntents.create({
      notification_intent_id: intent1, case_id: ids.case1, result_id: ids.result1,
      recipient_max_identity_id: ids.max1, delivery_chat_id: 'chat-1', delivery_chat_type: 'private',
      notification_kind: 'RESULT_READY', dedupe_key: 'result-ready-1', payload: { result_id: ids.result1 },
      status: 'PENDING', next_attempt_at: new Date(now.getTime() - 1000), last_attempt_at: null,
      claim_token: null, claimed_at: null, lease_expires_at: null, delivered_at: null,
      provider_message_id: null, last_error_code: null, last_error_message: null, created_at: now,
    });
    await expectDbError(pool, `INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, next_attempt_at, created_at) VALUES ($1,$2,$3,$4,'chat','private','RESULT_READY','bad-shape','{}','PENDING',NULL,now())`, [uuid(401), ids.case2, ids.result2, ids.max2], '23514', 'ck_notification_intent_status_shape');
    await expectDbError(pool, `INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, next_attempt_at, created_at) VALUES ($1,$2,$3,$4,'chat','private','RESULT_READY','bad-status','{}','UNKNOWN',now(),now())`, [uuid(404), ids.case2, ids.result2, ids.max2], '23514', 'ck_notification_intent_status');
    await expectDbError(pool, `INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, attempt_count, claim_token, claimed_at, lease_expires_at, created_at) VALUES ($1,$2,$3,$4,'chat','private','RESULT_READY','bad-lease','{}','CLAIMED',1,$5,now(),now(),now())`, [uuid(405), ids.case2, ids.result2, ids.max2, uuid(406)], '23514', 'ck_notification_intent_lease');
    await expectDbError(pool, `INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, attempt_count, next_attempt_at, created_at) VALUES ($1,$2,$3,$4,'chat','private','RESULT_READY','bad-counter','{}','PENDING',-1,now(),now())`, [uuid(407), ids.case2, ids.result2, ids.max2], '23514', 'ck_notification_intent_counters');
    await expectDbError(pool, `INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, next_attempt_at, created_at) VALUES ($1,$2,$3,$4,'chat','private','RESULT_READY','result-ready-1','{}','PENDING',now(),now())`, [uuid(402), ids.case2, ids.result2, ids.max2], '23505', 'uq_notification_intent_dedupe_key');
    await expectDbError(pool, `INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, next_attempt_at, created_at) VALUES ($1,$2,$3,$4,'chat','private','RESULT_READY','other-key','{}','PENDING',now(),now())`, [uuid(403), ids.case1, ids.result1, ids.max1], '23505', 'uq_notification_intent_result_kind');

    const token1 = uuid(410);
    const claimed = await repos.notificationIntents.claimNext({ claimToken: token1, claimedAt: now, leaseExpiresAt: new Date(now.getTime() + 60_000) });
    expect(claimed).toMatchObject({ notification_intent_id: intent1, status: 'CLAIMED', claim_token: token1, attempt_count: 1 });
    expect(await repos.notificationIntents.markDelivered(intent1, uuid(999), new Date(), 'wrong')).toBeUndefined();
    const stillClaimed = await pool.query(`SELECT status, claim_token, attempt_count FROM notification_intent WHERE notification_intent_id = $1`, [intent1]);
    expect(stillClaimed.rows[0]).toMatchObject({ status: 'CLAIMED', claim_token: token1, attempt_count: 1 });
    await repos.notificationIntents.scheduleRetry(intent1, token1, new Date(now.getTime() + 3_600_000), { code: 'TEMP', message: 'temporary' });

    const expiredIntent = uuid(420);
    const expiredToken = uuid(421);
    await pool.query(`INSERT INTO notification_intent (notification_intent_id, case_id, result_id, recipient_max_identity_id, delivery_chat_id, delivery_chat_type, notification_kind, dedupe_key, payload, status, attempt_count, next_attempt_at, last_attempt_at, claim_token, claimed_at, lease_expires_at, created_at) VALUES ($1,$2,$3,$4,'chat-2','private','RESULT_READY','result-ready-2','{}','CLAIMED',1,NULL,$5,$6,$5,$7,$5)`, [expiredIntent, ids.case2, ids.result2, ids.max2, new Date(now.getTime() - 120_000), expiredToken, new Date(now.getTime() - 60_000)]);
    const token2 = uuid(422);
    const reclaimed = await repos.notificationIntents.claimNext({ claimToken: token2, claimedAt: now, leaseExpiresAt: new Date(now.getTime() + 60_000) });
    expect(reclaimed).toMatchObject({ notification_intent_id: expiredIntent, status: 'CLAIMED', claim_token: token2, attempt_count: 2 });
    const failed = await repos.notificationIntents.markPermanentFailure(expiredIntent, token2, { code: 'AUTH', message: 'broken token' });
    expect(failed).toMatchObject({ status: 'PERMANENT_FAILURE', notification_intent_id: expiredIntent });
    const redriven = await repos.notificationIntents.redrive(expiredIntent, new Date(now.getTime() + 1000));
    expect(redriven).toMatchObject({ status: 'RETRY', notification_intent_id: expiredIntent, operational_redrive_count: 1, last_error_code: null, last_error_message: null });
    expect((await pool.query(`SELECT count(*)::int AS count FROM notification_intent WHERE notification_intent_id = $1`, [expiredIntent])).rows[0].count).toBe(1);
  } finally {
    await db.destroy();
  }
}, 60000);

test('ConfigurationChange is append-only and CaseEvent operational references are valid and same-Case', async () => {
  const { pool, db } = await createHarness();
  try {
    await seedBusinessGraph(pool);
    const changeId = uuid(500);
    await pool.query(`INSERT INTO configuration_change VALUES ($1,$2,'CATEGORY',$3,'UPDATE','{"active":false}'::jsonb,'{"active":true}'::jsonb,$4,now(),$5)`, [changeId, ids.org, ids.category, ids.user1, ids.seedCommand1]);
    await expectDbError(pool, `INSERT INTO configuration_change VALUES ($1,$2,'CATEGORY',$3,'UPDATE',NULL,'{}',$4,now(),$5)`, [uuid(501), uuid(9991), ids.category, ids.user1, ids.seedCommand1], '23503', 'fk_configuration_change_organization');
    await expectDbError(pool, `INSERT INTO configuration_change VALUES ($1,$2,'CATEGORY',$3,'UPDATE',NULL,'{}',$4,now(),$5)`, [uuid(503), ids.org, ids.category, uuid(9995), ids.seedCommand1], '23503', 'fk_configuration_change_actor');
    await expectDbError(pool, `INSERT INTO configuration_change VALUES ($1,$2,'CATEGORY',$3,'UPDATE',NULL,'{}',$4,now(),$5)`, [uuid(502), ids.org, ids.category, ids.user1, uuid(9992)], '23503', 'fk_configuration_change_command');
    for (const statement of [
      `UPDATE configuration_change SET action = 'DELETE' WHERE config_change_id = $1`,
      `DELETE FROM configuration_change WHERE config_change_id = $1`,
    ]) {
      await expectDbError(pool, statement, [changeId], 'P0001', 'tg007_append_only');
      const unchanged = await pool.query(`SELECT action, before_data, after_data FROM configuration_change WHERE config_change_id = $1`, [changeId]);
      expect(unchanged.rows[0]).toEqual({ action: 'UPDATE', before_data: { active: false }, after_data: { active: true } });
    }

    await expectDbError(pool, `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, description, command_id) VALUES ($1,$2,2,'EVT_002',now(),'Missing command',$3)`, [uuid(510), ids.case1, uuid(9993)], '23503', 'fk_event_command_id');
    await expectDbError(pool, `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, description, command_id, attachment_id) VALUES ($1,$2,2,'EVT_009',now(),'Missing attachment',$3,$4)`, [uuid(511), ids.case1, ids.seedCommand1, uuid(9994)], '23503', 'fk_event_attachment_id');
    const attachmentId = uuid(520);
    const bytes = Buffer.from('event material');
    const hash = createHash('sha256').update(bytes).digest('hex');
    await pool.query(`INSERT INTO attachment VALUES ($1,$2,$3,'event.bin','application/octet-stream',$4,$5,$6,now())`, [attachmentId, ids.case1, ids.user1, bytes.length, hash, bytes]);
    await pool.query(`INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, description, command_id, attachment_id) VALUES ($1,$2,2,'EVT_009',now(),'Valid',$3,$4)`, [uuid(512), ids.case1, ids.seedCommand1, attachmentId]);
    await expectDbError(pool, `INSERT INTO case_event (event_id, case_id, event_seq, event_type, occurred_at, description, command_id, attachment_id) VALUES ($1,$2,2,'EVT_009',now(),'Cross case',$3,$4)`, [uuid(513), ids.case2, ids.seedCommand2, attachmentId], '23503', 'fk_event_attachment_id');
    expect((await pool.query(`SELECT count(*)::int AS count FROM case_event WHERE attachment_id = $1`, [attachmentId])).rows[0].count).toBe(1);
  } finally {
    await db.destroy();
  }
}, 60000);
