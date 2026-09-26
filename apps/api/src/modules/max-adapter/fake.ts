import type { RuntimeConfig } from '../../config/types.js';
import { parseMaxUpdate } from './update.js';
import type {
  ExpectedMaxSubscription, MaxAdapter, MaxOutgoingMessage, MaxSendResult,
  MaxSubscription, ParsedMaxUpdate,
} from './types.js';

export interface FakeSentMessage {
  readonly chatId: string;
  readonly message: MaxOutgoingMessage;
}

export class FakeMaxAdapter implements MaxAdapter {
  readonly sent: FakeSentMessage[] = [];
  readonly createdSubscriptions: ExpectedMaxSubscription[] = [];
  subscriptions: MaxSubscription[] = [];

  constructor(config: RuntimeConfig) {
    if (config.APP_ENV !== 'test' || config.MAX_ADAPTER_MODE !== 'fake') {
      throw new Error('FAKE_MAX_ADAPTER_TEST_ONLY');
    }
  }

  async sendMessage(chatId: string, message: MaxOutgoingMessage): Promise<MaxSendResult> {
    this.sent.push({ chatId, message });
    return { providerMessageId: `fake-${this.sent.length}` };
  }

  async listSubscriptions(): Promise<readonly MaxSubscription[]> {
    return this.subscriptions;
  }

  async createSubscription(expected: ExpectedMaxSubscription): Promise<void> {
    this.createdSubscriptions.push(expected);
    this.subscriptions = [...this.subscriptions, { url: expected.url, updateTypes: expected.updateTypes }];
  }

  parseUpdate(value: unknown): ParsedMaxUpdate {
    return parseMaxUpdate(value);
  }
}
