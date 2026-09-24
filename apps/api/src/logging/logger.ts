import pino from 'pino';
import type { DestinationStream } from 'pino';
import { z } from 'zod';
import type { RuntimeConfig } from '../config/types.js';
import { sanitizeForLog } from './sanitize.js';

type ErrorType = 'runtime_error' | 'non_error';
type Trigger = 'SIGINT' | 'SIGTERM' | 'manual' | 'startup_failure';
type ErrorCode = 'READINESS_PROBE_FAILED' | 'FACTORY_BUILD_FAILED' | 'LISTEN_FAILED' | 'SHUTDOWN_CLOSE_FAILED';
type ErrorFields<C extends ErrorCode> = { errorType: ErrorType; errorCode: C };
type StartupFailure = ({ phase: 'factory' } & ErrorFields<'FACTORY_BUILD_FAILED'>) |
  ({ phase: 'listen' } & ErrorFields<'LISTEN_FAILED'>);
type TriggerFields = { trigger: Trigger };

export interface RuntimeEventLogger {
  productionDemoModeEnabled(): void;
  runtimeListening(value: { host: string; port: number }): void;
  readinessProbeFailed(value: ErrorFields<'READINESS_PROBE_FAILED'>): void;
  runtimeStartupFailed(value: StartupFailure): void;
  gracefulShutdownStarted(value: TriggerFields): void;
  gracefulShutdownCompleted(value: TriggerFields): void;
  gracefulShutdownFailed(value: TriggerFields & ErrorFields<'SHUTDOWN_CLOSE_FAILED'>): void;
  gracefulShutdownTimedOut(value: TriggerFields & { timeoutMs: 10000 }): void;
}

export function serializeRuntimeError<C extends ErrorCode>(error: unknown, errorCode: C): ErrorFields<C> {
  return { errorType: error instanceof Error ? 'runtime_error' : 'non_error', errorCode };
}

const errorType = z.enum(['runtime_error', 'non_error']);
const trigger = z.enum(['SIGINT', 'SIGTERM', 'manual', 'startup_failure']);
const schemas = {
  productionDemoModeEnabled: z.strictObject({}),
  runtimeListening: z.strictObject({ host: z.string(), port: z.number().int().min(1).max(65535) }),
  readinessProbeFailed: z.strictObject({ errorType, errorCode: z.literal('READINESS_PROBE_FAILED') }),
  runtimeStartupFailed: z.union([
    z.strictObject({ phase: z.literal('factory'), errorType, errorCode: z.literal('FACTORY_BUILD_FAILED') }),
    z.strictObject({ phase: z.literal('listen'), errorType, errorCode: z.literal('LISTEN_FAILED') }),
  ]),
  gracefulShutdownStarted: z.strictObject({ trigger }),
  gracefulShutdownCompleted: z.strictObject({ trigger }),
  gracefulShutdownFailed: z.strictObject({ trigger, errorType, errorCode: z.literal('SHUTDOWN_CLOSE_FAILED') }),
  gracefulShutdownTimedOut: z.strictObject({ trigger, timeoutMs: z.literal(10000) }),
} as const;

const codes = {
  productionDemoModeEnabled: 'production_demo_mode_enabled',
  runtimeListening: 'runtime_listening',
  readinessProbeFailed: 'readiness_probe_failed',
  runtimeStartupFailed: 'runtime_startup_failed',
  gracefulShutdownStarted: 'graceful_shutdown_started',
  gracefulShutdownCompleted: 'graceful_shutdown_completed',
  gracefulShutdownFailed: 'graceful_shutdown_failed',
  gracefulShutdownTimedOut: 'graceful_shutdown_timeout',
} as const;

export function createRuntimeLogger(config: RuntimeConfig, destination?: DestinationStream): Readonly<{
  loggerInstance: pino.Logger;
  events: RuntimeEventLogger;
}> {
  const loggerInstance = pino({
    base: { service: 'api', app_env: config.APP_ENV, build_sha: config.BUILD_SHA },
    customLevels: { critical: 60 },
    redact: { paths: [
      'req.headers.authorization', 'req.headers.cookie', 'req.headers.x-max-bot-api-secret',
      'req.body.init_data', 'req.body.initData',
    ], censor: '[REDACTED]' },
    serializers: { err: () => '[REDACTED]' },
    hooks: {
      logMethod(args, method) {
        const first = args[0];
        if (first instanceof Error) {
          method.apply(this, [{ err: '[REDACTED]' }]);
        } else if (first && typeof first === 'object' && !Array.isArray(first) && 'err' in first && first.err instanceof Error) {
          method.apply(this, [{ ...first, err: '[REDACTED]' }]);
        } else {
          method.apply(this, args);
        }
      },
    },
  }, destination) as unknown as pino.Logger;

  const emit = (name: keyof typeof codes, payload: unknown): void => {
    const validated = schemas[name].parse(payload);
    const safe = sanitizeForLog(validated) as Record<string, unknown>;
    const record: Record<string, unknown> = { event: codes[name] };
    for (const [key, value] of Object.entries(safe)) {
      record[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] = value;
    }
    if (name === 'productionDemoModeEnabled') {
      (loggerInstance as unknown as { critical: (value: object) => void }).critical(record);
    } else if (name === 'readinessProbeFailed' || name === 'runtimeStartupFailed' || name === 'gracefulShutdownFailed' || name === 'gracefulShutdownTimedOut') {
      loggerInstance.error(record);
    } else {
      loggerInstance.info(record);
    }
  };

  const events: RuntimeEventLogger = Object.freeze({
    productionDemoModeEnabled: (...args: []) => {
      if (args.length !== 0) throw new Error('INVALID_EVENT_PAYLOAD');
      emit('productionDemoModeEnabled', {});
    },
    runtimeListening: (value: { host: string; port: number }) => emit('runtimeListening', value),
    readinessProbeFailed: (value: ErrorFields<'READINESS_PROBE_FAILED'>) => emit('readinessProbeFailed', value),
    runtimeStartupFailed: (value: StartupFailure) => emit('runtimeStartupFailed', value),
    gracefulShutdownStarted: (value: TriggerFields) => emit('gracefulShutdownStarted', value),
    gracefulShutdownCompleted: (value: TriggerFields) => emit('gracefulShutdownCompleted', value),
    gracefulShutdownFailed: (value: TriggerFields & ErrorFields<'SHUTDOWN_CLOSE_FAILED'>) => emit('gracefulShutdownFailed', value),
    gracefulShutdownTimedOut: (value: TriggerFields & { timeoutMs: 10000 }) => emit('gracefulShutdownTimedOut', value),
  });
  return Object.freeze({ loggerInstance, events });
}
