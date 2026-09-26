import type { Pool, PoolClient } from 'pg';

export const SYNTHETIC_DEMO_ORGANIZATION_ID = 'd0080000-0000-4000-8000-000000000001' as const;
const SYNTHETIC_ORGANIZATION_MARKER = '[SYNTHETIC] Demo УК «Городская»';
const IDS = Object.freeze({
  house: 'd0080000-0000-4000-8000-000000000002',
  premises: 'd0080000-0000-4000-8000-000000000003',
  resident: 'd0080000-0000-4000-8000-000000000010',
  ukEmployee: 'd0080000-0000-4000-8000-000000000011',
  ukAdmin: 'd0080000-0000-4000-8000-000000000012',
  contractorA: 'd0080000-0000-4000-8000-000000000020',
  contractorAEmployee: 'd0080000-0000-4000-8000-000000000021',
  contractorB: 'd0080000-0000-4000-8000-000000000022',
  contractorBEmployee: 'd0080000-0000-4000-8000-000000000023',
  categoryA: 'd0080000-0000-4000-8000-000000000030',
  categoryB: 'd0080000-0000-4000-8000-000000000031',
  roleBindings: [
    'd0080000-0000-4000-8000-000000000040', 'd0080000-0000-4000-8000-000000000041',
    'd0080000-0000-4000-8000-000000000042', 'd0080000-0000-4000-8000-000000000043',
    'd0080000-0000-4000-8000-000000000044',
  ],
} as const);

const USER_IDS = [IDS.resident, IDS.ukEmployee, IDS.ukAdmin, IDS.contractorAEmployee, IDS.contractorBEmployee] as const;
const CONTRACTOR_IDS = [IDS.contractorA, IDS.contractorB] as const;
const CATEGORY_IDS = [IDS.categoryA, IDS.categoryB] as const;

export class MaintenanceRecoveryError extends Error {
  constructor(readonly code: string) {
    super(`MAINTENANCE_RECOVERY_REFUSED: ${code}`);
    this.name = 'MaintenanceRecoveryError';
  }
}

export interface MaintenanceAuditLogger {
  warn(fields: Readonly<Record<string, unknown>>, message: string): void;
}

export interface MaintenanceRecoveryOptions {
  readonly environment: string | undefined;
  readonly demoMode: boolean;
  readonly targetOrganizationId: string;
  readonly logger: MaintenanceAuditLogger;
  readonly reseed: (client: PoolClient) => Promise<void>;
}

function refuse(options: MaintenanceRecoveryOptions, code: string): never {
  options.logger.warn({
    event: 'synthetic_demo_maintenance_recovery',
    targetOrganizationId: options.targetOrganizationId,
    outcome: 'refused',
    reason: code,
  }, 'Synthetic demo maintenance recovery refused');
  throw new MaintenanceRecoveryError(code);
}

function guardInvocation(options: MaintenanceRecoveryOptions): void {
  if (options.environment === 'production') refuse(options, 'PRODUCTION_ENVIRONMENT');
  if (options.environment !== 'development' && options.environment !== 'test') refuse(options, 'UNKNOWN_ENVIRONMENT');
  if (!options.demoMode) refuse(options, 'DEMO_MODE_DISABLED');
  if (options.targetOrganizationId !== SYNTHETIC_DEMO_ORGANIZATION_ID) refuse(options, 'NON_SYNTHETIC_TARGET');
}

