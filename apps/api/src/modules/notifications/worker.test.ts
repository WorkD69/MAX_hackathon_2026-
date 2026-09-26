import type { NotificationIntentRecord } from '@max-smart-city/db';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../../config/types.js';
import { MaxAdapterError } from '../max-adapter/errors.js';
import type { MaxAdapter } from '../max-adapter/types.js';
import { parseMaxUpdate } from '../max-adapter/update.js';
import { redriveNotificationIntent } from './redrive-command.js';
import type { ClaimOptions, NotificationFailure, NotificationStore, RedriveResult } from './store.js';
import { DurableNotificationWorker, RESULT_READY_NOTIFICATION_TEXT } from './worker.js';

const now = new Date('2026-09-26T12:00:00.000Z');
const intentId = '00000000-0000-4000-8000-000000000401';
const claimToken = '00000000-0000-4000-8000-000000000410';

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    APP_ENV: 'test', HOST: '127.0.0.1', PORT: 3000, DEMO_MODE: false,
    DATABASE_URL: 'postgres://postgres:postgres@localhost/test', APP_SESSION_SECRET: 's'.repeat(32),
    MAX_ADAPTER_MODE: 'fake', PUBLIC_APP_URL: 'https://city.example/',
    PUBLIC_API_BASE_URL: 'https://api.city.example/api/v1', BUILD_SHA: 'a'.repeat(40),
    MAX_INIT_DATA_MAX_AGE_SECONDS: 300, MAX_INIT_DATA_FUTURE_SKEW_SECONDS: 30,
    APP_SESSION_TTL_SECONDS: 900, MAX_REQUEST_TIMEOUT_MS: 1000,
    MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS: 30000, NOTIFICATION_WORKER_POLL_INTERVAL_MS: 100,
    NOTIFICATION_WORKER_CONCURRENCY: 2, NOTIFICATION_RETRY_BASE_MS: 100,
    NOTIFICATION_RETRY_MAX_MS: 1000, NOTIFICATION_LEASE_MS: 5000, NOTIFICATION_MAX_ATTEMPTS: 3,
    ...overrides,
  };
}

function record(overrides: Partial<NotificationIntentRecord> = {}): NotificationIntentRecord {
  return {
    notification_intent_id: intentId, case_id: '00000000-0000-4000-8000-000000000001',
    result_id: '00000000-0000-4000-8000-000000000002',
    recipient_max_identity_id: '00000000-0000-4000-8000-000000000003',
    delivery_chat_id: '-70801090403050', delivery_chat_type: 'DIALOG',
    notification_kind: 'RESULT_READY', dedupe_key: 'result-ready:2', payload: { result_id: '2' },
    status: 'PENDING', attempt_count: 0, next_attempt_at: now, last_attempt_at: null,
    claim_token: null, claimed_at: null, lease_expires_at: null, delivered_at: null,
    provider_message_id: null, last_error_code: null, last_error_message: null,
    operational_redrive_count: 0, created_at: now, ...overrides,
  };
}

class MemoryStore implements NotificationStore {
  intent?: NotificationIntentRecord = record();
  recover?: NotificationIntentRecord;
  finalizationMatches = true;
  readonly events: string[] = [];

  async recoverExpiredExhausted(): Promise<NotificationIntentRecord | undefined> {
    this.events.push('recover');
    return this.recover;
  }

  async claimNext(options: ClaimOptions): Promise<NotificationIntentRecord | undefined> {
    this.events.push('claim');
    if (!this.intent || this.intent.status === 'CLAIMED' || this.intent.status === 'DELIVERED') return undefined;
    this.intent = record({
      ...this.intent, status: 'CLAIMED', claim_token: options.claimToken,
      claimed_at: options.claimedAt, lease_expires_at: options.leaseExpiresAt,
      next_attempt_at: null, last_attempt_at: options.claimedAt,
      attempt_count: this.intent.attempt_count + 1,
    });
    return this.intent;
  }

  async markDelivered(id: string, token: string, deliveredAt: Date, providerMessageId: string | null): Promise<NotificationIntentRecord | undefined> {
    this.events.push('delivered');
    if (!this.matches(id, token)) return undefined;
    this.intent = record({ ...this.intent, status: 'DELIVERED', claim_token: null, claimed_at: null,
      lease_expires_at: null, delivered_at: deliveredAt, provider_message_id: providerMessageId });
    return this.intent;
  }

