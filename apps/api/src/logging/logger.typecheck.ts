import type { RuntimeConfig } from '../config/types.js';
import type { RuntimeEventLogger } from './logger.js';

// Vitest's tinybench types use this Web Performance alias in the Node-only API build.
declare global { type DOMHighResTimeStamp = number; }

export function assertLoggerTypes(events: RuntimeEventLogger, config: RuntimeConfig, env: NodeJS.ProcessEnv): void {
  if (false) {
    events.productionDemoModeEnabled();
    events.runtimeListening({ host: 'localhost', port: 3000 });
    events.readinessProbeFailed({ errorType: 'runtime_error', errorCode: 'READINESS_PROBE_FAILED' });
    events.runtimeStartupFailed({ phase: 'factory', errorType: 'non_error', errorCode: 'FACTORY_BUILD_FAILED' });
    events.runtimeStartupFailed({ phase: 'listen', errorType: 'runtime_error', errorCode: 'LISTEN_FAILED' });
    events.gracefulShutdownStarted({ trigger: 'manual' });
    events.gracefulShutdownCompleted({ trigger: 'SIGINT' });
    events.gracefulShutdownFailed({ trigger: 'SIGTERM', errorType: 'runtime_error', errorCode: 'SHUTDOWN_CLOSE_FAILED' });
    events.gracefulShutdownTimedOut({ trigger: 'startup_failure', timeoutMs: 10000 });
    // @ts-expect-error no generic logging
    events.log('x', {});
    // @ts-expect-error no generic info
    events.info({});
    // @ts-expect-error no generic error
    events.error({});
    // @ts-expect-error extra fields
    events.runtimeListening({ host: 'x', port: 1, token: 'x' });
    // @ts-expect-error nested field
    events.runtimeListening({ host: { nested: 'x' }, port: 1 });
    // @ts-expect-error array field
    events.runtimeListening({ host: ['x'], port: 1 });
    // @ts-expect-error wrong phase-code pair
    events.runtimeStartupFailed({ phase: 'factory', errorType: 'runtime_error', errorCode: 'LISTEN_FAILED' });
    // @ts-expect-error config is not event payload
    events.runtimeListening(config);
    // @ts-expect-error environment is not event payload
    events.runtimeListening(env);
    // @ts-expect-error request body is not event payload
    events.runtimeListening({ body: { init_data: 'x' } });
    // @ts-expect-error Error is not event payload
    events.runtimeStartupFailed(new Error('secret'));
    // @ts-expect-error cause is not event payload
    events.runtimeStartupFailed({ phase: 'listen', errorType: 'runtime_error', errorCode: 'LISTEN_FAILED', cause: new Error('secret') });
  }
}
