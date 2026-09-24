import type { RuntimeFastifyInstance } from '../../app/static.js';
import type { RuntimeEventLogger } from '../../logging/logger.js';
import { serializeRuntimeError } from '../../logging/logger.js';
import type { ReadinessProbe, ReadinessSnapshot } from './readiness.js';

const notReady = {
  status: 'not_ready',
  checks: { database: 'down', migrations: 'pending', application: 'pending' },
} as const;

export function registerHealthRoutes(app: RuntimeFastifyInstance, options: {
  readiness: ReadinessProbe;
  events: RuntimeEventLogger;
  buildSha: string;
}): void {
  const buildSha = options.buildSha;
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    let snapshot: ReadinessSnapshot;
    try {
      snapshot = await options.readiness.snapshot();
    } catch (error) {
      try { options.events.readinessProbeFailed(serializeRuntimeError(error, 'READINESS_PROBE_FAILED')); }
      catch { /* reporting must not change diagnostics */ }
      return reply.code(503).send(notReady);
    }
    const checks = {
      database: snapshot.databaseReachable ? 'up' : 'down',
      migrations: snapshot.migrationsCurrent ? 'current' : 'pending',
      application: snapshot.applicationInitialized ? 'initialized' : 'pending',
    };
    const ready = snapshot.databaseReachable && snapshot.migrationsCurrent && snapshot.applicationInitialized;
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });
  app.get('/api/v1/system/info', async () => ({ build_sha: buildSha }));
}
