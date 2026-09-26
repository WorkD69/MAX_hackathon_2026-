import { randomUUID } from 'node:crypto';
import {
  ApplicationHeadersSchema, AuthMaxRequestSchema, ErrorResponseSchema, RequestIdHeaderSchema,
} from '@max-smart-city/contracts';
import type { RuntimeConfig } from '../../config/types.js';
import type { RuntimeFastifyInstance } from '../../app/static.js';
import type { MaxIdentityRepository } from '../max-identity/repository.js';
import { InitDataError } from './init-data.js';
import { AuthContextError, AuthService } from './service.js';
import { SessionError } from './session-token.js';

export interface AuthModuleOptions {
  readonly repository: MaxIdentityRepository;
  readonly nowSeconds?: () => number;
}

export function registerAuthRoutes(app: RuntimeFastifyInstance, config: RuntimeConfig, options: AuthModuleOptions): void {
  const service = new AuthService(config, options.repository, options.nowSeconds);
  const requestId = (header: unknown): string => {
    const parsed = RequestIdHeaderSchema.safeParse(header);
    return parsed.success ? parsed.data : randomUUID();
  };
  const errorBody = (code: string, id: string): unknown => ErrorResponseSchema.parse({
    error: { code, message: code, request_id: id },
  });

  app.post('/api/v1/auth/max', {
    errorHandler: (error, request, reply) => {
      const code = (error.statusCode ?? 500) < 500 ? 'INVALID_INIT_DATA_FORMAT' : 'AUTH_BOOTSTRAP_FAILED';
      return reply.code(code === 'INVALID_INIT_DATA_FORMAT' ? 400 : 500)
        .send(errorBody(code, requestId(request.headers['x-request-id'])));
    },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = requestId(request.headers['x-request-id']);
    const parsed = AuthMaxRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('INVALID_INIT_DATA_FORMAT', id));
    try {
      return reply.code(200).send(await service.bootstrap(parsed.data.init_data));
    } catch (error) {
      if (error instanceof InitDataError) {
        return reply.code(error.code === 'INVALID_INIT_DATA_FORMAT' ? 400 : 401).send(errorBody(error.code, id));
      }
      if (error instanceof AuthContextError) {
        return reply.code(error.code === 'APP_USER_NOT_MAPPED' ? 403 : 500).send(errorBody(error.code, id));
      }
      return reply.code(500).send(errorBody('AUTH_BOOTSTRAP_FAILED', id));
    }
  });

  app.get('/api/v1/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = requestId(request.headers['x-request-id']);
    const headers = ApplicationHeadersSchema.safeParse({
      authorization: request.headers.authorization,
      'x-request-id': request.headers['x-request-id'],
    });
    if (!headers.success) return reply.code(401).send(errorBody('UNAUTHENTICATED', id));
    try {
      const token = headers.data.authorization.slice('Bearer '.length);
      return reply.code(200).send(await service.readSession(token));
    } catch (error) {
      if (error instanceof SessionError) return reply.code(401).send(errorBody(error.code, id));
      return reply.code(500).send(errorBody('INTERNAL_ERROR', id));
    }
  });
}
