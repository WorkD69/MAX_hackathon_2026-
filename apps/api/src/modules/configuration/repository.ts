import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseTransaction, Role } from '@max-smart-city/db';
import type { Selectable } from 'kysely';
import type {
  AppUserTable, CategoryTable, ContractorTable, HouseTable, OrganizationContractorTable,
  OrganizationTable, UKHouseAccessTable, UserRoleBindingTable,
} from '@max-smart-city/db';

export type Db = DatabaseConnection | DatabaseTransaction;
export type Organization = Selectable<OrganizationTable>;
export type House = Selectable<HouseTable>;
export type Category = Selectable<CategoryTable>;
export type Contractor = Selectable<ContractorTable>;
export type OrganizationContractor = Selectable<OrganizationContractorTable>;
export type AppUser = Selectable<AppUserTable>;
export type Binding = Selectable<UserRoleBindingTable>;
export type HouseAccess = Selectable<UKHouseAccessTable>;

export class ConfigurationError extends Error {
  constructor(readonly code: 'RESOURCE_NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION_FAILED' | 'CONTRACTOR_NOT_AVAILABLE',
    readonly status: 403 | 404 | 422) { super(code); }
}
export const hidden = (): never => { throw new ConfigurationError('RESOURCE_NOT_FOUND', 404); };
export const invalid = (code: 'VALIDATION_FAILED' | 'CONTRACTOR_NOT_AVAILABLE' = 'VALIDATION_FAILED'): never => {
  throw new ConfigurationError(code, 422);
};

export const organizationView = (row: Organization) => ({
  organization_id: row.organization_id, name: row.name, active: row.active,
});
export const houseView = (row: House) => ({
  house_id: row.house_id, address: row.address, display_label: row.display_label, active: row.active,
});
export const categoryView = (row: Category) => ({
  category_id: row.category_id, name: row.name, description: row.description,
  default_contractor_id: row.default_contractor_id,
  requires_premises_access: row.requires_premises_access,
  result_requirement: row.result_requirement, active: row.active,
});
export const contractorView = (contractor: Contractor, binding: OrganizationContractor) => ({
  contractor: { contractor_id: contractor.contractor_id, display_name: contractor.display_name, active: contractor.active },
  organization_contractor: {
    organization_id: binding.organization_id, contractor_id: binding.contractor_id, active: binding.active,
  },
});

export async function userView(db: Db, user: AppUser, organizationId: string) {
  const ownContractors = await db.selectFrom('organization_contractor').select('contractor_id')
    .where('organization_id', '=', organizationId).execute();
  const contractorIds = ownContractors.map(row => row.contractor_id);
  const allBindings = await db.selectFrom('user_role_binding').selectAll()
    .where('app_user_id', '=', user.app_user_id).orderBy('role_binding_id').execute();
  const residentOwn = await db.selectFrom('resident_premises_access')
    .innerJoin('premises', 'premises.premises_id', 'resident_premises_access.premises_id')
    .innerJoin('house', 'house.house_id', 'premises.house_id')
    .select('resident_premises_access.app_user_id').where('resident_premises_access.app_user_id', '=', user.app_user_id)
    .where('house.organization_id', '=', organizationId).executeTakeFirst();
  const bindings = allBindings.filter(row =>
    row.organization_id === organizationId ||
    (row.role === 'CONTRACTOR_EMPLOYEE' && row.contractor_id !== null && contractorIds.includes(row.contractor_id)) ||
    (row.role === 'RESIDENT' && residentOwn !== undefined));
  const access = await db.selectFrom('uk_house_access')
    .innerJoin('house', 'house.house_id', 'uk_house_access.house_id')
    .select(['uk_house_access.house_id', 'uk_house_access.active'])
    .where('uk_house_access.app_user_id', '=', user.app_user_id)
    .where('house.organization_id', '=', organizationId)
    .orderBy('uk_house_access.house_id').execute();
  return {
    app_user: { app_user_id: user.app_user_id, display_name: user.display_name, active: user.active },
    role_bindings: bindings.map(row => ({
      role_binding_id: row.role_binding_id, role: row.role,
      organization_id: row.organization_id, contractor_id: row.contractor_id, active: row.active,
    })),
    uk_house_access: access.map(row => ({ house_id: row.house_id, active: row.active })),
  };
}

export async function eligibleUser(db: Db, userId: string, organizationId: string,
  demoRunId: string | null, serverEligibleIds: readonly string[]): Promise<AppUser | undefined> {
  const user = await db.selectFrom('app_user').selectAll().where('app_user_id', '=', userId).executeTakeFirst();
  if (!user) return undefined;
  if (demoRunId) {
    const actor = await db.selectFrom('demo_run_actor').select('app_user_id')
      .where('demo_run_id', '=', demoRunId).where('app_user_id', '=', userId).executeTakeFirst();
    if (!actor) return undefined;
  }
  if (serverEligibleIds.includes(userId)) return user;
  const ownBinding = await db.selectFrom('user_role_binding').select('role_binding_id')
    .where('app_user_id', '=', userId).where('organization_id', '=', organizationId).executeTakeFirst();
  if (ownBinding) return user;
  const ownHouseAccess = await db.selectFrom('uk_house_access')
    .innerJoin('house', 'house.house_id', 'uk_house_access.house_id')
    .select('uk_house_access.app_user_id').where('uk_house_access.app_user_id', '=', userId)
    .where('house.organization_id', '=', organizationId).executeTakeFirst();
  if (ownHouseAccess) return user;
  const ownResidentAccess = await db.selectFrom('resident_premises_access')
    .innerJoin('premises', 'premises.premises_id', 'resident_premises_access.premises_id')
    .innerJoin('house', 'house.house_id', 'premises.house_id')
    .select('resident_premises_access.app_user_id').where('resident_premises_access.app_user_id', '=', userId)
    .where('house.organization_id', '=', organizationId).executeTakeFirst();
  if (ownResidentAccess) return user;
  const ownContractorBinding = await db.selectFrom('user_role_binding')
    .innerJoin('organization_contractor', 'organization_contractor.contractor_id', 'user_role_binding.contractor_id')
    .select('user_role_binding.role_binding_id').where('user_role_binding.app_user_id', '=', userId)
    .where('user_role_binding.role', '=', 'CONTRACTOR_EMPLOYEE')
    .where('organization_contractor.organization_id', '=', organizationId).executeTakeFirst();
  return ownContractorBinding ? user : undefined;
}

