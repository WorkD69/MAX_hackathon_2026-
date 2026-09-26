import { createHash, randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import type { CommandPlan, Database, DatabaseTransaction } from '../index.js';
import { migrateToLatest } from '../index.js';
import { CommandKernelError, CommandTransactionKernel } from './command-kernel.js';

const DATABASE_URL = process.env.TG012_TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('MISSING_TG012_TEST_DATABASE_URL');

const parsed = new URL(DATABASE_URL);
const DATABASE_NAME = decodeURIComponent(parsed.pathname.slice(1));
const SCHEMA = 'tg012_kernel';
const uuid = (n: number) => `10000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const ids = {
  org: uuid(1), otherOrg: uuid(2), house: uuid(3), premises: uuid(4), category: uuid(5),
  house2: uuid(6), premises2: uuid(7),
  uk: uuid(10), foreignUk: uuid(11), resident: uuid(12), contractorUser: uuid(13),
  ukBinding: uuid(20), foreignBinding: uuid(21), residentBinding: uuid(22), contractorBinding: uuid(23),
  contractorA: uuid(30), contractorB: uuid(31),
  maxIdentity: uuid(32), demoRun: uuid(33),
  case1: uuid(100), case2: uuid(101), createCase: uuid(102),
  iteration1: uuid(110), iteration2: uuid(111), createIteration: uuid(112),
  selectionOld: uuid(120), selectionA: uuid(121), selectionB: uuid(122),
  selectionCase2A: uuid(123), selectionCase2B: uuid(124),
  assignmentCase2A: uuid(130), assignmentCase2B: uuid(131),
};

function poolConfig(schema: string, max = 8) {
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: DATABASE_NAME,
    max,
    options: `-c search_path=${schema}`,
  };
}

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

async function createHarness() {
  if (!DATABASE_NAME.endsWith('_tg012_test')) throw new Error('UNSAFE_TG012_TEST_DATABASE');
  const administrative = new Pool(poolConfig('public', 1));
  try {
    await administrative.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(SCHEMA)} CASCADE`);
    await administrative.query(`CREATE SCHEMA ${quoteIdentifier(SCHEMA)}`);
  } finally {
    await administrative.end();
  }
  const pool = new Pool(poolConfig(SCHEMA));
  const database = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  await migrateToLatest(database);
  await seed(pool);
  return { database, pool };
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(`INSERT INTO organization VALUES ($1,'Org',true,now(),now()),($2,'Other',true,now(),now())`, [ids.org, ids.otherOrg]);
  await pool.query(`INSERT INTO house VALUES ($1,$2,'Address',NULL,true,now(),now())`, [ids.house, ids.org]);
  await pool.query(`INSERT INTO house VALUES ($1,$2,'Address 2',NULL,true,now(),now())`, [ids.house2, ids.org]);
  await pool.query(`INSERT INTO premises VALUES ($1,$2,'1',true,now(),now())`, [ids.premises, ids.house]);
  await pool.query(`INSERT INTO premises VALUES ($1,$2,'2',true,now(),now())`, [ids.premises2, ids.house2]);
  await pool.query(`INSERT INTO category (category_id,organization_id,name,requires_premises_access,result_requirement,active,config_revision,created_at,updated_at) VALUES ($1,$2,'Category',true,'PHOTO',true,1,now(),now())`, [ids.category, ids.org]);
  await pool.query(`INSERT INTO contractor VALUES ($1,'A',true,now(),now()),($2,'B',true,now(),now())`, [ids.contractorA, ids.contractorB]);
  await pool.query(`INSERT INTO organization_contractor VALUES ($1,$2,true,now()),($1,$3,true,now())`, [ids.org, ids.contractorA, ids.contractorB]);
  await pool.query(`INSERT INTO app_user VALUES ($1,'UK',false,true,now(),now()),($2,'Foreign',false,true,now(),now()),($3,'Resident',false,true,now(),now()),($4,'Contractor',false,true,now(),now())`, [ids.uk, ids.foreignUk, ids.resident, ids.contractorUser]);
  await pool.query(`INSERT INTO max_identity VALUES ($1,'real-mini','real-chat','private','real-bot','LINKED_CONFIRMED',NULL,now(),now(),now())`, [ids.maxIdentity]);
  await pool.query(`INSERT INTO user_role_binding VALUES ($1,$2,'UK_EMPLOYEE',$3,NULL,true,now()),($4,$5,'UK_EMPLOYEE',$6,NULL,true,now()),($7,$8,'RESIDENT',NULL,NULL,true,now()),($9,$10,'CONTRACTOR_EMPLOYEE',NULL,$11,true,now())`, [ids.ukBinding, ids.uk, ids.org, ids.foreignBinding, ids.foreignUk, ids.otherOrg, ids.residentBinding, ids.resident, ids.contractorBinding, ids.contractorUser, ids.contractorA]);
  await pool.query(`INSERT INTO uk_house_access VALUES ($1,$2,true,now())`, [ids.uk, ids.house]);
  await pool.query(`INSERT INTO uk_house_access VALUES ($1,$2,true,now())`, [ids.uk, ids.house2]);
  await pool.query(`INSERT INTO resident_premises_access VALUES ($1,$2,true,now())`, [ids.resident, ids.premises]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO case_table (case_id,organization_id,house_id,premises_id,resident_user_id,category_id,description,created_at,updated_at,created_by_user_id,category_name_snapshot,requires_access_snapshot,result_requirement_snapshot,house_address_snapshot,premises_label_snapshot,current_state,current_iteration_id,revision,last_event_seq) VALUES ($1,$2,$3,$4,$5,$6,'Case 1',now(),now(),$5,'Category',true,'PHOTO','Address','1','ACCEPTED_BY_UK',$7,1,0),($8,$2,$10,$11,$5,$6,'Case 2',now(),now(),$5,'Category',true,'PHOTO','Address 2','2','EXECUTION',$9,1,0)`, [ids.case1, ids.org, ids.house, ids.premises, ids.resident, ids.category, ids.iteration1, ids.case2, ids.iteration2, ids.house2, ids.premises2]);
    await client.query(`INSERT INTO case_iteration (iteration_id,case_id,iteration_no,start_reason,started_at,started_by_user_id) VALUES ($1,$2,1,'INITIAL',now(),$3),($4,$5,1,'INITIAL',now(),$3)`, [ids.iteration1, ids.case1, ids.resident, ids.iteration2, ids.case2]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (const [selectionId, caseId, iterationId, contractorId, selectionNo] of [
    [ids.selectionOld, ids.case1, ids.iteration1, ids.contractorA, 1],
    [ids.selectionA, ids.case1, ids.iteration1, ids.contractorA, 2],
    [ids.selectionB, ids.case1, ids.iteration1, ids.contractorB, 3],
    [ids.selectionCase2A, ids.case2, ids.iteration2, ids.contractorA, 1],
    [ids.selectionCase2B, ids.case2, ids.iteration2, ids.contractorB, 2],
  ] as const) {
    await pool.query(`INSERT INTO contractor_selection (selection_id,case_id,created_iteration_id,contractor_id,selected_by_user_id,selected_at,selection_no) VALUES ($1,$2,$3,$4,$5,now(),$6)`, [selectionId, caseId, iterationId, contractorId, ids.uk, selectionNo]);
  }
  await pool.query(`UPDATE case_table SET current_selection_id=$2 WHERE case_id=$1`, [ids.case1, ids.selectionOld]);
  await pool.query(`INSERT INTO assignment (assignment_id,case_id,selection_id,contractor_id,created_iteration_id,assignment_no,sent_by_user_id,sent_at,decision_status,accepted_at,accepted_by_user_id) VALUES ($1,$2,$3,$4,$5,1,$6,now(),'ACCEPTED',now(),$7),($8,$2,$9,$10,$5,2,$6,now(),'ACCEPTED',now(),$7)`, [ids.assignmentCase2A, ids.case2, ids.selectionCase2A, ids.contractorA, ids.iteration2, ids.uk, ids.contractorUser, ids.assignmentCase2B, ids.selectionCase2B, ids.contractorB]);
  await pool.query(`UPDATE case_table SET current_selection_id=$2,current_assignment_id=$3,current_executor_contractor_id=$4 WHERE case_id=$1`, [ids.case2, ids.selectionCase2A, ids.assignmentCase2A, ids.contractorA]);
}

class SemanticError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

interface SwitchPayload {
  caseId: string;
  targetSelectionId: string;
  newSelectionId: string;
  marker: string;
  delayMs?: number;
  failAfterProjection?: boolean;
}
interface AuthContext { actor: 'UK' | 'CONTRACTOR'; assignmentId?: string }
interface SwitchEffect { eventSequence: number }
interface SwitchResponse {
  case_id: string;
  target_selection_id: string;
  new_selection_id: string;
  marker: string;
  revision: number;
}

async function authorizeCurrent(
  transaction: DatabaseTransaction,
  actorId: string,
  targetCase: { organization_id: string; house_id: string; current_assignment_id: string | null; current_executor_contractor_id: string | null } | undefined,
  context: AuthContext,
): Promise<void> {
  const user = await transaction.selectFrom('app_user').select('active').where('app_user_id', '=', actorId).executeTakeFirst();
  const binding = await transaction.selectFrom('user_role_binding').selectAll().where('app_user_id', '=', actorId).where('active', '=', true).executeTakeFirst();
  if (!user?.active || !binding) throw new SemanticError('FORBIDDEN', 403);
  if (!targetCase) throw new SemanticError('NOT_FOUND', 404);
  if (context.actor === 'UK') {
    if (binding.organization_id !== targetCase.organization_id) throw new SemanticError('NOT_FOUND', 404);
    const access = await transaction.selectFrom('uk_house_access').select('active')
      .where('app_user_id', '=', actorId).where('house_id', '=', targetCase.house_id).executeTakeFirst();
    if (!access?.active) throw new SemanticError('NOT_FOUND', 404);
    return;
  }
  if (binding.contractor_id !== targetCase.current_executor_contractor_id ||
    context.assignmentId !== targetCase.current_assignment_id) throw new SemanticError('NOT_FOUND', 404);
}

function switchPlan(actorId: string, auth: AuthContext = { actor: 'UK' }): CommandPlan<SwitchPayload, AuthContext, SwitchEffect, SwitchResponse> {
  return {
    requestedTarget: (payload) => ({
      kind: 'EXISTING_CASE', caseId: payload.caseId,
      authorizationKey: `${payload.caseId}:${auth.assignmentId ?? 'UK'}`,
      authorizationContext: auth,
    }),
    storedTarget: (execution) => {
      const body = execution.response_body as Partial<SwitchResponse>;
      if (!body.case_id) throw new Error('MISSING_STORED_CASE');
      return {
        kind: 'EXISTING_CASE', caseId: body.case_id,
        authorizationKey: `${body.case_id}:${auth.assignmentId ?? 'UK'}`,
        authorizationContext: auth,
      };
    },
    authorize: async ({ transaction, lockedCase, target }) => {
      await authorizeCurrent(transaction, actorId, lockedCase, target.authorizationContext);
    },
    terminalGuard: async ({ lockedCase }) => {
      if (!lockedCase) throw new SemanticError('NOT_FOUND', 404);
      if (lockedCase.current_state === 'COMPLETED') throw new SemanticError('TERMINAL_CASE', 409);
    },
    validateExactTargets: async ({ lockedCase, payload }) => {
      if (lockedCase!.current_selection_id !== payload.targetSelectionId) throw new SemanticError('STALE_SELECTION', 409);
    },
    validateStateContext: async () => {},
    lockConfiguration: async () => {},
    validateDomain: async () => {},
    writeDomain: async ({ transaction, payload, lockedCase }) => {
      if (payload.delayMs) await sql`SELECT pg_sleep(${payload.delayMs / 1000})`.execute(transaction);
      return { eventSequence: Number(lockedCase!.last_event_seq) + 1 };
    },
    updateProjection: async ({ transaction, payload, effect }) => {
      await transaction.updateTable('case_table').set({
        current_selection_id: payload.newSelectionId,
        updated_at: new Date(),
        last_event_seq: effect.eventSequence,
      }).where('case_id', '=', payload.caseId).executeTakeFirstOrThrow();
    },
    appendEvents: async ({ transaction, payload, effect, commandId, lockedCase }) => {
      if (payload.failAfterProjection) throw new Error('INJECTED_EVENT_FAILURE');
      await transaction.insertInto('case_event').values({
        event_id: randomUUID(),
        case_id: payload.caseId,
        event_seq: effect.eventSequence,
        event_type: 'EVT_003',
        occurred_at: new Date(),
        actor_user_id: actorId,
        actor_role_snapshot: auth.actor === 'UK' ? 'UK_EMPLOYEE' : 'CONTRACTOR_EMPLOYEE',
        actor_organization_id: auth.actor === 'UK' ? lockedCase!.organization_id : null,
        actor_contractor_id: auth.actor === 'CONTRACTOR' ? lockedCase!.current_executor_contractor_id : null,
        from_state: lockedCase!.current_state,
        to_state: lockedCase!.current_state,
        iteration_id: lockedCase!.current_iteration_id,
        selection_id: payload.newSelectionId,
        assignment_id: null,
        result_id: null,
        feedback_id: null,
        comment_id: null,
        attachment_id: null,
        description: payload.marker,
        presentation_data: { marker: payload.marker },
        command_id: commandId,
        caused_by_event_id: null,
        derived: false,
      }).executeTakeFirstOrThrow();
    },
    createNotificationIntents: async () => {},
    canonicalResponse: ({ payload, revision }) => ({
      status: 200,
      body: {
        case_id: payload.caseId,
        target_selection_id: payload.targetSelectionId,
        new_selection_id: payload.newSelectionId,
        marker: payload.marker,
        revision: revision!,
      },
    }),
  };
}

const input = (
  actorId: string,
  key: string,
  payload: SwitchPayload,
  requestHash = hash(JSON.stringify(payload)),
  auth: AuthContext = { actor: 'UK' },
) => ({
  authenticate: () => ({ type: 'APP_USER' as const, appUserId: actorId }),
  idempotencyKey: key,
  commandType: 'TEST_SWITCH_SELECTION',
  prepare: () => ({ requestHash, payload }),
  plan: switchPlan(actorId, auth),
});

describe('TG-012 real PostgreSQL command transaction kernel', () => {
  it('serializes concurrent same-key requests and replays one canonical success', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      const payload = { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'same-key', delayMs: 120 };
      const [first, second] = await Promise.all([kernel.run(input(ids.uk, 'same-key', payload)), kernel.run(input(ids.uk, 'same-key', payload))]);
      expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
      expect(first.body).toEqual(second.body);
      expect(first.commandId).toBe(second.commandId);
      expect(first.body.revision).toBe(2);
      expect((await pool.query(`SELECT count(*)::int count FROM command_execution WHERE idempotency_key='same-key' AND execution_status='SUCCEEDED'`)).rows[0].count).toBe(1);
      expect((await pool.query(`SELECT count(*)::int count FROM case_event WHERE case_id=$1`, [ids.case1])).rows[0].count).toBe(1);
      expect((await pool.query(`SELECT revision::int revision FROM case_table WHERE case_id=$1`, [ids.case1])).rows[0].revision).toBe(2);
    } finally { await database.destroy(); }
  }, 60_000);

  it('authorizes before same-payload replay and before changed-payload key reuse', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      const original = { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'canonical' };
      const success = await kernel.run(input(ids.uk, 'auth-replay', original));
      const replay = await kernel.run(input(ids.uk, 'auth-replay', original));
      expect(replay).toMatchObject({ replayed: true, body: success.body, commandId: success.commandId, revision: 2 });

      await pool.query(`UPDATE user_role_binding SET active=false WHERE role_binding_id=$1`, [ids.ukBinding]);
      await expect(kernel.run(input(ids.uk, 'auth-replay', original))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const changed = { ...original, marker: 'changed' };
      await expect(kernel.run(input(ids.uk, 'auth-replay', changed))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await pool.query(`UPDATE user_role_binding SET active=true WHERE role_binding_id=$1`, [ids.ukBinding]);
      await expect(kernel.run(input(ids.uk, 'auth-replay', changed))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', status: 409 });
      expect((await pool.query(`SELECT response_body FROM command_execution WHERE idempotency_key='auth-replay'`)).rows[0].response_body).toEqual(success.body);
    } finally { await database.destroy(); }
  }, 60_000);

  it('serializes different keys on Case and enforces exact-target first-valid-wins', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      const left = input(ids.uk, 'different-a', { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'winner-a', delayMs: 100 });
      const right = input(ids.uk, 'different-b', { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionB, marker: 'winner-b', delayMs: 100 });
      const settled = await Promise.allSettled([kernel.run(left), kernel.run(right)]);
      expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      expect(rejected?.reason).toMatchObject({ code: 'STALE_SELECTION', status: 409 });
      const row = (await pool.query(`SELECT revision::int revision,current_selection_id FROM case_table WHERE case_id=$1`, [ids.case1])).rows[0];
      expect(row.revision).toBe(2);
      expect([ids.selectionA, ids.selectionB]).toContain(row.current_selection_id);
      expect((await pool.query(`SELECT count(*)::int count FROM command_execution WHERE idempotency_key LIKE 'different-%'`)).rows[0].count).toBe(1);
      expect((await pool.query(`SELECT count(*)::int count FROM case_event WHERE case_id=$1`, [ids.case1])).rows[0].count).toBe(1);
    } finally { await database.destroy(); }
  }, 60_000);

  it('holds coherent configuration locks against contractor deactivation and rejects a later inactive dependency', async () => {
    const { database, pool } = await createHarness();
    let releaseValidation: (() => void) | undefined;
    try {
      let reportLocked: (() => void) | undefined;
      const locked = new Promise<void>((resolve) => { reportLocked = resolve; });
      const proceed = new Promise<void>((resolve) => { releaseValidation = resolve; });
      const makePlan = (wait: boolean) => ({
        ...switchPlan(ids.uk),
        lockConfiguration: async ({ transaction }: { transaction: DatabaseTransaction }) => {
          await transaction.selectFrom('organization').select('organization_id').where('organization_id', '=', ids.org).forUpdate().execute();
          await transaction.selectFrom('house').select('house_id').where('house_id', '=', ids.house).forUpdate().execute();
          await transaction.selectFrom('premises').select('premises_id').where('premises_id', '=', ids.premises).forUpdate().execute();
          await transaction.selectFrom('category').select('category_id').where('category_id', '=', ids.category).forUpdate().execute();
          await transaction.selectFrom('contractor').select('contractor_id').where('contractor_id', '=', ids.contractorA).forUpdate().execute();
          await transaction.selectFrom('organization_contractor').select('contractor_id')
            .where('organization_id', '=', ids.org).where('contractor_id', '=', ids.contractorA).forUpdate().execute();
          if (wait) reportLocked?.();
        },
        validateDomain: async ({ transaction }: { transaction: DatabaseTransaction }) => {
          if (wait) await proceed;
          const contractor = await transaction.selectFrom('contractor').select('active')
            .where('contractor_id', '=', ids.contractorA).executeTakeFirst();
          if (!contractor?.active) throw new SemanticError('CONTRACTOR_NOT_AVAILABLE', 422);
        },
      });
      const kernel = new CommandTransactionKernel(database);
      const firstPayload = { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'before-deactivation' };
      const first = kernel.run({ ...input(ids.uk, 'config-first', firstPayload), plan: makePlan(true) });
      await locked;
      let deactivationCommitted = false;
      const deactivation = pool.query(`UPDATE contractor SET active=false WHERE contractor_id=$1`, [ids.contractorA])
        .then(() => { deactivationCommitted = true; });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(deactivationCommitted).toBe(false);
      releaseValidation?.();
      expect((await first).revision).toBe(2);
      await deactivation;
      expect(deactivationCommitted).toBe(true);

      const secondPayload = { caseId: ids.case1, targetSelectionId: ids.selectionA, newSelectionId: ids.selectionB, marker: 'after-deactivation' };
      await expect(kernel.run({ ...input(ids.uk, 'config-second', secondPayload), plan: makePlan(false) }))
        .rejects.toMatchObject({ code: 'CONTRACTOR_NOT_AVAILABLE', status: 422 });
      expect((await pool.query(`SELECT count(*)::int count FROM command_execution WHERE idempotency_key='config-second'`)).rows[0].count).toBe(0);
    } finally { releaseValidation?.(); await database.destroy(); }
  }, 60_000);

  it('returns visibility denial before stale target details', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      await expect(kernel.run(input(ids.foreignUk, 'hidden-stale', {
        caseId: ids.case1, targetSelectionId: ids.selectionB, newSelectionId: ids.selectionA, marker: 'must-not-run',
      }))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
      await expect(kernel.run(input(ids.uk, 'guessed-case', {
        caseId: uuid(999), targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'must-not-run',
      }))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
      expect((await pool.query(`SELECT count(*)::int count FROM command_execution WHERE idempotency_key='guessed-case'`)).rows[0].count).toBe(0);
    } finally { await database.destroy(); }
  }, 60_000);

  it('locks requested and stored Cases in ascending order and gates both resources before key reuse', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      const onA = { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'A' };
      const onB = { caseId: ids.case2, targetSelectionId: ids.selectionCase2A, newSelectionId: ids.selectionCase2B, marker: 'B' };
      await kernel.run(input(ids.uk, 'cross-a', onA));
      await pool.query(`UPDATE uk_house_access SET active=false WHERE app_user_id=$1 AND house_id=$2`, [ids.uk, ids.house2]);
      await expect(kernel.run(input(ids.uk, 'cross-a', onB))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
      await pool.query(`UPDATE uk_house_access SET active=true WHERE app_user_id=$1 AND house_id=$2`, [ids.uk, ids.house2]);
      await expect(kernel.run(input(ids.uk, 'cross-a', onB))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', status: 409 });

      await kernel.run(input(ids.uk, 'cross-b', onB));
      const changedA = { ...onA, targetSelectionId: ids.selectionA, newSelectionId: ids.selectionB };
      await pool.query(`UPDATE uk_house_access SET active=false WHERE app_user_id=$1 AND house_id=$2`, [ids.uk, ids.house]);
      await expect(kernel.run(input(ids.uk, 'cross-b', changedA))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
      await pool.query(`UPDATE uk_house_access SET active=true WHERE app_user_id=$1 AND house_id=$2`, [ids.uk, ids.house]);
      await expect(kernel.run(input(ids.uk, 'cross-b', changedA))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', status: 409 });
      const simultaneous = await Promise.allSettled([
        kernel.run(input(ids.uk, 'cross-a', onB)),
        kernel.run(input(ids.uk, 'cross-b', changedA)),
      ]);
      expect(simultaneous.map((result) => result.status)).toEqual(['rejected', 'rejected']);
      for (const result of simultaneous) {
        if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });
      }
    } finally { await database.destroy(); }
  }, 60_000);

  it('denies old contractor replay after reassignment and permits unchanged contractor replay', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      const payload = { caseId: ids.case2, targetSelectionId: ids.selectionCase2A, newSelectionId: ids.selectionCase2A, marker: 'contractor-success' };
      const auth = { actor: 'CONTRACTOR' as const, assignmentId: ids.assignmentCase2A };
      const success = await kernel.run(input(ids.contractorUser, 'contractor-replay', payload, hash('contractor'), auth));
      expect((await kernel.run(input(ids.contractorUser, 'contractor-replay', payload, hash('contractor'), auth))).body).toEqual(success.body);
      await pool.query(`UPDATE case_table SET current_selection_id=$2,current_assignment_id=$3,current_executor_contractor_id=$4 WHERE case_id=$1`, [ids.case2, ids.selectionCase2B, ids.assignmentCase2B, ids.contractorB]);
      await expect(kernel.run(input(ids.contractorUser, 'contractor-replay', payload, hash('contractor'), auth))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    } finally { await database.destroy(); }
  }, 60_000);

  it('rolls back reservation, projection and event together, then permits retry', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      const failing = { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'rollback', failAfterProjection: true };
      const requestHash = hash('retry-stable-fingerprint');
      await expect(kernel.run(input(ids.uk, 'rollback-retry', failing, requestHash))).rejects.toThrow('INJECTED_EVENT_FAILURE');
      expect((await pool.query(`SELECT count(*)::int count FROM command_execution WHERE idempotency_key='rollback-retry'`)).rows[0].count).toBe(0);
      expect((await pool.query(`SELECT current_selection_id,revision::int revision,last_event_seq FROM case_table WHERE case_id=$1`, [ids.case1])).rows[0]).toMatchObject({ current_selection_id: ids.selectionOld, revision: 1, last_event_seq: '0' });
      const retry = await kernel.run(input(ids.uk, 'rollback-retry', { ...failing, failAfterProjection: false }, requestHash));
      expect(retry).toMatchObject({ replayed: false, revision: 2, body: { revision: 2, marker: 'rollback' } });
      expect((await pool.query(`SELECT count(*)::int count FROM case_event WHERE command_id=$1`, [retry.commandId])).rows[0].count).toBe(1);
    } finally { await database.destroy(); }
  }, 60_000);

  it('creates Case at canonical revision 1 and persists its response atomically', async () => {
    const { database, pool } = await createHarness();
    try {
      const kernel = new CommandTransactionKernel(database);
      const plan: CommandPlan<{ caseId: string; iterationId: string; premisesId: string }, { premisesId: string }, { caseId: string }, { case_id: string; revision: number }> = {
        requestedTarget: (payload) => ({ kind: 'CREATE_CASE', caseId: null, authorizationKey: `premises:${payload.premisesId}`, authorizationContext: { premisesId: payload.premisesId } }),
        storedTarget: (execution) => {
          const body = execution.response_body as { case_id?: string };
          return { kind: 'EXISTING_CASE', caseId: body.case_id ?? ids.createCase, authorizationKey: `case:${body.case_id ?? ids.createCase}`, authorizationContext: { premisesId: ids.premises } };
        },
        lockAuthorizationResources: async ({ transaction }) => {
          await transaction.selectFrom('organization').select('organization_id').where('organization_id', '=', ids.org).forUpdate().execute();
          await transaction.selectFrom('house').select('house_id').where('house_id', '=', ids.house).forUpdate().execute();
          await transaction.selectFrom('premises').select('premises_id').where('premises_id', '=', ids.premises).forUpdate().execute();
          await transaction.selectFrom('category').select('category_id').where('category_id', '=', ids.category).forUpdate().execute();
          await transaction.selectFrom('resident_premises_access').select('app_user_id').where('app_user_id', '=', ids.resident).where('premises_id', '=', ids.premises).forUpdate().execute();
        },
        lockReplayResources: async ({ transaction }) => {
          await transaction.selectFrom('organization').select('organization_id').where('organization_id', '=', ids.org).forUpdate().execute();
          await transaction.selectFrom('house').select('house_id').where('house_id', '=', ids.house).forUpdate().execute();
          await transaction.selectFrom('premises').select('premises_id').where('premises_id', '=', ids.premises).forUpdate().execute();
          await transaction.selectFrom('category').select('category_id').where('category_id', '=', ids.category).forUpdate().execute();
          await transaction.selectFrom('resident_premises_access').select('app_user_id').where('app_user_id', '=', ids.resident).where('premises_id', '=', ids.premises).forUpdate().execute();
        },
        authorize: async ({ transaction, target }) => {
          const access = await transaction.selectFrom('resident_premises_access').select('active').where('app_user_id', '=', ids.resident).where('premises_id', '=', target.authorizationContext.premisesId).executeTakeFirst();
          if (!access?.active) throw new SemanticError('NOT_FOUND', 404);
        },
        terminalGuard: async () => {}, validateExactTargets: async () => {}, validateStateContext: async () => {},
        lockConfiguration: async () => {}, validateDomain: async () => {},
        writeDomain: async ({ transaction, payload }) => {
          await transaction.insertInto('case_table').values({
            case_id: payload.caseId, display_number: null, organization_id: ids.org, house_id: ids.house,
            premises_id: ids.premises, resident_user_id: ids.resident, category_id: ids.category,
            description: 'Created atomically', created_at: new Date(), updated_at: new Date(), created_by_user_id: ids.resident,
            demo_run_id: null, category_name_snapshot: 'Category', requires_access_snapshot: true,
            result_requirement_snapshot: 'PHOTO', default_contractor_snapshot_id: null,
            house_address_snapshot: 'Address', premises_label_snapshot: '1', current_state: 'CREATED',
            current_iteration_id: payload.iterationId, current_selection_id: null, current_assignment_id: null,
            current_executor_contractor_id: null, current_result_id: null, closed_at: null, closed_by_user_id: null,
            closure_kind: null, closure_explanation: null, revision: 1, last_event_seq: 1,
          }).executeTakeFirstOrThrow();
          await transaction.insertInto('case_iteration').values({ iteration_id: payload.iterationId, case_id: payload.caseId, iteration_no: 1, start_reason: 'INITIAL', started_at: new Date(), started_by_user_id: ids.resident, source_result_id: null, source_feedback_id: null, started_by_event_id: null }).executeTakeFirstOrThrow();
          return { caseId: payload.caseId };
        },
        updateProjection: async () => {},
        appendEvents: async ({ transaction, payload, commandId }) => {
          await transaction.insertInto('case_event').values({ event_id: uuid(700), case_id: payload.caseId, event_seq: 1, event_type: 'EVT_001', occurred_at: new Date(), actor_user_id: ids.resident, actor_role_snapshot: 'RESIDENT', actor_organization_id: null, actor_contractor_id: null, from_state: null, to_state: 'CREATED', iteration_id: payload.iterationId, selection_id: null, assignment_id: null, result_id: null, feedback_id: null, comment_id: null, attachment_id: null, description: 'Created', presentation_data: {}, command_id: commandId, caused_by_event_id: null, derived: false }).executeTakeFirstOrThrow();
        },
        createNotificationIntents: async () => {},
        createdCaseId: (effect) => effect.caseId,
        canonicalResponse: ({ effect, revision }) => ({ status: 201, body: { case_id: effect.caseId, revision: revision! } }),
      };
      const command = {
        authenticate: () => ({ type: 'APP_USER' as const, appUserId: ids.resident }), idempotencyKey: 'create-case', commandType: 'CREATE_CASE',
        prepare: () => ({ requestHash: hash('create-case'), payload: { caseId: ids.createCase, iterationId: ids.createIteration, premisesId: ids.premises } }), plan,
      };
      const created = await kernel.run(command);
      expect(created).toMatchObject({ status: 201, revision: 1, body: { case_id: ids.createCase, revision: 1 } });
      const replay = await kernel.run(command);
      expect(replay).toMatchObject({ replayed: true, body: created.body, commandId: created.commandId, revision: 1 });
      await expect(kernel.run({
        ...command,
        prepare: () => ({ requestHash: hash('hidden-house'), payload: { caseId: ids.createCase, iterationId: ids.createIteration, premisesId: ids.premises2 } }),
      })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
      expect((await pool.query(`SELECT revision::int revision FROM case_table WHERE case_id=$1`, [ids.createCase])).rows[0].revision).toBe(1);
    } finally { await database.destroy(); }
  }, 60_000);

  it('uses the same reservation and both current context gates for non-Case commands', async () => {
    const { database, pool } = await createHarness();
    try {
      type Payload = { houseId: string; label: string };
      type Body = { house_id: string; label: string };
      const lockHouses = async (transaction: DatabaseTransaction, houseIds: readonly string[]) => {
        await transaction.selectFrom('organization').select('organization_id')
          .where('organization_id', '=', ids.org).forUpdate().execute();
        for (const houseId of [...new Set(houseIds)].sort()) {
          await transaction.selectFrom('house').select('house_id')
            .where('house_id', '=', houseId).forUpdate().execute();
        }
      };
      const plan: CommandPlan<Payload, { houseId: string }, null, Body> = {
        requestedTarget: (payload) => ({ kind: 'NON_CASE', caseId: null, authorizationKey: payload.houseId, authorizationContext: { houseId: payload.houseId } }),
        storedTarget: (execution) => {
          const body = execution.response_body as Body;
          return { kind: 'NON_CASE', caseId: null, authorizationKey: body.house_id, authorizationContext: { houseId: body.house_id } };
        },
        lockAuthorizationResources: async ({ transaction, target }) => lockHouses(transaction, [target.authorizationContext.houseId]),
        lockReplayResources: async ({ transaction, requested, stored }) => lockHouses(transaction, [requested.authorizationContext.houseId, stored.authorizationContext.houseId]),
        authorize: async ({ transaction, target }) => {
          const house = await transaction.selectFrom('house').select(['active', 'organization_id'])
            .where('house_id', '=', target.authorizationContext.houseId).executeTakeFirst();
          const access = await transaction.selectFrom('uk_house_access').select('active')
            .where('app_user_id', '=', ids.uk).where('house_id', '=', target.authorizationContext.houseId).executeTakeFirst();
          if (!house?.active || house.organization_id !== ids.org || !access?.active) throw new SemanticError('NOT_FOUND', 404);
        },
        terminalGuard: async () => {}, validateExactTargets: async () => {}, validateStateContext: async () => {},
        lockConfiguration: async () => {}, validateDomain: async () => {},
        writeDomain: async ({ transaction, payload, commandId }) => {
          await transaction.updateTable('house').set({ display_label: payload.label, updated_at: new Date() })
            .where('house_id', '=', payload.houseId).executeTakeFirstOrThrow();
          await transaction.insertInto('configuration_change').values({
            config_change_id: randomUUID(), organization_id: ids.org, entity_type: 'HOUSE',
            entity_id: payload.houseId, action: 'UPDATE', before_data: {}, after_data: { display_label: payload.label },
            actor_user_id: ids.uk, occurred_at: new Date(), command_id: commandId,
          }).executeTakeFirstOrThrow();
          return null;
        },
        updateProjection: async () => {}, appendEvents: async () => {}, createNotificationIntents: async () => {},
        canonicalResponse: ({ payload }) => ({ status: 200, body: { house_id: payload.houseId, label: payload.label } }),
      };
      const kernel = new CommandTransactionKernel(database);
      const command = (payload: Payload) => ({
        authenticate: () => ({ type: 'APP_USER' as const, appUserId: ids.uk }),
        idempotencyKey: 'non-case-key', commandType: 'UPDATE_HOUSE',
        prepare: () => ({ payload, requestHash: hash(JSON.stringify(payload)) }), plan,
      });
      const first = await kernel.run(command({ houseId: ids.house, label: 'One' }));
      expect(first).toMatchObject({ replayed: false, revision: null, body: { house_id: ids.house, label: 'One' } });
      expect(await kernel.run(command({ houseId: ids.house, label: 'One' }))).toMatchObject({ replayed: true, body: first.body });
      await pool.query(`UPDATE uk_house_access SET active=false WHERE app_user_id=$1 AND house_id=$2`, [ids.uk, ids.house2]);
      await expect(kernel.run(command({ houseId: ids.house2, label: 'Two' }))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
      await pool.query(`UPDATE uk_house_access SET active=true WHERE app_user_id=$1 AND house_id=$2`, [ids.uk, ids.house2]);
      await expect(kernel.run(command({ houseId: ids.house2, label: 'Two' }))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', status: 409 });
      expect((await pool.query(`SELECT count(*)::int count FROM configuration_change WHERE command_id=$1`, [first.commandId])).rows[0].count).toBe(1);
    } finally { await database.destroy(); }
  }, 60_000);

  it('supports real MAX_IDENTITY principal without a synthetic AppUser', async () => {
    const { database, pool } = await createHarness();
    try {
      type Payload = { runId: string };
      type Body = { run_id: string };
      const plan: CommandPlan<Payload, { runId: string }, null, Body> = {
        requestedTarget: (payload) => ({ kind: 'NON_CASE', caseId: null, authorizationKey: payload.runId, authorizationContext: { runId: payload.runId } }),
        storedTarget: (execution) => {
          const body = execution.response_body as Body;
          return { kind: 'NON_CASE', caseId: null, authorizationKey: body.run_id, authorizationContext: { runId: body.run_id } };
        },
        authorize: async ({ transaction }) => {
          const identity = await transaction.selectFrom('max_identity').select('max_identity_id')
            .where('max_identity_id', '=', ids.maxIdentity).executeTakeFirst();
          if (!identity) throw new SemanticError('NOT_FOUND', 404);
        },
        terminalGuard: async () => {}, validateExactTargets: async () => {}, validateStateContext: async () => {},
        lockConfiguration: async () => {}, validateDomain: async () => {},
        writeDomain: async ({ transaction, payload }) => {
          await transaction.insertInto('demo_run').values({
            demo_run_id: payload.runId, scenario_key: 'tg012-test', status: 'ACTIVE',
            created_by_max_identity_id: ids.maxIdentity, notification_recipient_max_identity_id: ids.maxIdentity,
            primary_case_id: null, created_at: new Date(), archived_at: null,
          }).executeTakeFirstOrThrow();
          return null;
        },
        updateProjection: async () => {}, appendEvents: async () => {}, createNotificationIntents: async () => {},
        canonicalResponse: ({ payload }) => ({ status: 201, body: { run_id: payload.runId } }),
      };
      const kernel = new CommandTransactionKernel(database);
      const request = (runId: string) => ({
        authenticate: () => ({ type: 'MAX_IDENTITY' as const, maxIdentityId: ids.maxIdentity }),
        idempotencyKey: 'max-technical', commandType: 'START_DEMO_RUN',
        prepare: () => ({ payload: { runId }, requestHash: hash(runId) }), plan,
      });
      const first = await kernel.run(request(ids.demoRun));
      expect(first).toMatchObject({ status: 201, replayed: false, revision: null, body: { run_id: ids.demoRun } });
      expect(await kernel.run(request(ids.demoRun))).toMatchObject({ replayed: true, body: first.body, commandId: first.commandId });
      await expect(kernel.run(request(uuid(34)))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', status: 409 });
      const stored = (await pool.query(`SELECT principal_type,app_user_id,max_identity_id FROM command_execution WHERE idempotency_key='max-technical'`)).rows[0];
      expect(stored).toMatchObject({ principal_type: 'MAX_IDENTITY', app_user_id: null, max_identity_id: ids.maxIdentity });
    } finally { await database.destroy(); }
  }, 60_000);

  it('runs authentication before request preparation and rejects missing keys', async () => {
    const { database } = await createHarness();
    try {
      const calls: string[] = [];
      const kernel = new CommandTransactionKernel(database);
      const payload = { caseId: ids.case1, targetSelectionId: ids.selectionOld, newSelectionId: ids.selectionA, marker: 'order' };
      const request = input(ids.uk, 'order', payload);
      await kernel.run({ ...request, authenticate: () => { calls.push('authenticate'); return { type: 'APP_USER', appUserId: ids.uk }; }, prepare: () => { calls.push('prepare'); return { requestHash: hash('order'), payload }; } });
      expect(calls).toEqual(['authenticate', 'prepare']);
      await expect(kernel.run({ ...request, idempotencyKey: '', prepare: () => { throw new Error('MUST_NOT_PREPARE'); } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    } finally { await database.destroy(); }
  }, 60_000);
});

void CommandKernelError;
