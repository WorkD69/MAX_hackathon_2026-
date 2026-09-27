import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { verifyOwnedLegacySuite } from '../../../tests/support/postgres.mjs';
import type { CommandPlan, Database } from '@max-smart-city/db';
import { CommandTransactionKernel } from '@max-smart-city/db';
import { MIGRATIONS_DIR } from '../../../packages/db/src/index.js';
import { loadConfig } from '../src/config/load-config.js';
import { issueSession } from '../src/modules/auth/session-token.js';
import { createCommandAuthorization } from '../src/modules/commands/kernel/authorization.js';
import type { CommandAuthorizationContext } from '../src/modules/commands/kernel/authorization.js';
import { createCommandFingerprint } from '../src/modules/commands/kernel/fingerprint.js';

const DATABASE_URL = await verifyOwnedLegacySuite('TG012_POLICY');
const parsed = new URL(DATABASE_URL);
const databaseName = decodeURIComponent(parsed.pathname.slice(1));
const schema = 'tg012_policy';
const uuid = (n: number) => `20000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = {
  org: uuid(1), house: uuid(2), premises: uuid(3), category: uuid(4),
  resident: uuid(5), binding: uuid(6), identity: uuid(7), case: uuid(8), iteration: uuid(9),
};

function connectionConfig(searchPath: string) {
  return {
    host: parsed.hostname, port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
    database: databaseName, options: `-c search_path=${searchPath}`,
  };
}

test('TG-011 policy is re-evaluated inside TG-012 PostgreSQL transaction before protected replay and key reuse', async () => {
  if (!databaseName.endsWith('_tg012_test')) throw new Error('UNSAFE_TG012_TEST_DATABASE');
  const admin = new Pool(connectionConfig('public'));
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally { await admin.end(); }

  const pool = new Pool(connectionConfig(schema));
  const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    expect((await pool.query('SHOW search_path')).rows[0]?.search_path).toBe(schema);
    const migrator = new Migrator({
      db: database, migrationTableName: 'tg012_policy_migration',
      migrationLockTableName: 'tg012_policy_migration_lock',
      provider: new FileMigrationProvider({
        fs, path, migrationFolder: MIGRATIONS_DIR,
        import: (modulePath: string) => import(pathToFileURL(modulePath).href),
      }),
    });
    const migration = await migrator.migrateToLatest();
    if (migration.error) throw migration.error;
    await pool.query(`INSERT INTO organization VALUES ($1,'Org',true,now(),now())`, [ids.org]);
    await pool.query(`INSERT INTO house VALUES ($1,$2,'Address',NULL,true,now(),now())`, [ids.house, ids.org]);
    await pool.query(`INSERT INTO premises VALUES ($1,$2,'1',true,now(),now())`, [ids.premises, ids.house]);
    await pool.query(`INSERT INTO category (category_id,organization_id,name,requires_premises_access,result_requirement,active,config_revision,created_at,updated_at) VALUES ($1,$2,'Category',true,'NONE',true,1,now(),now())`, [ids.category, ids.org]);
    await pool.query(`INSERT INTO app_user VALUES ($1,'Resident',false,true,now(),now())`, [ids.resident]);
    await pool.query(`INSERT INTO user_role_binding VALUES ($1,$2,'RESIDENT',NULL,NULL,true,now())`, [ids.binding, ids.resident]);
    await pool.query(`INSERT INTO resident_premises_access VALUES ($1,$2,true,now())`, [ids.resident, ids.premises]);
    await pool.query(`INSERT INTO max_identity VALUES ($1,'mini','chat','private','bot','LINKED_CONFIRMED',$2,now(),now(),now())`, [ids.identity, ids.resident]);
    await database.transaction().execute(async (transaction) => {
      await transaction.insertInto('case_table').values({
        case_id: ids.case, display_number: null, organization_id: ids.org, house_id: ids.house,
        premises_id: ids.premises, resident_user_id: ids.resident, category_id: ids.category,
        description: 'Case', created_at: new Date(), updated_at: new Date(), created_by_user_id: ids.resident,
        demo_run_id: null, category_name_snapshot: 'Category', requires_access_snapshot: true,
        result_requirement_snapshot: 'NONE', default_contractor_snapshot_id: null,
        house_address_snapshot: 'Address', premises_label_snapshot: '1', current_state: 'CREATED',
        current_iteration_id: ids.iteration, current_selection_id: null, current_assignment_id: null,
        current_executor_contractor_id: null, current_result_id: null, closed_at: null,
        closed_by_user_id: null, closure_kind: null, closure_explanation: null, revision: 1, last_event_seq: 0,
      }).executeTakeFirstOrThrow();
      await transaction.insertInto('case_iteration').values({
        iteration_id: ids.iteration, case_id: ids.case, iteration_no: 1, start_reason: 'INITIAL',
        started_at: new Date(), started_by_user_id: ids.resident, source_result_id: null,
        source_feedback_id: null, started_by_event_id: null,
      }).executeTakeFirstOrThrow();
    });

    const config = loadConfig({
      APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL,
      APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
      PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
      BUILD_SHA: 'a'.repeat(40), APP_SESSION_TTL_SECONDS: '900',
    });
    const token = issueSession({
      max_identity_id: ids.identity, app_user_id: ids.resident, role_binding_id: ids.binding,
      role: 'RESIDENT', demo_mode: false, demo_run_id: null, real_display_name: 'Resident',
    }, config, 1000).token;
    const authorization = createCommandAuthorization(token, config, 1001);
    const plan: CommandPlan<{ text: string }, CommandAuthorizationContext, null, { case_id: string; text: string; revision: number }> = {
      requestedTarget: () => ({ kind: 'EXISTING_CASE', caseId: ids.case, authorizationKey: ids.case,
        authorizationContext: { kind: 'CASE', action: 'ADD_COMMENT' } }),
      storedTarget: () => ({ kind: 'EXISTING_CASE', caseId: ids.case, authorizationKey: ids.case,
        authorizationContext: { kind: 'CASE', action: 'ADD_COMMENT' } }),
      authorize: authorization.authorize,
      terminalGuard: async () => {}, validateExactTargets: async () => {}, validateStateContext: async () => {},
      lockConfiguration: async () => {}, validateDomain: async () => {},
      writeDomain: async () => null,
      updateProjection: async ({ transaction }) => {
        await transaction.updateTable('case_table').set({ updated_at: new Date(), last_event_seq: 1 })
          .where('case_id', '=', ids.case).executeTakeFirstOrThrow();
      },
      appendEvents: async ({ transaction, commandId, payload }) => {
        await transaction.insertInto('case_event').values({
          event_id: uuid(30), case_id: ids.case, event_seq: 1, event_type: 'EVT_007',
          occurred_at: new Date(), actor_user_id: ids.resident, actor_role_snapshot: 'RESIDENT',
          actor_organization_id: null, actor_contractor_id: null, from_state: 'CREATED', to_state: 'CREATED',
          iteration_id: ids.iteration, selection_id: null, assignment_id: null, result_id: null,
          feedback_id: null, comment_id: null, attachment_id: null, description: payload.text,
          presentation_data: {}, command_id: commandId, caused_by_event_id: null, derived: false,
        }).executeTakeFirstOrThrow();
      },
      createNotificationIntents: async () => {},
      canonicalResponse: ({ payload, revision }) => ({ status: 200, body: { case_id: ids.case, text: payload.text, revision: revision! } }),
    };
    const kernel = new CommandTransactionKernel(database);
    const command = (text: string, bytes = Buffer.from('same attachment bytes')) => ({
      authenticate: authorization.authenticate, idempotencyKey: 'protected-replay', commandType: 'ADD_COMMENT',
      prepare: () => ({
        payload: { text },
        requestHash: createCommandFingerprint({
          method: 'POST', path: `/api/v1/cases/${ids.case}/comments`,
          commandType: 'ADD_COMMENT', normalizedPayload: { text },
          files: [{ field: 'files', fileName: 'proof.jpg', mimeType: 'image/jpeg', bytes }],
        }),
      }), plan,
    });

    const success = await kernel.run(command('canonical'));
    expect(await kernel.run(command('canonical'))).toMatchObject({ replayed: true, body: success.body, revision: 2 });
    await pool.query(`UPDATE user_role_binding SET active=false WHERE role_binding_id=$1`, [ids.binding]);
    await expect(kernel.run(command('canonical'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(kernel.run(command('changed'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await pool.query(`UPDATE user_role_binding SET active=true WHERE role_binding_id=$1`, [ids.binding]);
    await expect(kernel.run(command('changed'))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });
    await expect(kernel.run(command('canonical', Buffer.from('changed attachment byte'))))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });
    expect((await pool.query(`SELECT count(*)::int count FROM case_event WHERE case_id=$1`, [ids.case])).rows[0].count).toBe(1);
    expect((await pool.query(`SELECT response_body FROM command_execution WHERE idempotency_key='protected-replay'`)).rows[0].response_body).toEqual(success.body);
  } finally { await database.destroy(); }
}, 60_000);
