import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ColumnType, Generated, Kysely } from 'kysely';
import { FileMigrationProvider, Migrator, NO_MIGRATIONS } from 'kysely/migration';
import type { MigrationResult, MigrationResultSet } from 'kysely/migration';

export type Role = 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE';
export type ResultRequirement = 'NONE' | 'PHOTO' | 'FILE';
export type DemoRunStatus = 'ACTIVE' | 'ARCHIVED';
export type MaxIdentityLinkStatus = 'UNLINKED' | 'LINKED_CONFIRMED';

export interface OrganizationTable {
  organization_id: string;
  name: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface HouseTable {
  house_id: string;
  organization_id: string;
  address: string;
  display_label: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PremisesTable {
  premises_id: string;
  house_id: string;
  number_or_label: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AppUserTable {
  app_user_id: string;
  display_name: string;
  is_synthetic: Generated<boolean>;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserRoleBindingTable {
  role_binding_id: string;
  app_user_id: string;
  role: Role;
  organization_id: string | null;
  contractor_id: string | null;
  active: boolean;
  created_at: Date;
}

export interface ResidentPremisesAccessTable {
  app_user_id: string;
  premises_id: string;
  active: boolean;
  created_at: Date;
}

export interface UKHouseAccessTable {
  app_user_id: string;
  house_id: string;
  active: boolean;
  created_at: Date;
}

export interface MaxIdentityTable {
  max_identity_id: string;
  mini_app_user_id: string | null;
  delivery_chat_id: string | null;
  delivery_chat_type: string | null;
  bot_user_id: string | null;
  link_status: MaxIdentityLinkStatus;
  app_user_id: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  linked_at: Date | null;
}

export interface CategoryTable {
  category_id: string;
  organization_id: string;
  name: string;
  description: string | null;
  default_contractor_id: string | null;
  requires_premises_access: boolean;
  result_requirement: ResultRequirement;
  active: boolean;
  config_revision: ColumnType<string, number | string, number | string>;
  created_at: Date;
  updated_at: Date;
  updated_by_user_id: string | null;
}

export interface ContractorTable {
  contractor_id: string;
  display_name: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OrganizationContractorTable {
  organization_id: string;
  contractor_id: string;
  active: boolean;
  created_at: Date;
}

export interface DemoRunTable {
  demo_run_id: string;
  scenario_key: string;
  status: DemoRunStatus;
  created_by_max_identity_id: string;
  notification_recipient_max_identity_id: string;
  primary_case_id: string | null;
  created_at: Date;
  archived_at: Date | null;
}

export interface DemoRunActorTable {
  demo_run_id: string;
  app_user_id: string;
  role: Role;
  actor_alias: string;
}

export interface Database {
  organization: OrganizationTable;
  house: HouseTable;
  premises: PremisesTable;
  app_user: AppUserTable;
  user_role_binding: UserRoleBindingTable;
  resident_premises_access: ResidentPremisesAccessTable;
  uk_house_access: UKHouseAccessTable;
  max_identity: MaxIdentityTable;
  category: CategoryTable;
  contractor: ContractorTable;
  organization_contractor: OrganizationContractorTable;
  demo_run: DemoRunTable;
  demo_run_actor: DemoRunActorTable;
}

export type DB = Database;

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveMigrationsDir(moduleDir: string): string {
  return path.basename(moduleDir) === 'dist'
    ? path.join(moduleDir, 'migrations')
    : path.join(path.dirname(moduleDir), 'migrations');
}

export const MIGRATIONS_DIR = resolveMigrationsDir(currentDir);

const importModule = (modulePath: string): Promise<unknown> =>
  import(pathToFileURL(modulePath).href);

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    migrationTableName: 'kysely_migration',
    migrationLockTableName: 'kysely_migration_lock',
    allowUnorderedMigrations: false,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR, import: importModule }),
  });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  const { error, results } = await createMigrator(db).migrateToLatest();
  if (error) throw error;
  return results === undefined ? {} : { results };
}

export async function rollbackAll(db: Kysely<Database>): Promise<MigrationResultSet> {
  const { error, results } = await createMigrator(db).migrateTo(NO_MIGRATIONS);
  if (error) throw error;
  return results === undefined ? {} : { results };
}

export type { MigrationResult, MigrationResultSet };