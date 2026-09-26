import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/load-config.js';
import { canonicalizeMaxInitData, validateMaxInitData } from './init-data.js';

const token = 'TG010_TEST_BOT_TOKEN_2026';
const authDate = 1771409719;
const officialRaw = 'chat=%7B%22id%22%3A12345%2C%22type%22%3A%22DIALOG%22%7D&ip=192.168.0.1&user=%7B%22id%22%3A67890%2C%22first_name%22%3A%22Max%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3Anull%2C%22language_code%22%3A%22ru%22%2C%22photo_url%22%3Anull%7D&query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd&auth_date=1771409719';
const officialHash = '4cc1bccc784cc661a1a8c2d158631c86f2fe610050af96b54f30450f45d489e6';
const officialCanonical = 'auth_date=1771409719\nchat={"id":12345,"type":"DIALOG"}\nip=192.168.0.1\nquery_id=4c0ab423-342b-4e45-aea4-2747dbc500cd\nuser={"id":67890,"first_name":"Max","last_name":"User","username":null,"language_code":"ru","photo_url":null}';

const config = (overrides: Record<string, string> = {}) => loadConfig({
  APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
  APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'live',
  MAX_BOT_TOKEN: token, MAX_WEBHOOK_SECRET: 'w'.repeat(32),
  PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
  BUILD_SHA: 'a'.repeat(40), ...overrides,
});

function signed(fields: Record<string, string>, botToken = token): string {
  const canonical = Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', key).update(canonical).digest('hex');
  return Object.entries(fields).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&') + `&hash=${hash}`;
}

const fields = (overrides: Record<string, string> = {}) => ({
  auth_date: String(authDate),
  user: '{"id":67890,"first_name":"Max","last_name":"User"}',
  chat: '{"id":12345,"type":"DIALOG"}',
  ...overrides,
});

const code = (raw: string, now = authDate, overrides: Record<string, string> = {}) => {
  try { validateMaxInitData(raw, config(overrides), now); return 'VALID'; }
  catch (error) { return (error as { code?: string }).code; }
};

describe('pinned MAX validation vector and canonicalization', () => {
  it('matches the official example values and recorded independent HMAC vector', () => {
    const raw = `${officialRaw}&hash=${officialHash}`;
    expect(canonicalizeMaxInitData(raw).launchParams).toBe(officialCanonical);
    const derived = createHmac('sha256', 'WebAppData').update(token).digest();
    expect(derived.toString('hex')).toBe('a066dc60e06c1c52cf63ab62c68760347d5102f5d540cf774c8b356c5a8d5f3e');
    expect(validateMaxInitData(raw, config(), authDate + 300)).toEqual({
      miniAppUserId: '67890', chatId: '12345', chatType: 'DIALOG',
      displayName: 'Max User', authDate,
    });
  });

  it('decodes values once, preserves +, and does not add a final LF', () => {
    const raw = signed({ ...fields(), extra: 'a+b c' });
    expect(canonicalizeMaxInitData(raw).launchParams).toContain('extra=a+b c\n');
    expect(canonicalizeMaxInitData(raw).launchParams.endsWith('\n')).toBe(false);
  });
});

