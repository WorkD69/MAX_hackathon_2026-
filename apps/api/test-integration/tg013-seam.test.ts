import fastify from 'fastify';
import { verifyOwnedLegacySuite } from '../../../tests/support/postgres.mjs';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DestinationStream } from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthMaxSuccessSchema, ErrorResponseSchema, SessionReadResponseSchema } from '@max-smart-city/contracts';
import type { Database } from '@max-smart-city/db';
import { CommandTransactionKernel, migrateToLatest } from '../../../packages/db/src/index.js';
import { DEMO_ACTOR_ALLOWLIST, DEMO_IDS, seedDemoCatalog } from '../../../packages/db/src/seed/index.js';
import { registerAuthRoutes } from '../src/modules/auth/plugin.js';
import { loadConfig } from '../src/config/load-config.js';
import { createRuntimeLogger } from '../src/logging/logger.js';
import { createTransactionAuthorizationRepository } from '../src/modules/commands/kernel/authorization.js';
import { AuthService } from '../src/modules/auth/service.js';
import { verifySession } from '../src/modules/auth/session-token.js';
import { PostgresMaxIdentityRepository } from '../src/modules/max-identity/repository.js';
import { AuthorizationPolicy } from '../src/modules/authorization/policy.js';
import type { RuntimeFastifyInstance } from '../src/app/static.js';

const url = process.env.TG013_SEAM_TEST_DATABASE_URL;
if (!url) throw new Error('MISSING_TG013_SEAM_TEST_DATABASE_URL');
if (!decodeURIComponent(new URL(url).pathname).endsWith('_tg013_seam_test')) throw new Error('UNSAFE_TEST_DATABASE');
const schema = 'tg013_session_policy_seam';
const admin = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
const now = 1771409719;
const raw = 'chat=%7B%22id%22%3A12345%2C%22type%22%3A%22DIALOG%22%7D&ip=192.168.0.1&user=%7B%22id%22%3A67890%2C%22first_name%22%3A%22Max%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3Anull%2C%22language_code%22%3A%22ru%22%2C%22photo_url%22%3Anull%7D&query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd&auth_date=1771409719&hash=4cc1bccc784cc661a1a8c2d158631c86f2fe610050af96b54f30450f45d489e6';
const runId = 'd0130000-0000-4000-8000-000000000001';
const caseId = 'd0130000-0000-4000-8000-000000000002';
const iterationId = 'd0130000-0000-4000-8000-000000000003';
const config = loadConfig({
  APP_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: url,
  APP_SESSION_SECRET: 'TG013_SEAM_SESSION_SECRET_'.padEnd(32, 's'),
  MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: 'TG010_TEST_BOT_TOKEN_2026',
  MAX_WEBHOOK_SECRET: 'w'.repeat(32), PUBLIC_APP_URL: 'http://frontend/',
  PUBLIC_API_BASE_URL: 'http://api/api/v1', BUILD_SHA: 'a'.repeat(40),
});
const repository = new PostgresMaxIdentityRepository(pool);
const authorizationRepository = createTransactionAuthorizationRepository(db);
let app: RuntimeFastifyInstance;
let actorNullToken: string;
let maxIdentityId: string;
let ownedTargetVerified = false;

