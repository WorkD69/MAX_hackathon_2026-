import { randomUUID } from 'node:crypto';
import { ActorSwitchRequestSchema, AuthMaxSuccessSchema, DemoRunStartRequestSchema,
  DemoRunStartResponseSchema, IdempotencyKeyHeaderSchema } from '@max-smart-city/contracts';
import { CommandKernelError, CommandTransactionKernel } from '@max-smart-city/db';
import type { CommandPlan, CommandTarget, DatabaseConnection, DatabaseTransaction } from '@max-smart-city/db';
import type { RuntimeConfig } from '../../config/types.js';
import { AuthService } from '../auth/service.js';
import { SessionError, verifySession } from '../auth/session-token.js';
import { createTransactionAuthorizationRepository } from '../commands/kernel/authorization.js';
import { createCommandFingerprint } from '../commands/kernel/fingerprint.js';
import { demoActors } from './catalog.js';
import { DemoError } from './errors.js';
import { demoIdentityRepository, lockDemoIdentity, resolveDemoActor } from './repository.js';

type StartBody = ReturnType<typeof DemoRunStartResponseSchema.parse>;
type SwitchBody = ReturnType<typeof AuthMaxSuccessSchema.parse>;
type Body = StartBody | SwitchBody;
interface TargetContext { readonly runId: string | null; readonly storedSessionToken?: string }

export function createDemoAuthService(config: RuntimeConfig, db: DatabaseConnection | DatabaseTransaction,
  nowSeconds: () => number): AuthService {
  return new AuthService(config, demoIdentityRepository(db), nowSeconds,
    createTransactionAuthorizationRepository(db), (run, role, primary) => resolveDemoActor(db, run, role, primary));
}

