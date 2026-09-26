import { randomBytes } from 'node:crypto';
import fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../../config/types.js';
import type { MaxAdapter } from '../../modules/max-adapter/types.js';
import { parseMaxUpdate } from '../../modules/max-adapter/update.js';
import { createMaxWebhookPlugin } from './webhook.js';

const secret = 'Webhook_secret-1';

function config(): RuntimeConfig {
  return {
    APP_ENV: 'test', HOST: '127.0.0.1', PORT: 3000, DEMO_MODE: false,
    DATABASE_URL: 'postgres://postgres:postgres@localhost/test', APP_SESSION_SECRET: 's'.repeat(32),
    MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: randomBytes(24).toString('hex'), MAX_WEBHOOK_SECRET: secret,
    PUBLIC_APP_URL: 'https://city.example/', PUBLIC_API_BASE_URL: 'https://api.city.example/api/v1',
    BUILD_SHA: 'a'.repeat(40), MAX_INIT_DATA_MAX_AGE_SECONDS: 300, MAX_INIT_DATA_FUTURE_SKEW_SECONDS: 30,
    APP_SESSION_TTL_SECONDS: 900, MAX_REQUEST_TIMEOUT_MS: 1000,
    MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS: 30000, NOTIFICATION_WORKER_POLL_INTERVAL_MS: 100,
    NOTIFICATION_WORKER_CONCURRENCY: 2, NOTIFICATION_RETRY_BASE_MS: 100,
    NOTIFICATION_RETRY_MAX_MS: 1000, NOTIFICATION_LEASE_MS: 5000, NOTIFICATION_MAX_ATTEMPTS: 3,
  };
}

function adapter(): MaxAdapter & { sendMessage: ReturnType<typeof vi.fn> } {
  return {
    sendMessage: vi.fn(async () => ({ providerMessageId: 'mid.1' })),
    listSubscriptions: vi.fn(async () => []),
    createSubscription: vi.fn(async () => {}),
    parseUpdate: parseMaxUpdate,
  };
}

describe('protected MAX webhook', () => {
  it.each([undefined, 'wrong-secret'])('rejects missing/wrong secret before side effects', async supplied => {
    const max = adapter();
    const app = fastify({ logger: false });
    await app.register(createMaxWebhookPlugin({ config: config(), adapter: max }));
    const response = await app.inject({
      method: 'POST', url: '/integrations/max/webhook',
      headers: supplied ? { 'x-max-bot-api-secret': supplied } : {},
      payload: { update_type: 'bot_started', timestamp: 1, chat_id: 42, user: { user_id: 7 } },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(secret);
    expect(max.sendMessage).not.toHaveBeenCalled();
    await app.close();
  });

  it('acknowledges before outbound greeting and schedules exact open_app message', async () => {
    const max = adapter();
    const scheduled: Array<() => void> = [];
    const app = fastify({ logger: false });
    await app.register(createMaxWebhookPlugin({
      config: config(), adapter: max, schedule: task => { scheduled.push(task); },
    }));
    const response = await app.inject({
      method: 'POST', url: '/integrations/max/webhook',
      headers: { 'x-max-bot-api-secret': secret },
      payload: { update_type: 'bot_started', timestamp: 1, chat_id: -70801090403050, user: { user_id: 7 } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
    expect(max.sendMessage).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    await vi.waitFor(() => expect(max.sendMessage).toHaveBeenCalledTimes(1));
    expect(max.sendMessage).toHaveBeenCalledWith('-70801090403050', {
      text: 'Откройте мини-приложение «Умный город»',
      openAppAction: { type: 'open_app', text: 'Открыть приложение' },
    });
    await app.close();
  });

  it('keeps an int64 chat_id exact from raw webhook JSON', async () => {
    const max = adapter();
    const scheduled: Array<() => void> = [];
    const app = fastify({ logger: false });
    await app.register(createMaxWebhookPlugin({ config: config(), adapter: max, schedule: task => scheduled.push(task) }));
    const response = await app.inject({
      method: 'POST', url: '/integrations/max/webhook',
      headers: { 'x-max-bot-api-secret': secret, 'content-type': 'application/json' },
      payload: '{"update_type":"bot_started","timestamp":1780000000000,"chat_id":9007199254740993,"user":{"user_id":9007199254740995}}',
    });
    expect(response.statusCode).toBe(200);
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    await vi.waitFor(() => expect(max.sendMessage).toHaveBeenCalledTimes(1));
    expect(max.sendMessage).toHaveBeenCalledWith('9007199254740993', expect.anything());
    await app.close();
  });

  it('acknowledges documented unhandled and unknown updates without product commands', async () => {
    const max = adapter();
    const scheduled: Array<() => void> = [];
    const app = fastify({ logger: false });
    await app.register(createMaxWebhookPlugin({ config: config(), adapter: max, schedule: task => scheduled.push(task) }));
    for (const payload of [
      { update_type: 'message_created', timestamp: 1, message: {} },
      { update_type: 'future_update', timestamp: 1 },
      { update_type: 'bot_started', timestamp: 1, chat_id: 'not-an-id', user: { user_id: 7 } },
    ]) {
      const response = await app.inject({
        method: 'POST', url: '/integrations/max/webhook',
        headers: { 'x-max-bot-api-secret': secret }, payload,
      });
      expect(response.statusCode).toBe(200);
    }
    expect(scheduled).toHaveLength(0);
    expect(max.sendMessage).not.toHaveBeenCalled();
    await app.close();
  });
});
