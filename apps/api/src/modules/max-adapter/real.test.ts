import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../../config/types.js';
import { MaxAdapterError } from './errors.js';
import { FakeMaxAdapter } from './fake.js';
import { RealMaxAdapter } from './real.js';

const token = randomBytes(24).toString('hex');

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    APP_ENV: 'test', HOST: '127.0.0.1', PORT: 3000, DEMO_MODE: false,
    DATABASE_URL: 'postgres://postgres:postgres@localhost/test', APP_SESSION_SECRET: 's'.repeat(32),
    MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: token, MAX_WEBHOOK_SECRET: 'Webhook_secret-1',
    PUBLIC_APP_URL: 'https://city.example/', PUBLIC_API_BASE_URL: 'https://api.city.example/api/v1',
    BUILD_SHA: 'a'.repeat(40), MAX_INIT_DATA_MAX_AGE_SECONDS: 300, MAX_INIT_DATA_FUTURE_SKEW_SECONDS: 30,
    APP_SESSION_TTL_SECONDS: 900, MAX_REQUEST_TIMEOUT_MS: 1000,
    MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS: 30000, NOTIFICATION_WORKER_POLL_INTERVAL_MS: 100,
    NOTIFICATION_WORKER_CONCURRENCY: 2, NOTIFICATION_RETRY_BASE_MS: 100,
    NOTIFICATION_RETRY_MAX_MS: 1000, NOTIFICATION_LEASE_MS: 5000, NOTIFICATION_MAX_ATTEMPTS: 3,
    ...overrides,
  };
}

describe('RealMaxAdapter request contract', () => {
  it('sends exact chat_id/open_app contract and keeps token only in Authorization', async () => {
    const fetcher = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(JSON.stringify({
      message: { body: { mid: 'mid.123', seq: 1, text: 'ok', attachments: null } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const adapter = new RealMaxAdapter(config(), fetcher);
    await expect(adapter.sendMessage('-70801090403050', {
      text: 'Проверка', openAppAction: { type: 'open_app', text: 'Открыть приложение' },
    })).resolves.toEqual({ providerMessageId: 'mid.123' });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    if (!init) throw new Error('REQUEST_INIT_MISSING');
    expect(String(url)).toBe('https://platform-api2.max.ru/messages?chat_id=-70801090403050');
    expect(String(url)).not.toContain(token);
    expect(init.redirect).toBe('manual');
    expect(init.headers).toEqual({ Authorization: token, 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'Проверка',
      attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{
        type: 'open_app', text: 'Открыть приложение',
      }]] } }],
    });
    expect(String(init.body)).not.toContain(token);
  });

  it.each([
    [408, 'transient', 'MAX_HTTP_408'], [429, 'transient', 'MAX_HTTP_429'],
    [500, 'transient', 'MAX_HTTP_5XX'], [503, 'transient', 'MAX_HTTP_5XX'],
    [401, 'permanent', 'MAX_AUTH_REJECTED'], [400, 'permanent', 'MAX_REQUEST_REJECTED'],
    [302, 'permanent', 'MAX_REDIRECT_REJECTED'], [204, 'transient', 'MAX_UNEXPECTED_RESPONSE'],
  ] as const)('classifies HTTP %s without leaking response or token', async (status, disposition, code) => {
    const fetcher = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(status === 204 ? null : `remote body ${token}`, { status }));
    const adapter = new RealMaxAdapter(config(), fetcher);
    const error = await adapter.sendMessage('1', { text: 'x' }).then(
      () => { throw new Error('EXPECTED_MAX_FAILURE'); },
      value => value as MaxAdapterError,
    );
    expect(error).toBeInstanceOf(MaxAdapterError);
    expect(error).toMatchObject({ disposition, safeCode: code, message: code });
    expect(JSON.stringify(error)).not.toContain(token);
  });

  it('treats malformed/non-JSON 200 and network failure as transient sanitized failures', async () => {
    const malformed = new RealMaxAdapter(config(), async () => new Response('not-json', { status: 200 }));
    await expect(malformed.sendMessage('1', { text: 'x' })).rejects.toMatchObject({
      disposition: 'transient', safeCode: 'MAX_RESPONSE_MALFORMED',
    });
    const network = new RealMaxAdapter(config(), async () => { throw new Error(token); });
    const error = await network.sendMessage('1', { text: 'x' }).then(
      () => { throw new Error('EXPECTED_MAX_FAILURE'); },
      value => value as MaxAdapterError,
    );
    expect(error).toMatchObject({ disposition: 'transient', safeCode: 'MAX_NETWORK_FAILURE' });
    expect(error.message).not.toContain(token);
  });

  it('uses Authorization for subscription list/create and rejects success:false', async () => {
    const responses = [
      new Response(JSON.stringify({ subscriptions: [] }), { status: 200 }),
      new Response(JSON.stringify({ success: false, message: token }), { status: 200 }),
    ];
    const fetcher = vi.fn(async (_url: string | URL, _init?: RequestInit) => responses.shift()!);
    const adapter = new RealMaxAdapter(config(), fetcher);
    await expect(adapter.listSubscriptions()).resolves.toEqual([]);
    await expect(adapter.createSubscription({
      url: 'https://api.city.example/integrations/max/webhook',
      updateTypes: ['bot_started', 'message_created'], secret: 'Webhook_secret-1',
    })).rejects.toMatchObject({ safeCode: 'MAX_SUBSCRIPTION_REJECTED' });
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).not.toContain(token);
      expect(init?.headers).toEqual({ Authorization: token, 'Content-Type': 'application/json' });
    }
  });
});

it('cannot activate fake adapter outside APP_ENV=test and fake mode', () => {
  expect(() => new FakeMaxAdapter(config({ APP_ENV: 'production', MAX_ADAPTER_MODE: 'fake', MAX_BOT_TOKEN: undefined, MAX_WEBHOOK_SECRET: undefined })))
    .toThrow('FAKE_MAX_ADAPTER_TEST_ONLY');
  expect(() => new FakeMaxAdapter(config({ MAX_ADAPTER_MODE: 'live' }))).toThrow('FAKE_MAX_ADAPTER_TEST_ONLY');
});
