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
  private refreshedSecret = false;

  constructor(
    private readonly adapter: MaxAdapter,
    private readonly expected: ExpectedMaxSubscription,
    private readonly intervalMs: number,
    private readonly diagnostics: MaxIntegrationDiagnostics = silentDiagnostics,
    private readonly ownedPreviousWebhookUrls: readonly string[] = [],
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
    const shouldRefresh = !this.refreshedSecret ||
      !subscriptions.some(subscription => isExact(subscription, this.expected));
    if (shouldRefresh) {
      // GET does not expose the secret. POST refreshes it on each process start.
      await this.adapter.createSubscription(this.expected);
      this.refreshedSecret = true;
    }

    // A prior successful POST is required before removing the old endpoint.
    const ownedPreviousUrls = new Set(this.ownedPreviousWebhookUrls);
    const staleUrls = new Set(subscriptions
      .filter(subscription => subscription.url !== this.expected.url &&
        ownedPreviousUrls.has(subscription.url) &&
        canonicalTypes(subscription.updateTypes) === canonicalTypes(this.expected.updateTypes))
      .map(subscription => subscription.url));
    for (const url of staleUrls) await this.adapter.deleteSubscription(url);

    if (shouldRefresh || staleUrls.size > 0) {
      this.diagnostics.info('max_subscription_reconciled', { webhook_url: this.expected.url });
    }
    return shouldRefresh ? 'created' : 'unchanged';
  }

  private async safeReconcile(): Promise<void> {
    try { await this.reconcile(); }
    catch {
      this.diagnostics.error('max_subscription_reconcile_failed', {
        error_code: 'MAX_SUBSCRIPTION_RECONCILE_FAILED',
      });
    }
  }
}
