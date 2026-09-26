import { randomUUID } from 'node:crypto';
import type { RuntimeConfig } from '../../config/types.js';
import { MaxAdapterError } from '../max-adapter/errors.js';
import type { MaxAdapter } from '../max-adapter/types.js';
import type { NotificationFailure, NotificationStore } from './store.js';

export const RESULT_READY_NOTIFICATION_TEXT = 'Подрядчик сообщил о выполнении. Проверьте результат';

export type NotificationWorkResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'recovered_exhausted'; readonly intentId: string }
  | { readonly kind: 'delivered'; readonly intentId: string }
  | { readonly kind: 'retry_scheduled'; readonly intentId: string; readonly nextAttemptAt: Date }
  | { readonly kind: 'permanent_failure'; readonly intentId: string; readonly errorCode: string }
  | { readonly kind: 'claim_lost'; readonly intentId: string };

export interface NotificationDiagnostics {
  info(event: string, fields: Readonly<Record<string, unknown>>): void;
  error(event: string, fields: Readonly<Record<string, unknown>>): void;
}

const silentDiagnostics: NotificationDiagnostics = { info: () => {}, error: () => {} };

function backoffMs(config: RuntimeConfig, attemptCount: number): number {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 52);
  return Math.min(config.NOTIFICATION_RETRY_MAX_MS, config.NOTIFICATION_RETRY_BASE_MS * (2 ** exponent));
}

function safeFailure(error: unknown): { disposition: 'transient' | 'permanent'; failure: NotificationFailure } {
  if (!(error instanceof MaxAdapterError)) throw error;
  return {
    disposition: error.disposition,
    failure: { code: error.safeCode, message: 'MAX notification delivery failed' },
  };
}

export class DurableNotificationWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private cycle: Promise<void> | undefined;

  constructor(
    private readonly store: NotificationStore,
    private readonly adapter: MaxAdapter,
    private readonly config: RuntimeConfig,
    private readonly diagnostics: NotificationDiagnostics = silentDiagnostics,
    private readonly now: () => Date = () => new Date(),
    private readonly uuid: () => string = randomUUID,
  ) {}

  async processOne(): Promise<NotificationWorkResult> {
    const now = this.now();
    const exhausted = await this.store.recoverExpiredExhausted(now, this.config.NOTIFICATION_MAX_ATTEMPTS);
    if (exhausted) {
      this.diagnostics.error('notification_attempts_exhausted', { notification_intent_id: exhausted.notification_intent_id });
      return { kind: 'recovered_exhausted', intentId: exhausted.notification_intent_id };
    }

    const claimToken = this.uuid();
    const intent = await this.store.claimNext({
      claimToken,
      claimedAt: now,
      leaseExpiresAt: new Date(now.getTime() + this.config.NOTIFICATION_LEASE_MS),
      maxAttempts: this.config.NOTIFICATION_MAX_ATTEMPTS,
    });
    if (!intent) return { kind: 'idle' };

    let sent: Awaited<ReturnType<MaxAdapter['sendMessage']>>;
    try {
      sent = await this.adapter.sendMessage(intent.delivery_chat_id, {
        text: RESULT_READY_NOTIFICATION_TEXT,
        openAppAction: { type: 'open_app', text: 'Открыть приложение' },
      });
    } catch (error) {
      const classified = safeFailure(error);
      if (classified.disposition === 'permanent') {
        const finalized = await this.store.markPermanentFailure(intent.notification_intent_id, claimToken, classified.failure);
        if (!finalized) return { kind: 'claim_lost', intentId: intent.notification_intent_id };
        this.diagnostics.error('notification_permanent_failure', {
          notification_intent_id: intent.notification_intent_id,
          error_code: classified.failure.code,
        });
        return { kind: 'permanent_failure', intentId: intent.notification_intent_id, errorCode: classified.failure.code };
      }

      if (intent.attempt_count >= this.config.NOTIFICATION_MAX_ATTEMPTS) {
        const exhaustedFailure = { code: 'ATTEMPTS_EXHAUSTED', message: 'Notification delivery attempts exhausted' };
        const finalized = await this.store.markPermanentFailure(intent.notification_intent_id, claimToken, exhaustedFailure);
        if (!finalized) return { kind: 'claim_lost', intentId: intent.notification_intent_id };
        this.diagnostics.error('notification_permanent_failure', {
          notification_intent_id: intent.notification_intent_id,
          error_code: exhaustedFailure.code,
        });
        return { kind: 'permanent_failure', intentId: intent.notification_intent_id, errorCode: exhaustedFailure.code };
      }

      const nextAttemptAt = new Date(now.getTime() + backoffMs(this.config, intent.attempt_count));
      const finalized = await this.store.scheduleRetry(
        intent.notification_intent_id, claimToken, nextAttemptAt, classified.failure,
      );
      if (!finalized) return { kind: 'claim_lost', intentId: intent.notification_intent_id };
      this.diagnostics.error('notification_retry_scheduled', {
        notification_intent_id: intent.notification_intent_id,
        error_code: classified.failure.code,
        next_attempt_at: nextAttemptAt.toISOString(),
      });
      return { kind: 'retry_scheduled', intentId: intent.notification_intent_id, nextAttemptAt };
    }
    const finalized = await this.store.markDelivered(
      intent.notification_intent_id, claimToken, this.now(), sent.providerMessageId,
    );
    if (!finalized) return { kind: 'claim_lost', intentId: intent.notification_intent_id };
    this.diagnostics.info('notification_delivered', { notification_intent_id: intent.notification_intent_id });
    return { kind: 'delivered', intentId: intent.notification_intent_id };
  }

  async runCycle(): Promise<void> {
    await Promise.all(Array.from(
      { length: this.config.NOTIFICATION_WORKER_CONCURRENCY },
      () => this.processOne(),
    ));
  }

  start(): void {
    if (this.timer) return;
    const trigger = (): void => {
      if (this.cycle) return;
      this.cycle = this.runCycle()
        .catch(() => { this.diagnostics.error('notification_worker_cycle_failed', { error_code: 'WORKER_CYCLE_FAILED' }); })
        .finally(() => { this.cycle = undefined; });
    };
    trigger();
    this.timer = setInterval(trigger, this.config.NOTIFICATION_WORKER_POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
