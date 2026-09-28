import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifyOwnedPostgresConnection } from '../../../tests/support/postgres.mjs';
import fastify from 'fastify';
import pino from 'pino';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateToLatest } from '@max-smart-city/db';
import type { Database } from '@max-smart-city/db';
import { loadConfig } from '../src/config/load-config.js';
import { issueSession } from '../src/modules/auth/session-token.js';
import { registerIntakeAssignmentRoutes } from '../src/modules/cases/commands/intake-assignment/index.js';

const { DEMO_IDS, seedDemoCatalog } = await import(new URL(
  '../../../packages/db/src/seed/index.ts', import.meta.url).href) as {
    DEMO_IDS: Record<'resident' | 'residentRole' | 'premises' | 'categoryA' |
      'ukEmployee' | 'ukEmployeeRole' | 'contractorAEmployee' | 'contractorAEmployeeRole' |
      'contractorA' | 'contractorB' | 'contractorBEmployee' | 'contractorBEmployeeRole' |
      'organization' | 'house', string>;
    seedDemoCatalog(pool: Pool): Promise<void>;
  };

const url = process.env.TG013_SEAM_TEST_DATABASE_URL;
if (!url) throw new Error('MISSING_TG013_SEAM_TEST_DATABASE_URL');
const schema = `tg014_${randomUUID().replaceAll('-', '')}`;
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 12 });
const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
const admin = new Pool({ connectionString: url, max: 1 });
const config = loadConfig({ APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: url,
  APP_SESSION_SECRET: 'tg014-secret'.padEnd(40, 'x'), MAX_ADAPTER_MODE: 'live',
  MAX_BOT_TOKEN: 'tg014-bot', MAX_WEBHOOK_SECRET: 'w'.repeat(32),
  PUBLIC_APP_URL: 'http://localhost/', PUBLIC_API_BASE_URL: 'http://localhost/api/v1',
  BUILD_SHA: 'a'.repeat(40) });
const app = fastify({ loggerInstance: pino({ enabled: false }) });
registerIntakeAssignmentRoutes(app, config, { database });
const identityId = randomUUID();
const ukIdentity = randomUUID();
const contractorIdentity = randomUUID();
const contractorBIdentity = randomUUID();
let token: string;
let ukToken: string;
let contractorToken: string;
let contractorBToken: string;
let owned = false;
let created = false;

beforeAll(async () => {
  const receiptPath = process.env.TG013_SEAM_TEST_DATABASE_RECEIPT;
  const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;
  if (!receiptPath || !adminUrl) throw new Error('MISSING_OWNED_TEST_TARGET');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await verifyOwnedPostgresConnection({ adminUrl }, receipt, url!);
  owned = true;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await migrateToLatest(database);
  await seedDemoCatalog(pool);
  await database.insertInto('max_identity').values({ max_identity_id: identityId,
    mini_app_user_id: 'tg014-resident', delivery_chat_id: 'tg014-chat', delivery_chat_type: 'DIALOG',
    bot_user_id: null, link_status: 'LINKED_CONFIRMED', app_user_id: DEMO_IDS.resident,
    first_seen_at: new Date(), last_seen_at: new Date(), linked_at: new Date() }).execute();
  await database.insertInto('max_identity').values([
    { max_identity_id: ukIdentity, mini_app_user_id: 'tg014-uk', delivery_chat_id: 'tg014-uk-chat',
      delivery_chat_type: 'DIALOG', bot_user_id: null, link_status: 'LINKED_CONFIRMED',
      app_user_id: DEMO_IDS.ukEmployee, first_seen_at: new Date(), last_seen_at: new Date(), linked_at: new Date() },
    { max_identity_id: contractorIdentity, mini_app_user_id: 'tg014-contractor', delivery_chat_id: 'tg014-contractor-chat',
      delivery_chat_type: 'DIALOG', bot_user_id: null, link_status: 'LINKED_CONFIRMED',
      app_user_id: DEMO_IDS.contractorAEmployee, first_seen_at: new Date(), last_seen_at: new Date(), linked_at: new Date() },
    { max_identity_id: contractorBIdentity, mini_app_user_id: 'tg014-contractor-b',
      delivery_chat_id: 'tg014-contractor-b-chat', delivery_chat_type: 'DIALOG', bot_user_id: null,
      link_status: 'LINKED_CONFIRMED', app_user_id: DEMO_IDS.contractorBEmployee,
      first_seen_at: new Date(), last_seen_at: new Date(), linked_at: new Date() },
  ]).execute();
  token = issueSession({ max_identity_id: identityId, app_user_id: DEMO_IDS.resident,
    role_binding_id: DEMO_IDS.residentRole, role: 'RESIDENT', demo_mode: false,
    demo_run_id: null, real_display_name: 'Житель' }, config, Math.floor(Date.now() / 1000)).token;
  ukToken = issueSession({ max_identity_id: ukIdentity, app_user_id: DEMO_IDS.ukEmployee,
    role_binding_id: DEMO_IDS.ukEmployeeRole, role: 'UK_EMPLOYEE', demo_mode: false,
    demo_run_id: null, real_display_name: 'УК' }, config, Math.floor(Date.now() / 1000)).token;
  contractorToken = issueSession({ max_identity_id: contractorIdentity, app_user_id: DEMO_IDS.contractorAEmployee,
    role_binding_id: DEMO_IDS.contractorAEmployeeRole, role: 'CONTRACTOR_EMPLOYEE', demo_mode: false,
    demo_run_id: null, real_display_name: 'Подрядчик' }, config, Math.floor(Date.now() / 1000)).token;
  contractorBToken = issueSession({ max_identity_id: contractorBIdentity, app_user_id: DEMO_IDS.contractorBEmployee,
    role_binding_id: DEMO_IDS.contractorBEmployeeRole, role: 'CONTRACTOR_EMPLOYEE', demo_mode: false,
    demo_run_id: null, real_display_name: 'Подрядчик Б' }, config, Math.floor(Date.now() / 1000)).token;
  await app.ready();
}, 60000);

