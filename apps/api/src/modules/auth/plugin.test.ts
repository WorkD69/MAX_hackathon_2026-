import { createHmac } from 'node:crypto';
import type { DestinationStream } from 'pino';
import {
  AuthMaxRequestSchema, AuthMaxSuccessSchema, ErrorResponseSchema, SessionReadResponseSchema,
} from '@max-smart-city/contracts';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app/app.js';
import { loadConfig } from '../../config/load-config.js';
import { createRuntimeLogger } from '../../logging/logger.js';
import { canonicalizeMaxInitData } from './init-data.js';
import type { ValidatedMaxLaunch } from './init-data.js';
import type {
  DemoActorRow, DemoRunRow, MaxIdentityRepository, MaxIdentityRow, NormalActorRow,
} from '../max-identity/repository.js';

const now = 1771409719;
const botToken = 'TG010_TEST_BOT_TOKEN_2026';
const raw = 'chat=%7B%22id%22%3A12345%2C%22type%22%3A%22DIALOG%22%7D&ip=192.168.0.1&user=%7B%22id%22%3A67890%2C%22first_name%22%3A%22Max%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3Anull%2C%22language_code%22%3A%22ru%22%2C%22photo_url%22%3Anull%7D&query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd&auth_date=1771409719&hash=4cc1bccc784cc661a1a8c2d158631c86f2fe610050af96b54f30450f45d489e6';
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
  upsertCount = 0;
  async upsertValidated(launch: ValidatedMaxLaunch, _at: Date): Promise<MaxIdentityRow> {
    this.upsertCount++;
    this.identity = {
      ...this.identity, mini_app_user_id: launch.miniAppUserId,
      delivery_chat_id: launch.chatId, delivery_chat_type: launch.chatType,
      link_status: 'LINKED_CONFIRMED',
    };
    return this.identity;
  }
  async findById(id: string): Promise<MaxIdentityRow | null> { return id === identityId ? this.identity : null; }
  async normalActors(id: string): Promise<NormalActorRow[]> { return id === userId ? [this.actor] : []; }
  async currentDemoRun(_id: string): Promise<DemoRunRow | null> { return this.run; }
  async demoActor(_runId: string, _appUserId: string): Promise<DemoActorRow | null> { return null; }
}

const config = (demo = false) => loadConfig({
  APP_ENV: 'test', DEMO_MODE: String(demo), DATABASE_URL: 'postgresql://db/city',
  APP_SESSION_SECRET: 'SESSION_SECRET_SENTINEL_'.padEnd(32, 's'),
  MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: botToken,
  MAX_WEBHOOK_SECRET: 'w'.repeat(32), PUBLIC_APP_URL: 'http://frontend/',
  PUBLIC_API_BASE_URL: 'http://api/api/v1', BUILD_SHA: 'a'.repeat(40),
});

async function fixture(repository = new FakeRepository(), demo = false) {
  const lines: string[] = [];
  const clock = { value: now };
  const runtime = config(demo);
  const pair = createRuntimeLogger(runtime, { write: (line: string) => { lines.push(line); return true; } } as DestinationStream);
  const app = await buildApp({
    config: runtime, logger: pair.loggerInstance, events: pair.events,
    readiness: { snapshot: () => ({ databaseReachable: true, migrationsCurrent: true, applicationInitialized: true }) },
    auth: { repository, nowSeconds: () => clock.value },
  });
  return { app, repository, lines, runtime, clock };
}

describe('TG-002 HTTP auth/session wire boundary', () => {
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
