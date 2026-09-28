import { randomUUID } from 'node:crypto';
import {
  CategoryPathSchema, ContractorEmployeePathSchema, ContractorPathSchema, ErrorResponseSchema,
  HousePathSchema, IdempotencyKeyHeaderSchema, RequestIdHeaderSchema, UserPathSchema,
} from '@max-smart-city/contracts';
import type { DatabaseConnection } from '@max-smart-city/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { RuntimeFastifyInstance } from '../../app/static.js';
import type { RuntimeConfig } from '../../config/types.js';
import { SessionError } from '../auth/session-token.js';
import { AuthorizationError } from '../authorization/policy.js';
import { CommandKernelError } from '@max-smart-city/db';
import { ConfigurationError } from './repository.js';
import { ConfigurationService } from './service.js';
import type { ConfigurationServiceOptions } from './service.js';

export interface ConfigurationModuleOptions extends ConfigurationServiceOptions {
  readonly database: DatabaseConnection;
  readonly config: RuntimeConfig;
}

const token = (request: FastifyRequest): string => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) throw new SessionError('UNAUTHENTICATED');
  return authorization.slice(7);
};

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const requestId = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
  const id = requestId.success ? requestId.data : randomUUID();
  const code = error instanceof SessionError ? error.code
    : error instanceof AuthorizationError ? error.code === 'NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : error.code
      : error instanceof ConfigurationError || error instanceof CommandKernelError ? error.code
        : error instanceof ZodError ? 'MALFORMED_REQUEST' : 'INTERNAL_ERROR';
  const status = error instanceof SessionError ? 401
    : error instanceof AuthorizationError || error instanceof ConfigurationError || error instanceof CommandKernelError
      ? error.status : error instanceof ZodError ? 400 : 500;
  return reply.code(status).send(ErrorResponseSchema.parse({ error: { code, message: code, request_id: id } }));
}

/** Feature-owned route contribution. TG-029 composes it into the central app. */
export function registerConfigurationRoutes(app: RuntimeFastifyInstance, options: ConfigurationModuleOptions): void {
  const service = new ConfigurationService(options.database, options.config, options);
  const read = (kind: 'organization' | 'houses' | 'categories' | 'contractors' | 'users') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      try { return reply.code(200).send(await service.read(token(request), kind)); }
      catch (error) { return sendError(request, reply, error); }
    };
  app.get('/api/v1/config/organization', read('organization'));
  app.get('/api/v1/config/houses', read('houses'));
  app.get('/api/v1/config/categories', read('categories'));
  app.get('/api/v1/config/contractors', read('contractors'));
  app.get('/api/v1/config/users', read('users'));

  const mutation = (operation: Parameters<ConfigurationService['mutate']>[1], method: 'POST' | 'PATCH' | 'PUT',
    target: (params: unknown) => string | null) => async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      const key = request.headers['idempotency-key'];
      if (key !== undefined && !IdempotencyKeyHeaderSchema.safeParse(key).success) {
        throw new ZodError([]);
      }
      const result = await service.mutate(token(request), operation, method, request.url.split('?')[0]!,
        target(request.params), request.body, typeof key === 'string' ? key : null);
      if (result.replayed) reply.header('Idempotency-Replayed', 'true');
      return reply.code(result.status).send(result.body);
    } catch (error) { return sendError(request, reply, error); }
  };
  const noTarget = () => null;
  app.patch('/api/v1/config/organization', mutation('organization.patch', 'PATCH', noTarget));
  app.post('/api/v1/config/houses', mutation('house.create', 'POST', noTarget));
  app.patch('/api/v1/config/houses/:houseId', mutation('house.patch', 'PATCH', params => HousePathSchema.parse(params).houseId));
  app.post('/api/v1/config/categories', mutation('category.create', 'POST', noTarget));
  app.patch('/api/v1/config/categories/:categoryId', mutation('category.patch', 'PATCH', params => CategoryPathSchema.parse(params).categoryId));
  app.post('/api/v1/config/contractors', mutation('contractor.create', 'POST', noTarget));
  app.put('/api/v1/config/contractors/:contractorId/binding',
    mutation('contractor.binding', 'PUT', params => ContractorPathSchema.parse(params).contractorId));
  app.put('/api/v1/config/users/:appUserId/role-binding',
    mutation('user.role', 'PUT', params => UserPathSchema.parse(params).appUserId));
  app.put('/api/v1/config/contractors/:contractorId/employees/:appUserId',
    mutation('contractor.employee', 'PUT', params => {
      const parsed = ContractorEmployeePathSchema.parse(params);
      return `${parsed.contractorId}:${parsed.appUserId}`;
    }));
}
