import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RuntimeConfig } from '../../config/types.js';
import { canonicalInteger, IdentityJsonError, parseIdentityObject } from './lossless-json.js';

export type InitDataErrorCode = 'INVALID_INIT_DATA_FORMAT' | 'MAX_INIT_DATA_INVALID_SIGNATURE' | 'MAX_INIT_DATA_EXPIRED';

export class InitDataError extends Error {
  constructor(readonly code: InitDataErrorCode) { super(code); }
}

export interface ValidatedMaxLaunch {
  readonly miniAppUserId: string;
  readonly chatId: string;
  readonly chatType: 'DIALOG' | 'CHAT' | 'CHANNEL';
  readonly displayName: string;
  readonly authDate: number;
}

const format = (): never => { throw new InitDataError('INVALID_INIT_DATA_FORMAT'); };
const isAsciiKey = (key: string): boolean => /^[A-Za-z0-9_]+$/.test(key);

export function canonicalizeMaxInitData(raw: string): {
  launchParams: string;
  suppliedHash: string;
  parameters: ReadonlyMap<string, string>;
} {
  if (typeof raw !== 'string' || raw.length === 0) return format();
  const parameters = new Map<string, string>();
  for (const part of raw.split('&')) {
    const equal = part.indexOf('=');
    if (equal <= 0) return format();
    const key = part.slice(0, equal);
    if (!isAsciiKey(key) || parameters.has(key)) return format();
    try { parameters.set(key, decodeURIComponent(part.slice(equal + 1))); }
    catch { return format(); }
  }
  const suppliedHash = parameters.get('hash');
  if (!suppliedHash || !/^[0-9a-f]{64}$/.test(suppliedHash)) return format();
  parameters.delete('hash');
  const launchParams = [...parameters].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  return { launchParams, suppliedHash, parameters };
}

export function validateMaxInitData(raw: string, config: RuntimeConfig, nowSeconds: number): ValidatedMaxLaunch {
  if (!config.MAX_BOT_TOKEN) return format();
  const { launchParams, suppliedHash, parameters } = canonicalizeMaxInitData(raw);
  const secretKey = createHmac('sha256', 'WebAppData').update(config.MAX_BOT_TOKEN, 'utf8').digest();
  const expected = createHmac('sha256', secretKey).update(launchParams, 'utf8').digest();
  const supplied = Buffer.from(suppliedHash, 'hex');
  if (!timingSafeEqual(expected, supplied)) throw new InitDataError('MAX_INIT_DATA_INVALID_SIGNATURE');

  const authDateRaw = parameters.get('auth_date');
  if (!authDateRaw || !/^(?:0|[1-9][0-9]*)$/.test(authDateRaw)) return format();
  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate) || !Number.isSafeInteger(nowSeconds)) return format();
  const age = nowSeconds - authDate;
  if (age > config.MAX_INIT_DATA_MAX_AGE_SECONDS || age < -config.MAX_INIT_DATA_FUTURE_SKEW_SECONDS) {
    throw new InitDataError('MAX_INIT_DATA_EXPIRED');
  }
  try {
    const user = parseIdentityObject(parameters.get('user') ?? '');
    const chat = parseIdentityObject(parameters.get('chat') ?? '');
    const miniAppUserId = canonicalInteger(user.get('id'));
    const chatId = canonicalInteger(chat.get('id'));
    const chatType = chat.get('type');
    if (chatType !== 'DIALOG' && chatType !== 'CHAT' && chatType !== 'CHANNEL') return format();
    const firstName = user.get('first_name');
    const lastName = user.get('last_name');
    const displayName = [firstName, lastName].filter((name): name is string => typeof name === 'string')
      .join(' ').trim().slice(0, 256) || 'Пользователь MAX';
    return { miniAppUserId, chatId, chatType, displayName, authDate };
  } catch (error) {
    if (error instanceof IdentityJsonError) return format();
    throw error;
  }
}