afterAll(async () => {
  await app.close(); await database.destroy();
  if (owned && created) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});

function createBody(description: string, files: { name: string; content: Buffer; mime: string }[] = []) {
  const boundary = `tg014-${randomUUID()}`;
  const chunks = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n` +
    `Content-Type: application/json\r\n\r\n${JSON.stringify({ premises_id: DEMO_IDS.premises,
      category_id: DEMO_IDS.categoryA, description })}\r\n`)];
  for (const file of files) chunks.push(Buffer.from(`--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files[]"; filename="${file.name}"\r\n` +
    `Content-Type: ${file.mime}\r\n\r\n`), file.content, Buffer.from('\r\n'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
function create(description: string, key = randomUUID(), files: { name: string; content: Buffer; mime: string }[] = []) {
  const { body, contentType } = createBody(description, files);
  return app.inject({ method: 'POST', url: '/api/v1/cases', payload: body,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, 'content-type': contentType } });
}
function command(caseId: string, suffix: string, actorToken: string, payload: unknown, key = randomUUID()) {
  return app.inject({ method: 'POST', url: `/api/v1/cases/${caseId}/commands/${suffix}`, payload,
    headers: { authorization: `Bearer ${actorToken}`, 'idempotency-key': key } });
}
async function sentCase(contractorId = DEMO_IDS.contractorA) {
  const created = await create(`Проверка ${randomUUID()}`);
  expect(created.statusCode).toBe(201);
  const caseId = created.json().case_id as string;
  const iterationId = created.json().created.iteration_id as string;
  expect((await command(caseId, 'accept', ukToken, {})).statusCode).toBe(200);
  const selected = await command(caseId, 'select-contractor', ukToken,
    { iteration_id: iterationId, contractor_id: contractorId });
  expect(selected.statusCode).toBe(200);
  const selectionId = selected.json().created.selection_id as string;
  const sent = await command(caseId, 'send-assignment', ukToken,
    { iteration_id: iterationId, selection_id: selectionId });
  expect(sent.statusCode).toBe(200);
  return { caseId, iterationId, selectionId, assignmentId: sent.json().created.assignment_id as string };
}

