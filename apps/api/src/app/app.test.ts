import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DestinationStream } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/load-config.js';
import { createRuntimeLogger } from '../logging/logger.js';
import type { ReadinessSnapshot } from '../modules/health/readiness.js';
import { buildApp } from './app.js';
import { allowedPath } from './static.js';

const config = () => loadConfig({
  APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
  APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
  PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
  BUILD_SHA: 'a'.repeat(40),
});
const loggerPair = () => createRuntimeLogger(config(), { write: () => true } as DestinationStream);
const snapshot = (mask: number): ReadinessSnapshot => ({
  databaseReachable: Boolean(mask & 1), migrationsCurrent: Boolean(mask & 2), applicationInitialized: Boolean(mask & 4),
});
const exactReadyBody = (mask: number) => ({
  status: mask === 7 ? 'ready' : 'not_ready',
  checks: {
    database: mask & 1 ? 'up' : 'down',
    migrations: mask & 2 ? 'current' : 'pending',
    application: mask & 4 ? 'initialized' : 'pending',
  },
});

describe('runtime app diagnostics', () => {
  it('constructs without listening, uses supplied singleton, and closes', async () => {
    const pair = loggerPair();
    const childSpy = vi.spyOn(pair.loggerInstance, 'child');
    const app = await buildApp({ config: config(), logger: pair.loggerInstance, events: pair.events, readiness: { snapshot: () => snapshot(0) } });
    expect(childSpy).toHaveBeenCalled();
    expect(app.log.bindings()).toMatchObject(pair.loggerInstance.bindings());
    expect(app.server.listening).toBe(false);
    const routes = app.printRoutes();
    expect(app.hasRoute({ method: 'GET', url: '/health/live' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/health/ready' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/api/v1/system/info' })).toBe(true);
    expect(routes.match(/\(GET, HEAD\)/g)).toHaveLength(3);
    expect(routes).not.toContain('cases');
    expect(routes).not.toContain('integrations');
    await app.close();
  });

  it.each(Array.from({ length: 8 }, (_, mask) => [mask]))('returns exact readiness mapping for mask %i', async mask => {
    const pair = loggerPair();
    const app = await buildApp({ config: config(), logger: pair.loggerInstance, events: pair.events, readiness: { snapshot: () => snapshot(mask) } });
    try {
      const ready = await app.inject('/health/ready');
      expect(ready.statusCode).toBe(mask === 7 ? 200 : 503);
      expect(ready.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(ready.json()).toEqual(exactReadyBody(mask));
      const live = await app.inject('/health/live');
      expect(live.statusCode).toBe(200);
      expect(live.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(live.json()).toEqual({ status: 'ok' });
      const info = await app.inject('/api/v1/system/info');
      expect(info.statusCode).toBe(200);
      expect(info.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(info.json()).toEqual({ build_sha: 'a'.repeat(40) });
    } finally { await app.close(); }
  });

  it('returns all-false response and safe event when probe throws', async () => {
    const lines: string[] = [];
    const pair = createRuntimeLogger(config(), { write: (line: string) => { lines.push(line); return true; } } as DestinationStream);
    const app = await buildApp({ config: config(), logger: pair.loggerInstance, events: pair.events, readiness: { snapshot: () => { throw new Error('PROBE_SECRET_SENTINEL'); } } });
    try {
      const response = await app.inject('/health/ready');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual(exactReadyBody(0));
      expect(lines.join('')).toContain('readiness_probe_failed');
      expect(lines.join('')).toContain('READINESS_PROBE_FAILED');
      expect(lines.join('')).not.toContain('PROBE_SECRET_SENTINEL');
    } finally { await app.close(); }
  });
});

describe('static namespace isolation', () => {
  it('denies reserved namespaces at every depth and keeps control names eligible', () => {
    for (const pathname of ['/api/v1/hidden.txt', '\\API\\V1\\nested\\a.txt', '/health/unknown.html', '/integrations/private.txt']) {
      expect(allowedPath(pathname)).toBe(false);
    }
    for (const pathname of ['/healthz/ok.txt', '/api/v10/ok.txt', '/integration/ok.txt', '/assets/ok.txt']) {
      expect(allowedPath(pathname)).toBe(true);
    }
  });

  it('does not serve conflicting temp files under reserved namespaces', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tg003-static-'));
    const files = [
      ['api/v1/hidden.txt', 'SECRET_API'],
      ['health/unknown.html', 'SECRET_HEALTH'],
      ['integrations/private.txt', 'SECRET_INTEGRATIONS'],
      ['assets/ok.txt', 'SAFE_ASSET'],
      ['healthz/ok.txt', 'SAFE_HEALTHZ'],
      ['api/v10/ok.txt', 'SAFE_APIV10'],
      ['integration/ok.txt', 'SAFE_INTEGRATION'],
    ] as const;
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      for (const [name, body] of files) {
        const file = path.join(root, name);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, body);
      }
      const pair = loggerPair();
      app = await buildApp({ config: config(), logger: pair.loggerInstance, events: pair.events,
        readiness: { snapshot: () => snapshot(0) }, staticAssets: { root, prefix: '/', index: 'index.html' } });
      for (const [name, body] of files.slice(0, 3)) {
        const response = await app.inject(`/${name}`);
        expect(response.statusCode).toBe(404);
        expect(response.body).not.toContain(body);
      }
      for (const pathname of ['/api/v1/unknown/deep.txt', '/health/unknown/deep.txt', '/integrations/unknown/deep.txt']) {
        expect((await app.inject(pathname)).statusCode).toBe(404);
      }
      for (const [name, body] of files.slice(3)) {
        const response = await app.inject(`/${name}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe(body);
      }
    } finally {
      await app?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