export class DemoService {
  private readonly kernel: CommandTransactionKernel;
  constructor(private readonly config: RuntimeConfig, private readonly database: DatabaseConnection,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000)) {
    this.kernel = new CommandTransactionKernel(database, () => new Date(nowSeconds() * 1000));
  }

  async command(kind: 'START' | 'SWITCH', token: string, key: string | undefined, body: unknown) {
    const claims = verifySession(token, this.config, this.nowSeconds());
    if (!this.config.DEMO_MODE) throw new DemoError('DEMO_MODE_DISABLED', 403);
    if (!claims.demo_mode) throw new SessionError('SESSION_EXPIRED');
    const commandType = kind === 'START' ? 'DEMO_START' : 'DEMO_ACTOR_SWITCH';
    const path = kind === 'START' ? '/api/v1/demo/runs' : '/api/v1/demo/session/actor';
    const target = (context: TargetContext): CommandTarget<TargetContext> => ({ kind: 'NON_CASE',
      authorizationKey: `demo:${claims.max_identity_id}:${context.runId ?? 'start'}`, caseId: null, authorizationContext: context });
    const noop = async () => {};
    const lock = async (transaction: DatabaseTransaction) => {
      await lockDemoIdentity(transaction, claims.max_identity_id);
      // Prevent concurrent Case mutation from changing the contractor while it is resolved/signed.
      const run = await transaction.selectFrom('demo_run').select('primary_case_id')
        .where('created_by_max_identity_id', '=', claims.max_identity_id).where('status', '=', 'ACTIVE').executeTakeFirst();
      if (run?.primary_case_id) await transaction.selectFrom('case_table').select('case_id')
        .where('case_id', '=', run.primary_case_id).forShare().execute();
    };
    const plan: CommandPlan<unknown, TargetContext, Body, Body> = {
      requestedTarget: () => target({ runId: kind === 'SWITCH' ? claims.demo_run_id : null }),
      storedTarget: execution => {
        // Resolve the original protected target even when the new request reuses a key for another command.
        if (execution.command_type === 'DEMO_START') {
          const saved = DemoRunStartResponseSchema.parse(execution.response_body);
          return target({ runId: saved.demo_run_id });
        }
        if (execution.command_type === 'DEMO_ACTOR_SWITCH') {
          const saved = AuthMaxSuccessSchema.parse(execution.response_body);
          return target({ runId: saved.session.demo_run_id, storedSessionToken: saved.session_token });
        }
        throw new DemoError('INTERNAL_ERROR', 500);
      },
      lockAuthorizationResources: input => lock(input.transaction),
      lockReplayResources: input => lock(input.transaction),
      authorize: async input => {
        const repository = demoIdentityRepository(input.transaction);
        const identity = await repository.findById(claims.max_identity_id);
        if (!identity) throw new SessionError('SESSION_EXPIRED');
        if (identity.link_status !== 'LINKED_CONFIRMED' || identity.delivery_chat_id === null ||
          !['DIALOG', 'CHAT', 'CHANNEL'].includes(identity.delivery_chat_type ?? '')) {
          throw new DemoError('AUTH_BOOTSTRAP_FAILED', 500);
        }
        const service = createDemoAuthService(this.config, input.transaction, this.nowSeconds);
        // Start can operate with actor-null bootstrap tokens, including same-key retry after the first start.
        if (kind === 'SWITCH' || claims.app_user_id !== null) await service.readSession(token);
        if (input.target.authorizationContext.runId !== null) {
          const run = await repository.currentDemoRun(claims.max_identity_id);
          if (!run || run.demo_run_id !== input.target.authorizationContext.runId) throw new SessionError('SESSION_EXPIRED');
        } else if (kind === 'SWITCH') throw new SessionError('SESSION_EXPIRED');
        if (input.target.authorizationContext.storedSessionToken) {
          // Revalidate the exact actor/binding in the saved response; no new candidate/fallback on replay.
          const saved = await service.readSession(input.target.authorizationContext.storedSessionToken);
          if (!saved.demo_run_id || !saved.effective_actor.role ||
            await resolveDemoActor(input.transaction, saved.demo_run_id, saved.effective_actor.role,
              saved.primary_case_id) !== saved.effective_actor.app_user_id) throw new SessionError('SESSION_EXPIRED');
        }
      },
      terminalGuard: noop, validateExactTargets: noop, validateStateContext: noop,
      lockConfiguration: noop, validateDomain: noop,
      writeDomain: async input => {
        if (kind === 'SWITCH') {
          const payload = ActorSwitchRequestSchema.parse(input.payload);
          return createDemoAuthService(this.config, input.transaction, this.nowSeconds)
            .selectDemoActorSession(token, payload.role_view);
        }
        const createdAt = new Date(this.nowSeconds() * 1000);
        await input.transaction.updateTable('demo_run').set({ status: 'ARCHIVED', archived_at: createdAt })
          .where('created_by_max_identity_id', '=', claims.max_identity_id).where('status', '=', 'ACTIVE').execute();
        const runId = randomUUID();
        await input.transaction.insertInto('demo_run').values({ demo_run_id: runId,
          scenario_key: 'primary-housing-demo', status: 'ACTIVE', created_by_max_identity_id: claims.max_identity_id,
          notification_recipient_max_identity_id: claims.max_identity_id, primary_case_id: null,
          created_at: createdAt, archived_at: null }).execute();
        await input.transaction.insertInto('demo_run_actor').values(demoActors.map(actor => ({
          demo_run_id: runId, app_user_id: actor.appUserId, role: actor.role, actor_alias: actor.actorAlias,
        }))).execute();
        return DemoRunStartResponseSchema.parse({ demo_run_id: runId, status: 'ACTIVE', primary_case_id: null,
          role_views: ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'] });
      },
      updateProjection: noop, appendEvents: noop, createNotificationIntents: noop,
      canonicalResponse: input => ({ status: kind === 'START' ? 201 : 200, body: input.effect }),
    };
    return this.kernel.run({
      authenticate: () => ({ type: 'MAX_IDENTITY', maxIdentityId: claims.max_identity_id }),
      idempotencyKey: key, commandType,
      prepare: () => {
        if (!IdempotencyKeyHeaderSchema.safeParse(key).success) throw new CommandKernelError('IDEMPOTENCY_KEY_REQUIRED', 400);
        const parsed = kind === 'START' ? DemoRunStartRequestSchema.safeParse(body) : ActorSwitchRequestSchema.safeParse(body);
        if (!parsed.success) throw new DemoError('VALIDATION_FAILED', 400);
        return { payload: parsed.data, requestHash: createCommandFingerprint({ method: 'POST', path, commandType, normalizedPayload: parsed.data }) };
      }, plan,
    });
  }
}
