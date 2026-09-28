import { randomUUID } from 'node:crypto';
import { CasePathSchema, ErrorResponseSchema, RequestIdHeaderSchema } from '@max-smart-city/contracts';
import { CommandKernelError } from '@max-smart-city/db';
import type { DatabaseConnection } from '@max-smart-city/db';
import type { RuntimeConfig } from '../../../../config/types.js';
import type { RuntimeFastifyInstance } from '../../../../app/static.js';
import { SessionError } from '../../../auth/session-token.js';
import { AuthorizationError } from '../../../authorization/policy.js';
import { DemoError } from '../../../demo/errors.js';
import { CreateCaseService } from './create-case.js';
import { AssignmentLifecycleService } from './lifecycle.js';
import type { LifecycleKind } from './lifecycle.js';
import { parseIntakeMultipart } from './multipart.js';
import { IntakeError, residentCreateOptions } from './options.js';

export interface IntakeAssignmentModuleOptions { database: DatabaseConnection; nowSeconds?: () => number }
const wireCode = (code: string) => code === 'NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : code;

/** TG-029 registers this boundary in the central composition root. */
export function registerIntakeAssignmentRoutes(app: RuntimeFastifyInstance, config: RuntimeConfig,
  options: IntakeAssignmentModuleOptions): void {
  const createService = new CreateCaseService(options.database, config, options.nowSeconds);
  const lifecycleService = new AssignmentLifecycleService(options.database, config, options.nowSeconds);
  app.addContentTypeParser(/^multipart\/form-data(?:;.*)?$/i, { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 },
    (request, body, done) => {
      try {
        if (!Buffer.isBuffer(body)) throw new IntakeError('VALIDATION_FAILED', 400);
        done(null, parseIntakeMultipart(request.headers['content-type'] ?? '', body));
      }
      catch (error) { done(error as Error); }
    });
  app.get('/api/v1/cases/create-options', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
    const fail = (status: number, code: string) => reply.code(status).send(ErrorResponseSchema.parse({
      error: { code: wireCode(code), message: wireCode(code), request_id: id.success ? id.data : randomUUID() },
    }));
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return fail(401, 'UNAUTHENTICATED');
    try {
      return reply.code(200).send(await residentCreateOptions(options.database, config,
        header.slice('Bearer '.length), request.query, options.nowSeconds?.()));
    } catch (error) {
      if (error instanceof IntakeError || error instanceof AuthorizationError) return fail(error.status, error.code);
      if (error instanceof SessionError) return fail(401, error.code);
      return fail(500, 'INTERNAL_ERROR');
    }
  });
  app.post('/api/v1/cases', {
    errorHandler: (error, request, reply) => {
      const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
      const code = error instanceof IntakeError ? error.code : 'VALIDATION_FAILED';
      const status = error instanceof IntakeError ? error.status : 400;
      return reply.code(status).send(ErrorResponseSchema.parse({
        error: { code: wireCode(code), message: wireCode(code), request_id: id.success ? id.data : randomUUID() },
      }));
    },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
    const fail = (status: number, code: string) => reply.code(status).send(ErrorResponseSchema.parse({
      error: { code: wireCode(code), message: wireCode(code), request_id: id.success ? id.data : randomUUID() },
    }));
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return fail(401, 'UNAUTHENTICATED');
    const key = request.headers['idempotency-key'];
    if (key !== undefined && typeof key !== 'string') return fail(400, 'IDEMPOTENCY_KEY_REQUIRED');
    try {
      const parsed = request.body as ReturnType<typeof parseIntakeMultipart>;
      if (!parsed || !('payload' in parsed) || !Array.isArray(parsed.files)) return fail(400, 'VALIDATION_FAILED');
      const result = await createService.create(header.slice('Bearer '.length), key, parsed.payload, parsed.files);
      if (result.replayed) reply.header('Idempotency-Replayed', 'true');
      return reply.code(result.status).send(result.body);
    } catch (error) {
      if (error instanceof IntakeError || error instanceof AuthorizationError ||
          error instanceof DemoError || error instanceof CommandKernelError) return fail(error.status, error.code);
      if (error instanceof SessionError) return fail(401, error.code);
      return fail(500, 'INTERNAL_ERROR');
    }
  });
  const commands: readonly [string, LifecycleKind][] = [
    ['accept', 'ACCEPT_CASE'], ['select-contractor', 'SELECT_CONTRACTOR'],
    ['send-assignment', 'SEND_ASSIGNMENT'], ['accept-assignment', 'ACCEPT_ASSIGNMENT'],
    ['reject-assignment', 'REJECT_ASSIGNMENT'],
  ];
  for (const [slug, kind] of commands) {
    app.post(`/api/v1/cases/:caseId/commands/${slug}`, {
      errorHandler: (error, request, reply) => {
        const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
        const code = error instanceof IntakeError ? error.code : 'VALIDATION_FAILED';
        return reply.code(error instanceof IntakeError ? error.status : 400).send(ErrorResponseSchema.parse({
          error: { code: wireCode(code), message: wireCode(code), request_id: id.success ? id.data : randomUUID() },
        }));
      },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
      const fail = (status: number, code: string) => reply.code(status).send(ErrorResponseSchema.parse({
        error: { code: wireCode(code), message: wireCode(code), request_id: id.success ? id.data : randomUUID() },
      }));
      const header = request.headers.authorization;
      if (typeof header !== 'string' || !header.startsWith('Bearer ')) return fail(401, 'UNAUTHENTICATED');
      const key = request.headers['idempotency-key'];
      if (key !== undefined && typeof key !== 'string') return fail(400, 'IDEMPOTENCY_KEY_REQUIRED');
      const path = CasePathSchema.safeParse(request.params);
      if (!path.success) return fail(400, 'VALIDATION_FAILED');
      try {
        const result = await lifecycleService.command(kind, path.data.caseId,
          header.slice('Bearer '.length), key, request.body);
        if (result.replayed) reply.header('Idempotency-Replayed', 'true');
        return reply.code(result.status).send(result.body);
      } catch (error) {
        if (error instanceof IntakeError || error instanceof AuthorizationError ||
            error instanceof DemoError || error instanceof CommandKernelError) return fail(error.status, error.code);
        if (error instanceof SessionError) return fail(401, error.code);
        return fail(500, 'INTERNAL_ERROR');
      }
    });
  }
}