async function bootstrap() {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } });
  expect(response.statusCode).toBe(200);
  return AuthMaxSuccessSchema.parse(response.json());
}
async function select(roleView: 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE',
  userId = DEMO_ACTOR_ALLOWLIST.find((actor) => actor.role === roleView)!.appUserId,
  token = actorNullToken) {
  // TG-013 owns this future resolver; the TG-010/TG-011 consumers below use real database rows.
  const service = new AuthService(config, repository, () => now, authorizationRepository,
    async (run, view) => run === runId && view === roleView ? userId : null);
  return service.selectDemoActorSession(token, roleView);
}
async function read(token: string) {
  return app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${token}` } });
}
async function expectExpired(token: string) {
  const response = await read(token);
  expect(response.statusCode).toBe(401);
  expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('SESSION_EXPIRED');
}

beforeEach(async () => {
  await verifyOwnedLegacySuite('TG013_SEAM');
  ownedTargetVerified = true;
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrateToLatest(db);
  await seedDemoCatalog(pool);
  const logger = createRuntimeLogger(config, { write: () => true } as DestinationStream);
  app = fastify({ loggerInstance: logger.loggerInstance });
  registerAuthRoutes(app, config, { repository, authorizationRepository, nowSeconds: () => now });
  await app.ready();
  maxIdentityId = (await bootstrap()).session.real_max_identity.max_identity_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query(`INSERT INTO demo_run (demo_run_id,scenario_key,status,created_by_max_identity_id,
      notification_recipient_max_identity_id,primary_case_id,created_at,archived_at)
      VALUES ($1,'primary-housing-demo','ACTIVE',$2,$2,$3,now(),NULL)`, [runId, maxIdentityId, caseId]);
    await client.query(`INSERT INTO case_table (case_id,organization_id,house_id,premises_id,resident_user_id,
      category_id,description,created_at,updated_at,created_by_user_id,demo_run_id,category_name_snapshot,
      requires_access_snapshot,result_requirement_snapshot,default_contractor_snapshot_id,
      house_address_snapshot,premises_label_snapshot,current_state,current_iteration_id,revision,last_event_seq)
      VALUES ($1,$2,$3,$4,$5,$6,'Seam case',now(),now(),$5,$7,'Category',true,'PHOTO',$8,
        'Address','42','CREATED',$9,1,0)`, [caseId, DEMO_IDS.organization, DEMO_IDS.house,
      DEMO_IDS.premises, DEMO_IDS.resident, DEMO_IDS.categoryA, runId, DEMO_IDS.contractorA, iterationId]);
    await client.query(`INSERT INTO case_iteration (iteration_id,case_id,iteration_no,start_reason,started_at,started_by_user_id)
      VALUES ($1,$2,1,'INITIAL',now(),$3)`, [iterationId, caseId, DEMO_IDS.resident]);
    for (const actor of DEMO_ACTOR_ALLOWLIST) {
      await client.query(`INSERT INTO demo_run_actor (demo_run_id,app_user_id,role,actor_alias)
        VALUES ($1,$2,$3,$4)`, [runId, actor.appUserId, actor.role, actor.actorAlias]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  actorNullToken = (await bootstrap()).session_token;
});
afterEach(async () => { if (app) await app.close(); });
afterAll(async () => {
  await db.destroy();
  if (ownedTargetVerified) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

describe('TG013-CRIT-001: real PostgreSQL session/policy seam', () => {
  it('E: forged actor, binding, organization and contractor fields cannot enter bootstrap', async () => {
    const forged = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: {
      init_data: raw, app_user_id: DEMO_IDS.resident, role_binding_id: DEMO_IDS.residentRole,
      organization_id: DEMO_IDS.organization, contractor_id: DEMO_IDS.contractorA,
      actor_alias: 'contractor_b',
    } });
    expect(forged.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(forged.json()).error.code).toBe('INVALID_INIT_DATA_FORMAT');
  });
  it('A/H/I: exact binding revoke denies GET, while fresh bootstrap keeps run/Case with null actor', async () => {
    const selected = await select('RESIDENT');
    expect(verifySession(selected.session_token, config, now).role_binding_id).toBe(DEMO_IDS.residentRole);
    await pool.query('UPDATE user_role_binding SET active=false WHERE role_binding_id=$1', [DEMO_IDS.residentRole]);
    await expectExpired(selected.session_token);
    const fresh = await bootstrap();
    expect(fresh.session).toMatchObject({ demo_run_id: runId, primary_case_id: caseId,
      effective_actor: { app_user_id: null, role: null } });
  });
  it('B: ResidentPremisesAccess revoke denies actor session and switch candidate', async () => {
    const selected = await select('RESIDENT');
    await pool.query('UPDATE resident_premises_access SET active=false WHERE app_user_id=$1', [DEMO_IDS.resident]);
    await expectExpired(selected.session_token);
    expect((await bootstrap()).session.effective_actor.app_user_id).toBeNull();
    await expect(select('RESIDENT')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('C: UKHouseAccess revoke denies UK employee actor', async () => {
    const selected = await select('UK_EMPLOYEE');
    await pool.query('UPDATE uk_house_access SET active=false WHERE app_user_id=$1', [DEMO_IDS.ukEmployee]);
    await expectExpired(selected.session_token);
    expect((await bootstrap()).session.effective_actor.app_user_id).toBeNull();
    await expect(select('UK_EMPLOYEE')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('C: contractor organization membership revoke denies selected contractor actor', async () => {
    const selected = await select('CONTRACTOR_EMPLOYEE');
    await pool.query(`UPDATE organization_contractor SET active=false
      WHERE organization_id=$1 AND contractor_id=$2`, [DEMO_IDS.organization, DEMO_IDS.contractorA]);
    await expectExpired(selected.session_token);
    await expect(select('CONTRACTOR_EMPLOYEE')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('D/E: inactive AppUser or removed allowlist actor loses current session rights', async () => {
    const selected = await select('RESIDENT');
    await pool.query('UPDATE app_user SET active=false WHERE app_user_id=$1', [DEMO_IDS.resident]);
    await expectExpired(selected.session_token);
    expect((await bootstrap()).session.effective_actor.app_user_id).toBeNull();
    await pool.query('UPDATE app_user SET active=true WHERE app_user_id=$1', [DEMO_IDS.resident]);
    await pool.query('DELETE FROM demo_run_actor WHERE demo_run_id=$1 AND app_user_id=$2', [runId, DEMO_IDS.resident]);
    await expectExpired(selected.session_token);
    expect((await bootstrap()).session.effective_actor.app_user_id).toBeNull();
    await expect(select('RESIDENT')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('F: actor switch seam rejects a revoked selected candidate', async () => {
    await pool.query('UPDATE user_role_binding SET active=false WHERE role_binding_id=$1', [DEMO_IDS.ukAdminRole]);
    await expect(select('UK_ADMIN')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('G: TG-012 same-key switch replay gates stored TG-010 token through current TG-011 policy', async () => {
    const stored = await select('RESIDENT');
    const kernel = new CommandTransactionKernel(db);
    const replay = () => kernel.run({
      authenticate: () => ({ type: 'MAX_IDENTITY' as const, maxIdentityId }),
      idempotencyKey: 'same-switch-key', commandType: 'SWITCH_DEMO_ACTOR',
      prepare: () => ({ requestHash: 'a'.repeat(64), payload: { roleView: 'RESIDENT' as const } }),
      plan: {
        requestedTarget: () => ({ kind: 'NON_CASE' as const, caseId: null,
          authorizationKey: runId, authorizationContext: { roleView: 'RESIDENT' as const } }),
        storedTarget: () => ({ kind: 'NON_CASE' as const, caseId: null,
          authorizationKey: runId, authorizationContext: { roleView: 'RESIDENT' as const } }),
        authorize: async ({ transaction }) => {
          const policy = new AuthorizationPolicy(createTransactionAuthorizationRepository(transaction));
          const claims = verifySession(actorNullToken, config, now);
          await policy.selectDemoActor(claims, DEMO_IDS.resident, 'RESIDENT', caseId);
        },
        terminalGuard: async () => {}, validateExactTargets: async () => {},
        validateStateContext: async () => {}, lockConfiguration: async () => {},
        validateDomain: async () => {}, writeDomain: async () => null,
        updateProjection: async () => {}, appendEvents: async () => {},
        createNotificationIntents: async () => {},
        canonicalResponse: async () => ({ status: 200, body: { run_id: runId,
          session_token: stored.session_token } }),
      },
    });
    expect((await replay()).body.session_token).toBe(stored.session_token);
    expect((await replay()).replayed).toBe(true);
    await pool.query('UPDATE user_role_binding SET active=false WHERE role_binding_id=$1', [DEMO_IDS.residentRole]);
    await expect(replay()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('J: valid actor restore preserves exact actor, run and Case', async () => {
    const selected = await select('RESIDENT');
    const restored = await read(selected.session_token);
    expect(restored.statusCode).toBe(200);
    expect(SessionReadResponseSchema.parse(restored.json())).toEqual(selected.session);
    const fresh = await bootstrap();
    expect(fresh.session.demo_run_id).toBe(runId);
    expect(fresh.session.primary_case_id).toBe(caseId);
    expect(fresh.session.effective_actor.app_user_id).toBeNull();
  });
  it('K: multiple distinct bindings never union, and selected revoke has no fallback', async () => {
    const selected = await select('RESIDENT');
    const alternate = 'd0130000-0000-4000-8000-000000000010';
    await pool.query(`INSERT INTO user_role_binding (role_binding_id,app_user_id,role,active,created_at)
      VALUES ($1,$2,'RESIDENT',true,now())`, [alternate, DEMO_IDS.resident]);
    expect((await read(selected.session_token)).statusCode).toBe(200);
    await pool.query('UPDATE user_role_binding SET active=false WHERE role_binding_id=$1', [DEMO_IDS.residentRole]);
    await expectExpired(selected.session_token);
  });
  it('L: ambiguous same-role binding candidate fails closed before token issue', async () => {
    const alternate = 'd0130000-0000-4000-8000-000000000010';
    await pool.query(`INSERT INTO user_role_binding (role_binding_id,app_user_id,role,active,created_at)
      VALUES ($1,$2,'RESIDENT',true,now())`, [alternate, DEMO_IDS.resident]);
    await expect(select('RESIDENT')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});
