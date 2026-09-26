import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { recoverSyntheticDemo, SYNTHETIC_DEMO_ORGANIZATION_ID } from '../../../../apps/api/src/maintenance/recovery.js';

const dbModule = await import(new URL('../index.ts', import.meta.url).href) as {
  createMigrator(db: Kysely<unknown>): { migrateToLatest(): Promise<{ error?: unknown }> };
};
const seedModule = await import(new URL('./index.ts', import.meta.url).href) as {
  DEMO_ACTOR_ALLOWLIST: ReadonlyArray<{ role: string; actorAlias: string; appUserId: string }>;
  DEMO_BUSINESS_KEYS: Readonly<Record<string, string>>;
  DEMO_IDS: Readonly<Record<string, string>>;
  DEFAULT_CONTRACTOR_ACTOR: { appUserId: string };
  seedDemoCatalog(pool: Pool): Promise<void>;
  seedDemoCatalogInTransaction(client: PoolClient): Promise<void>;
};
const { DEMO_ACTOR_ALLOWLIST, DEMO_BUSINESS_KEYS, DEMO_IDS, DEFAULT_CONTRACTOR_ACTOR,
  seedDemoCatalog, seedDemoCatalogInTransaction } = seedModule;

const databaseUrl = process.env.TG008_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('MISSING_TG008_TEST_DATABASE_URL');

const parsed = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.slice(1));
if (!databaseName.endsWith('_tg008_test')) throw new Error('UNSAFE_TEST_DATABASE');

const schema = 'tg008_seed_recovery';
const admin = new Pool({ connectionString: databaseUrl });
const pool = new Pool({
  connectionString: databaseUrl,
  options: `-c search_path=${schema}`,
});
const events: Array<Record<string, unknown>> = [];
const logger = { warn: (fields: Readonly<Record<string, unknown>>) => { events.push({ ...fields }); } };

async function snapshot(): Promise<unknown> {
  const tables = [
    'organization', 'house', 'premises', 'app_user', 'contractor', 'category',
    'user_role_binding', 'resident_premises_access', 'uk_house_access', 'organization_contractor',
    'demo_run', 'demo_run_actor', 'max_identity', 'case_table', 'case_iteration', 'case_event', 'command_execution',
  ];
  const rows: Record<string, unknown> = {};
  for (const table of tables) {
    const result = await pool.query(`SELECT * FROM ${table} ORDER BY 1`);
    rows[table] = result.rows;
  }
  return rows;
}

async function resetFixtures(): Promise<void> {
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const migrationPool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const db = new Kysely({ dialect: new PostgresDialect({ pool: migrationPool }) });
  try {
    const { error } = await dbModule.createMigrator(db).migrateToLatest();
    if (error) throw error;
  } finally { await db.destroy(); }
  events.length = 0;
}

async function recover(overrides: Partial<Parameters<typeof recoverSyntheticDemo>[1]> = {}): Promise<void> {
  await recoverSyntheticDemo(pool, {
    environment: 'test', demoMode: true, targetOrganizationId: SYNTHETIC_DEMO_ORGANIZATION_ID,
    logger, reseed: seedDemoCatalogInTransaction, ...overrides,
  });
}

beforeAll(async () => {
  await admin.query('SELECT 1');
  await resetFixtures();
});
afterAll(async () => {
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
  await admin.end();
});

