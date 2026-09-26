import type { Pool, PoolClient, QueryResult } from 'pg';

export const DEMO_SEED_VERSION = 'tg008.v1' as const;
export const DEMO_SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z' as const;

export const DEMO_IDS = Object.freeze({
  organization: 'd0080000-0000-4000-8000-000000000001',
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
  residentRole: 'd0080000-0000-4000-8000-000000000040',
  ukEmployeeRole: 'd0080000-0000-4000-8000-000000000041',
  ukAdminRole: 'd0080000-0000-4000-8000-000000000042',
  contractorAEmployeeRole: 'd0080000-0000-4000-8000-000000000043',
  contractorBEmployeeRole: 'd0080000-0000-4000-8000-000000000044',
} as const);

export const DEMO_BUSINESS_KEYS = Object.freeze({
  'demo.uk': DEMO_IDS.organization,
  'demo.house': DEMO_IDS.house,
  'demo.premises': DEMO_IDS.premises,
  'demo.resident': DEMO_IDS.resident,
  'demo.uk_employee': DEMO_IDS.ukEmployee,
  'demo.uk_admin': DEMO_IDS.ukAdmin,
  'demo.contractor_a': DEMO_IDS.contractorA,
  'demo.contractor_a_employee': DEMO_IDS.contractorAEmployee,
  'demo.contractor_b': DEMO_IDS.contractorB,
  'demo.contractor_b_employee': DEMO_IDS.contractorBEmployee,
  'demo.category_a': DEMO_IDS.categoryA,
  'demo.category_b': DEMO_IDS.categoryB,
  'demo.role.resident': DEMO_IDS.residentRole,
  'demo.role.uk_employee': DEMO_IDS.ukEmployeeRole,
  'demo.role.uk_admin': DEMO_IDS.ukAdminRole,
  'demo.role.contractor_a_employee': DEMO_IDS.contractorAEmployeeRole,
  'demo.role.contractor_b_employee': DEMO_IDS.contractorBEmployeeRole,
  'demo.access.resident_premises': `${DEMO_IDS.resident}:${DEMO_IDS.premises}`,
  'demo.access.uk_employee_house': `${DEMO_IDS.ukEmployee}:${DEMO_IDS.house}`,
  'demo.access.uk_admin_house': `${DEMO_IDS.ukAdmin}:${DEMO_IDS.house}`,
  'demo.mapping.uk_contractor_a': `${DEMO_IDS.organization}:${DEMO_IDS.contractorA}`,
  'demo.mapping.uk_contractor_b': `${DEMO_IDS.organization}:${DEMO_IDS.contractorB}`,
} as const);

export type DemoRole = 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE';

export const DEMO_ACTOR_ALLOWLIST = Object.freeze([
  { role: 'RESIDENT', actorAlias: 'resident', appUserId: DEMO_IDS.resident },
  { role: 'UK_EMPLOYEE', actorAlias: 'uk_employee', appUserId: DEMO_IDS.ukEmployee },
  { role: 'UK_ADMIN', actorAlias: 'uk_admin', appUserId: DEMO_IDS.ukAdmin },
  { role: 'CONTRACTOR_EMPLOYEE', actorAlias: 'contractor_a', appUserId: DEMO_IDS.contractorAEmployee },
  { role: 'CONTRACTOR_EMPLOYEE', actorAlias: 'contractor_b', appUserId: DEMO_IDS.contractorBEmployee },
] as const satisfies ReadonlyArray<{ role: DemoRole; actorAlias: string; appUserId: string }>);

export const DEFAULT_CONTRACTOR_ACTOR = DEMO_ACTOR_ALLOWLIST[3];
export const SYNTHETIC_ORGANIZATION_MARKER = '[SYNTHETIC] Demo УК «Городская»';

export class DemoSeedConflictError extends Error {
  readonly conflict: string;

