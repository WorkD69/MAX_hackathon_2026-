import type { DestinationStream } from 'pino';
import { expect, it, vi } from 'vitest';
import { loadConfig } from '../config/load-config.js';
import { createRuntimeLogger } from '../logging/logger.js';

const registered = vi.hoisted(() => [] as Array<{ method: string; url: string }>);
vi.mock('fastify', async importOriginal => {
  const actual = await importOriginal<typeof import('fastify')>();
  const factory = ((...args: unknown[]) => {
    const app = (actual.default as (...values: unknown[]) => ReturnType<typeof actual.default>)(...args);
    app.addHook('onRoute', (route: { method: string | string[]; url: string }) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) registered.push({ method, url: route.url });
    });
    return app;
  }) as typeof actual.default;
  return { ...actual, default: factory };
});

it('live composition exposes the authenticated MAX webhook without starting network work at ready()', async () => {
  const config = loadConfig({ APP_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: 'postgresql://db/city',
    APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: 'test-only-bot-token',
    MAX_WEBHOOK_SECRET: 'test-only-webhook-secret', PUBLIC_APP_URL: 'https://city.example/',
    PUBLIC_API_BASE_URL: 'https://city.example/api/v1', BUILD_SHA: 'a'.repeat(40) });
  const pair = createRuntimeLogger(config, { write: () => true } as DestinationStream);
  const app = await buildApp({ config, logger: pair.loggerInstance, events: pair.events });
  try {
    expect(app.hasRoute({ method: 'POST', url: '/integrations/max/webhook' })).toBe(true);
    const invalid = await app.inject({ method: 'POST', url: '/integrations/max/webhook', payload: {} });
    expect(invalid.statusCode).toBe(401);
    expect(app.server.listening).toBe(false);
  } finally { await app.close(); }
});

import { buildApp } from './app.js';

it('registers each canonical product route once, with GET/HEAD companions', async () => {
  registered.length = 0;
  const config = loadConfig({
    APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
    APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
    PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
    BUILD_SHA: 'a'.repeat(40),
  });
  const pair = createRuntimeLogger(config, { write: () => true } as DestinationStream);
  const app = await buildApp({ config, logger: pair.loggerInstance, events: pair.events,
    readiness: { snapshot: () => ({ databaseReachable: false, migrationsCurrent: false, applicationInitialized: false }) } });
  try {
    const keys = registered.map(route => `${route.method} ${route.url}`);
    expect(new Set(keys).size).toBe(keys.length);
    const reads = ['/health/live', '/health/ready', '/api/v1/system/info', '/api/v1/session',
      '/api/v1/cases/create-options', '/api/v1/cases', '/api/v1/cases/:caseId',
      '/api/v1/cases/:caseId/contractor-candidates', '/api/v1/attachments/:attachmentId', '/downloads/:capability',
      ...['organization', 'houses', 'categories', 'contractors', 'users'].map(name => `/api/v1/config/${name}`)];
    expect(registered.filter(route => route.method === 'GET').map(route => route.url).sort()).toEqual(reads.sort());
    for (const url of reads) expect(keys).toContain(`HEAD ${url}`);
    const commands = ['accept', 'select-contractor', 'send-assignment', 'accept-assignment', 'reject-assignment',
      'submit-result', 'resident-confirmation', 'resident-remark', 'request-clarification',
      'record-no-resident-feedback', 'return-to-rework', 'complete', 'complete-with-explanation'];
    for (const slug of commands) expect(keys).toContain(`POST /api/v1/cases/:caseId/commands/${slug}`);
    for (const url of ['/api/v1/auth/max', '/api/v1/demo/runs', '/api/v1/demo/session/actor', '/api/v1/cases',
      '/api/v1/cases/:caseId/comments', '/api/v1/cases/:caseId/result-materials', '/api/v1/attachments/:attachmentId/download-capability']) {
      expect(keys).toContain(`POST ${url}`);
    }
  } finally { await app.close(); }
});