  async scheduleRetry(id: string, token: string, nextAttemptAt: Date, failure: NotificationFailure): Promise<NotificationIntentRecord | undefined> {
    this.events.push('retry');
    if (!this.matches(id, token)) return undefined;
    this.intent = record({ ...this.intent, status: 'RETRY', claim_token: null, claimed_at: null,
      lease_expires_at: null, next_attempt_at: nextAttemptAt,
      last_error_code: failure.code, last_error_message: failure.message });
    return this.intent;
  }

  async markPermanentFailure(id: string, token: string, failure: NotificationFailure): Promise<NotificationIntentRecord | undefined> {
    this.events.push('permanent');
    if (!this.matches(id, token)) return undefined;
    this.intent = record({ ...this.intent, status: 'PERMANENT_FAILURE', claim_token: null, claimed_at: null,
      lease_expires_at: null, next_attempt_at: null,
      last_error_code: failure.code, last_error_message: failure.message });
    return this.intent;
  }

  async redrive(id: string, nextAttemptAt: Date): Promise<RedriveResult | undefined> {
    if (!this.intent || this.intent.notification_intent_id !== id || this.intent.status !== 'PERMANENT_FAILURE') return undefined;
    const previousAttemptCount = this.intent.attempt_count;
    this.intent = record({ ...this.intent, status: 'RETRY', attempt_count: 0, next_attempt_at: nextAttemptAt,
      claim_token: null, claimed_at: null, lease_expires_at: null, last_error_code: null,
      last_error_message: null, operational_redrive_count: this.intent.operational_redrive_count + 1 });
    return { intent: this.intent, previousAttemptCount };
  }

  private matches(id: string, token: string): boolean {
    return this.finalizationMatches && this.intent?.notification_intent_id === id &&
      this.intent.status === 'CLAIMED' && this.intent.claim_token === token;
  }
}

function adapter(send: MaxAdapter['sendMessage']): MaxAdapter {
  return {
    sendMessage: send,
    listSubscriptions: vi.fn(async () => []),
    createSubscription: vi.fn(async () => {}),
    parseUpdate: parseMaxUpdate,
  };
}

