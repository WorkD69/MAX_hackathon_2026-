import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import { productFixture } from './product-fixture.js';
import { registerExecutionRoutes } from '../src/modules/cases/commands/execution/index.js';
import { registerFeedbackResolutionRoutes } from '../src/modules/cases/commands/feedback-resolution/index.js';
const f=await productFixture();
registerExecutionRoutes(f.app,f.config,{database:f.db});
registerFeedbackResolutionRoutes(f.app,f.config,{database:f.db});
async function result() {
  const c=await f.execute();
  const response=await f.json(c.caseId,'submit-result','a',{assignment_id:c.assignmentId,iteration_id:c.iterationId,description:'Готово',material_attachment_ids:[]});
  expect(response.statusCode,response.body).toBe(200);
  return {...c,resultId:response.json().created.result_id as string};
}
async function remark() {
  const c=await result();
  const response=await f.multipart(`/api/v1/cases/${c.caseId}/commands/resident-remark`,'resident',{
    result_id:c.resultId,iteration_id:c.iterationId,remark_text:'Осталась течь'},[{bytes:Buffer.from('remark')}]);
  expect(response.statusCode,response.body).toBe(200);
  return {...c,feedbackId:response.json().created.feedback_id as string};
}
it('confirmation is formal feedback only; UK completes and terminal commands have no effects',async()=>{
  const c=await result(),key=randomUUID();
  const body={result_id:c.resultId,iteration_id:c.iterationId};
  const confirm=await f.json(c.caseId,'resident-confirmation','resident',body,key);
  expect(confirm.statusCode,confirm.body).toBe(200);expect(confirm.json().state).toBe('AWAITING_RESULT_CHECK');
  expect((await f.json(c.caseId,'resident-confirmation','resident',body,key)).json()).toEqual(confirm.json());
  const duplicate=await f.json(c.caseId,'resident-confirmation','resident',body);
  expect(duplicate.statusCode).toBe(409);expect(duplicate.json().error.code).toBe('FEEDBACK_ALREADY_SUBMITTED');
  const completion={result_id:c.resultId,basis:{type:'RESIDENT_CONFIRMATION',feedback_id:confirm.json().created.feedback_id}};
  expect((await f.json(c.caseId,'complete','resident',completion)).statusCode).toBe(403);
  const done=await f.json(c.caseId,'complete','uk',completion);
  expect(done.statusCode,done.body).toBe(200);expect(done.json().state).toBe('COMPLETED');
  expect((await f.json(c.caseId,'complete','uk',completion)).statusCode).toBe(409);
  expect(await f.db.selectFrom('case_event').selectAll().where('case_id','=',c.caseId).where('event_type','=','EVT_016').execute()).toHaveLength(1);
});
it('multiple clarification requests have independent exact first replies and stale targets are rejected',async()=>{
  const c=await remark();
  const request=()=>f.json(c.caseId,'request-clarification','uk',{result_id:c.resultId,feedback_id:c.feedbackId,message:'Где течёт?'});
  const first=await request(),second=await request();expect(first.statusCode,first.body).toBe(200);expect(second.statusCode).toBe(200);
  const firstId=first.json().created.comment_id,secondId=second.json().created.comment_id;
  const reply=(id:string)=>f.multipart(`/api/v1/cases/${c.caseId}/comments`,'resident',{body:'Под раковиной',clarification_request_id:id});
  expect((await reply(firstId)).statusCode).toBe(200);
  const again=await reply(firstId);expect(again.statusCode).toBe(409);expect(again.json().error.code).toBe('CLARIFICATION_CONTEXT_REQUIRED');
  expect((await request()).statusCode).toBe(200);
  expect((await reply(secondId)).statusCode).toBe(200);
  const comments=await f.db.selectFrom('comment').selectAll().where('case_id','=',c.caseId).execute();
  expect(comments.filter(r=>r.in_reply_to_comment_id===firstId)).toHaveLength(1);
  expect(comments.filter(r=>r.in_reply_to_comment_id===secondId)).toHaveLength(1);
  const rework=await f.json(c.caseId,'return-to-rework','uk',{result_id:c.resultId,feedback_id:c.feedbackId});
  expect(rework.statusCode,rework.body).toBe(200);
  const stale=await reply(firstId);expect(stale.statusCode).toBe(409);expect(stale.json().error.code).toBe('CLARIFICATION_CONTEXT_REQUIRED');
  expect((await f.multipart(`/api/v1/cases/${randomUUID()}/comments`,'resident',{body:'reply',clarification_request_id:firstId})).statusCode).toBe(404);
});
it('rework creates N+1 once, keeps executor A, old Result immutable, and permits a new Result without reacceptance',async()=>{
  const c=await remark();
  const old=await f.db.selectFrom('result').selectAll().where('result_id','=',c.resultId).executeTakeFirstOrThrow();
  const key=randomUUID(),body={result_id:c.resultId,feedback_id:c.feedbackId};
  const response=await f.json(c.caseId,'return-to-rework','uk',body,key);
  expect(response.statusCode,response.body).toBe(200);expect(response.json().created.iteration_no).toBe(2);expect(response.json().event_ids).toHaveLength(2);
  expect((await f.json(c.caseId,'return-to-rework','uk',body,key)).json()).toEqual(response.json());
  expect((await f.json(c.caseId,'return-to-rework','uk',body)).statusCode).toBe(409);
  const next=await f.json(c.caseId,'submit-result','a',{assignment_id:c.assignmentId,iteration_id:response.json().created.iteration_id,description:'Повторно готово',material_attachment_ids:[]});
  expect(next.statusCode,next.body).toBe(200);
  expect(await f.db.selectFrom('result').selectAll().where('result_id','=',c.resultId).executeTakeFirstOrThrow()).toEqual(old);
  expect(await f.db.selectFrom('case_iteration').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(2);
  const events=await f.db.selectFrom('case_event').selectAll().where('case_id','=',c.caseId).where('event_type','in',['EVT_013','EVT_014']).orderBy('event_seq').execute();
  expect(events).toHaveLength(2);expect(events[1]!.caused_by_event_id).toBe(events[0]!.event_id);expect(events[1]!.derived).toBe(true);
});
it('no-feedback recording is explicit/unique and late feedback invalidates its completion basis',async()=>{
  const c=await result();
  const body={result_id:c.resultId,iteration_id:c.iterationId,basis_confirmed:true,basis_note:'Связались вручную'};
  const recorded=await f.json(c.caseId,'record-no-resident-feedback','uk',body);
  expect(recorded.statusCode,recorded.body).toBe(200);expect(recorded.json().state).toBe('AWAITING_RESULT_CHECK');
  const duplicate=await f.json(c.caseId,'record-no-resident-feedback','uk',body);
  expect(duplicate.statusCode).toBe(409);expect(duplicate.json().error.code).toBe('NO_FEEDBACK_ALREADY_RECORDED');
  expect((await f.json(c.caseId,'resident-confirmation','resident',{result_id:c.resultId,iteration_id:c.iterationId})).statusCode).toBe(200);
  const invalid=await f.json(c.caseId,'complete','uk',{result_id:c.resultId,basis:{type:'NO_RESIDENT_FEEDBACK',event_id:recorded.json().no_feedback_event_id,completion_basis:{confirmed:true,process_reference:'Процесс УК'}}});
  expect(invalid.statusCode).toBe(409);expect(invalid.json().error.code).toBe('COMPLETION_BASIS_INVALID');
});
it('manual no-feedback completion requires a separate assertion and disputed completion emits EVT017 only',async()=>{
  const c=await result();
  const recorded=await f.json(c.caseId,'record-no-resident-feedback','uk',{result_id:c.resultId,iteration_id:c.iterationId,basis_confirmed:true,basis_note:'Запись'});
  const basis={type:'NO_RESIDENT_FEEDBACK',event_id:recorded.json().no_feedback_event_id};
  expect((await f.json(c.caseId,'complete','uk',{result_id:c.resultId,basis})).statusCode).toBe(400);
  expect((await f.json(c.caseId,'complete','uk',{result_id:c.resultId,basis:{...basis,completion_basis:{confirmed:true,process_reference:'Отдельное основание'}}})).json().state).toBe('COMPLETED');
  const disputed=await remark();
  const done=await f.json(disputed.caseId,'complete-with-explanation','uk',{result_id:disputed.resultId,feedback_id:disputed.feedbackId,explanation:'Проверено УК'});
  expect(done.statusCode,done.body).toBe(200);
  const terminal=await f.db.selectFrom('case_event').selectAll().where('case_id','=',disputed.caseId).where('event_type','in',['EVT_016','EVT_017']).execute();
  expect(terminal.map(e=>e.event_type)).toEqual(['EVT_017']);
});
it('concurrent confirmation/remark and rework/disputed completion commit exactly one winner',async()=>{
  const c=await result();
  const feedback=await Promise.all([
    f.json(c.caseId,'resident-confirmation','resident',{result_id:c.resultId,iteration_id:c.iterationId}),
    f.multipart(`/api/v1/cases/${c.caseId}/commands/resident-remark`,'resident',{result_id:c.resultId,iteration_id:c.iterationId,remark_text:'Течёт'})]);
  expect(feedback.map(r=>r.statusCode).sort()).toEqual([200,409]);
  expect(await f.db.selectFrom('resident_feedback').selectAll().where('case_id','=',c.caseId).execute()).toHaveLength(1);
  const d=await remark(),body={result_id:d.resultId,feedback_id:d.feedbackId};
  const resolution=await Promise.all([f.json(d.caseId,'return-to-rework','uk',body),f.json(d.caseId,'complete-with-explanation','uk',{...body,explanation:'Проверка УК'})]);
  expect(resolution.map(r=>r.statusCode).sort()).toEqual([200,409]);
});