describe('TG-014 resident intake on real PostgreSQL', () => {
  it('returns current accessible premises without categories until one is selected', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/cases/create-options',
      headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ selected_premises_id: null, categories: [],
      premises: [{ premises_id: DEMO_IDS.premises }] });
  });
  it('creates one Case, iteration and EVT-001 from multipart payload', async () => {
    const boundary = `tg014-${randomUUID()}`;
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({
      premises_id: DEMO_IDS.premises, category_id: DEMO_IDS.categoryA, description: 'Не работает отопление',
    })}\r\n--${boundary}--\r\n`);
    const response = await app.inject({ method: 'POST', url: '/api/v1/cases', payload: body,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(),
        'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ state: 'CREATED', revision: 1,
      created: { iteration_id: expect.any(String) }, event_ids: [expect.any(String)] });
    const caseId = response.json().case_id as string;
    expect(await database.selectFrom('case_iteration').select('iteration_no').where('case_id', '=', caseId).execute())
      .toEqual([{ iteration_no: 1 }]);
    expect((await database.selectFrom('case_event').select('event_type').where('case_id', '=', caseId).execute()))
      .toEqual([{ event_type: 'EVT_001' }]);
  });
  it('accepts, selects, sends and accepts one exact Assignment', async () => {
    const boundary = `tg014-${randomUUID()}`;
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({
      premises_id: DEMO_IDS.premises, category_id: DEMO_IDS.categoryA, description: 'Течь стояка',
    })}\r\n--${boundary}--\r\n`);
    const created = await app.inject({ method: 'POST', url: '/api/v1/cases', payload: body,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(),
        'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(created.statusCode).toBe(201);
    const caseId = created.json().case_id as string;
    const iterationId = created.json().created.iteration_id as string;
    const command = (suffix: string, actorToken: string, payload: unknown, key = randomUUID()) => app.inject({
      method: 'POST', url: `/api/v1/cases/${caseId}/commands/${suffix}`, payload,
      headers: { authorization: `Bearer ${actorToken}`, 'idempotency-key': key },
    });
    const accepted = await command('accept', ukToken, {});
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ state: 'ACCEPTED_BY_UK', revision: 2 });
    const selected = await command('select-contractor', ukToken,
      { contractor_id: DEMO_IDS.contractorA, iteration_id: iterationId });
    expect(selected.statusCode).toBe(200);
    const selectionId = selected.json().created.selection_id as string;
    const sent = await command('send-assignment', ukToken,
      { selection_id: selectionId, iteration_id: iterationId });
    expect(sent.statusCode).toBe(200);
    const assignmentId = sent.json().created.assignment_id as string;
    const decisionKey = randomUUID();
    const acceptedAssignment = await command('accept-assignment', contractorToken,
      { assignment_id: assignmentId }, decisionKey);
    expect(acceptedAssignment.statusCode).toBe(200);
    expect(acceptedAssignment.json()).toMatchObject({ state: 'EXECUTION', revision: 5 });
    const replay = await command('accept-assignment', contractorToken,
      { assignment_id: assignmentId }, decisionKey);
    expect(replay.statusCode, JSON.stringify(replay.json())).toBe(200);
    expect(replay.json()).toEqual(acceptedAssignment.json());
    expect(replay.headers['idempotency-replayed']).toBe('true');
    const row = await database.selectFrom('case_table').selectAll().where('case_id', '=', caseId).executeTakeFirstOrThrow();
    expect(row.current_executor_contractor_id).toBe(DEMO_IDS.contractorA);
    expect((await database.selectFrom('case_event').select('event_type').where('case_id', '=', caseId)
      .orderBy('event_seq').execute()).map(event => event.event_type))
      .toEqual(['EVT_001', 'EVT_002', 'EVT_003', 'EVT_004', 'EVT_005']);
  });
  it('scopes selected options and hides inactive or foreign premises and categories', async () => {
    const get = (premisesId: string) => app.inject({ method: 'GET',
      url: `/api/v1/cases/create-options?premises_id=${premisesId}`,
      headers: { authorization: `Bearer ${token}` } });
    const selected = await get(DEMO_IDS.premises);
    expect(selected.statusCode).toBe(200);
    expect(selected.json().selected_premises_id).toBe(DEMO_IDS.premises);
    expect(selected.json().categories.map((category: { category_id: string }) => category.category_id))
      .toContain(DEMO_IDS.categoryA);
    expect(JSON.stringify(selected.json())).not.toContain('default_contractor_id');
    expect((await get(randomUUID())).statusCode).toBe(404);
    await database.updateTable('category').set({ active: false }).where('category_id', '=', DEMO_IDS.categoryA).execute();
    try {
      const inactive = await get(DEMO_IDS.premises);
      expect(inactive.json().categories.map((category: { category_id: string }) => category.category_id))
        .not.toContain(DEMO_IDS.categoryA);
      const failed = await create('Категория выключена');
      expect(failed.statusCode).toBe(422);
      expect(failed.json().error.code).toBe('CATEGORY_INACTIVE');
    } finally {
      await database.updateTable('category').set({ active: true }).where('category_id', '=', DEMO_IDS.categoryA).execute();
    }
    await database.updateTable('premises').set({ active: false }).where('premises_id', '=', DEMO_IDS.premises).execute();
    try { expect((await get(DEMO_IDS.premises)).statusCode).toBe(404); }
    finally { await database.updateTable('premises').set({ active: true }).where('premises_id', '=', DEMO_IDS.premises).execute(); }
  });
  it('stores initial file bytes and replays exact CreateCase without another event', async () => {
    const key = randomUUID();
    const file = { name: 'photo.png', content: Buffer.from([0, 1, 2, 255]), mime: 'image/png' };
    const first = await create('Файл', key, [file]);
    expect(first.statusCode).toBe(201);
    const caseId = first.json().case_id as string;
    const attachment = await database.selectFrom('attachment').selectAll().where('case_id', '=', caseId).executeTakeFirstOrThrow();
    expect(attachment.content).toEqual(file.content);
    expect((await database.selectFrom('case_initial_attachment').selectAll().where('case_id', '=', caseId).execute()).length).toBe(1);
    const replay = await create('Файл', key, [file]);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect((await create('Другой текст', key, [file])).json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect((await database.selectFrom('case_event').selectAll().where('case_id', '=', caseId).execute()).length).toBe(1);
  });
  it('rejects pending Assignment once, clears current pointers and keeps immutable history', async () => {
    const { caseId, iterationId, assignmentId } = await sentCase();
    const rejected = await command(caseId, 'reject-assignment', contractorToken,
      { assignment_id: assignmentId, reason: 'Нет бригады' });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({ state: 'ACCEPTED_BY_UK', revision: 5 });
    const row = await database.selectFrom('case_table').selectAll().where('case_id', '=', caseId).executeTakeFirstOrThrow();
    expect([row.current_selection_id, row.current_assignment_id, row.current_executor_contractor_id])
      .toEqual([null, null, null]);
    expect(row.current_iteration_id).toBe(iterationId);
    const historical = await database.selectFrom('assignment').selectAll()
      .where('assignment_id', '=', assignmentId).executeTakeFirstOrThrow();
    expect(historical).toMatchObject({ decision_status: 'REJECTED', reject_reason: 'Нет бригады' });
    const revoked = await command(caseId, 'accept-assignment', contractorToken, { assignment_id: assignmentId });
    expect(revoked.statusCode, JSON.stringify(revoked.json())).toBe(404);
    expect((await database.selectFrom('case_event').select('event_type').where('case_id', '=', caseId)
      .orderBy('event_seq').execute()).map(event => event.event_type).at(-1)).toBe('EVT_006');
  });
  it('serializes competing accept and reject decisions', async () => {
    const { caseId, assignmentId } = await sentCase();
    const [accept, reject] = await Promise.all([
      command(caseId, 'accept-assignment', contractorToken, { assignment_id: assignmentId }),
      command(caseId, 'reject-assignment', contractorToken, { assignment_id: assignmentId, reason: 'Отказ' }),
    ]);
    expect([accept.statusCode, reject.statusCode].filter(status => status === 200)).toHaveLength(1);
    expect([404, 409]).toContain([accept.statusCode, reject.statusCode].filter(status => status !== 200)[0]);
    const decisionEvents = await database.selectFrom('case_event').select('event_type')
      .where('case_id', '=', caseId).where('event_type', 'in', ['EVT_005', 'EVT_006']).execute();
    expect(decisionEvents).toHaveLength(1);
  });
  it('keeps a rework executor until B is selected, then cuts A over without N+2', async () => {
    const { caseId, assignmentId } = await sentCase();
    expect((await command(caseId, 'accept-assignment', contractorToken,
      { assignment_id: assignmentId })).statusCode).toBe(200);
    const nextIteration = randomUUID();
    await database.transaction().execute(async transaction => {
      await transaction.insertInto('case_iteration').values({ iteration_id: nextIteration, case_id: caseId,
        iteration_no: 2, start_reason: 'REWORK', started_at: new Date(),
        started_by_user_id: DEMO_IDS.ukEmployee, source_result_id: null,
        source_feedback_id: null, started_by_event_id: null }).execute();
      await transaction.updateTable('case_table').set({ current_state: 'REWORK',
        current_iteration_id: nextIteration, current_selection_id: null,
        current_result_id: null }).where('case_id', '=', caseId).execute();
    });
    const before = await command(caseId, 'accept-assignment', contractorToken,
      { assignment_id: assignmentId });
    expect(before.statusCode).toBe(409);
    const sameExecutor = await command(caseId, 'select-contractor', ukToken,
      { iteration_id: nextIteration, contractor_id: DEMO_IDS.contractorA });
    expect(sameExecutor.statusCode, JSON.stringify(sameExecutor.json())).toBe(409);
    expect(sameExecutor.json().error.code).toBe('INVALID_STATE');
    expect((await database.selectFrom('case_table').select('current_executor_contractor_id')
      .where('case_id', '=', caseId).executeTakeFirstOrThrow()).current_executor_contractor_id)
      .toBe(DEMO_IDS.contractorA);
    const selected = await command(caseId, 'select-contractor', ukToken,
      { iteration_id: nextIteration, contractor_id: DEMO_IDS.contractorB });
    expect(selected.statusCode).toBe(200);
    const selectedOnly = await database.selectFrom('case_table').selectAll().where('case_id', '=', caseId).executeTakeFirstOrThrow();
    expect(selectedOnly.current_state).toBe('REWORK');
    expect(selectedOnly.current_iteration_id).toBe(nextIteration);
    expect([selectedOnly.current_assignment_id, selectedOnly.current_executor_contractor_id]).toEqual([null, null]);
    expect((await command(caseId, 'accept-assignment', contractorToken,
      { assignment_id: assignmentId })).statusCode).toBe(404);
    expect((await command(caseId, 'accept-assignment', contractorBToken,
      { assignment_id: assignmentId })).statusCode).toBe(404);
    const sent = await command(caseId, 'send-assignment', ukToken,
      { iteration_id: nextIteration, selection_id: selected.json().created.selection_id });
    expect(sent.statusCode).toBe(200);
    const accepted = await command(caseId, 'accept-assignment', contractorBToken,
      { assignment_id: sent.json().created.assignment_id });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().state).toBe('EXECUTION');
    expect((await database.selectFrom('case_iteration').select('iteration_no').where('case_id', '=', caseId).execute())
      .map(row => row.iteration_no)).toEqual([1, 2]);
    expect((await database.selectFrom('assignment').select('decision_status')
      .where('assignment_id', '=', assignmentId).executeTakeFirstOrThrow()).decision_status).toBe('ACCEPTED');
  });
  it('does not require an old Category to remain active, but blocks unavailable contractors', async () => {
    const created = await create('Проверка настроек');
    expect(created.statusCode).toBe(201);
    const caseId = created.json().case_id as string;
    const iterationId = created.json().created.iteration_id as string;
    expect((await command(caseId, 'accept', ukToken, {})).statusCode).toBe(200);
    await database.updateTable('category').set({ active: false }).where('category_id', '=', DEMO_IDS.categoryA).execute();
    await database.updateTable('contractor').set({ active: false }).where('contractor_id', '=', DEMO_IDS.contractorA).execute();
    try {
      const unavailable = await command(caseId, 'select-contractor', ukToken,
        { iteration_id: iterationId, contractor_id: DEMO_IDS.contractorA });
      expect(unavailable.statusCode).toBe(422);
      expect(unavailable.json().error.code).toBe('CONTRACTOR_NOT_AVAILABLE');
    } finally {
      await database.updateTable('contractor').set({ active: true }).where('contractor_id', '=', DEMO_IDS.contractorA).execute();
    }
    try {
      const selected = await command(caseId, 'select-contractor', ukToken,
        { iteration_id: iterationId, contractor_id: DEMO_IDS.contractorA });
      expect(selected.statusCode).toBe(200);
      await database.updateTable('organization_contractor').set({ active: false })
        .where('organization_id', '=', DEMO_IDS.organization)
        .where('contractor_id', '=', DEMO_IDS.contractorA).execute();
      try {
        const blocked = await command(caseId, 'send-assignment', ukToken,
          { iteration_id: iterationId, selection_id: selected.json().created.selection_id });
        expect(blocked.statusCode).toBe(422);
        expect(blocked.json().error.code).toBe('CONTRACTOR_NOT_AVAILABLE');
        expect((await database.selectFrom('assignment').selectAll().where('case_id', '=', caseId).execute())).toEqual([]);
      } finally {
        await database.updateTable('organization_contractor').set({ active: true })
          .where('organization_id', '=', DEMO_IDS.organization)
          .where('contractor_id', '=', DEMO_IDS.contractorA).execute();
      }
      expect((await command(caseId, 'send-assignment', ukToken,
        { iteration_id: iterationId, selection_id: selected.json().created.selection_id })).statusCode).toBe(200);
    } finally {
      await database.updateTable('category').set({ active: true }).where('category_id', '=', DEMO_IDS.categoryA).execute();
    }
  });
  it('blocks Select when OrganizationContractor was deactivated before the command', async () => {
    const created = await create('Связь подрядчика');
    const caseId = created.json().case_id as string;
    const iterationId = created.json().created.iteration_id as string;
    expect((await command(caseId, 'accept', ukToken, {})).statusCode).toBe(200);
    await database.updateTable('organization_contractor').set({ active: false })
      .where('organization_id', '=', DEMO_IDS.organization)
      .where('contractor_id', '=', DEMO_IDS.contractorA).execute();
    try {
      const blocked = await command(caseId, 'select-contractor', ukToken,
        { iteration_id: iterationId, contractor_id: DEMO_IDS.contractorA });
      expect(blocked.statusCode).toBe(422);
      expect(blocked.json().error.code).toBe('CONTRACTOR_NOT_AVAILABLE');
      expect((await database.selectFrom('contractor_selection').select('selection_id')
        .where('case_id', '=', caseId).execute())).toEqual([]);
    } finally {
      await database.updateTable('organization_contractor').set({ active: true })
        .where('organization_id', '=', DEMO_IDS.organization)
        .where('contractor_id', '=', DEMO_IDS.contractorA).execute();
    }
  });
  it('rejects a superseded Selection by exact ID without creating an Assignment', async () => {
    const created = await create('Смена выбора');
    const caseId = created.json().case_id as string;
    const iterationId = created.json().created.iteration_id as string;
    expect((await command(caseId, 'accept', ukToken, {})).statusCode).toBe(200);
    const old = await command(caseId, 'select-contractor', ukToken,
      { iteration_id: iterationId, contractor_id: DEMO_IDS.contractorA });
    const fresh = await command(caseId, 'select-contractor', ukToken,
      { iteration_id: iterationId, contractor_id: DEMO_IDS.contractorB });
    expect(old.statusCode).toBe(200);
    expect(fresh.statusCode).toBe(200);
    const stale = await command(caseId, 'send-assignment', ukToken,
      { iteration_id: iterationId, selection_id: old.json().created.selection_id });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('STALE_SELECTION');
    expect((await database.selectFrom('assignment').select('assignment_id').where('case_id', '=', caseId).execute()))
      .toEqual([]);
  });
  it('replays an exact UK command and rejects changed same-key payload', async () => {
    const created = await create('Ключ команды');
    const caseId = created.json().case_id as string;
    const key = randomUUID();
    const first = await command(caseId, 'accept', ukToken, {}, key);
    expect(first.statusCode).toBe(200);
    const replay = await command(caseId, 'accept', ukToken, {}, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(replay.headers['idempotency-replayed']).toBe('true');
    const changed = await command(caseId, 'accept', ukToken, { client_revision: 20 }, key);
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect((await database.selectFrom('case_event').selectAll().where('case_id', '=', caseId)
      .where('event_type', '=', 'EVT_002').execute())).toHaveLength(1);
  });
  it('rejects reuse of a UK key across command types after current visibility check', async () => {
    const created = await create('Другой тип команды');
    const caseId = created.json().case_id as string;
    const iterationId = created.json().created.iteration_id as string;
    const key = randomUUID();
    expect((await command(caseId, 'accept', ukToken, {}, key)).statusCode).toBe(200);
    const reused = await command(caseId, 'select-contractor', ukToken,
      { iteration_id: iterationId, contractor_id: DEMO_IDS.contractorA }, key);
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect((await database.selectFrom('contractor_selection').select('selection_id')
      .where('case_id', '=', caseId).execute())).toEqual([]);
  });
  it('resolves a prior resident Case command before CreateCase key reuse conflict', async () => {
    const created = await create('Исходный случай');
    const caseId = created.json().case_id as string;
    const key = randomUUID();
    await database.insertInto('command_execution').values({ command_id: randomUUID(),
      principal_type: 'APP_USER', app_user_id: DEMO_IDS.resident, max_identity_id: null,
      idempotency_key: key, command_type: 'RESIDENT_CONFIRM', case_id: caseId,
      request_hash: 'a'.repeat(64), execution_status: 'SUCCEEDED', http_status: 200,
      response_body: { command_id: randomUUID(), case_id: caseId, state: 'CREATED', revision: 1,
        created: {}, event_ids: [] }, created_at: new Date(), completed_at: new Date() }).execute();
    const reused = await create('Другой случай', key);
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
  });
  it('requires the exact normal outbound recipient before any business write', async () => {
    const before = await database.selectFrom('case_table').select('case_id').execute();
    await database.updateTable('max_identity').set({ link_status: 'UNLINKED',
      delivery_chat_id: null, delivery_chat_type: null })
      .where('max_identity_id', '=', identityId).execute();
    const key = randomUUID();
    try {
      const failed = await create('Без адреса доставки', key,
        [{ name: 'orphan.txt', content: Buffer.from('must not persist'), mime: 'text/plain' }]);
      expect(failed.statusCode).toBe(409);
      expect(failed.json().error.code).toBe('MAX_DELIVERY_TARGET_NOT_READY');
      expect((await database.selectFrom('case_table').select('case_id').execute())).toEqual(before);
      expect((await database.selectFrom('command_execution').select('command_id')
        .where('idempotency_key', '=', key).execute())).toEqual([]);
      expect((await database.selectFrom('attachment').select('attachment_id')
        .where('file_name', '=', 'orphan.txt').execute())).toEqual([]);
    } finally {
      await database.updateTable('max_identity').set({ link_status: 'LINKED_CONFIRMED',
        delivery_chat_id: 'tg014-chat', delivery_chat_type: 'DIALOG' })
        .where('max_identity_id', '=', identityId).execute();
    }
  });
  it('waits for a Category writer and revalidates inactive config with zero orphan effects', async () => {
    const key = randomUUID();
    const writer = await pool.connect();
    await writer.query('BEGIN');
    try {
      await writer.query('SELECT category_id FROM category WHERE category_id=$1 FOR UPDATE', [DEMO_IDS.categoryA]);
      await writer.query('UPDATE category SET active=false WHERE category_id=$1', [DEMO_IDS.categoryA]);
      let settled = false;
      const pending = create('Гонка с настройкой', key,
        [{ name: 'blocked.txt', content: Buffer.from('blocked'), mime: 'text/plain' }])
        .then(result => { settled = true; return result; });
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(settled).toBe(false);
      await writer.query('COMMIT');
      const result = await pending;
      expect(result.statusCode).toBe(422);
      expect(result.json().error.code).toBe('CATEGORY_INACTIVE');
      expect((await database.selectFrom('case_table').select('case_id')
        .where('description', '=', 'Гонка с настройкой').execute())).toEqual([]);
      expect((await database.selectFrom('attachment').select('attachment_id')
        .where('file_name', '=', 'blocked.txt').execute())).toEqual([]);
      expect((await database.selectFrom('command_execution').select('command_id')
        .where('idempotency_key', '=', key).execute())).toEqual([]);
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
      await database.updateTable('category').set({ active: true })
        .where('category_id', '=', DEMO_IDS.categoryA).execute();
    }
  });
  it('rechecks current resident access for reads, creates and protected replay', async () => {
    const key = randomUUID();
    const first = await create('Доступ отозван позже', key);
    expect(first.statusCode).toBe(201);
    await database.updateTable('resident_premises_access').set({ active: false })
      .where('app_user_id', '=', DEMO_IDS.resident).where('premises_id', '=', DEMO_IDS.premises).execute();
    try {
      const options = await app.inject({ method: 'GET', url: '/api/v1/cases/create-options',
        headers: { authorization: `Bearer ${token}` } });
      expect(options.statusCode).toBe(200);
      expect(options.json().premises).toEqual([]);
      expect((await app.inject({ method: 'GET', url: `/api/v1/cases/create-options?premises_id=${DEMO_IDS.premises}`,
        headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(404);
      expect((await create('Попытка нового', randomUUID())).statusCode).toBe(404);
      expect((await create('Доступ отозван позже', key)).statusCode).toBe(404);
    } finally {
      await database.updateTable('resident_premises_access').set({ active: true })
        .where('app_user_id', '=', DEMO_IDS.resident).where('premises_id', '=', DEMO_IDS.premises).execute();
    }
  });
  it('keeps categories scoped to the selected organization across two accessible premises', async () => {
    const organizationId = randomUUID(), houseId = randomUUID(), premisesId = randomUUID(), categoryId = randomUUID();
    const now = new Date();
    await database.insertInto('organization').values({ organization_id: organizationId, name: 'Другая УК',
      active: true, created_at: now, updated_at: now }).execute();
    await database.insertInto('house').values({ house_id: houseId, organization_id: organizationId,
      address: 'Другая улица, 1', display_label: null, active: true, created_at: now, updated_at: now }).execute();
    await database.insertInto('premises').values({ premises_id: premisesId, house_id: houseId,
      number_or_label: 'Квартира 2', active: true, created_at: now, updated_at: now }).execute();
    await database.insertInto('category').values({ category_id: categoryId, organization_id: organizationId,
      name: 'Другая категория', description: null, default_contractor_id: null,
      requires_premises_access: true, result_requirement: 'NONE', active: true, config_revision: 1,
      created_at: now, updated_at: now, updated_by_user_id: null }).execute();
    const get = () => app.inject({ method: 'GET', url: `/api/v1/cases/create-options?premises_id=${premisesId}`,
      headers: { authorization: `Bearer ${token}` } });
    expect((await get()).statusCode).toBe(404);
    await database.insertInto('resident_premises_access').values({ app_user_id: DEMO_IDS.resident,
      premises_id: premisesId, active: true, created_at: now }).execute();
    const selected = await get();
    expect(selected.statusCode).toBe(200);
    expect(selected.json().premises).toHaveLength(2);
    expect(selected.json().categories.map((category: { category_id: string }) => category.category_id))
      .toEqual([categoryId]);
    expect((await app.inject({ method: 'GET',
      url: `/api/v1/cases/create-options?premises_id=${DEMO_IDS.premises}`,
      headers: { authorization: `Bearer ${token}` } })).json().categories
      .map((category: { category_id: string }) => category.category_id)).not.toContain(categoryId);
  });
  it('binds exactly one current DemoRun primary under concurrent CreateCase attempts', async () => {
    const realIdentity = randomUUID(), runId = randomUUID();
    const now = new Date();
    await database.insertInto('max_identity').values({ max_identity_id: realIdentity,
      mini_app_user_id: `tg014-demo-${realIdentity}`, delivery_chat_id: 'tg014-demo-chat',
      delivery_chat_type: 'DIALOG', bot_user_id: null, link_status: 'LINKED_CONFIRMED',
      app_user_id: null, first_seen_at: now, last_seen_at: now, linked_at: now }).execute();
    await database.insertInto('demo_run').values({ demo_run_id: runId, scenario_key: 'primary-housing-demo',
      status: 'ACTIVE', created_by_max_identity_id: realIdentity,
      notification_recipient_max_identity_id: realIdentity, primary_case_id: null,
      created_at: now, archived_at: null }).execute();
    await database.insertInto('demo_run_actor').values({ demo_run_id: runId, app_user_id: DEMO_IDS.resident,
      role: 'RESIDENT', actor_alias: 'resident' }).execute();
    const demoConfig = loadConfig({ APP_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: url,
      APP_SESSION_SECRET: 'tg014-secret'.padEnd(40, 'x'), MAX_ADAPTER_MODE: 'live',
      MAX_BOT_TOKEN: 'tg014-bot', MAX_WEBHOOK_SECRET: 'w'.repeat(32),
      PUBLIC_APP_URL: 'http://localhost/', PUBLIC_API_BASE_URL: 'http://localhost/api/v1',
      BUILD_SHA: 'a'.repeat(40) });
    const demoApp = fastify({ loggerInstance: pino({ enabled: false }) });
    registerIntakeAssignmentRoutes(demoApp, demoConfig, { database });
    await demoApp.ready();
    const demoToken = issueSession({ max_identity_id: realIdentity, app_user_id: DEMO_IDS.resident,
      role_binding_id: DEMO_IDS.residentRole, role: 'RESIDENT', demo_mode: true,
      demo_run_id: runId, real_display_name: 'Демо' }, demoConfig, Math.floor(Date.now() / 1000)).token;
    expect((await app.inject({ method: 'GET', url: '/api/v1/cases/create-options',
      headers: { authorization: `Bearer ${demoToken}` } })).statusCode).toBe(401);
    const request = (label: string, key: string) => {
      const multipart = createBody(label, [{ name: `${label}.txt`, content: Buffer.from(label), mime: 'text/plain' }]);
      return demoApp.inject({ method: 'POST', url: '/api/v1/cases', payload: multipart.body,
        headers: { authorization: `Bearer ${demoToken}`, 'idempotency-key': key,
          'content-type': multipart.contentType } });
    };
    const keys = [randomUUID(), randomUUID()];
    try {
      const results = await Promise.all([request('first', keys[0]!), request('second', keys[1]!)]);
      expect(results.map(result => result.statusCode).sort()).toEqual([201, 409]);
      const winner = results.find(result => result.statusCode === 201)!.json().case_id as string;
      expect(results.find(result => result.statusCode === 409)!.json().error.code).toBe('DEMO_PRIMARY_CASE_EXISTS');
      expect((await database.selectFrom('demo_run').select('primary_case_id')
        .where('demo_run_id', '=', runId).executeTakeFirstOrThrow()).primary_case_id).toBe(winner);
      expect((await database.selectFrom('case_table').select('case_id').where('demo_run_id', '=', runId).execute()))
        .toEqual([{ case_id: winner }]);
      expect((await database.selectFrom('attachment').select('attachment_id')
        .where('case_id', '=', winner).execute())).toHaveLength(1);
      expect((await database.selectFrom('case_event').select('event_type')
        .where('case_id', '=', winner).execute())).toEqual([{ event_type: 'EVT_001' }]);
      expect((await database.selectFrom('command_execution').select('command_id')
        .where('app_user_id', '=', DEMO_IDS.resident).where('idempotency_key', 'in', keys).execute())).toHaveLength(1);
    } finally { await demoApp.close(); }
  });
});
