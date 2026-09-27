import { createHmac, randomBytes } from 'node:crypto';
import type { DestinationStream } from 'pino';
import {
  AuthMaxRequestSchema, AuthMaxSuccessSchema, ErrorResponseSchema, SessionReadResponseSchema,
} from '@max-smart-city/contracts';
import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/load-config.js';
import { createRuntimeLogger } from '../../logging/logger.js';
import { registerHealthRoutes } from '../health/plugin.js';
import { canonicalizeMaxInitData, validateMaxInitData } from './init-data.js';
import { signSyntheticMaxInitData } from './test-signing.fixture.js';
import type { ValidatedMaxLaunch } from './init-data.js';
import type {
  DemoActorRow, DemoRunRow, MaxIdentityRepository, MaxIdentityRow, NormalActorRow,
} from '../max-identity/repository.js';
import { registerAuthRoutes } from './plugin.js';
import type { AuthorizationRepository, Binding } from '../authorization/policy.js';
import { AuthService } from './service.js';
import { verifySession } from './session-token.js';

const now = 1771409719;
const botToken = 'TG010_TEST_BOT_TOKEN_2026';
const raw = 'chat=%7B%22id%22%3A12345%2C%22type%22%3A%22DIALOG%22%7D&ip=192.168.0.1&user=%7B%22id%22%3A67890%2C%22first_name%22%3A%22Max%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3Anull%2C%22language_code%22%3A%22ru%22%2C%22photo_url%22%3Anull%7D&query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd&auth_date=1771409719&hash=4cc1bccc784cc661a1a8c2d158631c86f2fe610050af96b54f30450f45d489e6';
const signedLaunch = (chatType: 'DIALOG' | 'CHAT' | 'CHANNEL', chatId: number): string => {
  const params = new URLSearchParams(raw);
  params.set('chat', JSON.stringify({ id: chatId, type: chatType }));
  params.set('hash', '0'.repeat(64));
  const canonical = canonicalizeMaxInitData(params.toString()).launchParams;
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', key).update(canonical).digest('hex'));
  return params.toString();
};
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const identityId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roleBindingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const runId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const caseId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

class FakeRepository implements MaxIdentityRepository {
  identity: MaxIdentityRow = {
    max_identity_id: identityId, mini_app_user_id: null, delivery_chat_id: null,
    delivery_chat_type: null, link_status: 'UNLINKED', app_user_id: userId,
  };
  actor: NormalActorRow = {
    app_user_id: userId, display_name: 'Resident', user_active: true,
    role_binding_id: roleBindingId, role: 'RESIDENT', organization_id: null,
    contractor_id: null, organization_active: null, contractor_active: null,
  };
  run: DemoRunRow | null = null;
  demoActorRow: DemoActorRow | null = null;
  demoBindings: Binding[] = [];
  demoAccess = true;
  upsertCount = 0;
  async upsertValidated(launch: ValidatedMaxLaunch, _at: Date): Promise<MaxIdentityRow> {
    this.upsertCount++;
    const personal = launch.chatType === 'DIALOG';
    this.identity = {
      ...this.identity, mini_app_user_id: launch.miniAppUserId,
      delivery_chat_id: personal ? launch.chatId : this.identity.delivery_chat_id,
      delivery_chat_type: personal ? launch.chatType : this.identity.delivery_chat_type,
      link_status: personal || this.identity.delivery_chat_type === 'DIALOG' ? 'LINKED_CONFIRMED' : 'UNLINKED',
    };
    return this.identity;
  }
  async findById(id: string): Promise<MaxIdentityRow | null> { return id === identityId ? this.identity : null; }
  async normalActors(id: string): Promise<NormalActorRow[]> { return id === userId ? [this.actor] : []; }
  async currentDemoRun(_id: string): Promise<DemoRunRow | null> { return this.run; }
  async demoActor(runId: string, appUserId: string): Promise<DemoActorRow | null> {
    return runId === this.run?.demo_run_id && appUserId === this.demoActorRow?.app_user_id ? this.demoActorRow : null;
  }
}

