import { beforeAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CASE_STATES, ResidentCaseSnapshotSchema, UkCaseSnapshotSchema, ContractorCaseSnapshotSchema,
  ContractorCandidatesResponseSchema, CaseListResponseSchema } from '@max-smart-city/contracts';
import { productFixture, ids } from './product-fixture.js';
import { registerExecutionRoutes } from '../src/modules/cases/commands/execution/index.js';
import { registerFeedbackResolutionRoutes } from '../src/modules/cases/commands/feedback-resolution/index.js';
import { registerReadModelRoutes } from '../src/modules/read-models/index.js';
const f=await productFixture();
registerExecutionRoutes(f.app,f.config,{database:f.db,nowSeconds:()=>Math.floor(Date.now()/1000)+30});
registerFeedbackResolutionRoutes(f.app,f.config,{database:f.db});
registerReadModelRoutes(f.app,f.config,{database:f.db});
const snapshots=new Map<string,Awaited<ReturnType<typeof f.app.inject>>>();
let current:{caseId:string;iterationId:string;assignmentId:string;resultId:string;feedbackId:string};
const get=(caseId:string,actor:string,suffix='')=>f.app.inject({url:`/api/v1/cases/${caseId}${suffix}`,headers:f.headers(actor)});
beforeAll(async()=>{
  const c=await f.create(); let assignmentId='',resultId='',feedbackId='';
  const capture=async(state:string)=>{for(const actor of ['resident','uk','admin','a'])snapshots.set(`${actor}:${state}`,await get(c.caseId,actor));};
  await capture('CREATED'); await f.json(c.caseId,'accept','uk',{}); await capture('ACCEPTED_BY_UK');
  const selected=await f.json(c.caseId,'select-contractor','uk',{iteration_id:c.iterationId,contractor_id:ids.contractorA});
  expect((await get(c.caseId,'a')).statusCode).toBe(404);
  const sent=await f.json(c.caseId,'send-assignment','uk',{iteration_id:c.iterationId,selection_id:selected.json().created.selection_id});
  assignmentId=sent.json().created.assignment_id;await capture('SENT_TO_CONTRACTOR');
  await f.json(c.caseId,'accept-assignment','a',{assignment_id:assignmentId});
  await f.multipart(`/api/v1/cases/${c.caseId}/comments`,'a',{body:'Нужен доступ вечером',clarification_request_id:null});
  await f.multipart(`/api/v1/cases/${c.caseId}/comments`,'resident',{body:'После 19 удобно',clarification_request_id:null});
  await capture('EXECUTION');
  const result=await f.json(c.caseId,'submit-result','a',{assignment_id:assignmentId,iteration_id:c.iterationId,description:'Первый результат',material_attachment_ids:[]});
  resultId=result.json().created.result_id;await capture('AWAITING_RESULT_CHECK');
  const feedback=await f.multipart(`/api/v1/cases/${c.caseId}/commands/resident-remark`,'resident',{result_id:resultId,iteration_id:c.iterationId,remark_text:'Стояк холодный'});
  feedbackId=feedback.json().created.feedback_id;await capture('REMARKS_REVIEW');
  const rework=await f.json(c.caseId,'return-to-rework','uk',{result_id:resultId,feedback_id:feedbackId});
  await capture('REWORK');
  const nextId=rework.json().created.iteration_id;
  const next=await f.json(c.caseId,'submit-result','a',{assignment_id:assignmentId,iteration_id:nextId,description:'Второй результат',material_attachment_ids:[]});
  const confirmed=await f.json(c.caseId,'resident-confirmation','resident',{result_id:next.json().created.result_id,iteration_id:nextId});
  await f.json(c.caseId,'complete','uk',{result_id:next.json().created.result_id,basis:{type:'RESIDENT_CONFIRMATION',feedback_id:confirmed.json().created.feedback_id}});
  await capture('COMPLETED');current={...c,assignmentId,resultId,feedbackId};
},60000);
const actions:Record<string,string[]>={
  'resident:CREATED':[],'resident:ACCEPTED_BY_UK':[],'resident:SENT_TO_CONTRACTOR':[],
  'resident:EXECUTION':['ADD_COMMENT'],'resident:AWAITING_RESULT_CHECK':['RESIDENT_CONFIRM','RESIDENT_REMARK'],
  'resident:REMARKS_REVIEW':[],'resident:REWORK':['ADD_COMMENT'],'resident:COMPLETED':[],
  'uk:CREATED':['ACCEPT_CASE'],'uk:ACCEPTED_BY_UK':['SELECT_CONTRACTOR','ADD_COMMENT'],
  'uk:SENT_TO_CONTRACTOR':['ADD_COMMENT'],'uk:EXECUTION':['ADD_COMMENT'],
  'uk:AWAITING_RESULT_CHECK':['RECORD_NO_RESIDENT_FEEDBACK','ADD_COMMENT'],
  'uk:REMARKS_REVIEW':['REQUEST_CLARIFICATION','RETURN_TO_REWORK','COMPLETE_WITH_EXPLANATION','ADD_COMMENT'],
  'uk:REWORK':['SELECT_CONTRACTOR','ADD_COMMENT'],'uk:COMPLETED':[],
  'a:SENT_TO_CONTRACTOR':['ACCEPT_ASSIGNMENT','REJECT_ASSIGNMENT'],
  'a:EXECUTION':['ADD_RESULT_MATERIAL','SUBMIT_RESULT','ADD_COMMENT'],'a:AWAITING_RESULT_CHECK':[],
  'a:REMARKS_REVIEW':[],'a:REWORK':['ADD_RESULT_MATERIAL','SUBMIT_RESULT','ADD_COMMENT'],
};
for(const actor of ['resident','uk','admin','a'])for(const state of CASE_STATES)it(`golden ${actor} × ${state}`,()=>{
  const response=snapshots.get(`${actor}:${state}`)!;
  const hidden=actor==='a'&&['CREATED','ACCEPTED_BY_UK','COMPLETED'].includes(state);
  expect(response.statusCode,response.body).toBe(hidden?404:200);if(hidden)return;
  const schema=actor==='resident'?ResidentCaseSnapshotSchema:actor==='a'?ContractorCaseSnapshotSchema:UkCaseSnapshotSchema;
  const snapshot=schema.parse(response.json()).case;
  expect(snapshot.state).toBe(state);expect(snapshot.allowed_actions.map(a=>a.code)).toEqual(actions[`${actor==='admin'?'uk':actor}:${state}`]);
  expect(snapshot.responsibility.text.length).toBeGreaterThan(5);
  expect(new Set(snapshot.activity.map(a=>a.event_id)).size).toBe(snapshot.activity.length);
  expect(snapshot.activity.map(a=>a.event_seq)).toEqual(snapshot.activity.map(a=>a.event_seq).sort((a,b)=>a-b));
  expect(snapshot.activity.every(a=>a.activity_id===a.event_id)).toBe(true);
  expect(response.body).not.toContain('actor_user_id');expect(response.body).not.toContain('delivery_chat_id');expect(response.body).not.toContain('presentation_data');
  if(actor!=='resident')expect(snapshot).not.toHaveProperty('actionable_clarification_requests');
  for(const action of snapshot.allowed_actions)for(const value of Object.values(action.target))expect(value).toMatch(/^[a-f0-9-]{36}$/);
  if(actor==='a'&&state==='REMARKS_REVIEW')expect(snapshot.resident_feedback).toBeNull();
});
it('one event enriches one activity item; historical Result survives N+1 and out-of-time timestamps do not reorder the feed',async()=>{
  const snapshot=ResidentCaseSnapshotSchema.parse((await get(current.caseId,'resident')).json()).case;
  expect(snapshot.activity.some((item,i)=>i>0&&item.occurred_at<snapshot.activity[i-1]!.occurred_at)).toBe(true);
  expect(snapshot.activity.filter(a=>a.domain.result).map(a=>a.domain.result!.description)).toEqual(['Первый результат','Второй результат']);
  expect(snapshot.activity.filter(a=>a.domain.comment).map(a=>a.domain.comment!.body)).toEqual(['Нужен доступ вечером','После 19 удобно']);
});
it('projects independently actionable requests and removes only the answered target',async()=>{
  const c=await f.execute();
  const result=await f.json(c.caseId,'submit-result','a',{assignment_id:c.assignmentId,iteration_id:c.iterationId,description:'Результат',material_attachment_ids:[]});
  const resultId=result.json().created.result_id;
  const remark=await f.json(c.caseId,'resident-remark','resident',{result_id:resultId,iteration_id:c.iterationId,remark_text:'Замечание'});
  const feedbackId=remark.json().created.feedback_id;
  const request=()=>f.json(c.caseId,'request-clarification','uk',{result_id:resultId,feedback_id:feedbackId,message:'Уточните'});
  const first=await request(),second=await request();
  const read=async()=>ResidentCaseSnapshotSchema.parse((await get(c.caseId,'resident')).json()).case;
  expect((await read()).actionable_clarification_requests.map(r=>r.clarification_request_id)).toEqual([first.json().created.comment_id,second.json().created.comment_id]);
  await f.multipart(`/api/v1/cases/${c.caseId}/comments`,'resident',{body:'Ответ',clarification_request_id:first.json().created.comment_id});
  expect((await read()).actionable_clarification_requests.map(r=>r.clarification_request_id)).toEqual([second.json().created.comment_id]);
  await f.json(c.caseId,'return-to-rework','uk',{result_id:resultId,feedback_id:feedbackId});
  expect((await read()).actionable_clarification_requests).toEqual([]);
});
it('candidates are own-org/active/current, exclude current A on rework, and do not confer selected-only access',async()=>{
  const c=await f.create();expect((await get(c.caseId,'uk','/contractor-candidates')).statusCode).toBe(409);
  await f.json(c.caseId,'accept','uk',{});
  const read=async()=>ContractorCandidatesResponseSchema.parse((await get(c.caseId,'uk','/contractor-candidates')).json());
  expect((await read()).items.map(x=>x.contractor_id).sort()).toEqual([ids.contractorA,ids.contractorB].sort());
  await f.db.updateTable('organization_contractor').set({active:false}).where('contractor_id','=',ids.contractorB).execute();
  expect((await read()).items.map(x=>x.contractor_id)).toEqual([ids.contractorA]);
  await f.db.updateTable('organization_contractor').set({active:true}).where('contractor_id','=',ids.contractorB).execute();
  await f.db.updateTable('contractor').set({active:false}).where('contractor_id','=',ids.contractorB).execute();
  expect((await read()).items.map(x=>x.contractor_id)).toEqual([ids.contractorA]);
  await f.db.updateTable('contractor').set({active:true}).where('contractor_id','=',ids.contractorB).execute();
  expect((await get(c.caseId,'resident','/contractor-candidates')).statusCode).toBe(403);
  expect((await f.app.inject({url:`/api/v1/cases/${c.caseId}/contractor-candidates`})).statusCode).toBe(401);
  // A still executes in this captured REWORK state. Exercise candidates on a fresh real transition.
  const d=await f.execute();const result=await f.json(d.caseId,'submit-result','a',{assignment_id:d.assignmentId,iteration_id:d.iterationId,description:'Готово',material_attachment_ids:[]});
  const remark=await f.json(d.caseId,'resident-remark','resident',{result_id:result.json().created.result_id,iteration_id:d.iterationId,remark_text:'Холодно'});
  const returned=await f.json(d.caseId,'return-to-rework','uk',{result_id:result.json().created.result_id,feedback_id:remark.json().created.feedback_id});
  const candidates=ContractorCandidatesResponseSchema.parse((await get(d.caseId,'uk','/contractor-candidates')).json());
  expect(candidates.items.map(x=>x.contractor_id)).toEqual([ids.contractorB]);expect(candidates.iteration_id).toBe(returned.json().created.iteration_id);
  await f.json(d.caseId,'select-contractor','uk',{contractor_id:ids.contractorB,iteration_id:candidates.iteration_id});
  expect((await get(d.caseId,'a')).statusCode).toBe(404);expect((await get(d.caseId,'b')).statusCode).toBe(404);
});
it('Resident never receives rejection details, rejected contractor loses list/detail, and house/tenant access is current',async()=>{
  const c=await f.create();await f.json(c.caseId,'accept','uk',{});
  const selected=await f.json(c.caseId,'select-contractor','uk',{iteration_id:c.iterationId,contractor_id:ids.contractorA});
  const sent=await f.json(c.caseId,'send-assignment','uk',{iteration_id:c.iterationId,selection_id:selected.json().created.selection_id});
  expect((await f.json(c.caseId,'reject-assignment','a',{assignment_id:sent.json().created.assignment_id,reason:'SECRET_INTERNAL_REJECTION'})).statusCode).toBe(200);
  expect((await get(c.caseId,'resident')).body).not.toContain('SECRET_INTERNAL_REJECTION');
  expect((await get(c.caseId,'uk')).body).toContain('SECRET_INTERNAL_REJECTION');
  expect((await get(c.caseId,'a')).statusCode).toBe(404);
  const list=CaseListResponseSchema.parse((await f.app.inject({url:'/api/v1/cases',headers:f.headers('a')})).json());
  expect(list.items.some(x=>x.case_id===c.caseId)).toBe(false);
  await f.db.updateTable('uk_house_access').set({active:false}).where('app_user_id','=',ids.ukEmployee).execute();
  expect((await get(c.caseId,'uk')).statusCode).toBe(404);expect((await get(c.caseId,'uk','/contractor-candidates')).statusCode).toBe(404);
  expect((await get(c.caseId,'admin')).statusCode).toBe(200);
  await f.db.updateTable('uk_house_access').set({active:true}).where('app_user_id','=',ids.ukEmployee).execute();
  const foreign=randomUUID();await f.db.insertInto('organization').values({organization_id:foreign,name:'Другой tenant',active:true,created_at:new Date(),updated_at:new Date()}).execute();
  await f.db.updateTable('user_role_binding').set({organization_id:foreign}).where('role_binding_id','=',ids.ukEmployeeRole).execute();
  expect((await get(c.caseId,'uk')).statusCode).toBe(404);expect((await get(c.caseId,'uk','/contractor-candidates')).statusCode).toBe(404);
  await f.db.updateTable('user_role_binding').set({organization_id:ids.organization}).where('role_binding_id','=',ids.ukEmployeeRole).execute();
});
it('list filtering/pagination respects active scope and canonical updated_at, and hidden guessed cases disclose nothing',async()=>{
  const list=(actor:string,query='')=>f.app.inject({url:`/api/v1/cases${query}`,headers:f.headers(actor)});
  const first=CaseListResponseSchema.parse((await list('resident','?limit=1')).json());expect(first.items).toHaveLength(1);expect(first.next_cursor).not.toBeNull();
  const second=CaseListResponseSchema.parse((await list('resident',`?limit=1&cursor=${encodeURIComponent(first.next_cursor!)}`)).json());
  expect(second.items[0]!.case_id).not.toBe(first.items[0]!.case_id);
  const complete=CaseListResponseSchema.parse((await list('resident','?state=COMPLETED')).json());expect(complete.items.every(c=>c.state==='COMPLETED')).toBe(true);
  await f.db.updateTable('resident_premises_access').set({active:false}).where('app_user_id','=',ids.resident).execute();
  expect((await get(current.caseId,'resident')).statusCode).toBe(404);expect(CaseListResponseSchema.parse((await list('resident')).json()).items).toEqual([]);
  await f.db.updateTable('resident_premises_access').set({active:true}).where('app_user_id','=',ids.resident).execute();
  expect((await get(randomUUID(),'uk')).statusCode).toBe(404);
  expect(CaseListResponseSchema.parse((await list('a')).json()).items.some(c=>c.case_id===current.caseId)).toBe(false);
});
