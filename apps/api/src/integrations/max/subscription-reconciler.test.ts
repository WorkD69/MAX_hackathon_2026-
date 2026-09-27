import { expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../../config/types.js';
import { MaxAdapterError } from '../../modules/max-adapter/errors.js';
import type { ExpectedMaxSubscription, MaxAdapter, MaxSubscription } from '../../modules/max-adapter/types.js';
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

function adapter(initial: MaxSubscription[]): MaxAdapter & {
  listSubscriptions: ReturnType<typeof vi.fn>;
  createSubscription: ReturnType<typeof vi.fn>;
  deleteSubscription: ReturnType<typeof vi.fn>;
} {
  let subscriptions = [...initial];
  return {
    sendMessage: vi.fn(async () => ({ providerMessageId: 'mid.1' })),
    listSubscriptions: vi.fn(async () => [...subscriptions]),
    createSubscription: vi.fn(async (desired: ExpectedMaxSubscription) => {
      subscriptions = [
        ...subscriptions.filter(subscription => subscription.url !== desired.url),
        { url: desired.url, updateTypes: desired.updateTypes },
      ];
    }),
    deleteSubscription: vi.fn(async (url: string) => {
      subscriptions = subscriptions.filter(subscription => subscription.url !== url);
    }),
    parseUpdate: parseMaxUpdate,
  };
}

it('refreshes an exact subscription on first reconciliation to rotate an unobservable secret', async () => {
  const max = adapter([{ url: expected.url, updateTypes: ['message_created', 'bot_started'] }]);
  const reconciler = new MaxSubscriptionReconciler(max, expected, 30000);
  await expect(reconciler.reconcile()).resolves.toBe('created');
  expect(max.createSubscription).toHaveBeenCalledExactlyOnceWith(expected);
  expect(max.deleteSubscription).not.toHaveBeenCalled();
  await expect(reconciler.reconcile()).resolves.toBe('unchanged');
  expect(max.createSubscription).toHaveBeenCalledTimes(1);
});

it('refreshes an exact subscription again after a new reconciler starts', async () => {
  const max = adapter([{ url: expected.url, updateTypes: expected.updateTypes }]);
  await new MaxSubscriptionReconciler(max, { ...expected, secret: 'old-secret' }, 30000).reconcile();
  await new MaxSubscriptionReconciler(max, expected, 30000).reconcile();
  expect(max.createSubscription).toHaveBeenNthCalledWith(2, expected);
});

it('recreates a desired subscription if its update types drift after initial refresh', async () => {
  const max = adapter([{ url: expected.url, updateTypes: expected.updateTypes }]);
  const reconciler = new MaxSubscriptionReconciler(max, expected, 30000);
  await reconciler.reconcile();
  max.listSubscriptions.mockResolvedValueOnce([{ url: expected.url, updateTypes: ['bot_started'] }]);
  await expect(reconciler.reconcile()).resolves.toBe('created');
  expect(max.createSubscription).toHaveBeenCalledTimes(2);
});

it('migrates a canonical old webhook URL after creating the new URL', async () => {
  const oldUrl = 'https://old-api.city.example/integrations/max/webhook';
  const max = adapter([{ url: oldUrl, updateTypes: expected.updateTypes }]);
  const reconciler = new MaxSubscriptionReconciler(max, expected, 30000);
  await expect(reconciler.reconcile()).resolves.toBe('created');
  expect(max.createSubscription).toHaveBeenCalledExactlyOnceWith(expected);
  expect(max.deleteSubscription).toHaveBeenCalledExactlyOnceWith(oldUrl);
  expect(max.createSubscription.mock.invocationCallOrder[0]).toBeLessThan(max.deleteSubscription.mock.invocationCallOrder[0]!);
  await expect(reconciler.reconcile()).resolves.toBe('unchanged');
  expect(max.deleteSubscription).toHaveBeenCalledTimes(1);
});

it('preserves unrelated subscriptions and noncanonical lookalikes', async () => {
  const unrelated = [
    'https://other.example/webhook',
    'https://other.example/integrations/max/webhook/extra',
    'https://other.example/integrations/max/webhook?tenant=another',
    'http://other.example/integrations/max/webhook',
    'https://other.example:8443/integrations/max/webhook',
  ];
  const max = adapter(unrelated.map(url => ({ url, updateTypes: expected.updateTypes })));
  await new MaxSubscriptionReconciler(max, expected, 30000).reconcile();
  expect(max.deleteSubscription).not.toHaveBeenCalled();
});

it('coalesces concurrent reconciliation and only refreshes once', async () => {
  const max = adapter([{ url: expected.url, updateTypes: expected.updateTypes }]);
  let release!: () => void;
  max.listSubscriptions.mockImplementationOnce(() => new Promise(resolve => {
    release = () => resolve([{ url: expected.url, updateTypes: expected.updateTypes }]);
  }));
  const reconciler = new MaxSubscriptionReconciler(max, expected, 30000);
  const first = reconciler.reconcile();
  const second = reconciler.reconcile();
  expect(first).toBe(second);
  release();
  await expect(first).resolves.toBe('created');
  expect(max.createSubscription).toHaveBeenCalledTimes(1);
  expect(max.listSubscriptions).toHaveBeenCalledTimes(1);
});

it('retries stale URL cleanup without repeating successful secret refresh', async () => {
  const oldUrl = 'https://old-api.city.example/integrations/max/webhook';
  const max = adapter([{ url: oldUrl, updateTypes: expected.updateTypes }]);
  max.deleteSubscription.mockRejectedValueOnce(new MaxAdapterError('transient', 'MAX_HTTP_429'));
  const reconciler = new MaxSubscriptionReconciler(max, expected, 30000);
  await expect(reconciler.reconcile()).rejects.toMatchObject({ safeCode: 'MAX_HTTP_429' });
  await expect(reconciler.reconcile()).resolves.toBe('unchanged');
  expect(max.createSubscription).toHaveBeenCalledTimes(1);
  expect(max.deleteSubscription).toHaveBeenCalledTimes(2);
});

it('redacts secret and raw failure messages from reconciliation diagnostics', async () => {
  const max = adapter([]);
  max.createSubscription.mockRejectedValueOnce(new MaxAdapterError('permanent', expected.secret));
  const info = vi.fn();
  const error = vi.fn();
  const reconciler = new MaxSubscriptionReconciler(max, expected, 1000, { info, error });
  reconciler.start();
  await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
  reconciler.stop();
  expect(JSON.stringify([info.mock.calls, error.mock.calls])).not.toContain(expected.secret);
  expect(error).toHaveBeenCalledWith('max_subscription_reconcile_failed', {
    error_code: 'MAX_SUBSCRIPTION_RECONCILE_FAILED',
  });
});
