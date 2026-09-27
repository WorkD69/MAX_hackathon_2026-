import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { migrateToLatest } from '@max-smart-city/db';
import type { Database } from '@max-smart-city/db';
import type { SessionClaims } from '../src/modules/auth/session-token.js';
import { AuthorizationPolicy } from '../src/modules/authorization/policy.js';
import { createTransactionAuthorizationRepository } from '../src/modules/commands/kernel/authorization.js';

const url = process.env.TG015_TEST_DATABASE_URL;
if (!url) throw new Error('MISSING_TG015_TEST_DATABASE_URL');
const parsed = new URL(url);
const databaseName = decodeURIComponent(parsed.pathname.slice(1));
if (!databaseName.endsWith('_tg015_auth_test')) throw new Error('UNSAFE_TG015_TEST_DATABASE');
const schema = 'tg015_attachment_auth';
const id = (n: number) => `15000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const ids = {
  org: id(1), foreignOrg: id(2), house: id(3), premises: id(4), category: id(5),
  contractorA: id(6), contractorB: id(7), resident: id(8), uk: id(9), foreignUk: id(10),
  executorA: id(11), executorB: id(12), case: id(13), iteration1: id(14), iteration2: id(15),
  selectionA: id(16), selectionB: id(17), assignmentA: id(18), assignmentB: id(19),
  result: id(20), remark: id(21), commentA: id(22), commentB: id(23),
  commentResident: id(24), commentUk: id(25), feedbackFile: id(26),
  ownFile: id(27), oldFile: id(28), residentFile: id(29), ukFile: id(30),
};
const actors = [
  { user: ids.resident, role: 'RESIDENT', binding: id(101), max: id(201), org: null, contractor: null },
  { user: ids.uk, role: 'UK_EMPLOYEE', binding: id(102), max: id(202), org: ids.org, contractor: null },
  { user: ids.foreignUk, role: 'UK_EMPLOYEE', binding: id(103), max: id(203), org: ids.foreignOrg, contractor: null },
  { user: ids.executorA, role: 'CONTRACTOR_EMPLOYEE', binding: id(104), max: id(204), org: null, contractor: ids.contractorA },
  { user: ids.executorB, role: 'CONTRACTOR_EMPLOYEE', binding: id(105), max: id(205), org: null, contractor: ids.contractorB },
] as const;
const claim = (actor: typeof actors[number]): SessionClaims => ({
  schema_version: 1, sid: id(300), max_identity_id: actor.max, app_user_id: actor.user,
  role_binding_id: actor.binding, role: actor.role, demo_mode: false, demo_run_id: null,
  real_display_name: 'Actor', iat: 1, exp: 100,
});
const poolConfig = (searchPath: string) => ({
  host: parsed.hostname, port: parsed.port ? Number(parsed.port) : 5432,
  user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
  database: databaseName, options: `-c search_path=${searchPath}`,
});
let pool: Pool;
let db: Kysely<Database>;
let admin: Pool;

beforeAll(async () => {
  admin = new Pool(poolConfig('public'));
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new Pool(poolConfig(schema));
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  await migrateToLatest(db);
  await pool.query(`INSERT INTO organization VALUES ($1,'Org',true,now(),now()),($2,'Foreign',true,now(),now())`, [ids.org, ids.foreignOrg]);
  await pool.query(`INSERT INTO house VALUES ($1,$2,'House',NULL,true,now(),now())`, [ids.house, ids.org]);
  await pool.query(`INSERT INTO premises VALUES ($1,$2,'1',true,now(),now())`, [ids.premises, ids.house]);
  await pool.query(`INSERT INTO category (category_id,organization_id,name,requires_premises_access,result_requirement,active,config_revision,created_at,updated_at) VALUES ($1,$2,'Category',true,'PHOTO',true,1,now(),now())`, [ids.category, ids.org]);
  await pool.query(`INSERT INTO contractor VALUES ($1,'A',true,now(),now()),($2,'B',true,now(),now())`, [ids.contractorA, ids.contractorB]);
  await pool.query(`INSERT INTO organization_contractor VALUES ($1,$2,true,now()),($1,$3,true,now())`, [ids.org, ids.contractorA, ids.contractorB]);
  for (const actor of actors) {
    await pool.query(`INSERT INTO app_user VALUES ($1,'Actor',false,true,now(),now())`, [actor.user]);
    await pool.query(`INSERT INTO max_identity VALUES ($1,NULL,NULL,NULL,NULL,'UNLINKED',$2,now(),now(),NULL)`, [actor.max, actor.user]);
    await pool.query(`INSERT INTO user_role_binding VALUES ($1,$2,$3,$4,$5,true,now())`, [actor.binding, actor.user, actor.role, actor.org, actor.contractor]);
  }
  await pool.query(`INSERT INTO resident_premises_access VALUES ($1,$2,true,now())`, [ids.resident, ids.premises]);
  await pool.query(`INSERT INTO uk_house_access VALUES ($1,$2,true,now())`, [ids.uk, ids.house]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO case_table (case_id,organization_id,house_id,premises_id,resident_user_id,category_id,description,created_at,updated_at,created_by_user_id,category_name_snapshot,requires_access_snapshot,result_requirement_snapshot,house_address_snapshot,premises_label_snapshot,current_state,current_iteration_id,revision,last_event_seq) VALUES ($1,$2,$3,$4,$5,$6,'Case',now(),now(),$5,'Category',true,'PHOTO','House','1','REWORK',$7,1,0)`, [ids.case, ids.org, ids.house, ids.premises, ids.resident, ids.category, ids.iteration2]);
    await client.query(`INSERT INTO case_iteration (iteration_id,case_id,iteration_no,start_reason,started_at,started_by_user_id) VALUES ($1,$2,1,'INITIAL',now(),$3)`, [ids.iteration1, ids.case, ids.resident]);
    await client.query(`INSERT INTO contractor_selection (selection_id,case_id,created_iteration_id,contractor_id,selected_by_user_id,selected_at,selection_no) VALUES ($1,$2,$3,$4,$5,now(),1),($6,$2,$3,$7,$5,now(),2)`, [ids.selectionA, ids.case, ids.iteration1, ids.contractorA, ids.uk, ids.selectionB, ids.contractorB]);
    await client.query(`INSERT INTO assignment (assignment_id,case_id,selection_id,contractor_id,created_iteration_id,assignment_no,sent_by_user_id,sent_at,decision_status,accepted_at,accepted_by_user_id) VALUES ($1,$2,$3,$4,$5,1,$6,now(),'ACCEPTED',now(),$7),($8,$2,$9,$10,$5,2,$6,now(),'ACCEPTED',now(),$11)`, [ids.assignmentA, ids.case, ids.selectionA, ids.contractorA, ids.iteration1, ids.uk, ids.executorA, ids.assignmentB, ids.selectionB, ids.contractorB, ids.executorB]);
    await client.query(`INSERT INTO result VALUES ($1,$2,$3,$4,$5,$6,'Done',now())`, [ids.result, ids.case, ids.iteration1, ids.assignmentA, ids.contractorA, ids.executorA]);
    await client.query(`INSERT INTO resident_feedback VALUES ($1,$2,$3,$4,$5,'REMARK','Fix again',now())`, [ids.remark, ids.case, ids.iteration1, ids.result, ids.resident]);
    await client.query(`INSERT INTO case_iteration (iteration_id,case_id,iteration_no,start_reason,started_at,started_by_user_id,source_result_id,source_feedback_id) VALUES ($1,$2,2,'REWORK',now(),$3,$4,$5)`, [ids.iteration2, ids.case, ids.uk, ids.result, ids.remark]);
    await client.query(`UPDATE case_table SET current_selection_id=$2,current_assignment_id=$3,current_executor_contractor_id=$4 WHERE case_id=$1`, [ids.case, ids.selectionA, ids.assignmentA, ids.contractorA]);
    for (const [commentId, iterationId, actor, role, contractor] of [
      [ids.commentA, ids.iteration2, ids.executorA, 'CONTRACTOR_EMPLOYEE', ids.contractorA],
      [ids.commentB, ids.iteration1, ids.executorB, 'CONTRACTOR_EMPLOYEE', ids.contractorB],
      [ids.commentResident, ids.iteration2, ids.resident, 'RESIDENT', null],
      [ids.commentUk, ids.iteration2, ids.uk, 'UK_EMPLOYEE', null],
    ] as const) {
      await client.query(`INSERT INTO comment (comment_id,case_id,iteration_id,author_user_id,actor_role_snapshot,actor_contractor_id,comment_kind,body,created_at) VALUES ($1,$2,$3,$4,$5,$6,'WORKING','Work',now())`, [commentId, ids.case, iterationId, actor, role, contractor]);
    }
    for (const [fileId, uploadedBy] of [[ids.feedbackFile, ids.resident], [ids.ownFile, ids.executorA],
      [ids.oldFile, ids.executorB], [ids.residentFile, ids.resident], [ids.ukFile, ids.uk]] as const) {
      await client.query(`INSERT INTO attachment VALUES ($1,$2,$3,'file.txt','text/plain',1,$4,decode('78','hex'),now())`, [fileId, ids.case, uploadedBy, '0'.repeat(64)]);
    }
    await client.query(`INSERT INTO feedback_attachment VALUES ($1,$2,$3)`, [ids.case, ids.remark, ids.feedbackFile]);
    for (const [commentId, fileId] of [[ids.commentA, ids.ownFile], [ids.commentB, ids.oldFile],
      [ids.commentResident, ids.residentFile], [ids.commentUk, ids.ukFile]] as const) {
      await client.query(`INSERT INTO comment_attachment VALUES ($1,$2,$3)`, [ids.case, commentId, fileId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});

afterAll(async () => {
  await db?.destroy();
  await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin?.end();
});

const withPolicy = (run: (auth: AuthorizationPolicy) => Promise<void>) =>
  db.transaction().execute(async (transaction) =>
    run(new AuthorizationPolicy(createTransactionAuthorizationRepository(transaction))));
const hidden = { code: 'NOT_FOUND' };

describe('TG-012 real PostgreSQL attachment classifier and TG-011 policy', () => {
  it('classifies feedback and parent comments with typed context', async () => {
    await db.transaction().execute(async (transaction) => {
      const repository = createTransactionAuthorizationRepository(transaction);
      expect(await repository.attachmentById(ids.feedbackFile)).toMatchObject({ kind: 'FEEDBACK', feedback_id: ids.remark,
        feedback_type: 'REMARK', feedback_result_id: ids.result, feedback_iteration_id: ids.iteration1 });
      expect(await repository.attachmentById(ids.ownFile)).toMatchObject({ kind: 'COMMENT', comment_id: ids.commentA,
        comment_iteration_id: ids.iteration2, actor_contractor_id: ids.contractorA });
    });
  });
  it('keeps current remark attachment with UK and Resident during REMARKS_REVIEW', async () => {
    await db.updateTable('case_table').set({ current_state: 'REMARKS_REVIEW',
      current_iteration_id: ids.iteration1, current_result_id: ids.result })
      .where('case_id', '=', ids.case).execute();
    try {
      await withPolicy(async (auth) => {
        await expect(auth.attachment(claim(actors[3]), ids.feedbackFile)).rejects.toMatchObject(hidden);
        expect((await auth.attachment(claim(actors[0]), ids.feedbackFile)).access).toBe('RESIDENT');
        expect((await auth.attachment(claim(actors[1]), ids.feedbackFile)).access).toBe('UK');
      });
    } finally {
      await db.updateTable('case_table').set({ current_state: 'REWORK',
        current_iteration_id: ids.iteration2, current_result_id: null })
        .where('case_id', '=', ids.case).execute();
    }
  });
  it('allows parent-visible feedback and common work comments; hides foreign scope and unrelated history', async () => {
    await withPolicy(async (auth) => {
      expect((await auth.attachment(claim(actors[0]), ids.feedbackFile)).access).toBe('RESIDENT');
      expect((await auth.attachment(claim(actors[1]), ids.feedbackFile)).access).toBe('UK');
      await expect(auth.attachment(claim(actors[2]), ids.feedbackFile)).rejects.toMatchObject(hidden);
      for (const file of [ids.feedbackFile, ids.ownFile, ids.residentFile, ids.ukFile]) {
        expect((await auth.attachment(claim(actors[3]), file)).access).toBe('EXECUTOR');
      }
      await expect(auth.attachment(claim(actors[3]), ids.oldFile)).rejects.toMatchObject(hidden);
    });
  });
  it('policy recheck denies old executor after reassignment', async () => {
    const oldExecutor = claim(actors[3]);
    await withPolicy(async (auth) => { await auth.attachment(oldExecutor, ids.feedbackFile); });
    await db.updateTable('case_table').set({ current_selection_id: ids.selectionB,
      current_assignment_id: ids.assignmentB, current_executor_contractor_id: ids.contractorB })
      .where('case_id', '=', ids.case).execute();
    await withPolicy(async (auth) => {
      await expect(auth.attachment(oldExecutor, ids.feedbackFile)).rejects.toMatchObject(hidden);
      await expect(auth.attachment(oldExecutor, ids.ownFile)).rejects.toMatchObject(hidden);
      expect((await auth.attachment(claim(actors[4]), ids.ukFile)).access).toBe('EXECUTOR');
    });
  });
});
