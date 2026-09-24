import {
  ActorSwitchRequestSchema,
  ActorSwitchSuccessSchema,
  AuthMaxRequestSchema,
  AuthMaxSuccessSchema,
  DemoRunStartRequestSchema,
  DemoRunStartResponseSchema,
  SessionReadResponseSchema,
  type ActorSwitchSuccessOutput,
  type AuthMaxSuccessOutput,
  type DemoRunStartResponseOutput,
  type RoleOutput,
  type SessionReadResponseOutput,
} from '@max-smart-city/contracts';

export class SessionHttpError extends Error {
  constructor(readonly status: number) {
    super(`Session request failed (${status})`);
  }
}

async function send<T>(
  path: string,
  schema: { parse(value: unknown): T },
  options: { method?: 'GET' | 'POST'; token?: string; body?: unknown; mutation?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  if (options.mutation) headers['Idempotency-Key'] = crypto.randomUUID();
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'omit',
    cache: 'no-store',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) throw new SessionHttpError(response.status);
  return schema.parse(await response.json());
}

export function authenticateMax(rawInitData: string): Promise<AuthMaxSuccessOutput> {
  const body = AuthMaxRequestSchema.parse({ init_data: rawInitData });
  return send('/api/v1/auth/max', AuthMaxSuccessSchema, { method: 'POST', body });
}

export function readSession(token: string): Promise<SessionReadResponseOutput> {
  return send('/api/v1/session', SessionReadResponseSchema, { token });
}

export function startDemoRun(token: string): Promise<DemoRunStartResponseOutput> {
  const body = DemoRunStartRequestSchema.parse({ scenario_key: 'primary-housing-demo' });
  return send('/api/v1/demo/runs', DemoRunStartResponseSchema, {
    method: 'POST', token, body, mutation: true,
  });
}

export function switchActor(token: string, roleView: RoleOutput): Promise<ActorSwitchSuccessOutput> {
  const body = ActorSwitchRequestSchema.parse({ role_view: roleView });
  return send('/api/v1/demo/session/actor', ActorSwitchSuccessSchema, {
    method: 'POST', token, body, mutation: true,
  });
}
