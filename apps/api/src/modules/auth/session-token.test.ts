import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/load-config.js';
import { issueSession, verifySession } from './session-token.js';

const now = 1771409719;
const config = (ttl = '900') => loadConfig({
  APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
  APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
  PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
  BUILD_SHA: 'a'.repeat(40), APP_SESSION_TTL_SECONDS: ttl,
});
const context = {
  max_identity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  app_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role_binding_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  role: 'RESIDENT' as const,
  demo_mode: false,
  demo_run_id: null,
  real_display_name: 'Max User',
};

describe('versioned signed Bearer session', () => {
  it.each(['60', '900', '3600'])('signs with typed TTL %s and expires at exp boundary', ttl => {
    const issued = issueSession(context, config(ttl), now);
    expect(issued.token.startsWith('v1.')).toBe(true);
    expect(issued.claims.exp - issued.claims.iat).toBe(Number(ttl));
    expect(issued.expiresAt).toBe(new Date((now + Number(ttl)) * 1000).toISOString());
    expect(verifySession(issued.token, config(ttl), now + Number(ttl) - 1)).toEqual(issued.claims);
    expect(() => verifySession(issued.token, config(ttl), now + Number(ttl))).toThrow('SESSION_EXPIRED');
  });

  it('rejects payload tampering, wrong key and unknown version', () => {
    const issued = issueSession(context, config(), now);
    const [version, payload, tag] = issued.token.split('.');
    expect(() => verifySession(`${version}.${payload!.slice(0, -1)}A.${tag}`, config(), now)).toThrow('UNAUTHENTICATED');
    expect(() => verifySession(issued.token, loadConfig({
      APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
      APP_SESSION_SECRET: 'x'.repeat(32), MAX_ADAPTER_MODE: 'fake',
      PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1', BUILD_SHA: 'a'.repeat(40),
    }), now)).toThrow('UNAUTHENTICATED');
    expect(() => verifySession(`v2.${payload}.${tag}`, config(), now)).toThrow('UNAUTHENTICATED');
  });

  it.each(['', 'abc', 'g'.repeat(43), 'f'.repeat(64), 'a'.repeat(44)])('rejects malformed MAC without timingSafeEqual length exception', tag => {
    const [version, payload] = issueSession(context, config(), now).token.split('.');
    expect(() => verifySession(`${version}.${payload}.${tag}`, config(), now)).toThrow('UNAUTHENTICATED');
  });

  it('rejects malformed claims even when signed with the server key', () => {
    const issued = issueSession(context, config(), now);
    const [, payload] = issued.token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>;
    claims.schema_version = 2;
    const changedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signedPart = `v1.${changedPayload}`;
    const tag = createHmac('sha256', config().APP_SESSION_SECRET).update(signedPart, 'ascii').digest('base64url');
    expect(() => verifySession(`${signedPart}.${tag}`, config(), now)).toThrow('UNAUTHENTICATED');
  });
});