  constructor(conflict: string) {
    super(`DEMO_SEED_CONFLICT: ${conflict}`);
    this.name = 'DemoSeedConflictError';
    this.conflict = conflict;
  }
}

type Queryable = {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
};

async function expectNoRows(db: Queryable, text: string, values: readonly unknown[], conflict: string): Promise<void> {
  const result = await db.query(text, values);
  if ((result.rowCount ?? result.rows.length) !== 0) throw new DemoSeedConflictError(conflict);
}

async function validateOwnedRows(db: Queryable): Promise<void> {
  const ids = DEMO_IDS;
  await expectNoRows(db,
    `SELECT 1 FROM organization WHERE (organization_id = $1 AND name <> $2) OR (organization_id <> $1 AND name = $2)`,
    [ids.organization, SYNTHETIC_ORGANIZATION_MARKER], 'organization marker or id is already owned');
  await expectNoRows(db,
    `SELECT 1 FROM house WHERE (house_id = $1 AND organization_id <> $2) OR (house_id <> $1 AND organization_id = $2 AND address = $3)`,
    [ids.house, ids.organization, 'Вымышленная улица, дом 8'], 'house id or business identity is ambiguous');
  await expectNoRows(db,
    `SELECT 1 FROM premises WHERE (premises_id = $1 AND house_id <> $2) OR (premises_id <> $1 AND house_id = $2 AND number_or_label = $3)`,
    [ids.premises, ids.house, 'Квартира 42 (вымышленная)'], 'premises id or business identity is ambiguous');

  const users = [
    [ids.resident, 'Демо Житель'], [ids.ukEmployee, 'Демо Сотрудник УК'], [ids.ukAdmin, 'Демо Администратор УК'],
    [ids.contractorAEmployee, 'Демо Мастер Подрядчика А'], [ids.contractorBEmployee, 'Демо Мастер Подрядчика Б'],
  ] as const;
  for (const [id, name] of users) {
    await expectNoRows(db,
      `SELECT 1 FROM app_user WHERE (app_user_id = $1 AND is_synthetic IS NOT TRUE) OR (app_user_id <> $1 AND display_name = $2)`,
      [id, name], `app user ${id} is non-synthetic or business identity is ambiguous`);
  }

  const contractors = [[ids.contractorA, '[SYNTHETIC] Подрядчик А'], [ids.contractorB, '[SYNTHETIC] Подрядчик Б']] as const;
  for (const [id, name] of contractors) {
    await expectNoRows(db,
      `SELECT 1 FROM contractor WHERE (contractor_id = $1 AND display_name <> $2) OR (contractor_id <> $1 AND display_name = $2)`,
      [id, name], `contractor ${id} marker or id is already owned`);
  }

  const categories = [[ids.categoryA, 'Вымышленная категория: сантехника'], [ids.categoryB, 'Вымышленная категория: электрика']] as const;
  for (const [id, name] of categories) {
    await expectNoRows(db,
      `SELECT 1 FROM category WHERE (category_id = $1 AND organization_id <> $2) OR (category_id <> $1 AND organization_id = $2 AND name = $3)`,
      [id, ids.organization, name], `category ${id} id or business identity is ambiguous`);
  }

  const bindings = [
    [ids.residentRole, ids.resident, 'RESIDENT', null, null],
    [ids.ukEmployeeRole, ids.ukEmployee, 'UK_EMPLOYEE', ids.organization, null],
    [ids.ukAdminRole, ids.ukAdmin, 'UK_ADMIN', ids.organization, null],
    [ids.contractorAEmployeeRole, ids.contractorAEmployee, 'CONTRACTOR_EMPLOYEE', null, ids.contractorA],
    [ids.contractorBEmployeeRole, ids.contractorBEmployee, 'CONTRACTOR_EMPLOYEE', null, ids.contractorB],
  ] as const;
  for (const [bindingId, userId, role, organizationId, contractorId] of bindings) {
    await expectNoRows(db,
      `SELECT 1 FROM user_role_binding
       WHERE (role_binding_id = $1 AND (app_user_id <> $2 OR role <> $3 OR organization_id IS DISTINCT FROM $4 OR contractor_id IS DISTINCT FROM $5))
          OR (role_binding_id <> $1 AND app_user_id = $2 AND role = $3)`,
      [bindingId, userId, role, organizationId, contractorId], `role binding ${bindingId} is ambiguous`);
  }

  const userIds = [ids.resident, ids.ukEmployee, ids.ukAdmin, ids.contractorAEmployee, ids.contractorBEmployee];
  const contractorIds = [ids.contractorA, ids.contractorB];
  const bindingIds = [ids.residentRole, ids.ukEmployeeRole, ids.ukAdminRole,
    ids.contractorAEmployeeRole, ids.contractorBEmployeeRole];
  await expectNoRows(db,
    `SELECT 1 FROM user_role_binding WHERE
       (app_user_id = ANY($1::uuid[]) AND NOT (role_binding_id = ANY($2::uuid[])))
       OR (organization_id = $3 AND NOT (app_user_id = ANY($1::uuid[])))
       OR (contractor_id = ANY($4::uuid[]) AND NOT (app_user_id = ANY($1::uuid[])))`,
    [userIds, bindingIds, ids.organization, contractorIds], 'role binding crosses synthetic scope');
  await expectNoRows(db,
    `SELECT 1 FROM organization_contractor WHERE organization_id <> $1 AND contractor_id = ANY($2::uuid[])
     UNION ALL SELECT 1 FROM category WHERE organization_id <> $1 AND default_contractor_id = ANY($2::uuid[])`,
    [ids.organization, contractorIds], 'contractor is linked to another tenant');
  await expectNoRows(db,
    `SELECT 1 FROM resident_premises_access WHERE
       (app_user_id = ANY($1::uuid[]) AND (app_user_id <> $2 OR premises_id <> $3))
       OR (premises_id = $3 AND app_user_id <> $2)
     UNION ALL SELECT 1 FROM uk_house_access WHERE
       (app_user_id = ANY($1::uuid[]) AND (app_user_id NOT IN ($4::uuid,$5::uuid) OR house_id <> $6))
       OR (house_id = $6 AND app_user_id NOT IN ($4::uuid,$5::uuid))`,
    [userIds, ids.resident, ids.premises, ids.ukEmployee, ids.ukAdmin, ids.house],
    'access crosses synthetic scope');
  await expectNoRows(db,
    `SELECT 1 FROM case_table WHERE organization_id <> $1 AND
       (resident_user_id = ANY($2::uuid[]) OR created_by_user_id = ANY($2::uuid[])
         OR closed_by_user_id = ANY($2::uuid[]) OR default_contractor_snapshot_id = ANY($3::uuid[])
         OR current_executor_contractor_id = ANY($3::uuid[]))`,
    [ids.organization, userIds, contractorIds], 'Case history crosses synthetic scope');
}