describe('DurableNotificationWorker', () => {
  it('claims before network, sends canonical text, then finalizes matching claim', async () => {
    const store = new MemoryStore();
    const send = vi.fn(async () => {
      store.events.push('network');
      expect(store.intent?.status).toBe('CLAIMED');
      return { providerMessageId: 'mid.1' };
    });
    const worker = new DurableNotificationWorker(store, adapter(send), config(), undefined, () => now, () => claimToken);
    await expect(worker.processOne()).resolves.toEqual({ kind: 'delivered', intentId });
    expect(store.events).toEqual(['recover', 'claim', 'network', 'delivered']);
    expect(send).toHaveBeenCalledWith('-70801090403050', {
      text: RESULT_READY_NOTIFICATION_TEXT,
      openAppAction: { type: 'open_app', text: 'Открыть приложение' },
    });
    expect(store.intent).toMatchObject({ status: 'DELIVERED', attempt_count: 1, provider_message_id: 'mid.1' });
  });

  it('allows only one of two concurrent workers to claim the same intent', async () => {
    const store = new MemoryStore();
    const send = vi.fn(async () => ({ providerMessageId: 'mid.1' }));
    const one = new DurableNotificationWorker(store, adapter(send), config(), undefined, () => now, () => claimToken);
    const two = new DurableNotificationWorker(store, adapter(send), config(), undefined, () => now,
      () => '00000000-0000-4000-8000-000000000411');
    const results = await Promise.all([one.processOne(), two.processOne()]);
    expect(results.map(value => value.kind).sort()).toEqual(['delivered', 'idle']);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cannot finalize with a wrong/stale claim token', async () => {
    const store = new MemoryStore();
    store.finalizationMatches = false;
    const worker = new DurableNotificationWorker(store, adapter(async () => ({ providerMessageId: 'mid.1' })),
      config(), undefined, () => now, () => claimToken);
    await expect(worker.processOne()).resolves.toEqual({ kind: 'claim_lost', intentId });
    expect(store.intent?.status).toBe('CLAIMED');
  });

  it('does not disguise a database finalize failure as a MAX retry', async () => {
    const store = new MemoryStore();
    vi.spyOn(store, 'markDelivered').mockRejectedValue(new Error('DATABASE_UNAVAILABLE'));
    const send = vi.fn(async () => ({ providerMessageId: 'mid.1' }));
    const worker = new DurableNotificationWorker(store, adapter(send), config(), undefined, () => now, () => claimToken);
    await expect(worker.processOne()).rejects.toThrow('DATABASE_UNAVAILABLE');
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.events).not.toContain('retry');
  });

  it('propagates unexpected adapter errors for lease recovery instead of misclassifying them', async () => {
    const store = new MemoryStore();
    const worker = new DurableNotificationWorker(store, adapter(async () => {
      throw new Error('UNEXPECTED_ADAPTER_BUG');
    }), config(), undefined, () => now, () => claimToken);
    await expect(worker.processOne()).rejects.toThrow('UNEXPECTED_ADAPTER_BUG');
    expect(store.intent).toMatchObject({ status: 'CLAIMED', claim_token: claimToken });
    expect(store.events).not.toContain('retry');
  });

  it.each([
    ['MAX_HTTP_429'], ['MAX_HTTP_5XX'], ['MAX_NETWORK_FAILURE'],
  ])('retries transient %s with bounded exponential backoff', async safeCode => {
    const store = new MemoryStore();
    const worker = new DurableNotificationWorker(store, adapter(async () => {
      throw new MaxAdapterError('transient', safeCode);
    }), config(), undefined, () => now, () => claimToken);
    const result = await worker.processOne();
    expect(result).toMatchObject({ kind: 'retry_scheduled', intentId, nextAttemptAt: new Date(now.getTime() + 100) });
    expect(store.intent).toMatchObject({ status: 'RETRY', attempt_count: 1, last_error_code: safeCode });
  });

  it.each([['MAX_AUTH_REJECTED'], ['MAX_REQUEST_REJECTED'], ['MAX_REDIRECT_REJECTED']])
  ('makes permanent failure terminal for %s', async safeCode => {
    const store = new MemoryStore();
    const worker = new DurableNotificationWorker(store, adapter(async () => {
      throw new MaxAdapterError('permanent', safeCode);
    }), config(), undefined, () => now, () => claimToken);
    await expect(worker.processOne()).resolves.toEqual({ kind: 'permanent_failure', intentId, errorCode: safeCode });
    expect(store.intent).toMatchObject({ status: 'PERMANENT_FAILURE', last_error_code: safeCode });
  });

  it('does not send an expired exhausted claim and recovers the same row', async () => {
    const store = new MemoryStore();
    store.recover = record({ status: 'PERMANENT_FAILURE', attempt_count: 3, next_attempt_at: null });
    const send = vi.fn(async () => ({ providerMessageId: 'mid.1' }));
    const worker = new DurableNotificationWorker(store, adapter(send), config(), undefined, () => now, () => claimToken);
    await expect(worker.processOne()).resolves.toEqual({ kind: 'recovered_exhausted', intentId });
    expect(send).not.toHaveBeenCalled();
  });

  it('turns the last failed reservation into ATTEMPTS_EXHAUSTED', async () => {
    const store = new MemoryStore();
    store.intent = record({ status: 'RETRY', attempt_count: 2 });
    const worker = new DurableNotificationWorker(store, adapter(async () => {
      throw new MaxAdapterError('transient', 'MAX_HTTP_500');
    }), config(), undefined, () => now, () => claimToken);
    await expect(worker.processOne()).resolves.toEqual({ kind: 'permanent_failure', intentId, errorCode: 'ATTEMPTS_EXHAUSTED' });
    expect(store.intent).toMatchObject({ status: 'PERMANENT_FAILURE', attempt_count: 3, last_error_code: 'ATTEMPTS_EXHAUSTED' });
  });
});

it('redrives only the existing permanent intent and resets the bounded cycle without cloning', async () => {
  const store = new MemoryStore();
  const original = record({ status: 'PERMANENT_FAILURE', attempt_count: 3, next_attempt_at: null,
    last_attempt_at: new Date(now.getTime() - 1000), last_error_code: 'ATTEMPTS_EXHAUSTED' });
  store.intent = original;
  const info = vi.fn();
  const result = await redriveNotificationIntent({
    store, notificationIntentId: intentId, operatorContext: 'TG-019 operator recovery', now,
    diagnostics: { info, error: vi.fn() },
  });
  expect(result.intent).toMatchObject({
    notification_intent_id: intentId, status: 'RETRY', attempt_count: 0,
    operational_redrive_count: 1, last_attempt_at: original.last_attempt_at,
  });
  expect(info).toHaveBeenCalledWith('notification_intent_redriven', expect.objectContaining({
    notification_intent_id: intentId, previous_attempt_count: 3,
  }));
  expect(JSON.stringify(info.mock.calls)).not.toContain('TG-019 operator recovery');
  await expect(redriveNotificationIntent({
    store, notificationIntentId: intentId, operatorContext: 'second redrive', diagnostics: { info, error: vi.fn() },
  })).rejects.toThrow('NOTIFICATION_INTENT_NOT_REDRIVABLE');
});
