import { z } from 'zod';

export const ENV_KEYS = [
  'APP_ENV', 'HOST', 'PORT', 'DEMO_MODE', 'DATABASE_URL',
  'APP_SESSION_SECRET', 'MAX_ADAPTER_MODE', 'MAX_BOT_TOKEN',
  'MAX_WEBHOOK_SECRET', 'PUBLIC_APP_URL', 'PUBLIC_API_BASE_URL',
  'BUILD_SHA', 'MAX_INIT_DATA_MAX_AGE_SECONDS',
  'MAX_INIT_DATA_FUTURE_SKEW_SECONDS', 'APP_SESSION_TTL_SECONDS',
  'MAX_REQUEST_TIMEOUT_MS', 'MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS',
  'NOTIFICATION_WORKER_POLL_INTERVAL_MS', 'NOTIFICATION_WORKER_CONCURRENCY',
  'NOTIFICATION_RETRY_BASE_MS', 'NOTIFICATION_RETRY_MAX_MS',
  'NOTIFICATION_LEASE_MS', 'NOTIFICATION_MAX_ATTEMPTS',
] as const;

const integer = (min: number, max: number, fallback: string) =>
  z.string().regex(/^[0-9]+$/).default(fallback).transform(Number)
    .pipe(z.number().int().min(min).max(max));
const utf8Bytes = (min: number, max: number) => z.string().refine(
  value => Buffer.byteLength(value, 'utf8') >= min && Buffer.byteLength(value, 'utf8') <= max,
);
const publicUrl = z.url().refine(value => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password && !url.hash;
  } catch { return false; }
});
const databaseUrl = z.url().refine(value => {
  try { return ['postgres:', 'postgresql:'].includes(new URL(value).protocol); }
  catch { return false; }
});
const isLoopbackHost = (host: string): boolean => {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost' || normalized === '[::1]' || normalized === '::1' || /^127(?:\.\d{1,3}){3}$/.test(normalized);
};

export const inputSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']),
  HOST: z.string().min(1).max(255).default('0.0.0.0'),
  PORT: integer(1, 65535, '3000'),
  DEMO_MODE: z.enum(['true', 'false']).transform(value => value === 'true'),
  DATABASE_URL: databaseUrl,
  APP_SESSION_SECRET: utf8Bytes(32, 4096),
  MAX_ADAPTER_MODE: z.enum(['live', 'fake']),
  MAX_BOT_TOKEN: z.string().min(8).max(4096).optional(),
  MAX_WEBHOOK_SECRET: utf8Bytes(32, 4096).optional(),
  PUBLIC_APP_URL: publicUrl,
  PUBLIC_API_BASE_URL: publicUrl,
  BUILD_SHA: z.string().regex(/^[0-9a-f]{40}$/),
  MAX_INIT_DATA_MAX_AGE_SECONDS: integer(60, 3600, '300'),
  MAX_INIT_DATA_FUTURE_SKEW_SECONDS: integer(0, 300, '30'),
  APP_SESSION_TTL_SECONDS: integer(60, 3600, '900'),
  MAX_REQUEST_TIMEOUT_MS: integer(1000, 30000, '10000'),
  MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS: integer(30000, 3600000, '300000'),
  NOTIFICATION_WORKER_POLL_INTERVAL_MS: integer(100, 60000, '1000'),
  NOTIFICATION_WORKER_CONCURRENCY: integer(1, 32, '4'),
  NOTIFICATION_RETRY_BASE_MS: integer(100, 60000, '1000'),
  NOTIFICATION_RETRY_MAX_MS: integer(1000, 3600000, '300000'),
  NOTIFICATION_LEASE_MS: integer(5000, 300000, '30000'),
  NOTIFICATION_MAX_ATTEMPTS: integer(1, 20, '8'),
}).superRefine((value, context) => {
  const issue = (key: keyof typeof value) => context.addIssue({ code: 'custom', path: [key], message: 'invalid combination' });
  if (value.MAX_INIT_DATA_FUTURE_SKEW_SECONDS >= value.MAX_INIT_DATA_MAX_AGE_SECONDS) issue('MAX_INIT_DATA_FUTURE_SKEW_SECONDS');
  if (value.NOTIFICATION_RETRY_MAX_MS < value.NOTIFICATION_RETRY_BASE_MS) issue('NOTIFICATION_RETRY_MAX_MS');
  if (value.NOTIFICATION_LEASE_MS <= value.MAX_REQUEST_TIMEOUT_MS) issue('NOTIFICATION_LEASE_MS');
  if (value.MAX_ADAPTER_MODE === 'live') {
    if (!value.MAX_BOT_TOKEN) issue('MAX_BOT_TOKEN');
    if (!value.MAX_WEBHOOK_SECRET) issue('MAX_WEBHOOK_SECRET');
  } else {
    if (value.APP_ENV !== 'test') issue('MAX_ADAPTER_MODE');
    if (value.MAX_BOT_TOKEN !== undefined) issue('MAX_BOT_TOKEN');
    if (value.MAX_WEBHOOK_SECRET !== undefined) issue('MAX_WEBHOOK_SECRET');
  }
  try {
    const api = new URL(value.PUBLIC_API_BASE_URL);
    if (api.search || !api.pathname.endsWith('/api/v1')) issue('PUBLIC_API_BASE_URL');
    if (value.APP_ENV === 'production') {
      for (const key of ['PUBLIC_APP_URL', 'PUBLIC_API_BASE_URL'] as const) {
        const url = new URL(value[key]);
        if (url.protocol !== 'https:' || isLoopbackHost(url.hostname)) issue(key);
      }
    }
  } catch { /* URL fields have their own validation */ }
});

export type ParsedRuntimeConfig = z.output<typeof inputSchema>;
