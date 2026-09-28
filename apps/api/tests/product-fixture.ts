import { randomUUID } from 'node:crypto';
import fastify from 'fastify';
import pino from 'pino';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, expect } from 'vitest';
import { migrateToLatest } from '@max-smart-city/db';
import type { Database } from '@max-smart-city/db';
import { provisionPostgres } from '../../../tests/support/postgres.mjs';
import { loadConfig } from '../src/config/load-config.js';
import { issueSession } from '../src/modules/auth/session-token.js';
import { registerIntakeAssignmentRoutes } from '../src/modules/cases/commands/intake-assignment/index.js';

const seed = await import(new URL('../../../packages/db/src/seed/index.ts', import.meta.url).href);
export const ids = seed.DEMO_IDS;
export async function productFixture() {
  const target = await provisionPostgres({adminUrl:process.env.TEST_POSTGRES_ADMIN_URL!,suite:'tg026'});
  const url = target.migrationUrl;
  const pool = new Pool({ connectionString: url, max: 16 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  const config = loadConfig({ APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: url,
    APP_SESSION_SECRET: 'product-test-secret'.padEnd(40, 'x'), MAX_ADAPTER_MODE: 'live',
    MAX_BOT_TOKEN: 'product-test-bot', MAX_WEBHOOK_SECRET: 'w'.repeat(32),
    PUBLIC_APP_URL: 'https://localhost/', PUBLIC_API_BASE_URL: 'https://localhost/api/v1', BUILD_SHA: 'a'.repeat(40) });
  const app = fastify({ loggerInstance: pino({ enabled: false }), routerOptions:{maxParamLength:16384} });
  registerIntakeAssignmentRoutes(app, config, { database: db });
  const tokens: Record<string, string> = {};
  beforeAll(async () => {
    await migrateToLatest(db); await seed.seedDemoCatalog(pool);
    await db.updateTable('category').set({result_requirement:'NONE'}).where('category_id','=',ids.categoryB).execute();
    for (const [name, user, binding, role] of [
      ['resident', ids.resident, ids.residentRole, 'RESIDENT'],
      ['uk', ids.ukEmployee, ids.ukEmployeeRole, 'UK_EMPLOYEE'],
      ['admin', ids.ukAdmin, ids.ukAdminRole, 'UK_ADMIN'],
      ['a', ids.contractorAEmployee, ids.contractorAEmployeeRole, 'CONTRACTOR_EMPLOYEE'],
      ['b', ids.contractorBEmployee, ids.contractorBEmployeeRole, 'CONTRACTOR_EMPLOYEE'],
    ] as const) {
      const identity = randomUUID();
      await db.insertInto('max_identity').values({ max_identity_id: identity, mini_app_user_id: name,
        app_user_id: user, bot_user_id: null, delivery_chat_id: name, delivery_chat_type: 'DIALOG',
        link_status: 'LINKED_CONFIRMED', first_seen_at: new Date(), last_seen_at: new Date(), linked_at: new Date() }).execute();
      tokens[name] = issueSession({ max_identity_id: identity, app_user_id: user, role_binding_id: binding,
        role, demo_mode: false, demo_run_id: null, real_display_name: name }, config, Math.floor(Date.now()/1000)).token;
    }
    await app.ready();
  }, 60000);
  afterAll(async () => {
    await app.close(); await db.destroy();
    await target.cleanup();
  });
  const headers = (actor: string, key = randomUUID()) => ({ authorization: `Bearer ${tokens[actor]}`, 'idempotency-key': key });
  const json = (caseId: string, slug: string, actor: string, body: unknown, key?: string) =>
    app.inject({ method: 'POST', url: `/api/v1/cases/${caseId}/commands/${slug}`, headers: headers(actor, key), payload: body });
  const multipart = (url: string, actor: string, payload: unknown,
    files: { field?: string; mime?: string; bytes?: Buffer; name?: string }[] = [], key?: string) => {
    const boundary = `product-${randomUUID()}`;
    const chunks = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(payload)}\r\n`)];
    for (const file of files) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'files[]'}"; filename="${file.name ?? 'proof.txt'}"\r\nContent-Type: ${file.mime ?? 'text/plain'}\r\n\r\n`), file.bytes ?? Buffer.from('proof'), Buffer.from('\r\n'));
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return app.inject({ method: 'POST', url, headers: { ...headers(actor, key), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(chunks) });
  };
  const create = async (category = ids.categoryB) => {
    const res = await multipart('/api/v1/cases', 'resident', { premises_id: ids.premises, category_id: category, description: `Течь ${randomUUID()}` });
    expect(res.statusCode, res.body).toBe(201);
    return { caseId: res.json().case_id as string, iterationId: res.json().created.iteration_id as string };
  };
  const execute = async () => {
    const c = await create();
    expect((await json(c.caseId, 'accept', 'uk', {})).statusCode).toBe(200);
    const selected = await json(c.caseId, 'select-contractor', 'uk', { iteration_id: c.iterationId, contractor_id: ids.contractorA });
    const sent = await json(c.caseId, 'send-assignment', 'uk', { iteration_id: c.iterationId, selection_id: selected.json().created.selection_id });
    const assignmentId = sent.json().created.assignment_id as string;
    expect((await json(c.caseId, 'accept-assignment', 'a', { assignment_id: assignmentId })).statusCode).toBe(200);
    return { ...c, assignmentId };
  };
  return { app, db, pool, config, tokens, headers, json, multipart, create, execute };
}
