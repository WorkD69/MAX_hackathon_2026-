import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifyOwnedPostgresConnection } from '../../../../../tests/support/postgres.mjs';
import fastify from 'fastify';
import pino from 'pino';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateToLatest } from '@max-smart-city/db';
const { DEMO_IDS, seedDemoCatalog } = await import(new URL('../../../../../packages/db/src/seed/index.ts', import.meta.url).href) as {
  DEMO_IDS: Record<'organization' | 'house' | 'premises' | 'resident' | 'ukEmployee' | 'ukAdmin' |
    'contractorA' | 'contractorB' | 'contractorAEmployee' | 'contractorBEmployee' | 'categoryA' |
    'residentRole' | 'ukEmployeeRole' | 'ukAdminRole', string>; seedDemoCatalog(pool: Pool): Promise<void>;
};
import type { Database, DatabaseTransaction } from '@max-smart-city/db';
import { loadConfig } from '../../config/load-config.js';
import { canonicalizeMaxInitData } from '../auth/init-data.js';
import { issueSession, verifySession } from '../auth/session-token.js';
import { createTransactionAuthorizationRepository } from '../commands/kernel/authorization.js';
import { AuthorizationPolicy } from '../authorization/policy.js';
import { registerDemoRoutes } from './plugin.js';
import { registerDemoModule } from './index.js';
import { resolveDemoActor, bindPrimaryCase } from './repository.js';

const url = process.env.TG013_TEST_DATABASE_URL;
if (!url) throw new Error('MISSING_TG013_TEST_DATABASE_URL');
const schema = `tg013_${randomUUID().replaceAll('-', '')}`;
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 12 });
const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
const admin = new Pool({ connectionString: url, max: 1 });
const now = Math.floor(Date.now() / 1000);
const config = loadConfig({ APP_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: url,
  APP_SESSION_SECRET: 'tg013-secret'.padEnd(40, 'x'), MAX_ADAPTER_MODE: 'live',
  MAX_BOT_TOKEN: 'tg013-bot', MAX_WEBHOOK_SECRET: 'w'.repeat(32),
  PUBLIC_APP_URL: 'http://localhost/', PUBLIC_API_BASE_URL: 'http://localhost/api/v1', BUILD_SHA: 'a'.repeat(40) });
const app = fastify({ loggerInstance: pino({ enabled: false }) });
let ownedTargetVerified = false;
let schemaCreated = false;
registerDemoModule(app, config, { database, nowSeconds: () => now });

