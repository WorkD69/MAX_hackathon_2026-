import { describe, expect, it } from 'vitest';
import { ENV_KEYS } from './schema.js';
import { ConfigValidationError, loadConfig } from './load-config.js';

const base = (): NodeJS.ProcessEnv => ({
  APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://user:pass@db:5432/city',
  APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
  PUBLIC_APP_URL: 'http://frontend:5173/', PUBLIC_API_BASE_URL: 'http://api:3000/api/v1',
  BUILD_SHA: 'a'.repeat(40),
});

const integers = [
  ['PORT', 1, 65535, 3000],
  ['MAX_INIT_DATA_MAX_AGE_SECONDS', 60, 3600, 300],
  ['MAX_INIT_DATA_FUTURE_SKEW_SECONDS', 0, 300, 30],
  ['APP_SESSION_TTL_SECONDS', 60, 3600, 900],
  ['MAX_REQUEST_TIMEOUT_MS', 1000, 30000, 10000],
  ['MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS', 30000, 3600000, 300000],
  ['NOTIFICATION_WORKER_POLL_INTERVAL_MS', 100, 60000, 1000],
  ['NOTIFICATION_WORKER_CONCURRENCY', 1, 32, 4],
  ['NOTIFICATION_RETRY_BASE_MS', 100, 60000, 1000],
  ['NOTIFICATION_RETRY_MAX_MS', 1000, 3600000, 300000],
  ['NOTIFICATION_LEASE_MS', 5000, 300000, 30000],
  ['NOTIFICATION_MAX_ATTEMPTS', 1, 20, 8],
] as const;