function demoPolicyRepository(repo: FakeRepository): AuthorizationRepository {
  return {
    identity: async (id) => id === identityId ? { app_user_id: repo.identity.app_user_id } : null,
    appUser: async (id) => id === repo.demoActorRow?.app_user_id ? { active: repo.demoActorRow.active } : null,
    bindings: async (id) => id === repo.demoActorRow?.app_user_id ? repo.demoBindings : [],
    organization: async () => ({ active: true }), contractor: async () => ({ active: true }),
    demoRun: async (id) => id === repo.run?.demo_run_id
      ? { status: 'ACTIVE', created_by_max_identity_id: identityId } : null,
    demoActor: async (run, user) => (await repo.demoActor(run, user)) ? { role: repo.demoActorRow!.role } : null,
    house: async () => null, premises: async () => null,
    residentAccess: async () => repo.demoAccess,
    residentAnyAccess: async () => repo.demoAccess,
    ukHouseAccess: async () => repo.demoAccess,
    ukAnyHouseAccess: async () => repo.demoAccess,
    organizationContractor: async () => true,
    contractorAnyOrganization: async () => true,
    caseById: async () => null, attachmentById: async () => null,
  };
}

const config = (demo = false) => loadConfig({
  APP_ENV: 'test', DEMO_MODE: String(demo), DATABASE_URL: 'postgresql://db/city',
  APP_SESSION_SECRET: 'SESSION_SECRET_SENTINEL_'.padEnd(32, 's'),
  MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: botToken,
  MAX_WEBHOOK_SECRET: 'w'.repeat(32), PUBLIC_APP_URL: 'http://frontend/',
  PUBLIC_API_BASE_URL: 'http://api/api/v1', BUILD_SHA: 'a'.repeat(40),
});

