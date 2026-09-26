import { expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../../config/types.js';
import type { MaxAdapter, MaxSubscription } from '../../modules/max-adapter/types.js';
import { parseMaxUpdate } from '../../modules/max-adapter/update.js';
import { expectedMaxSubscription, MaxSubscriptionReconciler } from './subscription-reconciler.js';

const expected = {
  url: 'https://api.city.example/integrations/max/webhook',
  updateTypes: ['bot_started', 'message_created'],
  secret: 'Webhook_secret-1',
} as const;

it('builds webhook URL at the public origin, outside /api/v1', () => {
  const config = {
    PUBLIC_API_BASE_URL: 'https://api.city.example/api/v1',
    MAX_WEBHOOK_SECRET: expected.secret,
  } as RuntimeConfig;
  expect(expectedMaxSubscription(config)).toEqual(expected);
  expect(() => expectedMaxSubscription({ ...config, PUBLIC_API_BASE_URL: 'https://api.city.example:8443/api/v1' }))
    .toThrow('MAX_WEBHOOK_URL_INVALID');
});

function adapter(subscriptions: MaxSubscription[]): MaxAdapter & {
  listSubscriptions: ReturnType<typeof vi.fn>;
  createSubscription: ReturnType<typeof vi.fn>;
} {
  return {
    sendMessage: vi.fn(async () => ({ providerMessageId: 'mid.1' })),
    listSubscriptions: vi.fn(async () => subscriptions),
    createSubscription: vi.fn(async () => {}),
    parseUpdate: parseMaxUpdate,
  };
}

it('leaves an exact subscription unchanged regardless of update type order', async () => {
  const max = adapter([{ url: expected.url, updateTypes: ['message_created', 'bot_started'] }]);
  const reconciler = new MaxSubscriptionReconciler(max, expected, 30000);
  await expect(reconciler.reconcile()).resolves.toBe('unchanged');
  expect(max.createSubscription).not.toHaveBeenCalled();
});

it('reconciles missing/wrong subscription once and coalesces concurrent cycles', async () => {
  const max = adapter([
    { url: 'https://other.example/webhook', updateTypes: expected.updateTypes },
    { url: expected.url, updateTypes: ['bot_started'] },
  ]);
  let release!: () => void;
  max.listSubscriptions.mockImplementation(() => new Promise(resolve => { release = () => resolve(max.listSubscriptions.mock.results.length ? [
    { url: expected.url, updateTypes: ['bot_started'] },
  ] : []); }));
  const reconciler = new MaxSubscriptionReconciler(max, expected, 30000);
  const first = reconciler.reconcile();
  const second = reconciler.reconcile();
  expect(first).toBe(second);
  release();
  await expect(first).resolves.toBe('created');
  expect(max.createSubscription).toHaveBeenCalledTimes(1);
  expect(max.createSubscription).toHaveBeenCalledWith(expected);
});
