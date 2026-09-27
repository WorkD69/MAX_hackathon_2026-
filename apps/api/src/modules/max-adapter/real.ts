import { z } from 'zod';
import type { RuntimeConfig } from '../../config/types.js';
import { MaxAdapterError, classifyHttpFailure } from './errors.js';
import { parseMaxUpdate } from './update.js';
import type {
  ExpectedMaxSubscription, MaxAdapter, MaxOutgoingMessage, MaxSendResult,
  MaxSubscription, ParsedMaxUpdate,
} from './types.js';
import { MAX_API_BASE_URL } from './types.js';

export type MaxFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
export interface MaxTiming {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

const systemTiming: MaxTiming = {
  now: () => Date.now(),
  sleep: milliseconds => new Promise(resolve => { setTimeout(resolve, milliseconds); }),
};

class PerChatSendLimiter {
  private readonly sentAt = new Map<string, number[]>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly timing: MaxTiming) {}

  async enter(chatId: string): Promise<void> {
    const previous = this.tails.get(chatId) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>(resolve => { release = resolve; });
    this.tails.set(chatId, turn);
    await previous;
    try {
      for (;;) {
        const now = this.timing.now();
        const recent = (this.sentAt.get(chatId) ?? []).filter(at => at > now - 1000);
        if (recent.length < 2) {
          recent.push(now);
          this.sentAt.set(chatId, recent);
          return;
        }
        await this.timing.sleep(Math.max(1, recent[0]! + 1000 - now));
      }
    } finally {
      release();
      if (this.tails.get(chatId) === turn) this.tails.delete(chatId);
    }
  }
}

const sendResponse = z.object({
  message: z.object({ body: z.object({ mid: z.string().min(1) }).passthrough() }).passthrough(),
}).passthrough();

const subscriptionsResponse = z.object({
  subscriptions: z.array(z.object({
    url: z.string().url(),
    update_types: z.array(z.string()).optional(),
  }).passthrough()),
}).passthrough();

const createSubscriptionResponse = z.object({ success: z.boolean() }).passthrough();

function safeChatId(value: string): string {
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(value)) throw new MaxAdapterError('permanent', 'MAX_TARGET_INVALID');
  return value;
}

function messageBody(message: MaxOutgoingMessage): Record<string, unknown> {
  const body: Record<string, unknown> = { text: message.text };
  if (message.openAppAction) {
    body.attachments = [{
      type: 'inline_keyboard',
      payload: { buttons: [[{ type: 'open_app', text: 'Открыть приложение' }]] },
    }];
  }
  return body;
}

export class RealMaxAdapter implements MaxAdapter {
  private readonly token: string;
  private readonly fetcher: MaxFetch;
  private readonly timeoutMs: number;
  private readonly sendLimiter: PerChatSendLimiter;

  constructor(config: RuntimeConfig, fetcher: MaxFetch = fetch, timing: MaxTiming = systemTiming) {
    if (config.MAX_ADAPTER_MODE !== 'live' || !config.MAX_BOT_TOKEN) {
      throw new Error('MAX_LIVE_CONFIGURATION_REQUIRED');
    }
    this.token = config.MAX_BOT_TOKEN;
    this.timeoutMs = config.MAX_REQUEST_TIMEOUT_MS;
    this.fetcher = fetcher;
    this.sendLimiter = new PerChatSendLimiter(timing);
  }

  async sendMessage(validatedChatId: string, message: MaxOutgoingMessage): Promise<MaxSendResult> {
    const chatId = safeChatId(validatedChatId);
    await this.sendLimiter.enter(chatId);
    const url = new URL('/messages', MAX_API_BASE_URL);
    url.searchParams.set('chat_id', chatId);
    const response = await this.request(url, {
      method: 'POST',
      body: JSON.stringify(messageBody(message)),
    });
    if (response.status !== 200) throw classifyHttpFailure(response.status);
    const parsed = sendResponse.safeParse(await this.safeJson(response));
    if (!parsed.success) throw new MaxAdapterError('transient', 'MAX_RESPONSE_MALFORMED');
    return { providerMessageId: parsed.data.message.body.mid };
  }

  async listSubscriptions(): Promise<readonly MaxSubscription[]> {
    const response = await this.request(new URL('/subscriptions', MAX_API_BASE_URL), { method: 'GET' });
    if (response.status !== 200) throw classifyHttpFailure(response.status);
    const parsed = subscriptionsResponse.safeParse(await this.safeJson(response));
    if (!parsed.success) throw new MaxAdapterError('transient', 'MAX_RESPONSE_MALFORMED');
    return parsed.data.subscriptions.map(value => ({
      url: value.url,
      updateTypes: value.update_types ?? [],
    }));
  }

  async createSubscription(expected: ExpectedMaxSubscription): Promise<void> {
    const response = await this.request(new URL('/subscriptions', MAX_API_BASE_URL), {
      method: 'POST',
      body: JSON.stringify({
        url: expected.url,
        update_types: [...expected.updateTypes],
        secret: expected.secret,
      }),
    });
    if (response.status !== 200) throw classifyHttpFailure(response.status);
    const parsed = createSubscriptionResponse.safeParse(await this.safeJson(response));
    if (!parsed.success) throw new MaxAdapterError('transient', 'MAX_RESPONSE_MALFORMED');
    if (!parsed.data.success) throw new MaxAdapterError('transient', 'MAX_SUBSCRIPTION_REJECTED');
  }

  async deleteSubscription(subscriptionUrl: string): Promise<void> {
    const url = new URL('/subscriptions', MAX_API_BASE_URL);
    url.searchParams.set('url', subscriptionUrl);
    const response = await this.request(url, { method: 'DELETE' });
    if (response.status !== 200) throw classifyHttpFailure(response.status);
    const parsed = createSubscriptionResponse.safeParse(await this.safeJson(response));
    if (!parsed.success) throw new MaxAdapterError('transient', 'MAX_RESPONSE_MALFORMED');
    if (!parsed.data.success) throw new MaxAdapterError('transient', 'MAX_SUBSCRIPTION_REJECTED');
  }

  parseUpdate(value: unknown): ParsedMaxUpdate {
    return parseMaxUpdate(value);
  }

  private async request(url: URL, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, {
        ...init,
        headers: { Authorization: this.token, 'Content-Type': 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const code = error instanceof DOMException && error.name === 'TimeoutError'
        ? 'MAX_REQUEST_TIMEOUT'
        : 'MAX_NETWORK_FAILURE';
      throw new MaxAdapterError('transient', code);
    }
  }

  private async safeJson(response: Response): Promise<unknown> {
    try { return await response.json(); }
    catch { return undefined; }
  }
}