async function assertSyntheticScope(client: PoolClient, options: MaintenanceRecoveryOptions): Promise<void> {
  const organization = await client.query<{ name: string }>(
    `SELECT name FROM organization WHERE organization_id = $1 FOR UPDATE`, [SYNTHETIC_DEMO_ORGANIZATION_ID],
  );
  if (organization.rowCount !== 1 || organization.rows[0]?.name !== SYNTHETIC_ORGANIZATION_MARKER) {
    refuse(options, 'MISSING_OR_AMBIGUOUS_SYNTHETIC_MARKER');
  }

  const unsafeUsers = await client.query(
    `SELECT app_user_id FROM app_user WHERE app_user_id = ANY($1::uuid[]) AND is_synthetic IS NOT TRUE`, [USER_IDS],
  );
  if ((unsafeUsers.rowCount ?? 0) > 0) refuse(options, 'NON_SYNTHETIC_ACTOR');

  const wrongHouse = await client.query(`SELECT 1 FROM house WHERE house_id=$1 AND organization_id<>$2`, [IDS.house, SYNTHETIC_DEMO_ORGANIZATION_ID]);
  if ((wrongHouse.rowCount ?? 0) > 0) refuse(options, 'CROSS_TENANT_HOUSE');
  const wrongPremises = await client.query(`SELECT 1 FROM premises WHERE premises_id=$1 AND house_id<>$2`, [IDS.premises, IDS.house]);
  if ((wrongPremises.rowCount ?? 0) > 0) refuse(options, 'CROSS_TENANT_PREMISES');

  const expectedBindings = new Map<string, readonly [string, string, string | null, string | null]>([
    [IDS.roleBindings[0], [IDS.resident, 'RESIDENT', null, null]],
    [IDS.roleBindings[1], [IDS.ukEmployee, 'UK_EMPLOYEE', SYNTHETIC_DEMO_ORGANIZATION_ID, null]],
    [IDS.roleBindings[2], [IDS.ukAdmin, 'UK_ADMIN', SYNTHETIC_DEMO_ORGANIZATION_ID, null]],
    [IDS.roleBindings[3], [IDS.contractorAEmployee, 'CONTRACTOR_EMPLOYEE', null, IDS.contractorA]],
    [IDS.roleBindings[4], [IDS.contractorBEmployee, 'CONTRACTOR_EMPLOYEE', null, IDS.contractorB]],
  ]);
  const bindings = await client.query<{
    role_binding_id: string; app_user_id: string; role: string; organization_id: string | null; contractor_id: string | null;
  }>(`SELECT role_binding_id::text,app_user_id::text,role,organization_id::text,contractor_id::text
      FROM user_role_binding WHERE role_binding_id = ANY($1::uuid[])`, [IDS.roleBindings]);
  for (const binding of bindings.rows) {
    const expected = expectedBindings.get(binding.role_binding_id);
    if (!expected || binding.app_user_id !== expected[0] || binding.role !== expected[1]
      || binding.organization_id !== expected[2] || binding.contractor_id !== expected[3]) {
      refuse(options, 'CROSS_SCOPE_ROLE_BINDING');
    }
  }

  const contractorMarkers = await client.query<{ contractor_id: string; display_name: string }>(
    `SELECT contractor_id::text, display_name FROM contractor WHERE contractor_id = ANY($1::uuid[])`, [CONTRACTOR_IDS],
  );
  for (const row of contractorMarkers.rows) {
    const expected = row.contractor_id === IDS.contractorA ? '[SYNTHETIC] Подрядчик А' : '[SYNTHETIC] Подрядчик Б';
    if (row.display_name !== expected) refuse(options, 'AMBIGUOUS_CONTRACTOR_MARKER');
  }

  const blockers = await client.query<{ reason: string }>(`
    SELECT reason FROM (
      SELECT 'CASE_OR_HISTORY' AS reason WHERE EXISTS (
        SELECT 1 FROM case_table WHERE organization_id = $1 OR house_id = $2 OR premises_id = $3
          OR category_id = ANY($4::uuid[]) OR resident_user_id = ANY($5::uuid[])
          OR created_by_user_id = ANY($5::uuid[]) OR closed_by_user_id = ANY($5::uuid[])
          OR default_contractor_snapshot_id = ANY($6::uuid[]) OR current_executor_contractor_id = ANY($6::uuid[])
      )
      UNION ALL SELECT 'CASE_ACTOR_HISTORY' WHERE EXISTS (
        SELECT 1 FROM case_iteration WHERE started_by_user_id = ANY($5::uuid[])
        UNION ALL SELECT 1 FROM contractor_selection WHERE selected_by_user_id = ANY($5::uuid[]) OR contractor_id = ANY($6::uuid[])
        UNION ALL SELECT 1 FROM assignment WHERE sent_by_user_id = ANY($5::uuid[]) OR accepted_by_user_id = ANY($5::uuid[]) OR rejected_by_user_id = ANY($5::uuid[]) OR contractor_id = ANY($6::uuid[])
        UNION ALL SELECT 1 FROM result WHERE author_user_id = ANY($5::uuid[]) OR contractor_id = ANY($6::uuid[])
        UNION ALL SELECT 1 FROM resident_feedback WHERE resident_user_id = ANY($5::uuid[])
        UNION ALL SELECT 1 FROM comment WHERE author_user_id = ANY($5::uuid[])
        UNION ALL SELECT 1 FROM case_event WHERE actor_user_id = ANY($5::uuid[])
        UNION ALL SELECT 1 FROM attachment WHERE uploaded_by_user_id = ANY($5::uuid[])
      )
      UNION ALL SELECT 'DEMO_RUN_OR_REAL_IDENTITY' WHERE EXISTS (
        SELECT 1 FROM demo_run_actor WHERE app_user_id = ANY($5::uuid[])
        UNION ALL SELECT 1 FROM max_identity WHERE app_user_id = ANY($5::uuid[])
      )
      UNION ALL SELECT 'AUDIT_OR_COMMAND_HISTORY' WHERE EXISTS (
        SELECT 1 FROM configuration_change WHERE organization_id = $1 OR actor_user_id = ANY($5::uuid[])
        UNION ALL SELECT 1 FROM command_execution WHERE app_user_id = ANY($5::uuid[])
      )
      UNION ALL SELECT 'UNEXPECTED_TENANT_HOUSE' WHERE EXISTS (SELECT 1 FROM house WHERE organization_id = $1 AND house_id <> $2)
      UNION ALL SELECT 'UNEXPECTED_TENANT_PREMISES' WHERE EXISTS (SELECT 1 FROM premises WHERE house_id = $2 AND premises_id <> $3)
      UNION ALL SELECT 'UNEXPECTED_TENANT_CATEGORY' WHERE EXISTS (SELECT 1 FROM category WHERE organization_id = $1 AND NOT (category_id = ANY($4::uuid[])))
      UNION ALL SELECT 'CROSS_TENANT_CATEGORY' WHERE EXISTS (SELECT 1 FROM category WHERE organization_id <> $1 AND (category_id = ANY($4::uuid[]) OR default_contractor_id = ANY($6::uuid[])))
      UNION ALL SELECT 'UNEXPECTED_CONTRACTOR_MAPPING' WHERE EXISTS (
        SELECT 1 FROM organization_contractor WHERE (organization_id = $1 AND NOT (contractor_id = ANY($6::uuid[])))
          OR (organization_id <> $1 AND contractor_id = ANY($6::uuid[]))
      )
      UNION ALL SELECT 'UNEXPECTED_ROLE_BINDING' WHERE EXISTS (
        SELECT 1 FROM user_role_binding WHERE
          (app_user_id = ANY($5::uuid[]) AND NOT (role_binding_id = ANY($7::uuid[])))
          OR (organization_id = $1 AND NOT (app_user_id = ANY($5::uuid[])))
          OR (contractor_id = ANY($6::uuid[]) AND NOT (app_user_id = ANY($5::uuid[])))
      )
      UNION ALL SELECT 'UNEXPECTED_ACCESS' WHERE EXISTS (
        SELECT 1 FROM resident_premises_access WHERE
          (app_user_id = ANY($5::uuid[]) AND (app_user_id <> $8 OR premises_id <> $3))
          OR (premises_id = $3 AND app_user_id <> $8)
        UNION ALL SELECT 1 FROM uk_house_access WHERE
          (app_user_id = ANY($5::uuid[]) AND (app_user_id NOT IN ($9::uuid,$10::uuid) OR house_id <> $2))
          OR (house_id = $2 AND app_user_id NOT IN ($9::uuid,$10::uuid))
      )
    ) AS scope_blockers LIMIT 1`, [
      SYNTHETIC_DEMO_ORGANIZATION_ID, IDS.house, IDS.premises, CATEGORY_IDS, USER_IDS,
      CONTRACTOR_IDS, IDS.roleBindings, IDS.resident, IDS.ukEmployee, IDS.ukAdmin,
    ]);
  const blocker = blockers.rows[0]?.reason;
  if (blocker) refuse(options, blocker);
}