describe('malformed MAX input and MAC boundary', () => {
  it.each([
    ['', 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw}&hash=${officialHash}&hash=${officialHash}`, 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw}&user=x&hash=${officialHash}`, 'INVALID_INIT_DATA_FORMAT'],
    [officialRaw, 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw}&hash=abc`, 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw}&hash=${'g'.repeat(64)}`, 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw}&hash=${officialHash.toUpperCase()}`, 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw.replace('ip=192.168.0.1', 'ip=%Q1')}&hash=${officialHash}`, 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw.replace('ip=192.168.0.1', 'ip=%FF')}&hash=${officialHash}`, 'INVALID_INIT_DATA_FORMAT'],
    [`${officialRaw}&hash=${'0'.repeat(64)}`, 'MAX_INIT_DATA_INVALID_SIGNATURE'],
    [`${officialRaw.replace('67890', '67891')}&hash=${officialHash}`, 'MAX_INIT_DATA_INVALID_SIGNATURE'],
    [`${officialRaw}&hash=${officialHash}&`, 'INVALID_INIT_DATA_FORMAT'],
  ] as const)('rejects malformed or tampered input %#', (raw, expected) => {
    expect(code(raw)).toBe(expected);
  });

  it.each(['auth_date', 'user', 'chat'])('rejects missing signed field %s', key => {
    const entries = fields();
    delete (entries as Partial<typeof entries>)[key as keyof typeof entries];
    expect(code(signed(entries))).toBe('INVALID_INIT_DATA_FORMAT');
  });
});

describe('auth_date freshness', () => {
  const raw = signed(fields());
  it.each([
    [authDate + 300, {}, 'VALID'], [authDate + 301, {}, 'MAX_INIT_DATA_EXPIRED'],
    [authDate - 30, {}, 'VALID'], [authDate - 31, {}, 'MAX_INIT_DATA_EXPIRED'],
    [authDate + 3600, { MAX_INIT_DATA_MAX_AGE_SECONDS: '3600' }, 'VALID'],
    [authDate + 3601, { MAX_INIT_DATA_MAX_AGE_SECONDS: '3600' }, 'MAX_INIT_DATA_EXPIRED'],
    [authDate - 300, { MAX_INIT_DATA_MAX_AGE_SECONDS: '3600', MAX_INIT_DATA_FUTURE_SKEW_SECONDS: '300' }, 'VALID'],
    [authDate - 301, { MAX_INIT_DATA_MAX_AGE_SECONDS: '3600', MAX_INIT_DATA_FUTURE_SKEW_SECONDS: '300' }, 'MAX_INIT_DATA_EXPIRED'],
  ] as const)('enforces inclusive boundary at time %i', (now, overrides, expected) => {
    expect(code(raw, now, overrides)).toBe(expected);
  });

  it('rejects malformed timestamp', () => {
    expect(code(signed(fields({ auth_date: '1771409719.0' })))).toBe('INVALID_INIT_DATA_FORMAT');
  });
});

describe('lossless signed MAX identity', () => {
  it('preserves both identifiers beyond Number.MAX_SAFE_INTEGER without an ID range', () => {
    const huge = '900719925474099312345678901234567890';
    const result = validateMaxInitData(signed(fields({
      user: `{"id":${huge}}`, chat: `{"id":-${huge},"type":"CHANNEL"}`,
    })), config(), authDate);
    expect(result.miniAppUserId).toBe(huge);
    expect(result.chatId).toBe(`-${huge}`);
  });

  it('maps equivalent JSON field order, whitespace and escaped member names to one identity', () => {
    const first = validateMaxInitData(signed(fields({ user: '{"id":9007199254740993}' })), config(), authDate);
    const second = validateMaxInitData(signed(fields({ user: '{ "\\u0069d" : 9007199254740993 }' })), config(), authDate);
    expect(first.miniAppUserId).toBe('9007199254740993');
    expect(second.miniAppUserId).toBe(first.miniAppUserId);
  });

  it.each(['DIALOG', 'CHAT', 'CHANNEL'])('accepts signed chat type %s', type => {
    expect(validateMaxInitData(signed(fields({ chat: `{"id":12345,"type":"${type}"}` })), config(), authDate).chatType).toBe(type);
  });

  it.each([
    '{"id":"67890"}', '{"id":67890.0}', '{"id":6.789e4}',
    '{"id":9007199254740993.0}', '{"id":9.007199254740993e15}',
    '{"id":-0}', '{"id":null}', '{"id":true}', '{"id":1,"id":2}',
    '{"id":1,"\\u0069d":2}', '{"first_name":"Max"}', '[]', 'null',
  ])('rejects invalid or ambiguous user identity %s', user => {
    expect(code(signed(fields({ user })))).toBe('INVALID_INIT_DATA_FORMAT');
  });

  it.each([
    '{"id":"12345","type":"DIALOG"}', '{"id":12345.0,"type":"DIALOG"}',
    '{"id":12345,"type":"GROUP"}', '{"id":12345,"type":"dialog"}',
    '{"id":12345,"type":null}', '{"id":12345,"type":"CHAT","type":"DIALOG"}',
    '{"type":"DIALOG"}', '[]',
  ])('rejects invalid chat identity/type %s', chat => {
    expect(code(signed(fields({ chat })))).toBe('INVALID_INIT_DATA_FORMAT');
  });
});