export async function listEligibleUsers(db: Db, organizationId: string,
  demoRunId: string | null, serverEligibleIds: readonly string[]) {
  const users = await db.selectFrom('app_user').selectAll().orderBy('app_user_id').execute();
  const result = [];
  for (const user of users) {
    if (await eligibleUser(db, user.app_user_id, organizationId, demoRunId, serverEligibleIds)) {
      result.push(await userView(db, user, organizationId));
    }
  }
  return result;
}

export async function lockById(db: DatabaseTransaction, table: 'house' | 'premises' | 'category' | 'contractor' | 'app_user',
  ids: readonly string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    if (table === 'house') await db.selectFrom('house').select('house_id').where('house_id', '=', id).forUpdate().executeTakeFirst();
    else if (table === 'premises') await db.selectFrom('premises').select('premises_id').where('premises_id', '=', id).forUpdate().executeTakeFirst();
    else if (table === 'category') await db.selectFrom('category').select('category_id').where('category_id', '=', id).forUpdate().executeTakeFirst();
    else if (table === 'contractor') await db.selectFrom('contractor').select('contractor_id').where('contractor_id', '=', id).forUpdate().executeTakeFirst();
    // Serialize absent child binding creation without conflicting with the
    // principal FK's KEY SHARE acquired by another CommandExecution reservation.
    else await db.selectFrom('app_user').select('app_user_id').where('app_user_id', '=', id).forNoKeyUpdate().executeTakeFirst();
  }
}

export async function lockOrganization(db: DatabaseTransaction, ids: readonly string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await db.selectFrom('organization').select('organization_id').where('organization_id', '=', id).forUpdate().executeTakeFirst();
  }
}

export async function lockOrganizationContractor(db: DatabaseTransaction, organizationId: string, contractorIds: readonly string[]) {
  for (const contractorId of [...new Set(contractorIds)].sort()) {
    await db.selectFrom('organization_contractor').select('contractor_id')
      .where('organization_id', '=', organizationId).where('contractor_id', '=', contractorId)
      .forUpdate().executeTakeFirst();
  }
}

export async function lockUserChildren(db: DatabaseTransaction, userId: string, organizationId: string,
  role: Role, contractorId: string | null) {
  if (role === 'UK_ADMIN' || role === 'UK_EMPLOYEE') {
    const access = await db.selectFrom('uk_house_access').innerJoin('house', 'house.house_id', 'uk_house_access.house_id')
      .select('uk_house_access.house_id').where('uk_house_access.app_user_id', '=', userId)
      .where('house.organization_id', '=', organizationId).orderBy('uk_house_access.house_id').execute();
    for (const row of access) await db.selectFrom('uk_house_access').select('house_id')
      .where('app_user_id', '=', userId).where('house_id', '=', row.house_id).forUpdate().executeTakeFirst();
  }
  const bindings = (await db.selectFrom('user_role_binding').selectAll()
    .where('app_user_id', '=', userId).orderBy('role_binding_id').execute()
  ).filter(row => bindingScope(row, role, organizationId, contractorId));
  for (const row of bindings) await db.selectFrom('user_role_binding').select('role_binding_id')
    .where('role_binding_id', '=', row.role_binding_id).forUpdate().executeTakeFirst();
}

export async function appendAudit(db: DatabaseTransaction, values: {
  organizationId: string; entityType: string; entityId: string; action: string;
  before: unknown | null; after: unknown; actorId: string; commandId: string;
}) {
  await db.insertInto('configuration_change').values({
    config_change_id: randomUUID(), organization_id: values.organizationId,
    entity_type: values.entityType, entity_id: values.entityId, action: values.action,
    before_data: values.before, after_data: values.after, actor_user_id: values.actorId,
    occurred_at: new Date(), command_id: values.commandId,
  }).executeTakeFirstOrThrow();
}

export function bindingScope(row: Binding, role: Role, organizationId: string, contractorId: string | null): boolean {
  if (role === 'UK_ADMIN' || role === 'UK_EMPLOYEE') {
    return (row.role === 'UK_ADMIN' || row.role === 'UK_EMPLOYEE') && row.organization_id === organizationId;
  }
  if (role === 'CONTRACTOR_EMPLOYEE') return row.role === role && row.contractor_id === contractorId;
  return row.role === 'RESIDENT';
}