async function deleteOwnedCatalog(client: PoolClient): Promise<void> {
  await client.query(`DELETE FROM resident_premises_access WHERE app_user_id = $1 AND premises_id = $2`, [IDS.resident, IDS.premises]);
  await client.query(`DELETE FROM uk_house_access WHERE app_user_id = ANY($1::uuid[]) AND house_id = $2`, [[IDS.ukEmployee, IDS.ukAdmin], IDS.house]);
  await client.query(`DELETE FROM user_role_binding WHERE role_binding_id = ANY($1::uuid[])`, [IDS.roleBindings]);
  await client.query(`DELETE FROM category WHERE category_id = ANY($1::uuid[])`, [CATEGORY_IDS]);
  await client.query(`DELETE FROM organization_contractor WHERE organization_id = $1 AND contractor_id = ANY($2::uuid[])`, [SYNTHETIC_DEMO_ORGANIZATION_ID, CONTRACTOR_IDS]);
  await client.query(`DELETE FROM premises WHERE premises_id = $1`, [IDS.premises]);
  await client.query(`DELETE FROM house WHERE house_id = $1`, [IDS.house]);
  await client.query(`DELETE FROM app_user WHERE app_user_id = ANY($1::uuid[])`, [USER_IDS]);
  await client.query(`DELETE FROM contractor WHERE contractor_id = ANY($1::uuid[])`, [CONTRACTOR_IDS]);
  await client.query(`DELETE FROM organization WHERE organization_id = $1`, [SYNTHETIC_DEMO_ORGANIZATION_ID]);
}

