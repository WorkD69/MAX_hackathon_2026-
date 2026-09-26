import type { DestinationStream } from 'pino';
import { expect, test } from 'vitest';
import { buildApp } from '../app/app.js';
import { loadConfig } from '../config/load-config.js';
import { createRuntimeLogger } from '../logging/logger.js';

test('maintenance recovery has no public or product HTTP action', async () => {
  const config = loadConfig({
    APP_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: 'postgresql://localhost/demo',
    APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
    PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
    BUILD_SHA: 'a'.repeat(40),
  });
  const pair = createRuntimeLogger(config, { write: () => true } as DestinationStream);
  const app = await buildApp({ config, logger: pair.loggerInstance, events: pair.events,
    readiness: { snapshot: () => ({ databaseReachable: false, migrationsCurrent: false, applicationInitialized: false }) } });
  try {
    for (const url of ['/api/v1/maintenance/reseed', '/api/v1/demo/reset', '/maintenance/reseed']) {
      const response = await app.inject({ method: 'POST', url });
      expect(response.statusCode, url).toBe(404);
    }
  } finally { await app.close(); }
});