describe('TEST-only signed initData through real auth HTTP route', () => {
  it('persists signed identity, restores DemoRun, issues and reads a real session without disclosing the key', async () => {
    const signingKey = randomBytes(32);
    const keyHex = signingKey.toString('hex');
    const clock = Math.floor(Date.now() / 1000);
    const runtime = loadConfig({
      APP_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: 'postgresql://db/city',
      APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
      TEST_AUTH_DEMO_PROFILE: 'TEST_DEMO_E2E_V1', TEST_MAX_INIT_DATA_SIGNING_KEY: keyHex,
      PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1', BUILD_SHA: 'a'.repeat(40),
    });
    const repository = new FakeRepository();
    repository.identity.app_user_id = null;
    repository.run = { demo_run_id: runId, primary_case_id: caseId };
    const lines: string[] = [];
    const pair = createRuntimeLogger(runtime, { write: (line: string) => { lines.push(line); return true; } } as DestinationStream);
    const app = fastify({ loggerInstance: pair.loggerInstance });
    registerAuthRoutes(app, runtime, { repository, nowSeconds: () => clock });
    registerHealthRoutes(app, {
      readiness: { snapshot: async () => ({ databaseReachable: true, migrationsCurrent: true, applicationInitialized: true }) },
      events: pair.events, buildSha: runtime.BUILD_SHA,
    });
    await app.ready();
    try {
      const signed = signSyntheticMaxInitData({
        profile: 'TEST_DEMO_E2E_V1', signingKey, nowSeconds: clock,
        userId: '67890', chatId: '12345', chatType: 'DIALOG',
      });
      const authenticate = (init_data: string) => app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data } });
      const good = await authenticate(signed);
      expect(good.statusCode).toBe(200);
      const success = AuthMaxSuccessSchema.parse(good.json());
      expect(repository.identity).toMatchObject({
        mini_app_user_id: '67890', delivery_chat_id: '12345', delivery_chat_type: 'DIALOG',
      });
      expect(repository.upsertCount).toBe(1);
      expect(success.session).toMatchObject({ demo_mode: true, demo_run_id: runId, primary_case_id: caseId });
      const read = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${success.session_token}` } });
      expect(read.statusCode).toBe(200);
      expect(SessionReadResponseSchema.parse(read.json())).toEqual(success.session);
      const info = await app.inject({ method: 'GET', url: '/api/v1/system/info' });
      expect(info.json()).toEqual({ build_sha: runtime.BUILD_SHA });

      for (const [invalid, code] of [
        [signed.replace('67890', '67891'), 'MAX_INIT_DATA_INVALID_SIGNATURE'],
        [signed.replace('12345', '12346'), 'MAX_INIT_DATA_INVALID_SIGNATURE'],
        [signed.replace(/hash=[0-9a-f]{64}/, `hash=${'0'.repeat(64)}`), 'MAX_INIT_DATA_INVALID_SIGNATURE'],
        [signed.replace('auth_date=', 'auth_date=%Q'), 'INVALID_INIT_DATA_FORMAT'],
        [signSyntheticMaxInitData({ profile: 'TEST_DEMO_E2E_V1', signingKey, nowSeconds: clock - 301, userId: '67890', chatId: '12345' }), 'MAX_INIT_DATA_EXPIRED'],
        [signSyntheticMaxInitData({ profile: 'TEST_DEMO_E2E_V1', signingKey, nowSeconds: clock + 31, userId: '67890', chatId: '12345' }), 'MAX_INIT_DATA_EXPIRED'],
      ] as const) {
        const rejected = await authenticate(invalid);
        expect(rejected.statusCode).toBe(code === 'INVALID_INIT_DATA_FORMAT' ? 400 : 401);
        expect(ErrorResponseSchema.parse(rejected.json()).error.code).toBe(code);
      }
      expect(repository.upsertCount).toBe(1);
      const output = lines.join('') + good.body + read.body + info.body;
      for (const secret of [keyHex, signingKey.toString('base64'), signed]) expect(output).not.toContain(secret);
      expect(JSON.stringify(repository.identity)).not.toContain(keyHex);

      const live = config(true);
      expect(() => validateMaxInitData(signed, live, clock)).toThrowError('MAX_INIT_DATA_INVALID_SIGNATURE');
      expect(() => validateMaxInitData(raw, runtime, clock)).toThrowError('MAX_INIT_DATA_INVALID_SIGNATURE');
      const noProfile = loadConfig({
        APP_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: 'postgresql://db/city',
        APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
        PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1', BUILD_SHA: 'a'.repeat(40),
      });
      expect(() => validateMaxInitData(signed, noProfile, clock)).toThrowError('INVALID_INIT_DATA_FORMAT');
      const production = loadConfig({
        APP_ENV: 'production', DEMO_MODE: 'true', DATABASE_URL: 'postgresql://db/city',
        APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: botToken,
        MAX_WEBHOOK_SECRET: 'w'.repeat(32), PUBLIC_APP_URL: 'https://frontend.example/',
        PUBLIC_API_BASE_URL: 'https://api.example/api/v1', BUILD_SHA: 'a'.repeat(40),
      });
      expect(() => validateMaxInitData(signed, production, clock)).toThrowError('MAX_INIT_DATA_INVALID_SIGNATURE');
    } finally { await app.close(); }
  }, 30_000);
});

async function fixture(repository = new FakeRepository(), demo = false,
  authorizationRepository?: AuthorizationRepository) {
  const lines: string[] = [];
  const clock = { value: now };
  const runtime = config(demo);
  const pair = createRuntimeLogger(runtime, { write: (line: string) => { lines.push(line); return true; } } as DestinationStream);
  const app = fastify({ loggerInstance: pair.loggerInstance });
  registerAuthRoutes(app, runtime, { repository,
    ...(authorizationRepository ? { authorizationRepository } : {}), nowSeconds: () => clock.value });
  await app.ready();
  return { app, repository, lines, runtime, clock };
}

describe('TG-002 HTTP auth/session wire boundary', () => {
  it.each(['CHAT', 'CHANNEL'] as const)('does not use a signed %s launch as a personal target', async chatType => {
    const { app, repository } = await fixture();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: signedLaunch(chatType, -500) } });
      expect(response.statusCode).toBe(200);
      const success = AuthMaxSuccessSchema.parse(response.json());
      expect(success.session.real_max_identity.outbound_max_ready).toBe(false);
      expect(repository.identity).toMatchObject({ delivery_chat_id: null, delivery_chat_type: null, link_status: 'UNLINKED' });
      const read = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${success.session_token}` } });
      expect(SessionReadResponseSchema.parse(read.json()).real_max_identity.outbound_max_ready).toBe(false);
    } finally { await app.close(); }
  });

  it.each(['CHAT', 'CHANNEL'] as const)('preserves a personal DIALOG after a %s launch', async chatType => {
    const { app, repository } = await fixture();
    try {
      const first = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } });
      expect(first.statusCode).toBe(200);
      const second = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: signedLaunch(chatType, -500) } });
      expect(second.statusCode).toBe(200);
      expect(AuthMaxSuccessSchema.parse(second.json()).session.real_max_identity.outbound_max_ready).toBe(true);
      expect(repository.identity).toMatchObject({ delivery_chat_id: '12345', delivery_chat_type: 'DIALOG', link_status: 'LINKED_CONFIRMED' });
    } finally { await app.close(); }
  });

  it('reports a persisted non-personal target as not ready', async () => {
    const { app, repository } = await fixture();
    try {
      const bootstrap = AuthMaxSuccessSchema.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } })).json());
      repository.identity.delivery_chat_id = '-500';
      repository.identity.delivery_chat_type = 'CHAT';
      const read = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${bootstrap.session_token}` } });
      expect(SessionReadResponseSchema.parse(read.json()).real_max_identity.outbound_max_ready).toBe(false);
    } finally { await app.close(); }
  });
  it('bootstraps without Bearer, persists validated chat metadata and reads session with Bearer', async () => {
    const { app, repository } = await fixture();
    try {
      const requestId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      const body = AuthMaxRequestSchema.parse({ init_data: raw });
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/max', headers: { 'x-request-id': requestId }, payload: body });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const success = AuthMaxSuccessSchema.parse(response.json());
      expect(Object.keys(response.json())).toEqual(['session_token', 'expires_at', 'session']);
      expect(success.session.real_max_identity.outbound_max_ready).toBe(true);
      expect(success.session.effective_actor).toEqual({ app_user_id: userId, role: 'RESIDENT', display_name: 'Resident' });
      expect(repository.identity).toMatchObject({
        mini_app_user_id: '67890', delivery_chat_id: '12345', delivery_chat_type: 'DIALOG', app_user_id: userId,
      });
      const read = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${success.session_token}` } });
      expect(read.statusCode).toBe(200);
      expect(read.headers['cache-control']).toBe('no-store');
      expect(SessionReadResponseSchema.parse(read.json())).toEqual(success.session);
      expect(Object.keys(read.json())).toEqual(['real_max_identity', 'demo_mode', 'demo_run_id', 'primary_case_id', 'effective_actor']);
    } finally { await app.close(); }
  });

  it('returns strict documented errors for malformed request, bad signature and missing/invalid Bearer', async () => {
    const { app } = await fixture();
    try {
      for (const [payload, status, code] of [
        [{ init_data: raw, role: 'UK_ADMIN' }, 400, 'INVALID_INIT_DATA_FORMAT'],
        [{ init_data: raw.replace('67890', '67891') }, 401, 'MAX_INIT_DATA_INVALID_SIGNATURE'],
      ] as const) {
        const response = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload });
        expect(response.statusCode).toBe(status);
        expect(ErrorResponseSchema.parse(response.json()).error.code).toBe(code);
        expect(Object.keys(response.json().error)).toEqual(['code', 'message', 'request_id']);
      }
      const invalidJson = await app.inject({ method: 'POST', url: '/api/v1/auth/max',
        headers: { 'content-type': 'application/json' }, payload: '{invalid' });
      expect(invalidJson.statusCode).toBe(400);
      expect(ErrorResponseSchema.parse(invalidJson.json()).error.code).toBe('INVALID_INIT_DATA_FORMAT');
      for (const authorization of [undefined, 'Basic abc', 'Bearer malformed']) {
        const response = await app.inject({ method: 'GET', url: '/api/v1/session',
          headers: authorization ? { authorization } : {} });
        expect(response.statusCode).toBe(401);
        expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('UNAUTHENTICATED');
      }
    } finally { await app.close(); }
  });

  it('rejects unmapped normal identity and revoked selected binding', async () => {
    const repository = new FakeRepository();
    repository.identity.app_user_id = null;
    const { app } = await fixture(repository);
    try {
      const unmapped = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } });
      expect(unmapped.statusCode).toBe(403);
      expect(ErrorResponseSchema.parse(unmapped.json()).error.code).toBe('APP_USER_NOT_MAPPED');
      repository.identity.app_user_id = userId;
      const bootstrap = AuthMaxSuccessSchema.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } })).json());
      repository.actor.user_active = false;
      const revoked = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${bootstrap.session_token}` } });
      expect(revoked.statusCode).toBe(401);
      expect(ErrorResponseSchema.parse(revoked.json()).error.code).toBe('SESSION_EXPIRED');
    } finally { await app.close(); }
  });

  it('returns the documented expiry envelope when the Bearer TTL elapses', async () => {
    const { app, clock } = await fixture();
    try {
      const bootstrap = AuthMaxSuccessSchema.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } })).json());
      clock.value += 900;
      const expired = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${bootstrap.session_token}` } });
      expect(expired.statusCode).toBe(401);
      expect(ErrorResponseSchema.parse(expired.json()).error.code).toBe('SESSION_EXPIRED');
    } finally { await app.close(); }
  });

  it('restores the same current demo run on fresh bootstrap without creating a run', async () => {
    const repository = new FakeRepository();
    repository.identity.app_user_id = null;
    repository.run = { demo_run_id: runId, primary_case_id: caseId };
    const { app } = await fixture(repository, true);
    try {
      const first = AuthMaxSuccessSchema.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } })).json());
      const second = AuthMaxSuccessSchema.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } })).json());
      expect(first.session.demo_run_id).toBe(runId);
      expect(second.session.primary_case_id).toBe(caseId);
      expect(first.session.effective_actor.app_user_id).toBeNull();
      expect(first.session_token).not.toBe(second.session_token);
      expect(repository.upsertCount).toBe(2);
      const read = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${second.session_token}` } });
      expect(SessionReadResponseSchema.parse(read.json()).demo_run_id).toBe(runId);
    } finally { await app.close(); }
  });

  it('issues an exact demo binding and revalidates it through GET session', async () => {
    const repository = new FakeRepository();
    repository.identity.app_user_id = null;
    repository.run = { demo_run_id: runId, primary_case_id: null };
    repository.demoActorRow = { app_user_id: userId, display_name: 'Resident', role: 'RESIDENT', active: true };
    repository.demoBindings = [{ role_binding_id: roleBindingId, app_user_id: userId,
      role: 'RESIDENT', organization_id: null, contractor_id: null, active: true }];
    const policy = demoPolicyRepository(repository);
    const { app, runtime } = await fixture(repository, true, policy);
    const service = new AuthService(runtime, repository, () => now, policy, async () => userId);
    try {
      const bootstrap = AuthMaxSuccessSchema.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } })).json());
      const selected = await service.selectDemoActorSession(bootstrap.session_token, 'RESIDENT');
      expect(verifySession(selected.session_token, runtime, now).role_binding_id).toBe(roleBindingId);
      const read = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${selected.session_token}` } });
      expect(read.statusCode).toBe(200);
      expect(SessionReadResponseSchema.parse(read.json()).effective_actor.app_user_id).toBe(userId);
      repository.demoBindings[0]!.active = false;
      const revoked = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${selected.session_token}` } });
      expect(revoked.statusCode).toBe(401);
      expect(ErrorResponseSchema.parse(revoked.json()).error.code).toBe('SESSION_EXPIRED');
      const fresh = AuthMaxSuccessSchema.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } })).json());
      expect(fresh.session.effective_actor.app_user_id).toBeNull();
      await expect(service.selectDemoActorSession(fresh.session_token, 'RESIDENT'))
        .rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    } finally { await app.close(); }
  });

  it('keeps every secret and signed intermediate out of logs and persistence', async () => {
    const { app, repository, lines, runtime } = await fixture();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/max', payload: { init_data: raw } });
      const token = AuthMaxSuccessSchema.parse(response.json()).session_token;
      await app.inject({ method: 'GET', url: '/api/v1/session', headers: { authorization: `Bearer ${token}` } });
      const derived = createHmac('sha256', 'WebAppData').update(botToken).digest('hex');
      const canonical = canonicalizeMaxInitData(raw).launchParams;
      const signature = raw.slice(raw.lastIndexOf('hash=') + 5);
      const output = lines.join('');
      expect(lines.length).toBeGreaterThan(0);
      for (const secret of [runtime.APP_SESSION_SECRET, botToken, derived, raw, token, signature, canonical, raw.slice(0, 30)]) {
        expect(output).not.toContain(secret);
        expect(JSON.stringify(repository.identity)).not.toContain(secret);
      }
      expect(Object.keys(repository.identity)).toEqual([
        'max_identity_id', 'mini_app_user_id', 'delivery_chat_id', 'delivery_chat_type', 'link_status', 'app_user_id',
      ]);
    } finally { await app.close(); }
  });
});