export async function recoverSyntheticDemo(pool: Pool, options: MaintenanceRecoveryOptions): Promise<void> {
  guardInvocation(options);
  options.logger.warn({
    event: 'synthetic_demo_maintenance_recovery',
    targetOrganizationId: options.targetOrganizationId,
    outcome: 'started',
  }, 'Synthetic demo maintenance recovery started');

  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, ['tg008.v1:catalog']);
    await assertSyntheticScope(client, options);
    await client.query(`LOCK TABLE organization, house, premises, app_user, user_role_binding,
      resident_premises_access, uk_house_access, contractor, category, organization_contractor,
      max_identity, demo_run, demo_run_actor, case_table, case_iteration, contractor_selection,
      assignment, result, resident_feedback, comment, case_event, attachment, command_execution,
      configuration_change IN SHARE ROW EXCLUSIVE MODE`);
    await assertSyntheticScope(client, options);
    await deleteOwnedCatalog(client);
    await options.reseed(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    options.logger.warn({
      event: 'synthetic_demo_maintenance_recovery',
      targetOrganizationId: options.targetOrganizationId,
      outcome: 'rolled_back',
      reason: error instanceof MaintenanceRecoveryError ? error.code : 'RECOVERY_FAILED',
    }, 'Synthetic demo maintenance recovery rolled back');
    throw error;
  } finally {
    client.release();
  }

  options.logger.warn({
    event: 'synthetic_demo_maintenance_recovery',
    targetOrganizationId: options.targetOrganizationId,
    outcome: 'success',
  }, 'Synthetic demo maintenance recovery completed');
}
