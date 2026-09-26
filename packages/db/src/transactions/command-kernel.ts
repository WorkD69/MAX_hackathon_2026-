import { randomUUID } from 'node:crypto';
import type { CommandExecutionRecord, CommandPrincipal, DatabaseConnection, DatabaseTransaction, LockedCase } from './command-execution.js';
import { createCommandExecutionRepository } from './command-execution.js';

export type CommandTargetKind = 'EXISTING_CASE' | 'CREATE_CASE' | 'NON_CASE';

export interface CommandTarget<AuthorizationContext> {
  readonly kind: CommandTargetKind;
  readonly authorizationKey: string;
  readonly caseId: string | null;
  readonly authorizationContext: AuthorizationContext;
}

export interface CommandAuthorizationInput<AuthorizationContext> {
  readonly transaction: DatabaseTransaction;
  readonly target: CommandTarget<AuthorizationContext>;
  readonly lockedCase: LockedCase | undefined;
  /** No stored fingerprint, status or response is exposed before the gate. */
  readonly execution: { readonly commandId: string; readonly commandType: string; readonly caseId: string | null };
  readonly phase: 'NEW' | 'REPLAY_REQUESTED' | 'REPLAY_STORED';
}

export interface CommandOwnerContext<NormalizedPayload, AuthorizationContext> {
  readonly transaction: DatabaseTransaction;
  readonly payload: NormalizedPayload;
  readonly target: CommandTarget<AuthorizationContext>;
  readonly lockedCase: LockedCase | undefined;
  readonly execution: CommandExecutionRecord;
  readonly commandId: string;
}

export interface CommandCompletionContext<NormalizedPayload, AuthorizationContext, Effect> extends CommandOwnerContext<NormalizedPayload, AuthorizationContext> {
  readonly effect: Effect;
  readonly revision: number | null;
}

export interface CommandPlan<NormalizedPayload, AuthorizationContext, Effect, ResponseBody> {
  requestedTarget(payload: NormalizedPayload): CommandTarget<AuthorizationContext>;
  /** Pure resolver: derive the original protected resource from the immutable canonical response. */
  storedTarget(execution: CommandExecutionRecord): Promise<CommandTarget<AuthorizationContext>> | CommandTarget<AuthorizationContext>;
  lockAuthorizationResources?(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext>): Promise<void>;
  lockReplayResources?(input: {
    readonly transaction: DatabaseTransaction;
    readonly requested: CommandTarget<AuthorizationContext>;
    readonly stored: CommandTarget<AuthorizationContext>;
  }): Promise<void>;
  authorize(input: CommandAuthorizationInput<AuthorizationContext>): Promise<void>;
  terminalGuard(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext>): Promise<void>;
  validateExactTargets(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext>): Promise<void>;
  validateStateContext(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext>): Promise<void>;
  lockConfiguration(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext>): Promise<void>;
  validateDomain(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext>): Promise<void>;
  writeDomain(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext>): Promise<Effect>;
  updateProjection(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext> & { readonly effect: Effect }): Promise<void>;
  appendEvents(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext> & { readonly effect: Effect }): Promise<void>;
  createNotificationIntents(input: CommandOwnerContext<NormalizedPayload, AuthorizationContext> & { readonly effect: Effect }): Promise<void>;
  createdCaseId?(effect: Effect): string;
  canonicalResponse(input: CommandCompletionContext<NormalizedPayload, AuthorizationContext, Effect>): Promise<{ readonly status: number; readonly body: ResponseBody }> | { readonly status: number; readonly body: ResponseBody };
}

export interface RunCommandInput<NormalizedPayload, AuthorizationContext, Effect, ResponseBody> {
  readonly authenticate: () => Promise<CommandPrincipal> | CommandPrincipal;
  readonly idempotencyKey: string | null | undefined;
  readonly commandType: string;
  /** Schema validation, normalization and fingerprinting. Invoked only after authentication. */
  readonly prepare: () => Promise<{ readonly requestHash: string; readonly payload: NormalizedPayload }> | { readonly requestHash: string; readonly payload: NormalizedPayload };
  readonly plan: CommandPlan<NormalizedPayload, AuthorizationContext, Effect, ResponseBody>;
}

