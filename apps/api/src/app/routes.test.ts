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

import { buildApp } from './app.js';

it('registers exactly three GET routes and Fastify HEAD companions via onRoute metadata', async () => {
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
    expect(registered.sort((a, b) => `${a.url}:${a.method}`.localeCompare(`${b.url}:${b.method}`))).toEqual([
      { method: 'GET', url: '/health/live' }, { method: 'HEAD', url: '/health/live' },
      { method: 'GET', url: '/health/ready' }, { method: 'HEAD', url: '/health/ready' },
      { method: 'GET', url: '/api/v1/system/info' }, { method: 'HEAD', url: '/api/v1/system/info' },
    ].sort((a, b) => `${a.url}:${a.method}`.localeCompare(`${b.url}:${b.method}`)));
  } finally { await app.close(); }
});