test('seed twice is deterministic, complete, and leaves an empty Case baseline', async () => {
  await seedDemoCatalog(pool);
  const first = await snapshot();
  await seedDemoCatalog(pool);
  expect(await snapshot()).toEqual(first);

  for (const [key, value] of Object.entries(DEMO_BUSINESS_KEYS)) {
    expect(value, key).toBeTruthy();
    if (!value.includes(':')) {
      const table = key.startsWith('demo.role.') ? 'user_role_binding'
        : key === 'demo.uk' ? 'organization' : key === 'demo.house' ? 'house'
          : key === 'demo.premises' ? 'premises' : key.startsWith('demo.category_') ? 'category'
            : key === 'demo.contractor_a' || key === 'demo.contractor_b' ? 'contractor' : 'app_user';
      const column = table === 'user_role_binding' ? 'role_binding_id' : table === 'app_user' ? 'app_user_id'
        : table === 'organization' ? 'organization_id' : table === 'house' ? 'house_id'
          : table === 'premises' ? 'premises_id' : table === 'category' ? 'category_id' : 'contractor_id';
      expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [value])).rows[0].n, key).toBe(1);
    }
  }
  expect(DEMO_ACTOR_ALLOWLIST).toHaveLength(5);
  expect(new Set(DEMO_ACTOR_ALLOWLIST.map(actor => actor.role))).toEqual(new Set(['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE']));
  expect(DEFAULT_CONTRACTOR_ACTOR.appUserId).toBe(DEMO_IDS.contractorAEmployee);
  const roles = await pool.query(`SELECT role, count(*)::int AS n FROM user_role_binding GROUP BY role ORDER BY role`);
  expect(roles.rows).toEqual([
    { role: 'CONTRACTOR_EMPLOYEE', n: 2 }, { role: 'RESIDENT', n: 1 },
    { role: 'UK_ADMIN', n: 1 }, { role: 'UK_EMPLOYEE', n: 1 },
  ]);
  expect((await pool.query(`SELECT count(*)::int AS n FROM app_user WHERE is_synthetic = true`)).rows[0].n).toBe(5);
  expect((await pool.query(`SELECT contractor_id FROM organization_contractor WHERE organization_id=$1 AND active ORDER BY contractor_id`, [DEMO_IDS.organization])).rows.map(row => row.contractor_id)).toEqual([DEMO_IDS.contractorA, DEMO_IDS.contractorB]);
  expect((await pool.query(`SELECT category_id, default_contractor_id FROM category WHERE active ORDER BY category_id`)).rows).toEqual([
    { category_id: DEMO_IDS.categoryA, default_contractor_id: DEMO_IDS.contractorA },
    { category_id: DEMO_IDS.categoryB, default_contractor_id: DEMO_IDS.contractorB },
  ]);
  expect((await pool.query(`SELECT count(*)::int AS n FROM resident_premises_access WHERE app_user_id=$1 AND premises_id=$2 AND active`, [DEMO_IDS.resident, DEMO_IDS.premises])).rows[0].n).toBe(1);
  expect((await pool.query(`SELECT count(*)::int AS n FROM uk_house_access WHERE app_user_id=ANY($1::uuid[]) AND house_id=$2 AND active`, [[DEMO_IDS.ukEmployee, DEMO_IDS.ukAdmin], DEMO_IDS.house])).rows[0].n).toBe(2);
  expect((await pool.query(`SELECT count(*)::int AS n FROM demo_run`)).rows[0].n).toBe(0);
  expect((await pool.query(`SELECT count(*)::int AS n FROM case_table`)).rows[0].n).toBe(0);
  expect((await pool.query(`SELECT count(*)::int AS n FROM max_identity`)).rows[0].n).toBe(0);
  expect((await pool.query(`SELECT count(*)::int AS n FROM configuration_change`)).rows[0].n).toBe(0);
  expect((await pool.query(`SELECT count(*)::int AS n FROM notification_intent`)).rows[0].n).toBe(0);
}, 30_000);

test('seed refuses a real ID collision and recovery refuses a foreign tenant link', async () => {
  await resetFixtures();
  await pool.query(`INSERT INTO app_user (app_user_id,display_name,is_synthetic,active,created_at,updated_at) VALUES ($1,'Test sentinel',false,true,now(),now())`, [DEMO_IDS.resident]);
  const collision = await snapshot();
  await expect(seedDemoCatalog(pool)).rejects.toThrow('DEMO_SEED_CONFLICT');
  expect(await snapshot()).toEqual(collision);
  await pool.query(`DELETE FROM app_user WHERE app_user_id=$1`, [DEMO_IDS.resident]);
  await seedDemoCatalog(pool);
  const foreignOrg = 'd0080000-0000-4000-8000-000000000199';
  await pool.query(`INSERT INTO organization (organization_id,name,active,created_at,updated_at) VALUES ($1,'Foreign test tenant',true,now(),now())`, [foreignOrg]);
  await pool.query(`INSERT INTO organization_contractor (organization_id,contractor_id,active,created_at) VALUES ($1,$2,true,now())`, [foreignOrg, DEMO_IDS.contractorA]);
  const foreignLink = await snapshot();
  await expect(seedDemoCatalog(pool)).rejects.toThrow('contractor is linked to another tenant');
  expect(await snapshot()).toEqual(foreignLink);
  await expect(recover()).rejects.toThrow('UNEXPECTED_CONTRACTOR_MAPPING');
  expect(await snapshot()).toEqual(foreignLink);
}, 30_000);