function launch(user: number, authDate = now) {
  const unsigned = `auth_date=${authDate}&user=${encodeURIComponent(JSON.stringify({ id: user, first_name: 'Demo' }))}&chat=${encodeURIComponent(JSON.stringify({ id: user + 500000, type: 'DIALOG' }))}`;
  const secret = createHmac('sha256', 'WebAppData').update(config.MAX_BOT_TOKEN!).digest();
  const signature = createHmac('sha256', secret).update(canonicalizeMaxInitData(`${unsigned}&hash=${'0'.repeat(64)}`).launchParams).digest('hex');
  return `${unsigned}&hash=${signature}`;
}
async function bootstrap(user = 13001) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: launch(user) } });
  expect(response.statusCode).toBe(200);
  return response.json();
}
async function command(path: string, token: string, body: Record<string, unknown>, key: string = randomUUID()) {
  return app.inject({ method: 'POST', url: path, headers: { authorization: `Bearer ${token}`, 'idempotency-key': key }, payload: body });
}
const start = (token: string, key?: string) => command('/api/v1/demo/runs', token, { scenario_key: 'primary-housing-demo' }, key);
const startOn = (server: typeof app, token: string, key: string) => server.inject({
  method: 'POST', url: '/api/v1/demo/runs',
  headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
  payload: { scenario_key: 'primary-housing-demo' },
});
const switchRole = (token: string, role: string, key?: string) => command('/api/v1/demo/session/actor', token, { role_view: role }, key);
async function freshRun(user = 13001) {
  const before = await bootstrap(user);
  const response = await start(before.session_token);
  expect(response.statusCode).toBe(201);
  const issued = response.json();
  return { token: issued.session_token as string, run: issued.demo_run_id as string,
    identity: issued.session.real_max_identity.max_identity_id as string };
}
async function insertCase(tx: DatabaseTransaction, run: string) {
  const id = randomUUID(), iteration = randomUUID();
  await tx.insertInto('case_table').values({ case_id: id, organization_id: DEMO_IDS.organization,
    house_id: DEMO_IDS.house, premises_id: DEMO_IDS.premises, resident_user_id: DEMO_IDS.resident,
    category_id: DEMO_IDS.categoryA, description: 'История TG-013', created_at: new Date(), updated_at: new Date(),
    created_by_user_id: DEMO_IDS.resident, demo_run_id: run, category_name_snapshot: 'Демо',
    requires_access_snapshot: true, result_requirement_snapshot: 'PHOTO', house_address_snapshot: 'Демо',
    premises_label_snapshot: '42', current_state: 'CREATED', current_iteration_id: iteration,
    revision: 1, last_event_seq: 0 }).execute();
  await tx.insertInto('case_iteration').values({ iteration_id: iteration, case_id: id, iteration_no: 1,
    start_reason: 'INITIAL', started_at: new Date(), started_by_user_id: DEMO_IDS.resident }).execute();
  const commandId = randomUUID();
  await tx.insertInto('command_execution').values({ command_id: commandId, principal_type: 'APP_USER',
    app_user_id: DEMO_IDS.resident, idempotency_key: randomUUID(), command_type: 'TEST_CASE_FIXTURE',
    case_id: id, request_hash: 'a'.repeat(64), execution_status: 'SUCCEEDED', http_status: 201,
    response_body: { case_id: id, revision: 1 }, created_at: new Date(), completed_at: new Date() }).execute();
  await tx.insertInto('case_event').values({ event_id: randomUUID(), case_id: id, event_seq: 1, event_type: 'EVT_001',
    occurred_at: new Date(), actor_user_id: DEMO_IDS.resident, actor_role_snapshot: 'RESIDENT',
    to_state: 'CREATED', iteration_id: iteration, description: 'Начальная история', presentation_data: {},
    command_id: commandId, derived: false }).execute();
  await tx.updateTable('case_table').set({ last_event_seq: 1 }).where('case_id', '=', id).execute();
  return id;
}
beforeAll(async () => {
  if (!new URL(url!).pathname.endsWith('_tg013_test')) throw new Error('UNSAFE_TG013_TEST_DATABASE');
  const receiptPath = process.env.TG013_TEST_DATABASE_RECEIPT;
  if (!receiptPath) throw new Error('MISSING_OWNED_RECEIPT');
  const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;
  if (!adminUrl) throw new Error('MISSING_TEST_POSTGRES_ADMIN_URL');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await verifyOwnedPostgresConnection({ adminUrl }, receipt, url!);
  ownedTargetVerified = true;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await migrateToLatest(database);
  await seedDemoCatalog(pool);
  await app.ready();
}, 60000);
afterAll(async () => {
  await app.close(); await database.destroy();
  if (ownedTargetVerified && schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});

describe('TG-013 real PostgreSQL demo commands and session seam', () => {
  it('start issues an actor-null token for the new run and replays its exact body', async () => {
    const before = await bootstrap();
    const key = randomUUID();
    const response = await start(before.session_token, key);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ demo_run_id: expect.any(String), status: 'ACTIVE', primary_case_id: null,
      role_views: ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'],
      session_token: expect.any(String), expires_at: expect.any(String),
      session: { real_max_identity: { max_identity_id: before.session.real_max_identity.max_identity_id },
        effective_actor: { app_user_id: null, role: null }, primary_case_id: null } });
    const run = response.json().demo_run_id;
    expect(verifySession(response.json().session_token, config, now)).toMatchObject({
      max_identity_id: before.session.real_max_identity.max_identity_id, demo_run_id: run,
      app_user_id: null, role_binding_id: null, role: null, iat: now,
    });
    expect(response.json().session_token).not.toBe(before.session_token);
    expect((await database.selectFrom('demo_run_actor').selectAll().where('demo_run_id', '=', run).execute()).length).toBe(5);
    expect(await database.selectFrom('case_table').select('case_id').where('demo_run_id', '=', run).execute()).toEqual([]);
    const row = await database.selectFrom('demo_run').selectAll().where('demo_run_id', '=', run).executeTakeFirstOrThrow();
    expect(row.notification_recipient_max_identity_id).toBe(before.session.real_max_identity.max_identity_id);
    expect(row.notification_recipient_max_identity_id).not.toBe('13001');
    const replay = await start(before.session_token, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.body).toBe(response.body);
    expect(replay.json().expires_at).toBe(response.json().expires_at);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect((await switchRole(response.json().session_token, 'RESIDENT')).statusCode).toBe(200);
  });
  it('valid Bearer starts after original initData expires without MAX reauth', async () => {
    const issued = await bootstrap(13009);
    const expired = launch(13009, now - 86400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/max',
      payload: { init_data: expired } })).statusCode).toBe(401);
    const response = await start(issued.session_token);
    expect(response.statusCode).toBe(201);
    expect(response.json().session.real_max_identity.max_identity_id)
      .toBe(issued.session.real_max_identity.max_identity_id);
    expect(response.json().session.effective_actor.role).toBeNull();
  });
  it('fresh bootstrap and GET restore run, explicit switch restores each exact selected binding', async () => {
    const { run, token } = await freshRun();
    for (const role of ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE']) {
      const response = await switchRole(token, role);
      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.session.demo_run_id).toBe(run);
      expect(result.session.effective_actor.role).toBe(role);
      expect(verifySession(result.session_token, config, now).role_binding_id).not.toBeNull();
      const read = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${result.session_token}` } });
      expect(read.statusCode).toBe(200); expect(read.json()).toEqual(result.session);
    }
    expect((await bootstrap()).session).toMatchObject({ demo_run_id: run, effective_actor: { app_user_id: null, role: null } });
  });
  it('no client actor selectors or fifth role, mandatory key', async () => {
    const { token } = await freshRun();
    for (const extra of [{ app_user_id: DEMO_IDS.ukAdmin }, { actor_alias: 'contractor_b' },
      { contractor_id: DEMO_IDS.contractorB }, { role_binding_id: DEMO_IDS.ukAdminRole }, { organization_id: DEMO_IDS.organization }]) {
      expect((await command('/api/v1/demo/session/actor', token, { role_view: 'RESIDENT', ...extra })).statusCode).toBe(400);
    }
    expect((await switchRole(token, 'OPERATOR')).statusCode).toBe(400);
    expect((await switchRole(token, 'RESIDENT', 'key with spaces')).statusCode).toBe(400);
    expect((await command('/api/v1/demo/runs', token, { scenario_key: 'primary-housing-demo', demo_run_id: randomUUID() })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/demo/runs', headers: { authorization: `Bearer ${token}` }, payload: { scenario_key: 'primary-housing-demo' } })).json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
  it('first primary bind wins; second different Case rolls back without orphan', async () => {
    const { run, identity } = await freshRun();
    const first = await database.transaction().execute(async tx => { const id = await insertCase(tx, run); await bindPrimaryCase(tx, identity, run, id); return id; });
    await expect(database.transaction().execute(async tx => { const id = await insertCase(tx, run); await bindPrimaryCase(tx, identity, run, id); })).rejects.toMatchObject({ code: 'DEMO_PRIMARY_CASE_EXISTS', status: 409 });
    expect((await database.selectFrom('case_table').select('case_id').where('demo_run_id', '=', run).execute()).map(x => x.case_id)).toEqual([first]);
    await database.transaction().execute(tx => bindPrimaryCase(tx, identity, run, first));
    expect((await bootstrap()).session.primary_case_id).toBe(first);
  });
  it('concurrent primary bind has one winner and one 409, first Case immutable', async () => {
    const { run, identity } = await freshRun();
    let inserted = 0;
    let release!: () => void;
    const bothInserted = new Promise<void>(resolve => { release = resolve; });
    const results = await Promise.allSettled([1, 2].map(() => database.transaction().execute(async tx => {
      const id = await insertCase(tx, run);
      if (++inserted === 2) release();
      await bothInserted;
      await bindPrimaryCase(tx, identity, run, id); return id;
    })));
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(x => x.status === 'rejected')).toMatchObject({ reason: { code: 'DEMO_PRIMARY_CASE_EXISTS' } });
    const row = await database.selectFrom('demo_run').selectAll().where('demo_run_id', '=', run).executeTakeFirstOrThrow();
    await expect(database.updateTable('case_table').set({ demo_run_id: null }).where('case_id', '=', row.primary_case_id!).execute()).rejects.toBeDefined();
  });
  it('repeat preserves old Case, iteration and actors; old token/replay and foreign run fail closed', async () => {
    const one = await freshRun();
    const key = randomUUID();
    const actor = await switchRole(one.token, 'RESIDENT', key);
    const first = await database.transaction().execute(async tx => { const id = await insertCase(tx, one.run); await bindPrimaryCase(tx, one.identity, one.run, id); return id; });
    const snapshot = await database.selectFrom('case_table').selectAll().where('case_id', '=', first).executeTakeFirstOrThrow();
    const history = await database.selectFrom('case_event').selectAll().where('case_id', '=', first).execute();
    expect(history).toHaveLength(1);
    const two = await freshRun();
    expect((await app.inject({ method: 'GET', url: '/api/v1/session',
      headers: { authorization: `Bearer ${one.token}` } })).statusCode).toBe(401);
    expect((await switchRole(one.token, 'RESIDENT')).statusCode).toBe(401);
    const second = await database.transaction().execute(async tx => { const id = await insertCase(tx, two.run); await bindPrimaryCase(tx, two.identity, two.run, id); return id; });
    expect(first).not.toBe(second);
    expect(await database.selectFrom('case_table').selectAll().where('case_id', '=', first).executeTakeFirstOrThrow()).toEqual(snapshot);
    expect(await database.selectFrom('case_event').selectAll().where('case_id', '=', first).execute()).toEqual(history);
    expect(await database.selectFrom('case_iteration').selectAll().where('case_id', '=', first).execute()).toHaveLength(1);
    expect(await database.selectFrom('demo_run_actor').selectAll().where('demo_run_id', '=', one.run).execute()).toHaveLength(5);
    expect((await switchRole(actor.json().session_token, 'RESIDENT', key)).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${actor.json().session_token}` } })).statusCode).toBe(401);
    const foreign = await bootstrap(13002);
    const forged = issueSession({ ...verifySession(two.token, config, now), max_identity_id: foreign.session.real_max_identity.max_identity_id }, config, now).token;
    expect((await switchRole(forged, 'RESIDENT')).statusCode).toBe(401);
    await expect(database.transaction().execute(tx => bindPrimaryCase(tx, foreign.session.real_max_identity.max_identity_id, two.run, second))).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(database.transaction().execute(tx => bindPrimaryCase(tx, one.identity, one.run, first))).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
  it.each(['binding', 'access', 'actor'] as const)('%s revoke denies session, switch and replay; bootstrap returns actor-null', async kind => {
    const { token, run } = await freshRun();
    const key = randomUUID();
    const selected = await switchRole(token, 'RESIDENT', key);
    expect(selected.statusCode).toBe(200);
    const table = kind === 'binding' ? 'user_role_binding' : kind === 'access' ? 'resident_premises_access' : 'app_user';
    await database.updateTable(table).set({ active: false }).where('app_user_id', '=', DEMO_IDS.resident).execute();
    try {
      expect((await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${selected.json().session_token}` } })).statusCode).toBe(401);
      expect((await switchRole(token, 'RESIDENT')).statusCode).toBe(401);
      expect((await switchRole(token, 'RESIDENT', key)).statusCode).toBe(401);
      expect((await start(selected.json().session_token)).statusCode).toBe(401);
      expect((await bootstrap()).session).toMatchObject({ demo_run_id: run, effective_actor: { app_user_id: null } });
    } finally { await database.updateTable(table).set({ active: true }).where('app_user_id', '=', DEMO_IDS.resident).execute(); }
  });
  it('switch same key across valid role tokens shares real identity principal and protected replay', async () => {
    const { token } = await freshRun();
    const resident = await switchRole(token, 'RESIDENT');
    const key = randomUUID();
    const employee = await switchRole(resident.json().session_token, 'UK_EMPLOYEE', key);
    const replay = await switchRole(employee.json().session_token, 'UK_EMPLOYEE', key);
    expect(replay.statusCode).toBe(200); expect(replay.json()).toEqual(employee.json());
    expect((await switchRole(token, 'UK_ADMIN', key)).statusCode).toBe(409);
    expect((await start(employee.json().session_token, key)).statusCode).toBe(409);
  });
  it('contractor default/A/pending B/executor B is server resolved; old A replay is denied after context moves to B', async () => {
    const { token, run, identity } = await freshRun();
    const caseId = await database.transaction().execute(async tx => {
      const id = await insertCase(tx, run); await bindPrimaryCase(tx, identity, run, id); return id;
    });
    const defaultActor = await switchRole(token, 'CONTRACTOR_EMPLOYEE');
    expect(defaultActor.statusCode).toBe(200);
    expect(defaultActor.json().session.effective_actor.app_user_id).toBe(DEMO_IDS.contractorAEmployee);
    await expect(new AuthorizationPolicy(createTransactionAuthorizationRepository(database))
      .case(verifySession(defaultActor.json().session_token, config, now), caseId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const caseRow = await database.selectFrom('case_table').selectAll().where('case_id', '=', caseId).executeTakeFirstOrThrow();
    async function pending(contractorId: string, number: number) {
      return database.transaction().execute(async tx => {
        const selection = randomUUID(), assignment = randomUUID();
        await tx.insertInto('contractor_selection').values({ selection_id: selection, case_id: caseId,
          created_iteration_id: caseRow.current_iteration_id, contractor_id: contractorId,
          selected_by_user_id: DEMO_IDS.ukEmployee, selected_at: new Date(), selection_no: number }).execute();
        await tx.insertInto('assignment').values({ assignment_id: assignment, case_id: caseId, selection_id: selection,
          contractor_id: contractorId, created_iteration_id: caseRow.current_iteration_id, assignment_no: number,
          sent_by_user_id: DEMO_IDS.ukEmployee, sent_at: new Date(), decision_status: 'PENDING' }).execute();
        await tx.updateTable('case_table').set({ current_selection_id: selection, current_assignment_id: assignment,
          current_executor_contractor_id: null, current_state: 'SENT_TO_CONTRACTOR' }).where('case_id', '=', caseId).execute();
        return assignment;
      });
    }
    const aAssignment = await pending(DEMO_IDS.contractorA, 1);
    const key = randomUUID();
    const a = await switchRole(token, 'CONTRACTOR_EMPLOYEE', key);
    expect(a.statusCode).toBe(200); expect(a.json().session.effective_actor.app_user_id).toBe(DEMO_IDS.contractorAEmployee);
    await database.updateTable('assignment').set({ decision_status: 'REJECTED', rejected_at: new Date(),
      rejected_by_user_id: DEMO_IDS.contractorAEmployee, reject_reason: 'Отказ' }).where('assignment_id', '=', aAssignment).execute();
    const bAssignment = await pending(DEMO_IDS.contractorB, 2);
    const b = await switchRole(token, 'CONTRACTOR_EMPLOYEE');
    expect(b.statusCode).toBe(200); expect(b.json().session.effective_actor.app_user_id).toBe(DEMO_IDS.contractorBEmployee);
    const policy = new AuthorizationPolicy(createTransactionAuthorizationRepository(database));
    await expect(policy.case(verifySession(a.json().session_token, config, now), caseId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await policy.case(verifySession(b.json().session_token, config, now), caseId)).access).toBe('PENDING_CONTRACTOR');
    expect((await switchRole(token, 'CONTRACTOR_EMPLOYEE', key)).statusCode).toBe(401);
    await database.transaction().execute(async tx => {
      await tx.updateTable('assignment').set({ decision_status: 'ACCEPTED', accepted_at: new Date(),
        accepted_by_user_id: DEMO_IDS.contractorBEmployee }).where('assignment_id', '=', bAssignment).execute();
      await tx.updateTable('case_table').set({ current_state: 'EXECUTION', current_executor_contractor_id: DEMO_IDS.contractorB })
        .where('case_id', '=', caseId).execute();
    });
    const executor = await switchRole(token, 'CONTRACTOR_EMPLOYEE');
    expect(executor.statusCode).toBe(200); expect(executor.json().session.effective_actor.app_user_id).toBe(DEMO_IDS.contractorBEmployee);
    expect((await policy.case(verifySession(executor.json().session_token, config, now), caseId)).access).toBe('EXECUTOR');
  });
  it('concurrent starts serialize, one ACTIVE; archived start replay cannot disclose old run', async () => {
    const before = await bootstrap(13003);
    const key = randomUUID();
    const same = await Promise.all([start(before.session_token, key), start(before.session_token, key)]);
    expect(same.map(x => x.statusCode)).toEqual([201, 201]); expect(same[0]!.json()).toEqual(same[1]!.json());
    const next = await Promise.all([start(same[0]!.json().session_token), start(same[0]!.json().session_token)]);
    expect(next.map(x => x.statusCode).sort()).toEqual([201, 401]);
    const active = await database.selectFrom('demo_run').selectAll().where('created_by_max_identity_id', '=', before.session.real_max_identity.max_identity_id).where('status', '=', 'ACTIVE').execute();
    expect(active).toHaveLength(1);
    const denied = await start(before.session_token, key); expect(denied.statusCode).toBe(401); expect(denied.body).not.toContain(same[0]!.json().demo_run_id);
    expect((await start(before.session_token)).statusCode).toBe(401);
  });
  it('issuance failure rolls back archive, run, actors, and idempotency execution', async () => {
    const { token, run, identity } = await freshRun(13010);
    const key = randomUUID();
    const failing = fastify({ loggerInstance: pino({ enabled: false }) });
    registerDemoRoutes(failing, { ...config, APP_SESSION_TTL_SECONDS: Number.NaN },
      { database, nowSeconds: () => now });
    try {
      const failed = await startOn(failing, token, key);
      expect(failed.statusCode).toBe(500);
      expect(failed.json()).not.toHaveProperty('session_token');
      expect((await database.selectFrom('demo_run').select('status')
        .where('demo_run_id', '=', run).executeTakeFirstOrThrow()).status).toBe('ACTIVE');
      expect(await database.selectFrom('demo_run').select('demo_run_id')
        .where('created_by_max_identity_id', '=', identity).execute()).toHaveLength(1);
      expect(await database.selectFrom('command_execution').select('command_id')
        .where('principal_type', '=', 'MAX_IDENTITY').where('max_identity_id', '=', identity)
        .where('idempotency_key', '=', key).execute()).toEqual([]);
      expect((await start(token, key)).statusCode).toBe(201);
    } finally { await failing.close(); }
  });
  it('restore holds the current-run lock until its authoritative response, before concurrent Start archives it', async () => {
    const { token } = await freshRun();
    const resident = await switchRole(token, 'RESIDENT');
    expect(resident.statusCode).toBe(200);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const atBinding = new Promise<void>(resolve => { entered = resolve; });
    let pausedOnce = false;
    const instrumented = database.withPlugin({
      transformQuery: args => args.node,
      async transformResult(args) {
        if (!pausedOnce && (args.result.rows[0] as { role_binding_id?: string } | undefined)?.role_binding_id) {
          pausedOnce = true; entered(); await gate;
        }
        return args.result;
      },
    });
    const paused = fastify({ loggerInstance: pino({ enabled: false }) });
    registerDemoModule(paused, config, { database: instrumented, nowSeconds: () => now });
    const order: string[] = [];
    const read = paused.inject({ method: 'GET', url: '/api/v1/session',
      headers: { authorization: `Bearer ${resident.json().session_token}` } }).then(response => { order.push('restore'); return response; });
    await atBinding;
    const writer = start(resident.json().session_token).then(response => { order.push('start'); return response; });
    // Give the writer a chance to reach the lock while the real session consumer is paused at policy validation.
    await Promise.race([writer, new Promise<void>(resolve => setTimeout(resolve, 300))]);
    release();
    try {
      const [restored, started] = await Promise.all([read, writer]);
      expect(restored.statusCode).toBe(200); expect(started.statusCode).toBe(201);
      expect(order).toEqual(['restore', 'start']);
    } finally { await paused.close(); }
  });
  it('bootstrap never sends a success token before its identity transaction commits', async () => {
    let finished!: () => void;
    const rolledBack = new Promise<void>(resolve => { finished = resolve; });
    const failingCommit = new Proxy(database, {
      get(target, property, receiver) {
        if (property !== 'transaction') return Reflect.get(target, property, receiver);
        return () => ({
          execute: <T>(callback: (transaction: DatabaseTransaction) => Promise<T>) =>
            database.transaction().execute(async tx => {
              await callback(tx);
              throw new Error('SIMULATED_COMMIT_FAILURE');
            }).finally(finished),
        });
      },
    });
    const failing = fastify({ loggerInstance: pino({ enabled: false }) });
    registerDemoModule(failing, config, { database: failingCommit, nowSeconds: () => now });
    try {
      const response = await failing.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: launch(13007) } });
      await rolledBack;
      expect(response.statusCode).toBe(500); expect(response.json().error.code).toBe('AUTH_BOOTSTRAP_FAILED');
      expect(response.json()).not.toHaveProperty('session_token');
      expect(await database.selectFrom('max_identity').select('max_identity_id').where('mini_app_user_id', '=', '13007').execute()).toEqual([]);
      const valid = await bootstrap(13008);
      const read = await failing.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${valid.session_token}` } });
      expect(read.statusCode).toBe(500); expect(read.json().error.code).toBe('INTERNAL_ERROR');
      expect(read.body).not.toContain('SIMULATED_COMMIT_FAILURE');
    } finally { await failing.close(); }
  });
  it('not-outbound-ready start has no run/archive effects', async () => {
    const { token, run, identity } = await freshRun(13004);
    await database.updateTable('max_identity').set({ delivery_chat_id: null, link_status: 'UNLINKED', linked_at: null }).where('max_identity_id', '=', identity).execute();
    expect((await start(token)).statusCode).toBe(500);
    expect((await database.selectFrom('demo_run').select('status').where('demo_run_id', '=', run).executeTakeFirstOrThrow()).status).toBe('ACTIVE');
  });
  it('DEMO_MODE=false rejects both commands without effects', async () => {
    const disabled = fastify({ loggerInstance: pino({ enabled: false }) }); registerDemoRoutes(disabled, { ...config, DEMO_MODE: false }, { database, nowSeconds: () => now });
    const before = await bootstrap();
    for (const path of ['/api/v1/demo/runs', '/api/v1/demo/session/actor']) {
      const response = await disabled.inject({ method: 'POST', url: path, headers: { authorization: `Bearer ${before.session_token}`, 'idempotency-key': randomUUID() }, payload: path.endsWith('runs') ? { scenario_key: 'primary-housing-demo' } : { role_view: 'RESIDENT' } });
      expect(response.statusCode).toBe(403); expect(response.json().error.code).toBe('DEMO_MODE_DISABLED');
    }
    await disabled.close();
  });
});
