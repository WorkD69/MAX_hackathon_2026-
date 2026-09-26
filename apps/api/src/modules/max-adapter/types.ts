export const MAX_API_BASE_URL = 'https://platform-api2.max.ru';
export const REQUIRED_MAX_UPDATE_TYPES = ['bot_started', 'message_created'] as const;

export interface MaxOpenAppAction {
  readonly type: 'open_app';
  readonly text: 'Открыть приложение';
}

export interface MaxOutgoingMessage {
  readonly text: string;
  readonly openAppAction?: MaxOpenAppAction;
}

export interface MaxSendResult {
  readonly providerMessageId: string;
}

export interface MaxSubscription {
  readonly url: string;
  readonly updateTypes: readonly string[];
}

export interface ExpectedMaxSubscription {
  readonly url: string;
  readonly updateTypes: readonly string[];
  readonly secret: string;
}

export type ParsedMaxUpdate =
  | { readonly kind: 'bot_started'; readonly chatId: string }
  | { readonly kind: 'known_unhandled'; readonly updateType: string }
  | { readonly kind: 'unknown' };

export interface MaxAdapter {
  sendMessage(validatedChatId: string, message: MaxOutgoingMessage): Promise<MaxSendResult>;
  listSubscriptions(): Promise<readonly MaxSubscription[]>;
  createSubscription(expected: ExpectedMaxSubscription): Promise<void>;
  parseUpdate(value: unknown): ParsedMaxUpdate;
}
