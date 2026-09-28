import { randomUUID } from 'node:crypto';
import {
  CategoriesReadResponseSchema, CategoryCreateRequestSchema, CategoryCreateSuccessSchema,
  CategoryPatchRequestSchema, CategoryPatchSuccessSchema, ContractorBindingPutRequestSchema,
  ContractorBindingPutSuccessSchema, ContractorCreateRequestSchema, ContractorCreateSuccessSchema,
  ContractorEmployeePutRequestSchema, ContractorEmployeePutSuccessSchema,
  ContractorsReadResponseSchema, HouseCreateRequestSchema, HouseCreateSuccessSchema,
  HousePatchRequestSchema, HousePatchSuccessSchema, HousesReadResponseSchema,
  OrganizationPatchRequestSchema, OrganizationPatchSuccessSchema, OrganizationReadResponseSchema,
  UserRoleBindingPutRequestSchema, UserRoleBindingPutSuccessSchema, UsersReadResponseSchema,
} from '@max-smart-city/contracts';
import { CommandTransactionKernel } from '@max-smart-city/db';
import type { CommandPlan, DatabaseConnection, DatabaseTransaction, Role } from '@max-smart-city/db';
import { z } from 'zod';
import type { RuntimeConfig } from '../../config/types.js';
import { verifySession } from '../auth/session-token.js';
import type { SessionClaims } from '../auth/session-token.js';
import { createCommandFingerprint } from '../commands/kernel/fingerprint.js';
import { createTransactionAuthorizationRepository } from '../commands/kernel/authorization.js';
import { AuthorizationError, AuthorizationPolicy } from '../authorization/policy.js';
import {
  appendAudit, bindingScope, categoryView, contractorView, eligibleUser, hidden, houseView,
  invalid, listEligibleUsers, lockById, lockOrganization, lockOrganizationContractor,
  lockUserChildren, organizationView, userView,
} from './repository.js';
import type { AppUser, Binding, Db, HouseAccess } from './repository.js';

type Operation = 'organization.patch' | 'house.create' | 'house.patch' | 'category.create' |
  'category.patch' | 'contractor.create' | 'contractor.binding' | 'user.role' | 'contractor.employee';
type ReadKind = 'organization' | 'houses' | 'categories' | 'contractors' | 'users';
type Context = { organizationId: string; targetId: string | null; operation: Operation };
type Effect = { id: string; body: unknown };

const requestSchemas = {
  'organization.patch': OrganizationPatchRequestSchema,
  'house.create': HouseCreateRequestSchema,
  'house.patch': HousePatchRequestSchema,
  'category.create': CategoryCreateRequestSchema,
  'category.patch': CategoryPatchRequestSchema,
  'contractor.create': ContractorCreateRequestSchema,
  'contractor.binding': ContractorBindingPutRequestSchema,
  'user.role': UserRoleBindingPutRequestSchema,
  'contractor.employee': ContractorEmployeePutRequestSchema,
} satisfies Record<Operation, z.ZodType>;
const successSchemas = {
  'organization.patch': OrganizationPatchSuccessSchema,
  'house.create': HouseCreateSuccessSchema,
  'house.patch': HousePatchSuccessSchema,
  'category.create': CategoryCreateSuccessSchema,
  'category.patch': CategoryPatchSuccessSchema,
  'contractor.create': ContractorCreateSuccessSchema,
  'contractor.binding': ContractorBindingPutSuccessSchema,
  'user.role': UserRoleBindingPutSuccessSchema,
  'contractor.employee': ContractorEmployeePutSuccessSchema,
} satisfies Record<Operation, z.ZodType>;

const commandType = (operation: Operation) => `CONFIG_${operation.toUpperCase().replaceAll('.', '_')}`;
const storedOperationFor = (type: string): Operation | undefined =>
  (Object.keys(successSchemas) as Operation[]).find(operation => commandType(operation) === type);