test('normal seed keeps both historical runs, completed Case, snapshots, and event intact', async () => {
  await resetFixtures();
  await seedDemoCatalog(pool);
  const run1 = 'd0080000-0000-4000-8000-000000000101';
  const run2 = 'd0080000-0000-4000-8000-000000000102';
  const caseA = 'd0080000-0000-4000-8000-000000000111';
  const caseB = 'd0080000-0000-4000-8000-000000000112';
  const iterationA = 'd0080000-0000-4000-8000-000000000121';
  const iterationB = 'd0080000-0000-4000-8000-000000000122';
  const identity = 'd0080000-0000-4000-8000-000000000130';
  const command = 'd0080000-0000-4000-8000-000000000131';
  const event = 'd0080000-0000-4000-8000-000000000132';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO max_identity (max_identity_id, link_status, first_seen_at, last_seen_at) VALUES ($1,'UNLINKED',now(),now())`, [identity]);
    await client.query(`INSERT INTO demo_run (demo_run_id,scenario_key,status,created_by_max_identity_id,notification_recipient_max_identity_id,primary_case_id,created_at,archived_at) VALUES ($1,'demo','ARCHIVED',$3,$3,$4,now(),now()),($2,'demo','ACTIVE',$3,$3,$5,now(),NULL)`, [run1, run2, identity, caseA, caseB]);
    for (const [run, caseId, iterationId, completed] of [[run1, caseA, iterationA, true], [run2, caseB, iterationB, false]] as const) {
      await client.query(`INSERT INTO case_table (case_id,organization_id,house_id,premises_id,resident_user_id,category_id,description,created_at,updated_at,created_by_user_id,demo_run_id,category_name_snapshot,requires_access_snapshot,result_requirement_snapshot,default_contractor_snapshot_id,house_address_snapshot,premises_label_snapshot,current_state,current_iteration_id,closed_at,closed_by_user_id,closure_kind,revision,last_event_seq)
        VALUES ($1,$2,$3,$4,$5,$6,'Синтетический случай',now(),now(),$5,$7,'Снимок категории',true,'PHOTO',$8,'Снимок адреса','42',$9,$10,$11,$12,$13,1,$14)`,
      [caseId, DEMO_IDS.organization, DEMO_IDS.house, DEMO_IDS.premises, DEMO_IDS.resident, DEMO_IDS.categoryA, run, DEMO_IDS.contractorA, completed ? 'COMPLETED' : 'CREATED', iterationId, completed ? new Date() : null, completed ? DEMO_IDS.ukAdmin : null, completed ? 'NO_RESIDENT_FEEDBACK' : null, completed ? 1 : 0]);
      await client.query(`INSERT INTO case_iteration (iteration_id,case_id,iteration_no,start_reason,started_at,started_by_user_id) VALUES ($1,$2,1,'INITIAL',now(),$3)`, [iterationId, caseId, DEMO_IDS.resident]);
      await client.query(`INSERT INTO demo_run_actor (demo_run_id,app_user_id,role,actor_alias) VALUES ($1,$2,'RESIDENT','resident')`, [run, DEMO_IDS.resident]);
    }
    await client.query(`INSERT INTO command_execution (command_id,principal_type,app_user_id,idempotency_key,command_type,case_id,request_hash,execution_status,http_status,response_body,created_at,completed_at) VALUES ($1,'APP_USER',$2,'historical-create','CREATE_CASE',$3,repeat('a',64),'SUCCEEDED',200,'{}',now(),now())`, [command, DEMO_IDS.resident, caseA]);
    await client.query(`INSERT INTO case_event (event_id,case_id,event_seq,event_type,occurred_at,description,command_id) VALUES ($1,$2,1,'EVT_001',now(),'История A',$3)`, [event, caseA, command]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  const before = await snapshot();
  await seedDemoCatalog(pool);
  expect(await snapshot()).toEqual(before);
  expect((await pool.query(`SELECT case_id FROM case_table ORDER BY case_id`)).rows.map(row => row.case_id)).toEqual([caseA, caseB]);
  await expect(recover()).rejects.toThrow('CASE_OR_HISTORY');
  expect(await snapshot()).toEqual(before);
}, 30_000);

test('environment, demo flag, target and synthetic ownership refuse before mutation', async () => {
  await resetFixtures();
  await seedDemoCatalog(pool);
  const baseline = await snapshot();
  for (const override of [
    { environment: 'production' }, { environment: 'staging' }, { environment: undefined },
    { demoMode: false }, { targetOrganizationId: 'd0080000-0000-4000-8000-000000009999' },
  ]) {
    await expect(recover(override)).rejects.toThrow('MAINTENANCE_RECOVERY_REFUSED');
    expect(await snapshot()).toEqual(baseline);
  }
  await pool.query(`UPDATE app_user SET is_synthetic=false WHERE app_user_id=$1`, [DEMO_IDS.resident]);
  const nonSynthetic = await snapshot();
  await expect(recover()).rejects.toThrow('NON_SYNTHETIC_ACTOR');
  expect(await snapshot()).toEqual(nonSynthetic);
  await pool.query(`UPDATE app_user SET is_synthetic=true WHERE app_user_id=$1`, [DEMO_IDS.resident]);
  await pool.query(`UPDATE organization SET name='Real tenant' WHERE organization_id=$1`, [DEMO_IDS.organization]);
  const noMarker = await snapshot();
  await expect(recover()).rejects.toThrow('MISSING_OR_AMBIGUOUS_SYNTHETIC_MARKER');
  expect(await snapshot()).toEqual(noMarker);
}, 30_000);

test('bounded recovery restores catalog atomically and rejects mixed real links', async () => {
  await resetFixtures();
  await seedDemoCatalog(pool);
  const initialCatalog = await snapshot();
  const identity = 'd0080000-0000-4000-8000-000000000140';
  await pool.query(`INSERT INTO max_identity (max_identity_id,app_user_id,link_status,first_seen_at,last_seen_at) VALUES ($1,$2,'UNLINKED',now(),now())`, [identity, DEMO_IDS.resident]);
  const mixed = await snapshot();
  await expect(recover()).rejects.toThrow('DEMO_RUN_OR_REAL_IDENTITY');
  expect(await snapshot()).toEqual(mixed);
  await pool.query(`DELETE FROM max_identity WHERE max_identity_id=$1`, [identity]);
  await pool.query(`UPDATE category SET name='Изменённая синтетическая настройка',config_revision=4 WHERE category_id=$1`, [DEMO_IDS.categoryA]);
  const modified = await snapshot();
  await seedDemoCatalog(pool);
  expect(await snapshot()).toEqual(modified);
  await expect(recover({ reseed: async () => { throw new Error('injected failure'); } })).rejects.toThrow('injected failure');
  expect(await snapshot()).toEqual(modified);
  await recover();
  expect(await snapshot()).toEqual(initialCatalog);
  expect((await pool.query(`SELECT name,config_revision::int FROM category WHERE category_id=$1`, [DEMO_IDS.categoryA])).rows[0]).toEqual({ name: 'Вымышленная категория: сантехника', config_revision: 1 });
  expect((await pool.query(`SELECT count(*)::int AS n FROM user_role_binding`)).rows[0].n).toBe(5);
  expect((await pool.query(`SELECT count(*)::int AS n FROM category WHERE active`)).rows[0].n).toBe(2);
  expect(events.some(event => event.outcome === 'success' && event.targetOrganizationId === DEMO_IDS.organization)).toBe(true);
  expect(events.some(event => event.outcome === 'rolled_back')).toBe(true);
}, 30_000);
