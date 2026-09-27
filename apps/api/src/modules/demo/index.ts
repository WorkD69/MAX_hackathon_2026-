import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorResponseSchema, RequestIdHeaderSchema } from '@max-smart-city/contracts';
import type { DatabaseConnection, DatabaseTransaction } from '@max-smart-city/db';
import type { RuntimeConfig } from '../../config/types.js';
import type { RuntimeFastifyInstance } from '../../app/static.js';
import { registerAuthRoutes } from '../auth/plugin.js';
import type { AuthModuleOptions } from '../auth/plugin.js';
import type { MaxIdentityRepository } from '../max-identity/repository.js';
import { createTransactionAuthorizationRepository } from '../commands/kernel/authorization.js';
import { registerDemoRoutes } from './plugin.js';
import type { DemoModuleOptions } from './plugin.js';
import { demoIdentityRepository, lockDemoIdentity, resolveDemoActor } from './repository.js';

/** Only the existing auth handlers run in this request transaction; commands use TG-012. */
function createDemoAuthOptions(database: DatabaseConnection, scope: AsyncLocalStorage<DatabaseTransaction>,
  nowSeconds: () => number): AuthModuleOptions {
  const connection = () => scope.getStore() ?? database;
  const repository: MaxIdentityRepository = {
    upsertValidated: (launch, now) => demoIdentityRepository(connection()).upsertValidated(launch, now),
    findById: id => demoIdentityRepository(connection()).findById(id),
    normalActors: id => demoIdentityRepository(connection()).normalActors(id),
    demoActor: (run, actor) => demoIdentityRepository(connection()).demoActor(run, actor),
    async currentDemoRun(identity) {
      const transaction = scope.getStore();
      if (transaction) await lockDemoIdentity(transaction, identity);
      return demoIdentityRepository(connection()).currentDemoRun(identity);
    },
  };
  const authorizationRepository = new Proxy(createTransactionAuthorizationRepository(database), {
    get(_target, property) {
      return (...args: unknown[]) => {
        const current = createTransactionAuthorizationRepository(connection());
        return Reflect.apply(Reflect.get(current, property), current, args);
      };
    },
  });
  return { repository, nowSeconds, authorizationRepository,
    demoActorResolver: (run, role, primary) => resolveDemoActor(connection(), run, role, primary) };
}

/** Register once, instead of a separate auth registration, in the application composition root. */
export function registerDemoModule(app: RuntimeFastifyInstance, config: RuntimeConfig, options: DemoModuleOptions): void {
  const scope = new AsyncLocalStorage<DatabaseTransaction>();
  // Decorate registration, preserving TG-010's exact handlers, schemas, errors and token protocol.
  const authRoutes = new Proxy(app, {
    get(target, property, receiver) {
      if (property !== 'get' && property !== 'post') return Reflect.get(target, property, receiver);
      return (...args: unknown[]) => {
        const handler = args.at(-1);
        if (typeof handler !== 'function') throw new TypeError('AUTH_ROUTE_HANDLER_REQUIRED');
        const path = args[0];
        args[args.length - 1] = async function (this: RuntimeFastifyInstance, request: FastifyRequest, reply: FastifyReply) {
          let payload: unknown;
          let sent = false;
          // TG-010 chains header/code/send. Preserve metadata, but defer the actual send until COMMIT.
          const buffered = new Proxy(reply, {
            get(targetReply, property, replyReceiver) {
              if (property === 'then') return undefined;
              if (property === 'send') return (body: unknown) => { payload = body; sent = true; return buffered; };
              if (property === 'header' || property === 'code') return (...values: unknown[]) => {
                Reflect.apply(Reflect.get(targetReply, property), targetReply, values);
                return buffered;
              };
              return Reflect.get(targetReply, property, replyReceiver);
            },
          });
          try {
            await options.database.transaction().execute(transaction => scope.run(transaction,
              () => Promise.resolve(Reflect.apply(handler, this, [request, buffered]))));
            if (!sent) throw new Error('AUTH_RESPONSE_REQUIRED');
          } catch {
            const id = RequestIdHeaderSchema.safeParse(request.headers['x-request-id']);
            const code = path === '/api/v1/auth/max' ? 'AUTH_BOOTSTRAP_FAILED' : 'INTERNAL_ERROR';
            return reply.header('Cache-Control', 'no-store').code(500).send(ErrorResponseSchema.parse({
              error: { code, message: code, request_id: id.success ? id.data : randomUUID() },
            }));
          }
          return reply.send(payload);
        };
        return Reflect.apply(Reflect.get(target, property), target, args);
      };
    },
  });
  registerAuthRoutes(authRoutes, config, createDemoAuthOptions(options.database, scope,
    options.nowSeconds ?? (() => Math.floor(Date.now() / 1000))));
  registerDemoRoutes(app, config, options);
}

export { registerDemoRoutes } from './plugin.js';
export type { DemoModuleOptions } from './plugin.js';
export { bindPrimaryCase, lockDemoIdentity, resolveDemoActor } from './repository.js';
export { DemoService } from './service.js';
export { DemoError } from './errors.js';