async function insertCatalog(db: Queryable): Promise<void> {
  const i = DEMO_IDS;
  const t = DEMO_SEED_TIMESTAMP;
  await db.query(`INSERT INTO organization (organization_id,name,active,created_at,updated_at) VALUES ($1,$2,true,$3,$3) ON CONFLICT DO NOTHING`, [i.organization, SYNTHETIC_ORGANIZATION_MARKER, t]);
  await db.query(`INSERT INTO contractor (contractor_id,display_name,active,created_at,updated_at) VALUES ($1,$2,true,$3,$3),($4,$5,true,$3,$3) ON CONFLICT DO NOTHING`, [i.contractorA, '[SYNTHETIC] Подрядчик А', t, i.contractorB, '[SYNTHETIC] Подрядчик Б']);
  await db.query(`INSERT INTO house (house_id,organization_id,address,display_label,active,created_at,updated_at) VALUES ($1,$2,$3,$4,true,$5,$5) ON CONFLICT DO NOTHING`, [i.house, i.organization, 'Вымышленная улица, дом 8', 'Демо-дом', t]);
  await db.query(`INSERT INTO premises (premises_id,house_id,number_or_label,active,created_at,updated_at) VALUES ($1,$2,$3,true,$4,$4) ON CONFLICT DO NOTHING`, [i.premises, i.house, 'Квартира 42 (вымышленная)', t]);
  await db.query(`INSERT INTO app_user (app_user_id,display_name,is_synthetic,active,created_at,updated_at) VALUES
    ($1,$2,true,true,$11,$11),($3,$4,true,true,$11,$11),($5,$6,true,true,$11,$11),($7,$8,true,true,$11,$11),($9,$10,true,true,$11,$11) ON CONFLICT DO NOTHING`,
    [i.resident, 'Демо Житель', i.ukEmployee, 'Демо Сотрудник УК', i.ukAdmin, 'Демо Администратор УК', i.contractorAEmployee, 'Демо Мастер Подрядчика А', i.contractorBEmployee, 'Демо Мастер Подрядчика Б', t]);
  await db.query(`INSERT INTO organization_contractor (organization_id,contractor_id,active,created_at) VALUES ($1,$2,true,$4),($1,$3,true,$4) ON CONFLICT DO NOTHING`, [i.organization, i.contractorA, i.contractorB, t]);
  await db.query(`INSERT INTO category (category_id,organization_id,name,description,default_contractor_id,requires_premises_access,result_requirement,active,config_revision,created_at,updated_at,updated_by_user_id) VALUES
    ($1,$2,$3,$4,$5,true,'PHOTO',true,1,$9,$9,NULL),($6,$2,$7,$8,$10,true,'PHOTO',true,1,$9,$9,NULL) ON CONFLICT DO NOTHING`,
    [i.categoryA, i.organization, 'Вымышленная категория: сантехника', 'Синтетические данные для демонстрации', i.contractorA, i.categoryB, 'Вымышленная категория: электрика', 'Синтетические данные для демонстрации', t, i.contractorB]);
  await db.query(`INSERT INTO user_role_binding (role_binding_id,app_user_id,role,organization_id,contractor_id,active,created_at) VALUES
    ($1,$2,'RESIDENT',NULL,NULL,true,$11),($3,$4,'UK_EMPLOYEE',$10,NULL,true,$11),($5,$6,'UK_ADMIN',$10,NULL,true,$11),
    ($7,$8,'CONTRACTOR_EMPLOYEE',NULL,$12,true,$11),($9,$13,'CONTRACTOR_EMPLOYEE',NULL,$14,true,$11) ON CONFLICT DO NOTHING`,
    [i.residentRole, i.resident, i.ukEmployeeRole, i.ukEmployee, i.ukAdminRole, i.ukAdmin, i.contractorAEmployeeRole, i.contractorAEmployee, i.contractorBEmployeeRole, i.organization, t, i.contractorA, i.contractorBEmployee, i.contractorB]);
  await db.query(`INSERT INTO resident_premises_access (app_user_id,premises_id,active,created_at) VALUES ($1,$2,true,$3) ON CONFLICT DO NOTHING`, [i.resident, i.premises, t]);
  await db.query(`INSERT INTO uk_house_access (app_user_id,house_id,active,created_at) VALUES ($1,$3,true,$4),($2,$3,true,$4) ON CONFLICT DO NOTHING`, [i.ukEmployee, i.ukAdmin, i.house, t]);
}

export async function seedDemoCatalogInTransaction(client: PoolClient): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${DEMO_SEED_VERSION}:catalog`]);
  await validateOwnedRows(client);
  await insertCatalog(client);
  await validateOwnedRows(client);
}

export async function seedDemoCatalog(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedDemoCatalogInTransaction(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