export interface CommandResult<ResponseBody> {
  readonly commandId: string;
  readonly status: number;
  readonly body: ResponseBody;
  readonly revision: number | null;
  readonly replayed: boolean;
}

export class CommandKernelError extends Error {
  constructor(
    readonly code: 'IDEMPOTENCY_KEY_REQUIRED' | 'IDEMPOTENCY_KEY_REUSE' | 'INTERNAL_ERROR',
    readonly status: 400 | 409 | 500,
  ) { super(code); }
}

const asLockedCaseMap = (rows: readonly LockedCase[]): ReadonlyMap<string, LockedCase> =>
  new Map(rows.map((row) => [row.case_id, row]));

const requireRequestHash = (requestHash: string): void => {
  if (!/^[0-9a-f]{64}$/.test(requestHash)) throw new CommandKernelError('INTERNAL_ERROR', 500);
};

const validateTarget = <Context>(target: CommandTarget<Context>): void => {
  if (target.authorizationKey.length === 0) throw new CommandKernelError('INTERNAL_ERROR', 500);
  if (target.kind === 'EXISTING_CASE' && !target.caseId) throw new CommandKernelError('INTERNAL_ERROR', 500);
  if (target.kind !== 'EXISTING_CASE' && target.kind !== 'CREATE_CASE' && target.caseId) {
    throw new CommandKernelError('INTERNAL_ERROR', 500);
  }
};

/**
 * The one transaction protocol for all mutating commands.
 * Command slices supply policy and domain callbacks but cannot move them across phases.
 */