const bodyId = (operation: Operation, body: unknown): string | null => {
  if (typeof body !== 'object' || body === null) return null;
  const object = body as Record<string, unknown>;
  if (operation.startsWith('house.')) return typeof object.house_id === 'string' ? object.house_id : null;
  if (operation.startsWith('category.')) return typeof object.category_id === 'string' ? object.category_id : null;
  if (operation === 'contractor.create' || operation === 'contractor.binding') {
    const contractor = object.contractor as Record<string, unknown> | undefined;
    return typeof contractor?.contractor_id === 'string' ? contractor.contractor_id : null;
  }
  if (operation === 'user.role' || operation === 'contractor.employee') {
    const user = object.app_user as Record<string, unknown> | undefined;
    return typeof user?.app_user_id === 'string' ? user.app_user_id : null;
  }
  return typeof object.organization_id === 'string' ? object.organization_id : null;
};

export interface ConfigurationServiceOptions {
  /** Trusted seed/scenario eligibility, never derived from a request. */
  readonly eligibleUserIdsByOrganization?: Readonly<Record<string, readonly string[]>>;
  readonly nowSeconds?: () => number;
}

/** TG-018 owns this module boundary; TG-029 registers it in the central app. */
export class ConfigurationService {
  private readonly kernel: CommandTransactionKernel;
  private readonly eligibleIdsByOrganization: Readonly<Record<string, readonly string[]>>;
  private readonly nowSeconds: () => number;