describe('runtime config', () => {
  it('has exactly 23 unique canonical keys and ignores unknown keys', () => {
    expect(ENV_KEYS).toHaveLength(23);
    expect(new Set(ENV_KEYS).size).toBe(23);
    const config = loadConfig({ ...base(), UNRECOGNIZED_SECRET: 'should-not-appear' });
    expect(Object.keys(config)).toEqual([...ENV_KEYS]);
    expect(JSON.stringify(config)).not.toContain('should-not-appear');
  });

  it('normalizes defaults and booleans', () => {
    const config = loadConfig(base());
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.DEMO_MODE).toBe(false);
    for (const [key, , , fallback] of integers) expect(config[key]).toBe(fallback);
    expect(loadConfig({ ...base(), DEMO_MODE: 'true' }).DEMO_MODE).toBe(true);
  });

  it.each(integers)('%s accepts minimum and maximum', (key, min, max) => {
    const withValue = (value: number) => {
      const env = { ...base(), [key]: String(value) };
      if (key === 'MAX_INIT_DATA_MAX_AGE_SECONDS') env.MAX_INIT_DATA_FUTURE_SKEW_SECONDS = '0';
      if (key === 'MAX_INIT_DATA_FUTURE_SKEW_SECONDS') env.MAX_INIT_DATA_MAX_AGE_SECONDS = '3600';
      if (key === 'NOTIFICATION_RETRY_BASE_MS') env.NOTIFICATION_RETRY_MAX_MS = '60000';
      if (key === 'NOTIFICATION_RETRY_MAX_MS') env.NOTIFICATION_RETRY_BASE_MS = '100';
      if (key === 'NOTIFICATION_LEASE_MS') env.MAX_REQUEST_TIMEOUT_MS = '1000';
      if (key === 'MAX_REQUEST_TIMEOUT_MS') env.NOTIFICATION_LEASE_MS = '300000';
      return loadConfig(env)[key];
    };
    expect(withValue(min)).toBe(min);
    expect(withValue(max)).toBe(max);
  });

  it.each(integers)('%s rejects malformed and out-of-range integers', (key, min, max) => {
    for (const value of ['-1', '+1', ' 1', '1 ', '1.0', '1e2', '１２', String(min - 1), String(max + 1)]) {
      expect(() => loadConfig({ ...base(), [key]: value })).toThrow(ConfigValidationError);
    }
  });

  it.each([
    ['MAX_INIT_DATA_MAX_AGE_SECONDS', '60', 'MAX_INIT_DATA_FUTURE_SKEW_SECONDS', '60'],
    ['NOTIFICATION_RETRY_BASE_MS', '60000', 'NOTIFICATION_RETRY_MAX_MS', '1000'],
    ['MAX_REQUEST_TIMEOUT_MS', '30000', 'NOTIFICATION_LEASE_MS', '30000'],
  ])('rejects %s/%s cross-field conflict', (keyA, valueA, keyB, valueB) => {
    expect(() => loadConfig({ ...base(), [keyA]: valueA, [keyB]: valueB })).toThrow(ConfigValidationError);
  });

  it('enforces modes and production public URLs', () => {
    expect(loadConfig({ ...base(), APP_ENV: 'development', MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: '12345678', MAX_WEBHOOK_SECRET: 'w'.repeat(32) }).APP_ENV).toBe('development');
    expect(() => loadConfig({ ...base(), APP_ENV: 'development' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), MAX_BOT_TOKEN: '12345678' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), APP_ENV: 'production', MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: '12345678', MAX_WEBHOOK_SECRET: 'w'.repeat(32) })).toThrow(ConfigValidationError);
    const production = loadConfig({ ...base(), APP_ENV: 'production', DEMO_MODE: 'true', MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: '12345678', MAX_WEBHOOK_SECRET: 'w'.repeat(32), PUBLIC_APP_URL: 'https://city.example/', PUBLIC_API_BASE_URL: 'https://api.city.example/api/v1' });
    expect(production.DEMO_MODE).toBe(true);
    for (const host of ['localhost', 'localhost.', '127.0.0.1', '127.42.0.1', '[::1]']) {
      expect(() => loadConfig({ ...base(), APP_ENV: 'production', MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: '12345678', MAX_WEBHOOK_SECRET: 'w'.repeat(32), PUBLIC_APP_URL: `https://${host}/`, PUBLIC_API_BASE_URL: 'https://api.city.example/api/v1' })).toThrow(ConfigValidationError);
    }
  });

  it('accepts non-production remote HTTP and rejects malformed URLs', () => {
    expect(loadConfig({ ...base(), PUBLIC_APP_URL: 'http://remote.example/app', PUBLIC_API_BASE_URL: 'http://service:3000/api/v1' }).PUBLIC_APP_URL).toBe('http://remote.example/app');
    for (const value of ['relative/path', 'https://user:pass@host/', 'https://host/#fragment', 'ftp://host/']) {
      expect(() => loadConfig({ ...base(), PUBLIC_APP_URL: value })).toThrow(ConfigValidationError);
    }
    for (const value of ['https://api.example/api/v1/', 'https://api.example/api/v1?q=1', 'https://api.example/other']) {
      expect(() => loadConfig({ ...base(), PUBLIC_API_BASE_URL: value })).toThrow(ConfigValidationError);
    }
  });

  it('rejects invalid required fields and does not disclose rejected secrets', () => {
    const sentinel = 'SECRET_SENTINEL_91';
    const invalid = { ...base(), APP_SESSION_SECRET: sentinel, DATABASE_URL: `bad:${sentinel}`, BUILD_SHA: sentinel };
    let error: unknown;
    try { loadConfig(invalid); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(JSON.stringify(error)).not.toContain(sentinel);
    expect(String(error)).not.toContain(sentinel);
    expect(() => loadConfig({ ...base(), APP_ENV: undefined })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), DEMO_MODE: 'TRUE' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), DATABASE_URL: 'mysql://db/city' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), APP_SESSION_SECRET: 'é'.repeat(4097) })).toThrow(ConfigValidationError);
  });

  it('validates all non-integer field bounds and secret mode classification', () => {
    expect(() => loadConfig({ ...base(), APP_ENV: 'staging' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), HOST: '' })).toThrow(ConfigValidationError);
    expect(loadConfig({ ...base(), HOST: 'x'.repeat(255) }).HOST).toHaveLength(255);
    expect(() => loadConfig({ ...base(), HOST: 'x'.repeat(256) })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), BUILD_SHA: 'A'.repeat(40) })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), BUILD_SHA: 'a'.repeat(39) })).toThrow(ConfigValidationError);
    expect(loadConfig({ ...base(), APP_SESSION_SECRET: 'é'.repeat(16) }).APP_SESSION_SECRET).toBe('é'.repeat(16));
    expect(() => loadConfig({ ...base(), APP_SESSION_SECRET: 'é'.repeat(15) })).toThrow(ConfigValidationError);
    expect(loadConfig({ ...base(), APP_SESSION_SECRET: 's'.repeat(4096) }).APP_SESSION_SECRET).toHaveLength(4096);
    expect(() => loadConfig({ ...base(), APP_SESSION_SECRET: 's'.repeat(4097) })).toThrow(ConfigValidationError);
    const live = { ...base(), MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: 'b'.repeat(8), MAX_WEBHOOK_SECRET: 'é'.repeat(16) };
    expect(loadConfig(live).MAX_BOT_TOKEN).toHaveLength(8);
    expect(loadConfig({ ...live, MAX_BOT_TOKEN: 'b'.repeat(4096) }).MAX_BOT_TOKEN).toHaveLength(4096);
    expect(() => loadConfig({ ...live, MAX_BOT_TOKEN: 'b'.repeat(7) })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...live, MAX_BOT_TOKEN: 'b'.repeat(4097) })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...live, MAX_WEBHOOK_SECRET: 'é'.repeat(15) })).toThrow(ConfigValidationError);
    expect(loadConfig({ ...live, MAX_WEBHOOK_SECRET: 'w'.repeat(4096) }).MAX_WEBHOOK_SECRET).toHaveLength(4096);
    expect(() => loadConfig({ ...live, MAX_WEBHOOK_SECRET: 'w'.repeat(4097) })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...live, MAX_BOT_TOKEN: undefined })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...live, MAX_WEBHOOK_SECRET: undefined })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...base(), MAX_WEBHOOK_SECRET: 'w'.repeat(32) })).toThrow(ConfigValidationError);
  });

  it('never includes any secret value in config issues', () => {
    const sentinel = 'SECRET_SENTINEL_987654321';
    const candidates = [
      { DATABASE_URL: sentinel },
      { APP_SESSION_SECRET: sentinel },
      { MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: sentinel.slice(0, 5), MAX_WEBHOOK_SECRET: 'w'.repeat(32) },
      { MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: 'b'.repeat(8), MAX_WEBHOOK_SECRET: sentinel },
    ];
    for (const candidate of candidates) {
      let thrown: unknown;
      try { loadConfig({ ...base(), ...candidate }); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(ConfigValidationError);
      expect(String(thrown)).not.toContain(sentinel);
      expect(JSON.stringify(thrown)).not.toContain(sentinel);
    }
  });
});