export class CommandTransactionKernel {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly now: () => Date = () => new Date(),
    private readonly commandId: () => string = randomUUID,
  ) {}

  async run<NormalizedPayload, AuthorizationContext, Effect, ResponseBody>(
    input: RunCommandInput<NormalizedPayload, AuthorizationContext, Effect, ResponseBody>,
  ): Promise<CommandResult<ResponseBody>> {
    // Authentication and principal derivation always happen before fingerprint/reservation handling.
    const principal = await input.authenticate();
    if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
      throw new CommandKernelError('IDEMPOTENCY_KEY_REQUIRED', 400);
    }
    const prepared = await input.prepare();
    requireRequestHash(prepared.requestHash);
    const requested = input.plan.requestedTarget(prepared.payload);
    validateTarget(requested);
    const generatedCommandId = this.commandId();

    return this.database.transaction().execute(async (transaction) => {
      const repository = createCommandExecutionRepository(transaction);
      const reservation = await repository.reserveOrFind({
        commandId: generatedCommandId,
        principal,
        idempotencyKey: input.idempotencyKey!,
        commandType: input.commandType,
        // TG-007's immediate Case FK must not reveal guessed Case IDs before visibility.
        // The immutable successful response carries the exact protected resource for replay.
        caseId: null,
        requestHash: prepared.requestHash,
        createdAt: this.now(),
      });
      const executionMetadata = {
        commandId: reservation.execution.command_id,
        commandType: reservation.execution.command_type,
        caseId: reservation.execution.case_id,
      };

      if (!reservation.owner) {
        const stored = await input.plan.storedTarget(reservation.execution);
        validateTarget(stored);
        if (reservation.execution.command_type === 'CREATE_CASE' && stored.kind !== 'EXISTING_CASE') {
          throw new CommandKernelError('INTERNAL_ERROR', 500);
        }
        const locked = asLockedCaseMap(await repository.lockCases(
          [requested.caseId, stored.caseId].filter((caseId): caseId is string => caseId !== null),
        ));
        await input.plan.lockReplayResources?.({ transaction, requested, stored });

        // No request-hash decision or protected response leaves the transaction before both current gates.
        await input.plan.authorize({
          transaction,
          target: requested,
          lockedCase: requested.caseId ? locked.get(requested.caseId) : undefined,
          execution: executionMetadata,
          phase: 'REPLAY_REQUESTED',
        });
        await input.plan.authorize({
          transaction,
          target: stored,
          lockedCase: stored.caseId ? locked.get(stored.caseId) : undefined,
          execution: executionMetadata,
          phase: 'REPLAY_STORED',
        });

        if (reservation.execution.request_hash !== prepared.requestHash) {
          throw new CommandKernelError('IDEMPOTENCY_KEY_REUSE', 409);
        }
        if (reservation.execution.execution_status !== 'SUCCEEDED' ||
          reservation.execution.http_status === null || reservation.execution.response_body === null) {
          throw new CommandKernelError('INTERNAL_ERROR', 500);
        }
        const replayRevision = this.replayRevision(stored, reservation.execution.response_body);
        return {
          commandId: reservation.execution.command_id,
          status: reservation.execution.http_status,
          body: reservation.execution.response_body as ResponseBody,
          revision: replayRevision,
          replayed: true,
        };
      }

      const locked = asLockedCaseMap(await repository.lockCases(
        requested.caseId ? [requested.caseId] : [],
      ));
      const ownerContext: CommandOwnerContext<NormalizedPayload, AuthorizationContext> = {
        transaction,
        payload: prepared.payload,
        target: requested,
        lockedCase: requested.caseId ? locked.get(requested.caseId) : undefined,
        execution: reservation.execution,
        commandId: reservation.execution.command_id,
      };

      if (requested.kind !== 'EXISTING_CASE') await input.plan.lockAuthorizationResources?.(ownerContext);
      await input.plan.authorize({
        transaction,
        target: requested,
        lockedCase: ownerContext.lockedCase,
        execution: executionMetadata,
        phase: 'NEW',
      });
      await input.plan.terminalGuard(ownerContext);
      await input.plan.validateExactTargets(ownerContext);
      await input.plan.validateStateContext(ownerContext);
      await input.plan.lockConfiguration(ownerContext);
      await input.plan.validateDomain(ownerContext);
      const effect = await input.plan.writeDomain(ownerContext);
      const effectContext = { ...ownerContext, effect };
      await input.plan.updateProjection(effectContext);
      await input.plan.appendEvents(effectContext);
      await input.plan.createNotificationIntents(effectContext);

      const revision = await this.finalRevision(repository, requested, effect, input.plan);
      const canonical = await input.plan.canonicalResponse({ ...effectContext, revision });
      if (!Number.isInteger(canonical.status) || canonical.status < 200 || canonical.status > 299) {
        throw new CommandKernelError('INTERNAL_ERROR', 500);
      }
      this.assertCanonicalRevision(revision, canonical.body);
      const completed = await repository.succeed(reservation.execution.command_id, {
        httpStatus: canonical.status,
        responseBody: canonical.body,
        completedAt: this.now(),
      });
      if (!completed) throw new CommandKernelError('INTERNAL_ERROR', 500);
      return {
        commandId: completed.command_id,
        status: canonical.status,
        body: canonical.body,
        revision,
        replayed: false,
      };
    });
  }

  private async finalRevision<Payload, Context, Effect, Body>(
    repository: ReturnType<typeof createCommandExecutionRepository>,
    target: CommandTarget<Context>,
    effect: Effect,
    plan: CommandPlan<Payload, Context, Effect, Body>,
  ): Promise<number | null> {
    if (target.kind === 'EXISTING_CASE') return repository.incrementCaseRevision(target.caseId!);
    if (target.kind === 'NON_CASE') return null;
    if (!plan.createdCaseId) throw new CommandKernelError('INTERNAL_ERROR', 500);
    const revision = await repository.readCaseRevision(plan.createdCaseId(effect));
    if (revision !== 1) throw new CommandKernelError('INTERNAL_ERROR', 500);
    return revision;
  }

  private replayRevision<Context>(
    target: CommandTarget<Context>,
    body: unknown,
  ): number | null {
    if (!target.caseId) return null;
    if (typeof body === 'object' && body !== null && 'revision' in body) {
      const revision = Number((body as { revision: unknown }).revision);
      if (Number.isSafeInteger(revision) && revision >= 1) return revision;
    }
    throw new CommandKernelError('INTERNAL_ERROR', 500);
  }

  private assertCanonicalRevision(revision: number | null, body: unknown): void {
    if (revision === null) return;
    if (typeof body !== 'object' || body === null || !('revision' in body) ||
      Number((body as { revision: unknown }).revision) !== revision) {
      throw new CommandKernelError('INTERNAL_ERROR', 500);
    }
  }
}
