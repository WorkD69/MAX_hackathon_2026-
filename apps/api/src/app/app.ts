import fastify from 'fastify';
import type pino from 'pino';
import type { RuntimeConfig } from '../config/types.js';
import type { RuntimeEventLogger } from '../logging/logger.js';
import { registerHealthRoutes } from '../modules/health/plugin.js';
import type { ReadinessProbe } from '../modules/health/readiness.js';
import { registerAuthRoutes } from '../modules/auth/plugin.js';
import type { AuthModuleOptions } from '../modules/auth/plugin.js';
import { registerStaticAssets } from './static.js';
import type { StaticAssets } from './static.js';
import type { RuntimeFastifyInstance } from './static.js';

export async function buildApp(options: {
  config: RuntimeConfig;
  logger: pino.Logger;
  events: RuntimeEventLogger;
  readiness: ReadinessProbe;
  staticAssets?: StaticAssets;
  auth?: AuthModuleOptions;
}): Promise<RuntimeFastifyInstance> {
  const { config, logger, events, readiness, staticAssets, auth } = options;
  const app = fastify({ loggerInstance: logger });
  registerHealthRoutes(app, { readiness, events, buildSha: config.BUILD_SHA });
  if (auth) registerAuthRoutes(app, config, auth);
  if (staticAssets) await registerStaticAssets(app, staticAssets);
  await app.ready();
  return app;
}
