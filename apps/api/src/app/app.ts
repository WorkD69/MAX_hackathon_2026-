import fastify from 'fastify';
import type pino from 'pino';
import { CompiledQuery, Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { createMigrator, type Database, type DatabaseConnection } from '@max-smart-city/db';
import type { RuntimeConfig } from '../config/types.js';
import type { RuntimeEventLogger } from '../logging/logger.js';
import { registerHealthRoutes } from '../modules/health/plugin.js';
import type { ReadinessProbe } from '../modules/health/readiness.js';
import { registerStaticAssets } from './static.js';
import type { StaticAssets } from './static.js';
import type { RuntimeFastifyInstance } from './static.js';
import { registerDemoModule } from '../modules/demo/index.js';
import { registerIntakeAssignmentRoutes } from '../modules/cases/commands/intake-assignment/index.js';
import { registerExecutionRoutes } from '../modules/cases/commands/execution/index.js';
import { registerFeedbackResolutionRoutes } from '../modules/cases/commands/feedback-resolution/index.js';
import { registerAttachmentRoutes } from '../modules/attachments/index.js';
import { registerReadModelRoutes } from '../modules/read-models/index.js';
import { registerConfigurationRoutes } from '../modules/configuration/index.js';
import { createMaxAdapter, PerChatSendCoordinator } from '../modules/max-adapter/index.js';
import { DurableNotificationWorker, PostgresNotificationStore } from '../modules/notifications/index.js';
import { createMaxWebhookPlugin, expectedMaxSubscription, MaxSubscriptionReconciler } from '../integrations/max/index.js';

export async function buildApp(options: {
  config: RuntimeConfig;
  logger: pino.Logger;
  events: RuntimeEventLogger;
  readiness?: ReadinessProbe;
  database?: DatabaseConnection;
  staticAssets?: StaticAssets;
}): Promise<RuntimeFastifyInstance> {
  const { config, logger, events, staticAssets } = options;
  const database = options.database ?? new Kysely<Database>({ dialect: new PostgresDialect({
    pool: new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 3000 }),
  }) });
  const readiness = options.readiness ?? { async snapshot() {
    try {
      await database.executeQuery(CompiledQuery.raw('select 1'));
      const migrations = await createMigrator(database).getMigrations();
      return { databaseReachable: true, migrationsCurrent: migrations.length > 0 &&
        migrations.every(migration => migration.executedAt !== undefined), applicationInitialized: true };
    } catch { return { databaseReachable: false, migrationsCurrent: false, applicationInitialized: true }; }
  } };
  const app = fastify({ loggerInstance: logger, routerOptions: { maxParamLength: 16384 } });
  registerHealthRoutes(app, { readiness, events, buildSha: config.BUILD_SHA });
  const commands = { database };
  registerDemoModule(app, config, commands);
  registerIntakeAssignmentRoutes(app, config, commands);
  registerExecutionRoutes(app, config, commands);
  registerFeedbackResolutionRoutes(app, config, commands);
  registerAttachmentRoutes(app, config, commands);
  registerReadModelRoutes(app, config, commands);
  registerConfigurationRoutes(app, { database, config });
  const adapter = createMaxAdapter(config, new PerChatSendCoordinator());
  const diagnostics = {
    info: (event: string, fields?: Readonly<Record<string, unknown>>) => logger.info({ event, ...fields }),
    error: (event: string, fields: Readonly<Record<string, unknown>>) => logger.error({ event, ...fields }),
  };
  const worker = new DurableNotificationWorker(new PostgresNotificationStore({
    query: <Row extends object>(text: string, values: unknown[] = []) =>
      database.executeQuery<Row>(CompiledQuery.raw(text, values)),
  }), adapter, config, diagnostics);
  const reconciler = config.MAX_ADAPTER_MODE === 'live'
    ? new MaxSubscriptionReconciler(adapter, expectedMaxSubscription(config), config.MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS, diagnostics)
    : undefined;
  if (reconciler) await app.register(createMaxWebhookPlugin({ config, adapter }));
  app.addHook('onListen', async () => { worker.start(); reconciler?.start(); });
  app.addHook('onClose', async () => {
    reconciler?.stop();
    await worker.stop();
    if (!options.database) await database.destroy();
  });
  if (staticAssets) await registerStaticAssets(app, staticAssets);
  await app.ready();
  return app;
}
