import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { RoleSchema } from '@max-smart-city/contracts';
import { z } from 'zod';
import type { RuntimeConfig } from '../../config/types.js';

const claimsSchema = z.strictObject({
  schema_version: z.literal(1),
  sid: z.uuid(),
  max_identity_id: z.uuid(),
  app_user_id: z.uuid().nullable(),
  role_binding_id: z.uuid().nullable(),
  role: RoleSchema.nullable(),
  demo_mode: z.boolean(),
  demo_run_id: z.uuid().nullable(),
  real_display_name: z.string().max(256),
  iat: z.number().int().refine(Number.isSafeInteger),
  exp: z.number().int().refine(Number.isSafeInteger),
});

export type SessionClaims = z.output<typeof claimsSchema>;
export type NewSessionContext = Omit<SessionClaims, 'schema_version' | 'sid' | 'iat' | 'exp'>;
export type SessionErrorCode = 'UNAUTHENTICATED' | 'SESSION_EXPIRED';

export class SessionError extends Error {
  constructor(readonly code: SessionErrorCode) { super(code); }
}

export function issueSession(context: NewSessionContext, config: RuntimeConfig, nowSeconds: number): {
  token: string;
  expiresAt: string;
  claims: SessionClaims;
} {
  const claims = claimsSchema.parse({
    ...context, schema_version: 1, sid: randomUUID(), iat: nowSeconds,
    exp: nowSeconds + config.APP_SESSION_TTL_SECONDS,
  });
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signedPart = `v1.${payload}`;
  const tag = createHmac('sha256', config.APP_SESSION_SECRET).update(signedPart, 'ascii').digest('base64url');
  return { token: `${signedPart}.${tag}`, expiresAt: new Date(claims.exp * 1000).toISOString(), claims };
}

export function verifySession(token: string, config: RuntimeConfig, nowSeconds: number): SessionClaims {
  if (typeof token !== 'string') throw new SessionError('UNAUTHENTICATED');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new SessionError('UNAUTHENTICATED');
  const payload = parts[1]!;
  const tag = parts[2]!;
  if (!/^[A-Za-z0-9_-]{1,8192}$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(tag)) {
    throw new SessionError('UNAUTHENTICATED');
  }
  const supplied = Buffer.from(tag, 'base64url');
  if (supplied.length !== 32 || supplied.toString('base64url') !== tag) {
    throw new SessionError('UNAUTHENTICATED');
  }
  const expected = createHmac('sha256', config.APP_SESSION_SECRET)
    .update(`v1.${payload}`, 'ascii').digest();
  if (!timingSafeEqual(expected, supplied)) throw new SessionError('UNAUTHENTICATED');
  const decoded = Buffer.from(payload, 'base64url');
  if (decoded.toString('base64url') !== payload) throw new SessionError('UNAUTHENTICATED');
  let parsed: unknown;
  try { parsed = JSON.parse(decoded.toString('utf8')); }
  catch { throw new SessionError('UNAUTHENTICATED'); }
  const result = claimsSchema.safeParse(parsed);
  if (!result.success) throw new SessionError('UNAUTHENTICATED');
  const claims = result.data;
  if (claims.exp <= nowSeconds) throw new SessionError('SESSION_EXPIRED');
  if (claims.iat > nowSeconds || claims.exp <= claims.iat || claims.exp - claims.iat > 3600) {
    throw new SessionError('UNAUTHENTICATED');
  }
  if (claims.demo_mode ? claims.role_binding_id !== null : claims.demo_run_id !== null) {
    throw new SessionError('UNAUTHENTICATED');
  }
  return claims;
}
