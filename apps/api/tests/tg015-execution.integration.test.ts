import { randomUUID, createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { productFixture, ids } from './product-fixture.js';
import { registerExecutionRoutes } from '../src/modules/cases/commands/execution/index.js';
import { registerAttachmentRoutes } from '../src/modules/attachments/index.js';

const f = await productFixture();
let seconds = 0;
registerExecutionRoutes(f.app, f.config, { database: f.db });
registerAttachmentRoutes(f.app, f.config, { database: f.db, nowSeconds: () => Math.floor(Date.now()/1000)+seconds });
describe('TG015 real PostgreSQL execution', () => {
  it('stores comment/material once and atomically submits immutable Result, links, event, intent, revision and execution', async () => {
    const c = await f.execute(); const key = randomUUID();
    const comment = () => f.multipart(`/api/v1/cases/${c.caseId}/comments`, 'a', { body: 'Работаем', clarification_request_id: null }, [{ bytes: Buffer.from('comment') }], key);
    const first = await comment(); expect(first.statusCode, first.body).toBe(200);
    expect((await comment()).json()).toEqual(first.json());
    const material = await f.multipart(`/api/v1/cases/${c.caseId}/result-materials`, 'a', { assignment_id: c.assignmentId, iteration_id: c.iterationId }, [{ field: 'file' }]);
    expect(material.statusCode, material.body).toBe(200);
    const attachmentId = material.json().created.attachment_id;
    const stored = await f.db.selectFrom('attachment').selectAll().where('attachment_id','=',attachmentId).executeTakeFirstOrThrow();
    expect(stored.sha256).toBe(createHash('sha256').update('proof').digest('hex'));
    const body = { assignment_id: c.assignmentId, iteration_id: c.iterationId, description: 'Готово', material_attachment_ids: [attachmentId] };
    const resultKey = randomUUID();
    const result = await f.json(c.caseId, 'submit-result', 'a', body, resultKey);
    expect(result.statusCode, result.body).toBe(200); expect(result.json().state).toBe('AWAITING_RESULT_CHECK');
    expect((await f.json(c.caseId, 'submit-result', 'a', body, resultKey)).json()).toEqual(result.json());
    expect((await f.json(c.caseId, 'submit-result', 'a', body)).statusCode).toBe(409);
    expect(await f.db.selectFrom('result').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(1);
    expect(await f.db.selectFrom('result_attachment').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(1);
    expect(await f.db.selectFrom('notification_intent').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(1);
    expect(await f.db.selectFrom('case_event').selectAll().where('case_id','=',c.caseId).where('event_type','=','EVT_008').execute()).toHaveLength(1);
    const row = await f.db.selectFrom('case_table').selectAll().where('case_id','=',c.caseId).executeTakeFirstOrThrow();
    expect(Number(row.revision)).toBe(result.json().revision); expect(row.current_result_id).toBe(result.json().created.result_id);
  });
  it('rolls back SubmitResult completely when recipient loses readiness', async () => {
    const c = await f.execute();
    const before = await f.db.selectFrom('case_table').selectAll().where('case_id','=',c.caseId).executeTakeFirstOrThrow();
    await f.db.updateTable('max_identity').set({ link_status:'UNLINKED', delivery_chat_id: null, delivery_chat_type: null }).where('app_user_id','=',ids.resident).execute();
    const result = await f.json(c.caseId, 'submit-result','a',{ assignment_id: c.assignmentId, iteration_id: c.iterationId, description:'Готово',material_attachment_ids:[] });
    expect(result.statusCode,result.body).toBe(409); expect(result.json().error.code).toBe('MAX_DELIVERY_TARGET_NOT_READY');
    expect(await f.db.selectFrom('result').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(0);
    expect(await f.db.selectFrom('notification_intent').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(0);
    expect(await f.db.selectFrom('case_event').selectAll().where('case_id','=',c.caseId).where('event_type','=','EVT_008').execute()).toHaveLength(0);
    expect(await f.db.selectFrom('case_table').selectAll().where('case_id','=',c.caseId).executeTakeFirstOrThrow()).toEqual(before);
    await f.db.updateTable('max_identity').set({ link_status:'LINKED_CONFIRMED', delivery_chat_id:'resident',delivery_chat_type:'DIALOG' }).where('app_user_id','=',ids.resident).execute();
  });
  it('reauthorizes capability consume, revokes A after select B, hides foreign subjects and expires tokens', async () => {
    const c = await f.execute();
    const mat = await f.multipart(`/api/v1/cases/${c.caseId}/result-materials`,'a',{assignment_id:c.assignmentId,iteration_id:c.iterationId},[{field:'file'}]);
    const id = mat.json().created.attachment_id;
    const direct = await f.app.inject({url:`/api/v1/attachments/${id}`,headers:f.headers('a')});
    expect(direct.statusCode,direct.body).toBe(200); expect(direct.body).toBe('proof');
    const mint = await f.app.inject({method:'POST',url:`/api/v1/attachments/${id}/download-capability`,headers:f.headers('a'),payload:{}});
    expect(mint.statusCode,mint.body).toBe(200);
    const path = new URL(mint.json().download_url).pathname;
    expect((await f.app.inject({url:path})).statusCode).toBe(200);
    expect((await f.app.inject({url:`/api/v1/attachments/${id}`,headers:f.headers('b')})).statusCode).toBe(404);
    seconds += 121; expect((await f.app.inject({url:path})).statusCode).toBe(404); seconds -= 121;
    // A→B is allowed only in REWORK. The following exact projection represents that canonical transition boundary.
    await f.db.updateTable('case_table').set({current_state:'REWORK'}).where('case_id','=',c.caseId).execute();
    const select = await f.json(c.caseId,'select-contractor','uk',{iteration_id:c.iterationId,contractor_id:ids.contractorB});
    expect(select.statusCode,select.body).toBe(200);
    expect((await f.app.inject({url:path})).statusCode).toBe(404);
    expect((await f.app.inject({url:`/api/v1/attachments/${id}`,headers:f.headers('a')})).statusCode).toBe(404);
  });
  it('rejects wrong MIME/count/size without materials', async () => {
    const c = await f.execute(); const path=`/api/v1/cases/${c.caseId}/result-materials`;
    for (const files of [[], [{field:'file',mime:'text/html'}], [{field:'file',bytes:Buffer.alloc(10*1024*1024+1)}]]) {
      expect((await f.multipart(path,'a',{assignment_id:c.assignmentId,iteration_id:c.iterationId},files)).statusCode).toBeGreaterThanOrEqual(400);
    }
    expect(await f.db.selectFrom('work_material_attachment').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(0);
  });
  it('serializes concurrent result submissions and enforces immutable PHOTO snapshot', async () => {
    const c=await f.execute();
    // Configuration changed before intake is captured as an immutable snapshot by CreateCase.
    await f.db.updateTable('category').set({result_requirement:'PHOTO'}).where('category_id','=',ids.categoryB).execute();
    const photoCase=await f.execute();
    await f.db.updateTable('category').set({result_requirement:'NONE'}).where('category_id','=',ids.categoryB).execute();
    const body={assignment_id:photoCase.assignmentId,iteration_id:photoCase.iterationId,description:'Готово',material_attachment_ids:[]};
    expect((await f.json(photoCase.caseId,'submit-result','a',body)).statusCode).toBe(422);
    const photo=await f.multipart(`/api/v1/cases/${photoCase.caseId}/result-materials`,'a',
      {assignment_id:photoCase.assignmentId,iteration_id:photoCase.iterationId},[{field:'file',mime:'image/png',name:'proof.png',bytes:Buffer.from('89504e470d0a1a0a','hex')}]);
    expect(photo.statusCode,photo.body).toBe(200);
    expect((await f.json(photoCase.caseId,'submit-result','a',{...body,material_attachment_ids:[photo.json().created.attachment_id]})).statusCode).toBe(200);
    const concurrent=await Promise.all([1,2].map(()=>f.json(c.caseId,'submit-result','a',{
      assignment_id:c.assignmentId,iteration_id:c.iterationId,description:'Готово',material_attachment_ids:[]})));
    expect(concurrent.map(r=>r.statusCode).sort()).toEqual([200,409]);
    expect(await f.db.selectFrom('notification_intent').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(1);
  });
});
