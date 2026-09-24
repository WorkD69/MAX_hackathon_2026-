import type { DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/load-config.js';
import { createRuntimeLogger, serializeRuntimeError } from './logger.js';
import { canonicalizeLogKey, sanitizeForLog } from './sanitize.js';

const config = () => loadConfig({
  APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
  APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
  PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
  BUILD_SHA: 'a'.repeat(40),
});
const capture = () => {
  const lines: string[] = [];
  const destination = { write(line: string) { lines.push(line); return true; } } as DestinationStream;
  const pair = createRuntimeLogger(config(), destination);
  return { lines, ...pair };
};

describe('closed runtime logger', () => {
  it('has exactly eight event methods and one frozen Pino pair', () => {
    const pair = capture();
    expect(Object.isFrozen(pair.events)).toBe(true);
    expect(Object.keys(pair.events).sort()).toEqual([
      'productionDemoModeEnabled', 'runtimeListening', 'readinessProbeFailed',
      'runtimeStartupFailed', 'gracefulShutdownStarted', 'gracefulShutdownCompleted',
      'gracefulShutdownFailed', 'gracefulShutdownTimedOut',
    ].sort());
    expect('log' in pair.events).toBe(false);
    expect('info' in pair.events).toBe(false);
    expect('error' in pair.events).toBe(false);
    expect(pair.loggerInstance.bindings()).toEqual({ service: 'api', app_env: 'test', build_sha: 'a'.repeat(40) });
  });

  it('rejects unknown/nested/invalid variable payloads before writing', () => {
    const pair = capture();
    const attempts: Array<() => void> = [
      () => pair.events.runtimeListening({ host: 'x', port: 1, credential: 'sentinel' } as never),
      () => pair.events.runtimeListening({ host: { nested: 'x' }, port: 1 } as never),
      () => pair.events.runtimeListening({ host: ['x'], port: 1 } as never),
      () => pair.events.readinessProbeFailed({ errorType: 'runtime_error', errorCode: 'READINESS_PROBE_FAILED', token: 'x' } as never),
      () => pair.events.runtimeStartupFailed({ phase: 'factory', errorType: 'runtime_error', errorCode: 'LISTEN_FAILED' } as never),
      () => pair.events.gracefulShutdownStarted({ trigger: 'manual', cause: new Error('x') } as never),
      () => pair.events.gracefulShutdownCompleted({ trigger: 'wrong' } as never),
      () => pair.events.gracefulShutdownFailed({ trigger: 'manual', errorType: 'runtime_error', errorCode: 'SHUTDOWN_CLOSE_FAILED', extra: 1 } as never),
      () => pair.events.gracefulShutdownTimedOut({ trigger: 'manual', timeoutMs: 9999 } as never),
      () => (pair.events.productionDemoModeEnabled as unknown as (value: unknown) => void)({ token: 'x' }),
    ];
    for (const attempt of attempts) expect(attempt).toThrow();
    expect(pair.lines).toHaveLength(0);
  });

  it('emits only registered flat fields and critical demo event', () => {
    const pair = capture();
    pair.events.productionDemoModeEnabled();
    pair.events.runtimeListening({ host: '127.0.0.1', port: 3000 });
    pair.events.runtimeStartupFailed({ phase: 'factory', errorType: 'runtime_error', errorCode: 'FACTORY_BUILD_FAILED' });
    pair.events.gracefulShutdownTimedOut({ trigger: 'manual', timeoutMs: 10000 });
    const records = pair.lines.map(line => JSON.parse(line) as Record<string, unknown>);
    expect(records.map(row => row.event)).toEqual([
      'production_demo_mode_enabled', 'runtime_listening', 'runtime_startup_failed', 'graceful_shutdown_timeout',
    ]);
    expect(records[0]).not.toHaveProperty('token');
    expect(records[1]).toMatchObject({ host: '127.0.0.1', port: 3000 });
    expect(records[2]).toMatchObject({ phase: 'factory', error_type: 'runtime_error', error_code: 'FACTORY_BUILD_FAILED' });
    expect(records[3]).toMatchObject({ trigger: 'manual', timeout_ms: 10000 });
  });

  it('redacts Pino paths and never serializes Error internals', () => {
    const pair = capture();
    const sentinel = 'SECRET_SENTINEL_42';
    pair.loggerInstance.info({ req: { headers: { authorization: sentinel, cookie: sentinel, 'x-max-bot-api-secret': sentinel }, body: { init_data: sentinel, initData: sentinel } }, err: new Error(sentinel) });
    const text = pair.lines.join('');
    expect(text).not.toContain(sentinel);
    expect(text).toContain('[REDACTED]');
    const error = new Error(sentinel, { cause: new Error('CAUSE_SENTINEL') });
    expect(serializeRuntimeError(error, 'LISTEN_FAILED')).toEqual({ errorType: 'runtime_error', errorCode: 'LISTEN_FAILED' });
    expect(serializeRuntimeError({ message: sentinel }, 'READINESS_PROBE_FAILED')).toEqual({ errorType: 'non_error', errorCode: 'READINESS_PROBE_FAILED' });
  });
});

const aliases: Record<string, string[]> = {
  authorization: ['authorization', 'Authorization', 'author_ization', 'author-ization', 'author.ization'],
  cookie: ['cookie', 'Cookie', 'coo_kie', 'coo-kie', 'coo.kie'],
  xmaxbotapisecret: ['x_max_bot_api_secret', 'xMaxBotApiSecret', 'x-max-bot-api-secret', 'x.max.bot.api.secret'],
  initdata: ['init_data', 'initData', 'init-data', 'init.data'],
  sessiontoken: ['session_token', 'sessionToken', 'session-token', 'session.token'],
  token: ['token', 'Token', 'to_ken', 'to-ken', 'to.ken'],
  maxbottoken: ['max_bot_token', 'maxBotToken', 'MAX-BOT-TOKEN', 'max.bot.token'],
  maxwebhooksecret: ['max_webhook_secret', 'maxWebhookSecret', 'MAX-WEBHOOK-SECRET', 'max.webhook.secret'],
  appsessionsecret: ['app_session_secret', 'appSessionSecret', 'APP-SESSION-SECRET', 'app.session.secret'],
  databaseurl: ['database_url', 'databaseUrl', 'DATABASE-URL', 'database.url'],
  password: ['password', 'Password', 'pass_word', 'pass-word', 'pass.word'],
  filebytes: ['file_bytes', 'fileBytes', 'FILE-BYTES', 'file.bytes'],
  bytes: ['bytes', 'Bytes', 'by_tes', 'by-tes', 'by.tes'],
};

describe('nested secret sanitizer', () => {
  it('implements exact canonical key normalization', () => {
    for (const [canonical, variants] of Object.entries(aliases)) {
      for (const variant of variants) expect(canonicalizeLogKey(variant)).toBe(canonical);
    }
  });

  it('redacts unique sentinels for every alias at root and nested depths in actual JSON', () => {
    const pair = capture();
    for (const [canonical, variants] of Object.entries(aliases)) {
      for (const [index, variant] of variants.entries()) {
        const sentinel = `SECRET_${canonical}_${index}`;
        const input = { [variant]: sentinel, nested: [{ [variant]: sentinel }] };
        const safe = sanitizeForLog(input);
        pair.loggerInstance.info(safe as object);
        expect(JSON.stringify(safe)).not.toContain(sentinel);
        expect(pair.lines.at(-1)).not.toContain(sentinel);
        expect(input[variant]).toBe(sentinel);
      }
    }
  });

  it('bounds depth and container size, omits functions and handles cycles', () => {
    const value: Record<string, unknown> = { visible: 'ok', callable: () => 1 };
    value.self = value;
    const safe = sanitizeForLog(value) as Record<string, unknown>;
    expect(safe.self).toBe('[CIRCULAR]');
    expect(safe).not.toHaveProperty('callable');
    let deep: unknown = 'leaf';
    for (let index = 0; index < 9; index++) deep = { nested: deep };
    expect(JSON.stringify(sanitizeForLog(deep))).toContain('[TRUNCATED]');
    expect((sanitizeForLog(Array.from({ length: 101 }, (_, index) => index)) as unknown[]).at(-1)).toBe('[TRUNCATED]');
  });
});
