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
export type CaseState = 'CREATED' | 'ACCEPTED_BY_UK' | 'SENT_TO_CONTRACTOR' | 'EXECUTION' | 'AWAITING_RESULT_CHECK' | 'REMARKS_REVIEW' | 'REWORK' | 'COMPLETED';
export type AssignmentDecision = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ResidentFeedbackType = 'CONFIRMATION' | 'REMARK';
export type ClosureKind = 'CONFIRMED_RESULT' | 'NO_RESIDENT_FEEDBACK' | 'DISPUTED_WITH_EXPLANATION';
export type CommentKind = 'WORKING' | 'CLARIFICATION_REQUEST' | 'CLARIFICATION_REPLY';
export type CaseEventType = 'EVT_001' | 'EVT_002' | 'EVT_003' | 'EVT_004' | 'EVT_005' | 'EVT_006' | 'EVT_007' | 'EVT_008' | 'EVT_009' | 'EVT_010' | 'EVT_011' | 'EVT_012' | 'EVT_013' | 'EVT_014' | 'EVT_015' | 'EVT_016' | 'EVT_017';
export type IterationStartReason = 'INITIAL' | 'REWORK';
export type IdempotencyPrincipalType = 'APP_USER' | 'MAX_IDENTITY';
export type CommandExecutionStatus = 'IN_PROGRESS' | 'SUCCEEDED';
export type NotificationKind = 'RESULT_READY';
export type NotificationStatus = 'PENDING' | 'RETRY' | 'CLAIMED' | 'DELIVERED' | 'PERMANENT_FAILURE';

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

export interface CaseTable {
  case_id: string;
  display_number: string | null;
  organization_id: string;
  house_id: string;
  premises_id: string;
  resident_user_id: string;
  category_id: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  created_by_user_id: string;
  demo_run_id: string | null;
  category_name_snapshot: string;
  requires_access_snapshot: boolean;
  result_requirement_snapshot: ResultRequirement;
  default_contractor_snapshot_id: string | null;
  house_address_snapshot: string;
  premises_label_snapshot: string;
  current_state: CaseState;
  current_iteration_id: string;
  current_selection_id: string | null;
  current_assignment_id: string | null;
  current_executor_contractor_id: string | null;
  current_result_id: string | null;
  closed_at: Date | null;
  closed_by_user_id: string | null;
  closure_kind: string | null;
  closure_explanation: string | null;
  revision: number;
  last_event_seq: number;
}

export interface CaseIterationTable {
  iteration_id: string;
  case_id: string;
  iteration_no: number;
  start_reason: IterationStartReason;
  started_at: Date;
  started_by_user_id: string;
  source_result_id: string | null;
  source_feedback_id: string | null;
  started_by_event_id: string | null;
}

export interface ContractorSelectionTable {
  selection_id: string;
  case_id: string;
  created_iteration_id: string;
  contractor_id: string;
  selected_by_user_id: string;
  selected_at: Date;
  selection_no: number;
}

export interface AssignmentTable {
  assignment_id: string;
  case_id: string;
  selection_id: string;
  contractor_id: string;
  created_iteration_id: string;
  assignment_no: number;
  sent_by_user_id: string;
  sent_at: Date;
  decision_status: AssignmentDecision;
  accepted_at: Date | null;
  accepted_by_user_id: string | null;
  rejected_at: Date | null;
  rejected_by_user_id: string | null;
  reject_reason: string | null;
}

export interface ResultTable {
  result_id: string;
  case_id: string;
  iteration_id: string;
  assignment_id: string;
  contractor_id: string;
  author_user_id: string;
  description: string;
  submitted_at: Date;
}

export interface ResidentFeedbackTable {
  feedback_id: string;
  case_id: string;
  iteration_id: string;
  result_id: string;
  resident_user_id: string;
  type: ResidentFeedbackType;
  remark_text: string | null;
  created_at: Date;
}