  constructor(private readonly database: DatabaseConnection, private readonly config: RuntimeConfig,
    options: ConfigurationServiceOptions = {}) {
    this.kernel = new CommandTransactionKernel(database);
    this.eligibleIdsByOrganization = options.eligibleUserIdsByOrganization ?? {};
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  private claims(token: string): SessionClaims { return verifySession(token, this.config, this.nowSeconds()); }

  private async currentScope(db: Db, claims: SessionClaims) {
    const policy = new AuthorizationPolicy(createTransactionAuthorizationRepository(db as DatabaseTransaction));
    const principal = await policy.principal(claims);
    if (principal.binding.role !== 'UK_ADMIN') throw new AuthorizationError('FORBIDDEN');
    const organizationId = principal.binding.organization_id;
    if (!organizationId) throw new AuthorizationError('FORBIDDEN');
    await policy.configuration(claims, organizationId);
    return { principal, organizationId };
  }

  async read(token: string, kind: ReadKind): Promise<unknown> {
    const claims = this.claims(token);
    return this.database.transaction().execute(async transaction => {
      const { organizationId } = await this.currentScope(transaction, claims);
      if (kind === 'organization') {
        const row = await transaction.selectFrom('organization').selectAll()
          .where('organization_id', '=', organizationId).executeTakeFirstOrThrow();
        return OrganizationReadResponseSchema.parse(organizationView(row));
      }
      if (kind === 'houses') {
        const rows = await transaction.selectFrom('house').selectAll()
          .where('organization_id', '=', organizationId).orderBy('house_id').execute();
        return HousesReadResponseSchema.parse(rows.map(houseView));
      }
      if (kind === 'categories') {
        const rows = await transaction.selectFrom('category').selectAll()
          .where('organization_id', '=', organizationId).orderBy('category_id').execute();
        return CategoriesReadResponseSchema.parse(rows.map(categoryView));
      }
      if (kind === 'contractors') {
        const rows = await transaction.selectFrom('organization_contractor').selectAll()
          .where('organization_contractor.organization_id', '=', organizationId)
          .orderBy('organization_contractor.contractor_id').execute();
        const projected = [];
        for (const binding of rows) {
          const contractor = await transaction.selectFrom('contractor').selectAll()
            .where('contractor_id', '=', binding.contractor_id).executeTakeFirstOrThrow();
          projected.push(contractorView(contractor, binding));
        }
        return ContractorsReadResponseSchema.parse(projected);
      }
      return UsersReadResponseSchema.parse(await listEligibleUsers(
        transaction, organizationId, claims.demo_run_id,
        this.eligibleIdsByOrganization[organizationId] ?? [],
      ));
    });
  }

  async mutate(token: string, operation: Operation, method: 'POST' | 'PATCH' | 'PUT', path: string,
    targetId: string | null, body: unknown, idempotencyKey: string | null | undefined) {
    const claims = this.claims(token);
    // Determine the server-selected tenant before preparing the fingerprint. The locked gate below repeats this check.
    const { organizationId } = await this.currentScope(this.database, claims);
    const actorId = claims.app_user_id!;
    const context = (id: string | null): Context => ({ organizationId, targetId: id, operation });
    let normalizedPayload: Record<string, unknown> | undefined;
    const plan: CommandPlan<Record<string, unknown>, Context, Effect, unknown> = {
      requestedTarget: () => ({ kind: 'NON_CASE', caseId: null,
        authorizationKey: `${operation}:${targetId ?? organizationId}`, authorizationContext: context(targetId) }),
      storedTarget: execution => {
        const storedOperation = storedOperationFor(execution.command_type);
        if (!storedOperation) throw new Error('CONFIGURATION_STORED_OPERATION_UNKNOWN');
        const originalBody = successSchemas[storedOperation].parse(execution.response_body);
        const id = bodyId(storedOperation, originalBody);
        if (!id) throw new Error('CONFIGURATION_STORED_TARGET_MISSING');
        return { kind: 'NON_CASE', caseId: null, authorizationKey: `${storedOperation}:${id}`,
          authorizationContext: { organizationId, targetId: id, operation: storedOperation } };
      },
      lockAuthorizationResources: async ({ transaction }) => { await lockOrganization(transaction, [organizationId]); },
      lockReplayResources: async ({ transaction }) => { await lockOrganization(transaction, [organizationId]); },
      authorize: async ({ transaction, target, execution, phase }) => {
        await new AuthorizationPolicy(createTransactionAuthorizationRepository(transaction))
          .configuration(claims, organizationId);
        let authorizedContext = target.authorizationContext;
        if (phase === 'REPLAY_STORED') {
          const original = await transaction.selectFrom('configuration_change').select(['organization_id', 'after_data'])
            .where('command_id', '=', execution.commandId).executeTakeFirst();
          if (!original || original.organization_id !== organizationId) return hidden();
          if (authorizedContext.operation === 'contractor.employee') {
            const after = original.after_data as { role_bindings?: Binding[] };
            const contractorId = after.role_bindings?.find(row => row.role === 'CONTRACTOR_EMPLOYEE')?.contractor_id;
            if (!contractorId) return hidden();
            authorizedContext = { ...authorizedContext, targetId: `${contractorId}:${authorizedContext.targetId}` };
          }
        }
        await this.visibleTarget(transaction, claims, authorizedContext);
        if (phase !== 'REPLAY_STORED' && normalizedPayload) {
          await this.visibleLinkedTargets(transaction, operation, organizationId, normalizedPayload);
        }
      },
      terminalGuard: async () => {}, validateExactTargets: async () => {}, validateStateContext: async () => {},
      lockConfiguration: async ({ transaction, payload }) => {
        await this.lockDependencies(transaction, operation, organizationId, targetId, payload);
      },
      validateDomain: async ({ transaction, payload }) => {
        await new AuthorizationPolicy(createTransactionAuthorizationRepository(transaction))
          .configuration(claims, organizationId);
        await this.visibleTarget(transaction, claims, context(targetId));
        await this.validateMapping(transaction, operation, organizationId, targetId, payload);
      },
      writeDomain: async ({ transaction, payload, commandId }) => {
        return this.write(transaction, operation, organizationId, actorId, targetId, payload, commandId);
      },
      updateProjection: async () => {}, appendEvents: async () => {}, createNotificationIntents: async () => {},
      canonicalResponse: ({ effect }) => ({ status: operation.endsWith('.create') ? 201 : 200,
        body: successSchemas[operation].parse(effect.body) }),
    };
    return this.kernel.run({
      authenticate: () => ({ type: 'APP_USER' as const, appUserId: actorId }),
      idempotencyKey, commandType: commandType(operation),
      prepare: () => {
        const parsed = requestSchemas[operation].parse(body) as Record<string, unknown>;
        normalizedPayload = parsed;
        return { payload: parsed, requestHash: createCommandFingerprint({
          method, path, commandType: commandType(operation),
          normalizedPayload: parsed,
        }) };
      },
      plan,
    });
  }

  private async visibleTarget(db: Db, claims: SessionClaims, context: Context): Promise<void> {
    const { operation, targetId, organizationId } = context;
    if (operation === 'house.patch') {
      const row = await db.selectFrom('house').select('organization_id').where('house_id', '=', targetId!).executeTakeFirst();
      if (!row || row.organization_id !== organizationId) hidden();
    } else if (operation === 'category.patch') {
      const row = await db.selectFrom('category').select('organization_id').where('category_id', '=', targetId!).executeTakeFirst();
      if (!row || row.organization_id !== organizationId) hidden();
    } else if (operation === 'contractor.binding' || operation === 'contractor.employee') {
      const contractorId = operation === 'contractor.employee' ? context.targetId!.split(':')[0]! : targetId!;
      const row = await db.selectFrom('contractor').select('contractor_id')
        .where('contractor_id', '=', contractorId)
        .executeTakeFirst();
      if (!row) hidden();
      if (operation === 'contractor.employee') {
        const ownBinding = await db.selectFrom('organization_contractor').select('contractor_id')
          .where('organization_id', '=', organizationId).where('contractor_id', '=', contractorId)
          .executeTakeFirst();
        if (!ownBinding) hidden();
      }
    }
    if (operation === 'user.role' || operation === 'contractor.employee') {
      const userId = operation === 'contractor.employee' ? targetId!.split(':')[1]! : targetId!;
      if (!(await eligibleUser(db, userId, organizationId, claims.demo_run_id,
        this.eligibleIdsByOrganization[organizationId] ?? []))) hidden();
    }
  }

  private async visibleLinkedTargets(db: Db, operation: Operation, orgId: string,
    payload: Record<string, unknown>): Promise<void> {
    if (operation === 'category.create' || operation === 'category.patch' || operation === 'user.role') {
      const contractorId = operation === 'user.role' ? payload.contractor_id : payload.default_contractor_id;
      if (typeof contractorId === 'string') {
        const ownBinding = await db.selectFrom('organization_contractor').select('contractor_id')
          .where('organization_id', '=', orgId).where('contractor_id', '=', contractorId)
          .executeTakeFirst();
        if (!ownBinding) hidden();
      }
    }
    if (operation === 'user.role' && (payload.role === 'UK_ADMIN' || payload.role === 'UK_EMPLOYEE')) {
      for (const houseId of payload.house_ids as string[]) {
        const house = await db.selectFrom('house').select('organization_id')
          .where('house_id', '=', houseId).executeTakeFirst();
        if (!house || house.organization_id !== orgId) hidden();
      }
    }
  }

  private async lockDependencies(db: DatabaseTransaction, operation: Operation, orgId: string,
    targetId: string | null, payload: Record<string, unknown>): Promise<void> {
    if (operation === 'house.patch') await lockById(db, 'house', [targetId!]);
    if (operation === 'user.role') {
      const ownAccess = await db.selectFrom('uk_house_access').innerJoin('house', 'house.house_id', 'uk_house_access.house_id')
        .select('uk_house_access.house_id').where('uk_house_access.app_user_id', '=', targetId!)
        .where('house.organization_id', '=', orgId).execute();
      await lockById(db, 'house', [...ownAccess.map(row => row.house_id), ...((payload.house_ids as string[]) ?? [])]);
    }
    if (operation === 'category.patch') await lockById(db, 'category', [targetId!]);
    const contractors: string[] = [];
    if (operation === 'category.patch') {
      const current = await db.selectFrom('category').select('default_contractor_id')
        .where('category_id', '=', targetId!).executeTakeFirst();
      if (current?.default_contractor_id) contractors.push(current.default_contractor_id);
    }
    if ((operation === 'category.create' || operation === 'category.patch') && payload.default_contractor_id) {
      contractors.push(payload.default_contractor_id as string);
    }
    if (operation === 'contractor.binding') contractors.push(targetId!);
    if (operation === 'user.role' && payload.contractor_id) contractors.push(payload.contractor_id as string);
    if (operation === 'contractor.employee') contractors.push(targetId!.split(':')[0]!);
    await lockById(db, 'contractor', contractors);
    await lockOrganizationContractor(db, orgId, contractors);
    if (operation === 'user.role' || operation === 'contractor.employee') {
      const userId = operation === 'user.role' ? targetId! : targetId!.split(':')[1]!;
      await lockById(db, 'app_user', [userId]);
      const role = operation === 'user.role' ? payload.role as Role : 'CONTRACTOR_EMPLOYEE';
      const contractorId = operation === 'user.role' ? payload.contractor_id as string | null : targetId!.split(':')[0]!;
      await lockUserChildren(db, userId, orgId, role, contractorId);
    }
  }

  private async validateMapping(db: Db, operation: Operation, orgId: string,
    targetId: string | null, payload: Record<string, unknown>): Promise<void> {
    if (operation === 'category.create' || operation === 'category.patch') {
      const id = payload.default_contractor_id;
      if (id !== undefined && id !== null) await this.requireBoundContractor(db, orgId, id as string);
    }
    if (operation === 'contractor.binding') {
      const contractor = await db.selectFrom('contractor').select('active').where('contractor_id', '=', targetId!).executeTakeFirst();
      if (!contractor) return hidden();
      if (payload.active === true && !contractor.active) invalid('CONTRACTOR_NOT_AVAILABLE');
      if (payload.active === false) {
        const binding = await db.selectFrom('organization_contractor').select('contractor_id')
          .where('organization_id', '=', orgId).where('contractor_id', '=', targetId!).executeTakeFirst();
        if (!binding) invalid();
      }
    }
    if (operation === 'user.role') {
      const role = payload.role as Role;
      const contractorId = payload.contractor_id as string | null;
      const houseIds = payload.house_ids as string[];
      if (role === 'UK_ADMIN' || role === 'UK_EMPLOYEE') {
        if (contractorId !== null) invalid();
        for (const houseId of houseIds) {
          const house = await db.selectFrom('house').select('organization_id')
            .where('house_id', '=', houseId).executeTakeFirst();
          if (!house || house.organization_id !== orgId) hidden();
        }
      } else {
        if (houseIds.length !== 0) invalid();
        if (role === 'RESIDENT') {
          if (contractorId !== null) invalid();
          const access = await db.selectFrom('resident_premises_access')
            .innerJoin('premises', 'premises.premises_id', 'resident_premises_access.premises_id')
            .innerJoin('house', 'house.house_id', 'premises.house_id')
            .select('resident_premises_access.app_user_id')
            .where('resident_premises_access.app_user_id', '=', targetId!)
            .where('house.organization_id', '=', orgId).executeTakeFirst();
          if (!access) invalid();
        } else {
          if (!contractorId) return invalid();
          await this.requireBoundContractor(db, orgId, contractorId, payload.active !== false);
        }
      }
    }
    if (operation === 'contractor.employee') {
      await this.requireBoundContractor(db, orgId, targetId!.split(':')[0]!, payload.active === true);
    }
  }

  private async requireBoundContractor(db: Db, orgId: string, contractorId: string, requireActive = true) {
    const contractor = await db.selectFrom('contractor').select('active')
      .where('contractor_id', '=', contractorId).executeTakeFirst();
    if (!contractor) return hidden();
    const binding = await db.selectFrom('organization_contractor').select('active')
      .where('organization_id', '=', orgId).where('contractor_id', '=', contractorId).executeTakeFirst();
    if (!binding) return hidden();
    if (requireActive && (!contractor.active || !binding.active)) invalid('CONTRACTOR_NOT_AVAILABLE');
  }

  private async write(db: DatabaseTransaction, operation: Operation, orgId: string, actorId: string,
    targetId: string | null, payload: Record<string, unknown>, commandId: string): Promise<Effect> {
    const audit = async (entityType: string, entityId: string, action: string, before: unknown | null, after: unknown) => {
      await appendAudit(db, { organizationId: orgId, entityType, entityId, action, before, after, actorId, commandId });
    };
    const now = new Date();
    if (operation === 'organization.patch') {
      const before = await db.selectFrom('organization').selectAll().where('organization_id', '=', orgId).executeTakeFirstOrThrow();
      const after = await db.updateTable('organization').set({ name: payload.name as string, updated_at: now })
        .where('organization_id', '=', orgId).returningAll().executeTakeFirstOrThrow();
      await audit('ORGANIZATION', orgId, 'UPDATE', before, after);
      return { id: orgId, body: organizationView(after) };
    }
    if (operation === 'house.create') {
      const id = randomUUID();
      const after = await db.insertInto('house').values({ house_id: id, organization_id: orgId,
        address: payload.address as string, display_label: payload.display_label as string | null,
        active: payload.active as boolean, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();
      await audit('HOUSE', id, 'CREATE', null, after);
      return { id, body: houseView(after) };
    }
    if (operation === 'house.patch') {
      const before = await db.selectFrom('house').selectAll().where('house_id', '=', targetId!).executeTakeFirstOrThrow();
      const after = await db.updateTable('house').set({ ...payload, updated_at: now })
        .where('house_id', '=', targetId!).returningAll().executeTakeFirstOrThrow();
      await audit('HOUSE', targetId!, 'UPDATE', before, after);
      return { id: targetId!, body: houseView(after) };
    }
    if (operation === 'category.create') {
      const id = randomUUID();
      const after = await db.insertInto('category').values({
        category_id: id, organization_id: orgId,
        name: payload.name as string, description: payload.description as string | null,
        default_contractor_id: payload.default_contractor_id as string | null,
        requires_premises_access: payload.requires_premises_access as boolean,
        result_requirement: payload.result_requirement as 'NONE' | 'PHOTO' | 'FILE',
        active: payload.active as boolean, config_revision: 1,
        created_at: now, updated_at: now, updated_by_user_id: actorId,
      }).returningAll().executeTakeFirstOrThrow();
      await audit('CATEGORY', id, 'CREATE', null, after);
      return { id, body: categoryView(after) };
    }
    if (operation === 'category.patch') {
      const before = await db.selectFrom('category').selectAll().where('category_id', '=', targetId!).executeTakeFirstOrThrow();
      const after = await db.updateTable('category').set({
        ...payload, config_revision: String(Number(before.config_revision) + 1),
        updated_at: now, updated_by_user_id: actorId,
      }).where('category_id', '=', targetId!).returningAll().executeTakeFirstOrThrow();
      await audit('CATEGORY', targetId!, 'UPDATE', before, after);
      return { id: targetId!, body: categoryView(after) };
    }
    if (operation === 'contractor.create') {
      const id = randomUUID();
      const contractor = await db.insertInto('contractor').values({ contractor_id: id,
        display_name: payload.display_name as string, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();
      const binding = await db.insertInto('organization_contractor').values({
        organization_id: orgId, contractor_id: id, active: true, created_at: now,
      }).returningAll().executeTakeFirstOrThrow();
      await audit('CONTRACTOR', id, 'CREATE', null, { contractor, organization_contractor: binding });
      return { id, body: contractorView(contractor, binding) };
    }
    if (operation === 'contractor.binding') {
      const contractor = await db.selectFrom('contractor').selectAll().where('contractor_id', '=', targetId!).executeTakeFirstOrThrow();
      const before = await db.selectFrom('organization_contractor').selectAll()
        .where('organization_id', '=', orgId).where('contractor_id', '=', targetId!).executeTakeFirst();
      const binding = before
        ? await db.updateTable('organization_contractor').set({ active: payload.active as boolean })
          .where('organization_id', '=', orgId).where('contractor_id', '=', targetId!)
          .returningAll().executeTakeFirstOrThrow()
        : await db.insertInto('organization_contractor').values({ organization_id: orgId,
          contractor_id: targetId!, active: true, created_at: now,
        }).returningAll().executeTakeFirstOrThrow();
      await audit('ORGANIZATION_CONTRACTOR', targetId!, before ? 'UPDATE' : 'CREATE',
        before ? { contractor, organization_contractor: before } : null,
        { contractor, organization_contractor: binding });
      return { id: targetId!, body: contractorView(contractor, binding) };
    }
    const userId = operation === 'user.role' ? targetId! : targetId!.split(':')[1]!;
    const user = await db.selectFrom('app_user').selectAll().where('app_user_id', '=', userId).executeTakeFirstOrThrow();
    const role: Role = operation === 'user.role' ? payload.role as Role : 'CONTRACTOR_EMPLOYEE';
    const contractorId = operation === 'user.role' ? payload.contractor_id as string | null : targetId!.split(':')[0]!;
    const active = operation === 'user.role' ? payload.active !== false : payload.active as boolean;
    const scoped = async () => {
      const bindings = (await db.selectFrom('user_role_binding').selectAll()
        .where('app_user_id', '=', userId).orderBy('role_binding_id').execute())
        .filter(row => bindingScope(row, role, orgId, contractorId));
      const access = operation === 'user.role' && (role === 'UK_ADMIN' || role === 'UK_EMPLOYEE')
        ? await db.selectFrom('uk_house_access').innerJoin('house', 'house.house_id', 'uk_house_access.house_id')
          .selectAll('uk_house_access').where('uk_house_access.app_user_id', '=', userId)
          .where('house.organization_id', '=', orgId).orderBy('uk_house_access.house_id').execute()
        : [] as HouseAccess[];
      return { app_user: user, role_bindings: bindings, uk_house_access: access };
    };
    const before = await scoped();
    const chosen = before.role_bindings.find(row => row.active) ?? before.role_bindings[0];
    for (const binding of before.role_bindings) {
      if (binding.role_binding_id !== chosen?.role_binding_id && binding.active) {
        await db.updateTable('user_role_binding').set({ active: false })
          .where('role_binding_id', '=', binding.role_binding_id).executeTakeFirstOrThrow();
      }
    }
    if (chosen) {
      await db.updateTable('user_role_binding').set({ role,
        organization_id: role === 'UK_ADMIN' || role === 'UK_EMPLOYEE' ? orgId : null,
        contractor_id: role === 'CONTRACTOR_EMPLOYEE' ? contractorId : null, active,
      }).where('role_binding_id', '=', chosen.role_binding_id).executeTakeFirstOrThrow();
    } else {
      await db.insertInto('user_role_binding').values({ role_binding_id: randomUUID(), app_user_id: userId,
        role, organization_id: role === 'UK_ADMIN' || role === 'UK_EMPLOYEE' ? orgId : null,
        contractor_id: role === 'CONTRACTOR_EMPLOYEE' ? contractorId : null,
        active, created_at: now,
      }).executeTakeFirstOrThrow();
    }
    if (operation === 'user.role' && (role === 'UK_ADMIN' || role === 'UK_EMPLOYEE')) {
      const desired = new Set(active ? payload.house_ids as string[] : []);
      for (const access of before.uk_house_access) {
        const shouldBeActive = desired.delete(access.house_id);
        if (access.active !== shouldBeActive) {
          await db.updateTable('uk_house_access').set({ active: shouldBeActive })
            .where('app_user_id', '=', userId).where('house_id', '=', access.house_id).executeTakeFirstOrThrow();
        }
      }
      for (const houseId of [...desired].sort()) {
        await db.insertInto('uk_house_access').values({ app_user_id: userId, house_id: houseId,
          active: true, created_at: now,
        }).executeTakeFirstOrThrow();
      }
    }
    const after = await scoped();
    await audit(operation === 'user.role' ? 'USER_ROLE_BINDING' : 'CONTRACTOR_EMPLOYEE', userId,
      before.role_bindings.length ? 'UPDATE' : 'CREATE',
      before.role_bindings.length || before.uk_house_access.length ? before : null, after);
    return { id: userId, body: await userView(db, user as AppUser, orgId) };
  }
}
