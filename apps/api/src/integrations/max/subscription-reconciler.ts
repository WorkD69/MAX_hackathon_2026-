import type { RuntimeConfig } from '../../config/types.js';
import { MaxAdapterError } from '../../modules/max-adapter/errors.js';
import type { ExpectedMaxSubscription, MaxAdapter, MaxSubscription } from '../../modules/max-adapter/types.js';
import { REQUIRED_MAX_UPDATE_TYPES } from '../../modules/max-adapter/types.js';

export interface MaxIntegrationDiagnostics {
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, fields: Readonly<Record<string, unknown>>): void;
}

const silentDiagnostics: MaxIntegrationDiagnostics = {
  info: () => {},
  error: () => {},
};

function canonicalTypes(values: readonly string[]): string {
  return [...new Set(values)].sort().join('\u0000');
}

function isExact(subscription: MaxSubscription, expected: ExpectedMaxSubscription): boolean {
  return subscription.url === expected.url &&
    canonicalTypes(subscription.updateTypes) === canonicalTypes(expected.updateTypes);
}

export function expectedMaxSubscription(config: RuntimeConfig): ExpectedMaxSubscription {
  if (!config.MAX_WEBHOOK_SECRET) throw new Error('MAX_WEBHOOK_SECRET_REQUIRED');
  const url = new URL('/integrations/max/webhook', config.PUBLIC_API_BASE_URL);
  if (url.protocol !== 'https:' || url.port) throw new MaxAdapterError('permanent', 'MAX_WEBHOOK_URL_INVALID');
  return {
    url: url.toString(),
    updateTypes: REQUIRED_MAX_UPDATE_TYPES,
    secret: config.MAX_WEBHOOK_SECRET,
  };
}

export class MaxSubscriptionReconciler {
  private inFlight: Promise<'unchanged' | 'created'> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly adapter: MaxAdapter,
    private readonly expected: ExpectedMaxSubscription,
    private readonly intervalMs: number,
    private readonly diagnostics: MaxIntegrationDiagnostics = silentDiagnostics,
  ) {}

  reconcile(): Promise<'unchanged' | 'created'> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.reconcileOnce().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  start(): void {
    if (this.timer) return;
    void this.safeReconcile();
    this.timer = setInterval(() => { void this.safeReconcile(); }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async reconcileOnce(): Promise<'unchanged' | 'created'> {
    const subscriptions = await this.adapter.listSubscriptions();
    if (subscriptions.some(subscription => isExact(subscription, this.expected))) return 'unchanged';
    await this.adapter.createSubscription(this.expected);
    this.diagnostics.info('max_subscription_reconciled', { webhook_url: this.expected.url });
    return 'created';
  }

  private async safeReconcile(): Promise<void> {
    try { await this.reconcile(); }
    catch (error) {
      this.diagnostics.error('max_subscription_reconcile_failed', {
        error_code: error instanceof MaxAdapterError ? error.safeCode : 'MAX_SUBSCRIPTION_RECONCILE_FAILED',
      });
    }
  }
}