export interface CommentTable {
  comment_id: string;
  case_id: string;
  iteration_id: string;
  author_user_id: string;
  actor_role_snapshot: Role;
  actor_organization_id: string | null;
  actor_contractor_id: string | null;
  comment_kind: CommentKind;
  context_result_id: string | null;
  context_feedback_id: string | null;
  in_reply_to_comment_id: string | null;
  body: string;
  created_at: Date;
}

export interface CaseEventTable {
  event_id: string;
  case_id: string;
  event_seq: number;
  event_type: CaseEventType;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_role_snapshot: Role | null;
  actor_organization_id: string | null;
  actor_contractor_id: string | null;
  from_state: CaseState | null;
  to_state: CaseState | null;
  iteration_id: string | null;
  selection_id: string | null;
  assignment_id: string | null;
  result_id: string | null;
  feedback_id: string | null;
  comment_id: string | null;
  attachment_id: string | null;
  description: string;
  presentation_data: unknown;
  command_id: string;
  caused_by_event_id: string | null;
  derived: boolean;
}

export interface AttachmentTable {
  attachment_id: string;
  case_id: string;
  uploaded_by_user_id: string;
  file_name: string;
  mime_type: string;
  byte_size: ColumnType<string, number | string, never>;
  sha256: string;
  content: Buffer;
  created_at: Date;
}

export interface CaseInitialAttachmentTable {
  case_id: string;
  attachment_id: string;
}

export interface WorkMaterialAttachmentTable {
  case_id: string;
  iteration_id: string;
  assignment_id: string;
  attachment_id: string;
  created_event_id: string;
}

export interface ResultAttachmentTable {
  case_id: string;
  result_id: string;
  attachment_id: string;
}

export interface FeedbackAttachmentTable {
  case_id: string;
  feedback_id: string;
  attachment_id: string;
}

export interface CommentAttachmentTable {
  case_id: string;
  comment_id: string;
  attachment_id: string;
}

export interface CommandExecutionTable {
  command_id: string;
  principal_type: IdempotencyPrincipalType;
  app_user_id: string | null;
  max_identity_id: string | null;
  idempotency_key: string;
  command_type: string;
  case_id: string | null;
  request_hash: string;
  execution_status: CommandExecutionStatus;
  http_status: number | null;
  response_body: unknown | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface NotificationIntentTable {
  notification_intent_id: string;
  case_id: string;
  result_id: string;
  recipient_max_identity_id: string;
  delivery_chat_id: string;
  delivery_chat_type: string;
  notification_kind: NotificationKind;
  dedupe_key: string;
  payload: unknown;
  status: NotificationStatus;
  attempt_count: Generated<number>;
  next_attempt_at: Date | null;
  last_attempt_at: Date | null;
  claim_token: string | null;
  claimed_at: Date | null;
  lease_expires_at: Date | null;
  delivered_at: Date | null;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  operational_redrive_count: Generated<number>;
  created_at: Date;
}

export interface ConfigurationChangeTable {
  config_change_id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_data: unknown | null;
  after_data: unknown;
  actor_user_id: string;
  occurred_at: Date;
  command_id: string;
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
  case_table: CaseTable;
  case_iteration: CaseIterationTable;
  contractor_selection: ContractorSelectionTable;
  assignment: AssignmentTable;
  result: ResultTable;
  resident_feedback: ResidentFeedbackTable;
  comment: CommentTable;
  case_event: CaseEventTable;
  attachment: AttachmentTable;
  case_initial_attachment: CaseInitialAttachmentTable;
  work_material_attachment: WorkMaterialAttachmentTable;
  result_attachment: ResultAttachmentTable;
  feedback_attachment: FeedbackAttachmentTable;
  comment_attachment: CommentAttachmentTable;
  command_execution: CommandExecutionTable;
  notification_intent: NotificationIntentTable;
  configuration_change: ConfigurationChangeTable;
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
export * from './operational-repositories.js';
