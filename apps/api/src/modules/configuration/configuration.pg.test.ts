import { randomUUID } from 'node:crypto';
import fastify from 'fastify';
import pino from 'pino';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import type { Database } from '@max-smart-city/db';
import { withDisposablePostgres } from '../../../../../tests/support/postgres.mjs';
import { loadConfig } from '../../config/load-config.js';
import { issueSession } from '../auth/session-token.js';
import { registerConfigurationRoutes } from './plugin.js';

const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;
const enabled = Boolean(adminUrl && process.env.APP_ENV === 'test' &&
  process.env.TEST_DATABASE_TARGET === 'DISPOSABLE_TEST_ONLY');
const uuid = (n: number) => `e0180000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = {
  org: uuid(1), foreignOrg: uuid(2), house: uuid(3), foreignHouse: uuid(4),
  premises: uuid(5), category: uuid(6), foreignCategory: uuid(7),
  contractor: uuid(8), foreignContractor: uuid(9),
  admin: uuid(10), employee: uuid(11), foreignAdmin: uuid(12), eligible: uuid(13), foreignUser: uuid(14),
  identity: uuid(20), employeeIdentity: uuid(21), foreignIdentity: uuid(22),
  adminBinding: uuid(30), employeeBinding: uuid(31), foreignBinding: uuid(32),
};

async function fixture(run: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  await withDisposablePostgres({ adminUrl: adminUrl!, suite: 'tg026' }, async target => {
    await target.migrate();
    const migration = new Pool({ connectionString: target.migrationUrl });
    const pool = new Pool({ connectionString: target.runtimeUrl, max: 12 });
    const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    try {
      await seed(migration);
      const f = await setup(database, pool, migration, target.runtimeUrl);
      try { await run(f); } finally { await f.app.close(); }
    } finally {
      await database.destroy();
      await migration.end();
    }
  });
}

async function seed(pool: Pool) {
  await pool.query(`INSERT INTO organization VALUES ($1,'Own UK',true,now(),now()),($2,'Foreign UK',true,now(),now())`, [ids.org, ids.foreignOrg]);
  await pool.query(`INSERT INTO house VALUES ($1,$2,'Own address',NULL,true,now(),now()),($3,$4,'Foreign address',NULL,false,now(),now())`,
    [ids.house, ids.org, ids.foreignHouse, ids.foreignOrg]);
  await pool.query(`INSERT INTO premises VALUES ($1,$2,'1',true,now(),now())`, [ids.premises, ids.house]);
  await pool.query(`INSERT INTO contractor VALUES ($1,'Own contractor',true,now(),now()),($2,'Foreign contractor',false,now(),now())`,
    [ids.contractor, ids.foreignContractor]);
  await pool.query(`INSERT INTO organization_contractor VALUES ($1,$2,true,now()),($3,$4,true,now())`,
    [ids.org, ids.contractor, ids.foreignOrg, ids.foreignContractor]);
  await pool.query(`INSERT INTO category (category_id,organization_id,name,description,default_contractor_id,requires_premises_access,result_requirement,active,config_revision,created_at,updated_at,updated_by_user_id) VALUES
    ($1,$2,'Own category',NULL,$3,true,'PHOTO',true,1,now(),now(),NULL),
    ($4,$5,'Foreign category',NULL,NULL,false,'NONE',false,1,now(),now(),NULL)`,
  [ids.category, ids.org, ids.contractor, ids.foreignCategory, ids.foreignOrg]);
  await pool.query(`INSERT INTO app_user (app_user_id,display_name,is_synthetic,active,created_at,updated_at) VALUES
    ($1,'Admin',false,true,now(),now()),($2,'Employee',false,true,now(),now()),
    ($3,'Foreign admin',false,true,now(),now()),($4,'Eligible',false,true,now(),now()),
    ($5,'Foreign user',true,true,now(),now())`,
  [ids.admin, ids.employee, ids.foreignAdmin, ids.eligible, ids.foreignUser]);
  await pool.query(`INSERT INTO user_role_binding VALUES
    ($1,$2,'UK_ADMIN',$3,NULL,true,now()),($4,$5,'UK_EMPLOYEE',$3,NULL,true,now()),
    ($6,$7,'UK_ADMIN',$8,NULL,true,now())`,
  [ids.adminBinding, ids.admin, ids.org, ids.employeeBinding, ids.employee, ids.foreignBinding, ids.foreignAdmin, ids.foreignOrg]);
  await pool.query(`INSERT INTO uk_house_access VALUES ($1,$2,true,now()),($3,$2,false,now()),($4,$5,true,now())`,
    [ids.admin, ids.house, ids.eligible, ids.foreignUser, ids.foreignHouse]);
  await pool.query(`INSERT INTO max_identity (max_identity_id,mini_app_user_id,delivery_chat_id,delivery_chat_type,link_status,app_user_id,first_seen_at,last_seen_at,linked_at) VALUES
    ($1,'admin','chat-admin','private','LINKED_CONFIRMED',$2,now(),now(),now()),
    ($3,'employee','chat-employee','private','LINKED_CONFIRMED',$4,now(),now(),now()),
    ($5,'foreign','chat-foreign','private','LINKED_CONFIRMED',$6,now(),now(),now())`,
  [ids.identity, ids.admin, ids.employeeIdentity, ids.employee, ids.foreignIdentity, ids.foreignAdmin]);
}

async function setup(database: Kysely<Database>, pool: Pool, migration: Pool, url: string) {
  const config = loadConfig({ APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: url,
    APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
    PUBLIC_APP_URL: 'http://localhost:5173/', PUBLIC_API_BASE_URL: 'http://localhost:3000/api/v1',
    BUILD_SHA: 'a'.repeat(40),
  });
  const app = fastify({ loggerInstance: pino({ enabled: false }) });
  registerConfigurationRoutes(app, { database, config });
  await app.ready();
  const issue = (user: string, identity: string, role: 'UK_ADMIN' | 'UK_EMPLOYEE', binding: string) =>
    issueSession({ max_identity_id: identity, app_user_id: user, role_binding_id: binding,
      role, demo_mode: false, demo_run_id: null, real_display_name: role,
    }, config, Math.floor(Date.now() / 1000)).token;
  const tokens = {
    admin: issue(ids.admin, ids.identity, 'UK_ADMIN', ids.adminBinding),
    employee: issue(ids.employee, ids.employeeIdentity, 'UK_EMPLOYEE', ids.employeeBinding),
    foreign: issue(ids.foreignAdmin, ids.foreignIdentity, 'UK_ADMIN', ids.foreignBinding),
  };
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, token = tokens.admin,
    body?: unknown, key?: string) => {
    const response = await app.inject({ method, url: `/api/v1/config${path}`,
      headers: { authorization: `Bearer ${token}`, ...(key ? { 'idempotency-key': key } : {}) },
      ...(body === undefined ? {} : { payload: JSON.stringify(body), headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      } }),
    });
    return { status: response.statusCode, body: response.json(), headers: response.headers };
  };
  return { app, pool, migration, database, call, tokens };
}

describe.skipIf(!enabled)('TG-018 configuration API on owned real PostgreSQL', () => {
  it('enforces five own-scope reads and executes all nine mutations with strict stored success', async () => {
    await fixture(async ({ call, pool, tokens, migration }) => {
      const organization = await call('GET', '/organization');
      expect(organization).toMatchObject({ status: 200, body: { organization_id: ids.org, name: 'Own UK' } });
      expect((await call('GET', '/houses')).body).toEqual([{ house_id: ids.house, address: 'Own address', display_label: null, active: true }]);
      expect((await call('GET', '/categories')).body).toEqual([{
        category_id: ids.category, name: 'Own category', description: null,
        default_contractor_id: ids.contractor, requires_premises_access: true,
        result_requirement: 'PHOTO', active: true,
      }]);
      expect((await call('GET', '/contractors')).body).toEqual([{
        contractor: { contractor_id: ids.contractor, display_name: 'Own contractor', active: true },
        organization_contractor: { organization_id: ids.org, contractor_id: ids.contractor, active: true },
      }]);
      const users = await call('GET', '/users');
      expect(users.status).toBe(200);
      expect(users.body.map((row: { app_user: { app_user_id: string } }) => row.app_user.app_user_id)).toEqual(
        [ids.admin, ids.employee, ids.eligible].sort(),
      );
      expect(users.body.find((row: { app_user: { app_user_id: string } }) => row.app_user.app_user_id === ids.eligible))
        .toMatchObject({ role_bindings: [], uk_house_access: [{ house_id: ids.house, active: false }] });
      for (const path of ['/organization', '/houses', '/categories', '/contractors', '/users']) {
        expect((await call('GET', path, tokens.employee)).status).toBe(403);
      }
      expect((await call('PATCH', `/houses/${ids.foreignHouse}`, tokens.admin, { active: true }, randomUUID())).status).toBe(404);
      expect((await call('PATCH', `/categories/${ids.foreignCategory}`, tokens.admin, { active: true }, randomUUID())).status).toBe(404);
      expect((await call('PUT', `/users/${ids.foreignUser}/role-binding`, tokens.admin,
        { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [] }, randomUUID())).status).toBe(404);

      const patchOrg = await call('PATCH', '/organization', tokens.admin, { name: 'New UK' }, randomUUID());
      expect(patchOrg).toMatchObject({ status: 200, body: { organization_id: ids.org, name: 'New UK' } });
      const houseKey = randomUUID();
      const housePayload = { address: 'Second address', display_label: 'Second', active: true };
      const createdHouse = await call('POST', '/houses', tokens.admin, housePayload, houseKey);
      expect(createdHouse.status).toBe(201);
      expect(await call('POST', '/houses', tokens.admin, housePayload, houseKey)).toMatchObject({
        status: 201, body: createdHouse.body, headers: { 'idempotency-replayed': 'true' },
      });
      const houseId = createdHouse.body.house_id as string;
      expect((await call('PATCH', `/houses/${houseId}`, tokens.admin, { active: false }, randomUUID())).body.active).toBe(false);
      const contractorKey = randomUUID();
      const createdContractor = await call('POST', '/contractors', tokens.admin,
        { display_name: 'New contractor' }, contractorKey);
      expect(createdContractor.status).toBe(201);
      expect(await call('POST', '/contractors', tokens.admin,
        { display_name: 'New contractor' }, contractorKey)).toMatchObject({ status: 201, body: createdContractor.body });
      const contractorId = createdContractor.body.contractor.contractor_id as string;
      expect((await call('PUT', `/contractors/${contractorId}/binding`, tokens.admin,
        { active: false }, randomUUID())).body.organization_contractor.active).toBe(false);
      expect((await call('POST', '/categories', tokens.admin, {
        name: 'Invalid dependency', description: null, default_contractor_id: contractorId,
        requires_premises_access: true, result_requirement: 'PHOTO', active: true,
      }, randomUUID())).status).toBe(422);
      expect((await call('POST', '/categories', tokens.admin, {
        name: 'Foreign dependency', description: null, default_contractor_id: ids.foreignContractor,
        requires_premises_access: true, result_requirement: 'PHOTO', active: true,
      }, randomUUID())).status).toBe(404);
      expect((await pool.query(`SELECT active FROM contractor WHERE contractor_id=$1`, [contractorId])).rows[0].active).toBe(true);
      expect((await call('PUT', `/contractors/${contractorId}/binding`, tokens.admin,
        { active: true }, randomUUID())).body.contractor.active).toBe(true);
      const createdCategory = await call('POST', '/categories', tokens.admin, {
        name: 'New category', description: null, default_contractor_id: contractorId,
        requires_premises_access: false, result_requirement: 'NONE', active: true,
      }, randomUUID());
      expect(createdCategory.status).toBe(201);
      const categoryId = createdCategory.body.category_id as string;
      expect((await pool.query(`SELECT config_revision FROM category WHERE category_id=$1`, [categoryId])).rows[0].config_revision).toBe('1');
      const patchKey = randomUUID();
      const patched = await call('PATCH', `/categories/${categoryId}`, tokens.admin,
        { name: 'New category', default_contractor_id: null, result_requirement: 'FILE' }, patchKey);
      expect(patched).toMatchObject({ status: 200, body: { default_contractor_id: null, result_requirement: 'FILE' } });
      const replay = await call('PATCH', `/categories/${categoryId}`, tokens.admin,
        { name: 'New category', default_contractor_id: null, result_requirement: 'FILE' }, patchKey);
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual(patched.body);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect((await call('PATCH', `/categories/${categoryId}`, tokens.admin, { name: 'Changed' }, patchKey)).status).toBe(409);
      expect((await call('PATCH', `/categories/${categoryId}`, tokens.admin,
        { default_contractor_id: ids.foreignContractor }, patchKey)).status).toBe(404);
      expect((await pool.query(`SELECT config_revision,updated_by_user_id FROM category WHERE category_id=$1`, [categoryId])).rows[0])
        .toMatchObject({ config_revision: '2', updated_by_user_id: ids.admin });
      const role = await call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
        { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [ids.house] }, randomUUID());
      expect(role.status).toBe(200);
      expect(role.body.role_bindings).toHaveLength(1);
      const employeeKey = randomUUID();
      const employee = await call('PUT', `/contractors/${contractorId}/employees/${ids.eligible}`, tokens.admin,
        { active: true }, employeeKey);
      expect(employee.status).toBe(200);
      expect(await call('PUT', `/contractors/${contractorId}/employees/${ids.eligible}`, tokens.admin,
        { active: true }, employeeKey)).toMatchObject({ status: 200, body: employee.body,
        headers: { 'idempotency-replayed': 'true' } });
      expect(employee.body.role_bindings.some((row: { role: string; contractor_id: string }) =>
        row.role === 'CONTRACTOR_EMPLOYEE' && row.contractor_id === contractorId)).toBe(true);
      expect((await pool.query(`SELECT count(*)::int AS n FROM configuration_change`)).rows[0].n).toBe(10);
      expect((await pool.query(`SELECT count(*)::int AS n FROM configuration_change c
        JOIN command_execution e ON e.command_id=c.command_id
        WHERE c.organization_id=$1 AND c.actor_user_id=$2 AND e.execution_status='SUCCEEDED'`,
      [ids.org, ids.admin])).rows[0].n).toBe(10);
      expect((await pool.query(`SELECT count(*)::int AS n FROM case_table`)).rows[0].n).toBe(0);
      await migration.query(`UPDATE user_role_binding SET active=false WHERE role_binding_id=$1`, [ids.adminBinding]);
      expect((await call('PATCH', `/categories/${categoryId}`, tokens.admin,
        { name: 'New category', default_contractor_id: null, result_requirement: 'FILE' }, patchKey)).status).toBe(403);
    });
  }, 120_000);

  it('replaces UK role and house access, preserves foreign bindings, and keeps audit before/after', async () => {
    await fixture(async ({ call, pool, tokens, migration }) => {
      const house2 = uuid(40);
      await migration.query(`INSERT INTO house VALUES ($1,$2,'Third',NULL,false,now(),now())`, [house2, ids.org]);
      const foreignBindingId = uuid(41);
      await migration.query(`INSERT INTO user_role_binding VALUES ($1,$2,'UK_ADMIN',$3,NULL,true,now())`,
        [foreignBindingId, ids.eligible, ids.foreignOrg]);
      const key = randomUUID();
      const first = await call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
        { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [ids.house, house2, house2] }, key);
      expect(first.status).toBe(200);
      expect(first.body.uk_house_access).toHaveLength(2);
      const second = await call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
        { role: 'UK_ADMIN', contractor_id: null, house_ids: [] }, randomUUID());
      expect(second.status).toBe(200);
      expect(second.body.role_bindings.filter((row: { active: boolean }) => row.active)).toHaveLength(1);
      expect(second.body.role_bindings[0].role).toBe('UK_ADMIN');
      expect(second.body.uk_house_access.every((row: { active: boolean }) => !row.active)).toBe(true);
      const off = await call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
        { role: 'UK_ADMIN', contractor_id: null, house_ids: [ids.house], active: false }, randomUUID());
      expect(off.status).toBe(200);
      expect(off.body.role_bindings[0].active).toBe(false);
      const again = await call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
        { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [house2] }, randomUUID());
      expect(again.body.role_bindings.filter((row: { active: boolean }) => row.active)).toHaveLength(1);
      expect(again.body.uk_house_access).toEqual([
        { house_id: ids.house, active: false }, { house_id: house2, active: true },
      ]);
      expect(again.body.role_bindings.every((row: { organization_id: string }) => row.organization_id === ids.org)).toBe(true);
      const race = await Promise.all([
        call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
          { role: 'UK_ADMIN', contractor_id: null, house_ids: [] }, randomUUID()),
        call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
          { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [ids.house] }, randomUUID()),
      ]);
      expect(race.map(row => row.status)).toEqual([200, 200]);
      const activeOwn = await pool.query(`SELECT count(*)::int AS n FROM user_role_binding
        WHERE app_user_id=$1 AND organization_id=$2 AND active=true`, [ids.eligible, ids.org]);
      expect(activeOwn.rows[0].n).toBe(1);
      expect((await pool.query(`SELECT active FROM user_role_binding WHERE role_binding_id=$1`, [foreignBindingId])).rows[0].active).toBe(true);
      const audit = (await pool.query(`SELECT before_data,after_data FROM configuration_change
        WHERE entity_type='USER_ROLE_BINDING' ORDER BY occurred_at`)).rows;
      expect(audit).toHaveLength(6);
      expect(audit[0].before_data.uk_house_access[0].active).toBe(false);
      expect(audit[0].after_data.uk_house_access).toHaveLength(2);
      expect(audit[3].after_data.role_bindings.filter((row: { active: boolean }) => row.active)).toHaveLength(1);
      expect((await call('PUT', `/users/${ids.eligible}/role-binding`, tokens.admin,
        { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [ids.foreignHouse] }, randomUUID())).status).toBe(404);
    });
  }, 120_000);

  it('serializes concurrent category writers and rolls back mutation when audit insert fails', async () => {
    await fixture(async ({ call, pool, migration, tokens }) => {
      const blocker = await migration.connect();
      await blocker.query('BEGIN');
      await blocker.query(`SELECT organization_id FROM organization WHERE organization_id=$1 FOR UPDATE`, [ids.org]);
      const first = call('PATCH', `/categories/${ids.category}`, tokens.admin, { name: 'A' }, randomUUID());
      const second = call('PATCH', `/categories/${ids.category}`, tokens.admin, { name: 'B' }, randomUUID());
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const count = await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'`);
          if (count.rows[0].n >= 1) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        expect(waiting).toBe(true);
      } finally {
        await blocker.query('COMMIT');
        blocker.release();
      }
      const results = await Promise.all([first, second]);
      expect(results.map(row => row.status)).toEqual([200, 200]);
      expect((await pool.query(`SELECT config_revision FROM category WHERE category_id=$1`, [ids.category])).rows[0].config_revision).toBe('3');
      const audit = (await pool.query(`SELECT before_data,after_data FROM configuration_change
        WHERE entity_type='CATEGORY' ORDER BY occurred_at`)).rows;
      expect(audit).toHaveLength(2);
      expect(audit[0].after_data.name).toBe(audit[1].before_data.name);
      await migration.query(`CREATE FUNCTION tg018_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'forced audit failure'; END $$`);
      await migration.query(`CREATE TRIGGER tg018_audit_failure BEFORE INSERT ON configuration_change
        FOR EACH ROW EXECUTE FUNCTION tg018_audit_failure()`);
      const before = (await pool.query(`SELECT name,config_revision FROM category WHERE category_id=$1`, [ids.category])).rows[0];
      const failed = await call('PATCH', `/categories/${ids.category}`, tokens.admin, { name: 'ROLLBACK' }, 'retry-after-failure');
      expect(failed.status).toBe(500);
      expect((await pool.query(`SELECT name,config_revision FROM category WHERE category_id=$1`, [ids.category])).rows[0]).toEqual(before);
      expect((await pool.query(`SELECT count(*)::int AS n FROM command_execution WHERE idempotency_key='retry-after-failure'`)).rows[0].n).toBe(0);
      await migration.query(`DROP TRIGGER tg018_audit_failure ON configuration_change`);
      await migration.query(`DROP FUNCTION tg018_audit_failure()`);
      expect((await call('PATCH', `/categories/${ids.category}`, tokens.admin, { name: 'COMMIT' }, 'retry-after-failure')).status).toBe(200);

      await migration.query(`CREATE FUNCTION tg018_finalize_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.execution_status='SUCCEEDED' THEN RAISE EXCEPTION 'forced finalization failure'; END IF;
        RETURN NEW; END $$`);
      await migration.query(`CREATE TRIGGER tg018_finalize_failure BEFORE UPDATE ON command_execution
        FOR EACH ROW EXECUTE FUNCTION tg018_finalize_failure()`);
      const preFinalization = (await pool.query(`SELECT name,config_revision FROM category WHERE category_id=$1`, [ids.category])).rows[0];
      expect((await call('PATCH', `/categories/${ids.category}`, tokens.admin,
        { name: 'FINALIZE_ROLLBACK' }, 'retry-finalization')).status).toBe(500);
      expect((await pool.query(`SELECT name,config_revision FROM category WHERE category_id=$1`, [ids.category])).rows[0])
        .toEqual(preFinalization);
      expect((await pool.query(`SELECT count(*)::int AS n FROM configuration_change
        WHERE after_data->>'name'='FINALIZE_ROLLBACK'`)).rows[0].n).toBe(0);
      await migration.query(`DROP TRIGGER tg018_finalize_failure ON command_execution`);
      await migration.query(`DROP FUNCTION tg018_finalize_failure()`);
      expect((await call('PATCH', `/categories/${ids.category}`, tokens.admin,
        { name: 'FINALIZE_COMMIT' }, 'retry-finalization')).status).toBe(200);
    });
  }, 120_000);

  it('rejects every mutation for non-admin and leaves existing Case snapshots intact', async () => {
    await fixture(async ({ call, pool, tokens, migration }) => {
      const attempts: Array<['POST' | 'PATCH' | 'PUT', string, unknown]> = [
        ['PATCH', '/organization', { name: 'Denied' }],
        ['POST', '/houses', { address: 'Denied', display_label: null, active: true }],
        ['PATCH', `/houses/${ids.house}`, { active: false }],
        ['POST', '/categories', { name: 'Denied', description: null, default_contractor_id: null,
          requires_premises_access: true, result_requirement: 'NONE', active: true }],
        ['PATCH', `/categories/${ids.category}`, { active: false }],
        ['POST', '/contractors', { display_name: 'Denied' }],
        ['PUT', `/contractors/${ids.contractor}/binding`, { active: false }],
        ['PUT', `/users/${ids.eligible}/role-binding`, { role: 'UK_ADMIN', contractor_id: null, house_ids: [] }],
        ['PUT', `/contractors/${ids.contractor}/employees/${ids.eligible}`, { active: true }],
      ];
      for (const [method, path, body] of attempts) {
        expect((await call(method, path, tokens.employee, body, randomUUID())).status).toBe(403);
      }
      expect((await call('PATCH', '/organization', tokens.admin, { name: 'Missing key' })).status).toBe(400);
      expect((await call('PATCH', '/organization', tokens.admin, { name: 'Invalid', active: false }, randomUUID())).status).toBe(400);
      expect((await pool.query(`SELECT count(*)::int AS n FROM configuration_change`)).rows[0].n).toBe(0);

      const caseId = uuid(80), iterationId = uuid(81);
      const client = await migration.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO case_table (case_id,organization_id,house_id,premises_id,resident_user_id,
          category_id,description,created_at,updated_at,created_by_user_id,category_name_snapshot,
          requires_access_snapshot,result_requirement_snapshot,default_contractor_snapshot_id,
          house_address_snapshot,premises_label_snapshot,current_state,current_iteration_id,revision,last_event_seq)
          VALUES ($1,$2,$3,$4,$5,$6,'Existing',now(),now(),$5,'Own category',true,'PHOTO',$7,
          'Own address','1','CREATED',$8,1,0)`,
        [caseId, ids.org, ids.house, ids.premises, ids.eligible, ids.category, ids.contractor, iterationId]);
        await client.query(`INSERT INTO case_iteration (iteration_id,case_id,iteration_no,start_reason,started_at,started_by_user_id)
          VALUES ($1,$2,1,'INITIAL',now(),$3)`, [iterationId, caseId, ids.eligible]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      const before = (await pool.query(`SELECT * FROM case_table WHERE case_id=$1`, [caseId])).rows[0];
      expect((await call('PATCH', `/houses/${ids.house}`, tokens.admin, { address: 'New address' }, randomUUID())).status).toBe(200);
      expect((await call('PATCH', `/categories/${ids.category}`, tokens.admin,
        { name: 'New category', active: false, default_contractor_id: null }, randomUUID())).status).toBe(200);
      expect((await pool.query(`SELECT * FROM case_table WHERE case_id=$1`, [caseId])).rows[0]).toEqual(before);
      expect((await pool.query(`SELECT count(*)::int AS n FROM case_event WHERE case_id=$1`, [caseId])).rows[0].n).toBe(0);
    });
  }, 120_000);
});
