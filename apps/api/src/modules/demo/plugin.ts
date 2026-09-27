import { randomUUID } from 'node:crypto';
import { ApplicationHeadersSchema, ErrorResponseSchema, RequestIdHeaderSchema } from '@max-smart-city/contracts';
import { CommandKernelError } from '@max-smart-city/db';
import type { DatabaseConnection } from '@max-smart-city/db';
import type { RuntimeConfig } from '../../config/types.js';
import type { RuntimeFastifyInstance } from '../../app/static.js';
export interface DemoModuleOptions { database: DatabaseConnection; nowSeconds?: () => number }
import { SessionError } from '../auth/session-token.js';
import { DemoError } from './errors.js';
import { DemoService } from './service.js';
import { canonicalJson } from './canonical-response.js';

export function registerDemoRoutes(app: RuntimeFastifyInstance, config: RuntimeConfig, options: DemoModuleOptions): void {
  const service = new DemoService(config, options.database, options.nowSeconds);
  for (const [path, kind] of [['/api/v1/demo/runs', 'START'], ['/api/v1/demo/session/actor', 'SWITCH']] as const) {
    app.post(path, {
      errorHandler: (error, request, reply) => {
        const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
        const code = (error.statusCode ?? 500) < 500 ? 'MALFORMED_REQUEST' : 'INTERNAL_ERROR';
        return reply.code(code === 'MALFORMED_REQUEST' ? 400 : 500).send(ErrorResponseSchema.parse({
          error: { code, message: code, request_id: id.success ? id.data : randomUUID() },
        }));
      },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
      const fail = (status: number, code: string) => reply.code(status).send(ErrorResponseSchema.parse({
        error: { code, message: code, request_id: id.success ? id.data : randomUUID() },
      }));
      const headers = ApplicationHeadersSchema.safeParse({ authorization: request.headers.authorization,
        'x-request-id': request.headers['x-request-id'] });
      if (!headers.success) return fail(401, 'UNAUTHENTICATED');
      const key = request.headers['idempotency-key'];
      if (key !== undefined && typeof key !== 'string') return fail(400, 'IDEMPOTENCY_KEY_REQUIRED');
      try {
        const result = await service.command(kind, headers.data.authorization.slice('Bearer '.length), key, request.body);
        if (result.replayed) reply.header('Idempotency-Replayed', 'true');
        return reply.code(result.status).type('application/json').send(canonicalJson(result.body));
      } catch (error) {
        if (error instanceof SessionError) return fail(401, error.code);
        if (error instanceof DemoError || error instanceof CommandKernelError) return fail(error.status, error.code);
        return fail(500, 'INTERNAL_ERROR');
      }
    });
  }
}
