import { afterAll, beforeAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { provisionPostgres } from '../../../tests/support/postgres.mjs';
import type { Database } from '@max-smart-city/db';
import { loadConfig } from '../src/config/load-config.js';
import { createRuntimeLogger } from '../src/logging/logger.js';
import { buildApp } from '../src/app/app.js';
import { signSyntheticMaxInitData } from '../src/modules/auth/test-signing.fixture.js';
import { validPng } from './image-fixtures.js';
const seed=await import(new URL('../../../packages/db/src/seed/index.ts',import.meta.url).href);
const target=await provisionPostgres({adminUrl:process.env.TEST_POSTGRES_ADMIN_URL!,suite:'tg026'});
const pool=new Pool({connectionString:target.migrationUrl});
const db=new Kysely<Database>({dialect:new PostgresDialect({pool})});
const config=loadConfig({APP_ENV:'test',DEMO_MODE:'true',DATABASE_URL:target.migrationUrl,APP_SESSION_SECRET:'tg029-session'.padEnd(40,'x'),
  MAX_ADAPTER_MODE:'fake',TEST_AUTH_DEMO_PROFILE:'TEST_DEMO_E2E_V1',TEST_MAX_INIT_DATA_SIGNING_KEY:'a'.repeat(64),
  PUBLIC_APP_URL:'https://localhost/',PUBLIC_API_BASE_URL:'https://localhost/api/v1',BUILD_SHA:'a'.repeat(40)});
const logger=createRuntimeLogger(config,{write:()=>true});
let app:Awaited<ReturnType<typeof buildApp>>;
let token='';
beforeAll(async()=>{
  await target.migrate();await seed.seedDemoCatalog(pool);await seed.seedDemoCatalog(pool);
  app=await buildApp({config,logger:logger.loggerInstance,events:logger.events,database:db,
    readiness:{snapshot:()=>({databaseReachable:true,migrationsCurrent:true,applicationInitialized:true})}});
  await app.listen({host:'127.0.0.1',port:0});
  const auth=await app.inject({method:'POST',url:'/api/v1/auth/max',payload:{init_data:signSyntheticMaxInitData({profile:'TEST_DEMO_E2E_V1',signingKey:Buffer.from('a'.repeat(64),'hex'),nowSeconds:Math.floor(Date.now()/1000),userId:'29001',chatId:'29002'})}});
  expect(auth.statusCode,auth.body).toBe(200);token=auth.json().session_token;
},60000);
afterAll(async()=>{await app?.close();await db.destroy();await target.cleanup();});
const post=async(path:string,payload:unknown)=>{
  const result=await app.inject({method:'POST',url:path,payload,headers:{authorization:`Bearer ${token}`,'idempotency-key':randomUUID()}});
  expect(result.statusCode,result.body).toBeLessThan(300);return result.json();
};
const actor=async(role:string)=>{token=(await post('/api/v1/demo/session/actor',{role_view:role})).session_token;};
const command=(id:string,slug:string,body:unknown)=>post(`/api/v1/cases/${id}/commands/${slug}`,body);
const read=(id:string)=>app.inject({url:`/api/v1/cases/${id}`,headers:{authorization:`Bearer ${token}`}});
async function startCase(){
  const started=await post('/api/v1/demo/runs',{scenario_key:'primary-housing-demo'});token=started.session_token;
  await actor('RESIDENT');
  const boundary=`smoke-${randomUUID()}`;
  const payload=`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify({premises_id:seed.DEMO_IDS.premises,category_id:seed.DEMO_IDS.categoryA,description:'Стояк холодный, нужен доступ в квартиру'})}\r\n--${boundary}--\r\n`;
  const created=await app.inject({method:'POST',url:'/api/v1/cases',headers:{authorization:`Bearer ${token}`,'idempotency-key':randomUUID(),'content-type':`multipart/form-data; boundary=${boundary}`},payload});
  expect(created.statusCode,created.body).toBe(201);return {id:created.json().case_id as string,iteration:created.json().created.iteration_id as string};
}
async function assign(c:{id:string;iteration:string},contractor:string){
  const selected=await command(c.id,'select-contractor',{contractor_id:contractor,iteration_id:c.iteration});
  const sent=await command(c.id,'send-assignment',{selection_id:selected.created.selection_id,iteration_id:c.iteration});
  return sent.created.assignment_id as string;
}
async function submit(c:{id:string;iteration:string},assignment:string){
  const boundary=`photo-${randomUUID()}`;
  const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify({assignment_id:assignment,iteration_id:c.iteration})}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="result.png"\r\nContent-Type: image/png\r\n\r\n`),validPng,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const material=await app.inject({method:'POST',url:`/api/v1/cases/${c.id}/result-materials`,headers:{authorization:`Bearer ${token}`,'idempotency-key':randomUUID(),'content-type':`multipart/form-data; boundary=${boundary}`},payload});
  expect(material.statusCode,material.body).toBe(200);
  return command(c.id,'submit-result',{assignment_id:assignment,iteration_id:c.iteration,description:'Отопление восстановлено',material_attachment_ids:[material.json().created.attachment_id]});
}
let oldId='';
it('final deployed factory executes happy path and delivers transactional outbox outside the command',async()=>{
  const c=await startCase();await actor('UK_EMPLOYEE');await command(c.id,'accept',{});
  const a=await assign(c,seed.DEMO_IDS.contractorA);await actor('CONTRACTOR_EMPLOYEE');await command(c.id,'accept-assignment',{assignment_id:a});
  const result=await submit(c,a);await actor('RESIDENT');
  const confirmed=await command(c.id,'resident-confirmation',{result_id:result.created.result_id,iteration_id:c.iteration});
  expect(confirmed.state).toBe('AWAITING_RESULT_CHECK');await actor('UK_EMPLOYEE');
  expect((await command(c.id,'complete',{result_id:result.created.result_id,basis:{type:'RESIDENT_CONFIRMATION',feedback_id:confirmed.created.feedback_id}})).state).toBe('COMPLETED');
  const deadline=Date.now()+10000;
  for(;;){const intent=await db.selectFrom('notification_intent').selectAll().where('case_id','=',c.id).executeTakeFirstOrThrow();
    if(intent.status==='DELIVERED'){expect(intent.attempt_count).toBe(1);break;}if(Date.now()>deadline)throw new Error('OUTBOX_NOT_DELIVERED');await new Promise(r=>setTimeout(r,50));}
  oldId=c.id;expect((await read(c.id)).statusCode).toBe(200);
});
it('new DemoRun preserves old history; rework A→B revokes A and B finishes the same Case',async()=>{
  const before=await db.selectFrom('case_event').selectAll().where('case_id','=',oldId).orderBy('event_seq').execute();
  const c=await startCase();expect(c.id).not.toBe(oldId);
  expect((await read(oldId)).statusCode).toBe(404);
  expect(await db.selectFrom('case_event').selectAll().where('case_id','=',oldId).orderBy('event_seq').execute()).toEqual(before);
  await actor('UK_EMPLOYEE');await command(c.id,'accept',{});const a=await assign(c,seed.DEMO_IDS.contractorA);
  await actor('CONTRACTOR_EMPLOYEE');const oldAToken=token;await command(c.id,'accept-assignment',{assignment_id:a});
  const first=await submit(c,a);const oldResult=await db.selectFrom('result').selectAll().where('result_id','=',first.created.result_id).executeTakeFirstOrThrow();
  await actor('RESIDENT');const remark=await command(c.id,'resident-remark',{result_id:first.created.result_id,iteration_id:c.iteration,remark_text:'Стояк ещё холодный'});
  await actor('UK_EMPLOYEE');const rework=await command(c.id,'return-to-rework',{result_id:first.created.result_id,feedback_id:remark.created.feedback_id});
  c.iteration=rework.created.iteration_id;expect(rework.created.iteration_no).toBe(2);
  const b=await assign(c,seed.DEMO_IDS.contractorB);
  expect((await app.inject({url:`/api/v1/cases/${c.id}`,headers:{authorization:`Bearer ${oldAToken}`}})).statusCode).toBe(404);
  await actor('CONTRACTOR_EMPLOYEE');await command(c.id,'accept-assignment',{assignment_id:b});const next=await submit(c,b);
  await actor('RESIDENT');const confirmed=await command(c.id,'resident-confirmation',{result_id:next.created.result_id,iteration_id:c.iteration});
  await actor('UK_EMPLOYEE');expect((await command(c.id,'complete',{result_id:next.created.result_id,basis:{type:'RESIDENT_CONFIRMATION',feedback_id:confirmed.created.feedback_id}})).state).toBe('COMPLETED');
  expect(await db.selectFrom('result').selectAll().where('result_id','=',first.created.result_id).executeTakeFirstOrThrow()).toEqual(oldResult);
  expect((await read(c.id)).json().case.activity.filter((e:{domain:{result:unknown}})=>e.domain.result)).toHaveLength(2);
},30000);
it('rejection A→B continues, with A absent from LIVE reads',async()=>{
  const c=await startCase();await actor('UK_EMPLOYEE');await command(c.id,'accept',{});const a=await assign(c,seed.DEMO_IDS.contractorA);
  await actor('CONTRACTOR_EMPLOYEE');const aToken=token;await command(c.id,'reject-assignment',{assignment_id:a,reason:'Нет возможности приехать'});
  await actor('UK_EMPLOYEE');const b=await assign(c,seed.DEMO_IDS.contractorB);
  expect((await app.inject({url:`/api/v1/cases/${c.id}`,headers:{authorization:`Bearer ${aToken}`}})).statusCode).toBe(404);
  await actor('CONTRACTOR_EMPLOYEE');await command(c.id,'accept-assignment',{assignment_id:b});expect((await submit(c,b)).state).toBe('AWAITING_RESULT_CHECK');
});
it('same-executor rework preserves accepted A; retry creates no N+2',async()=>{
  const c=await startCase();await actor('UK_EMPLOYEE');await command(c.id,'accept',{});
  const a=await assign(c,seed.DEMO_IDS.contractorA);await actor('CONTRACTOR_EMPLOYEE');
  await command(c.id,'accept-assignment',{assignment_id:a});const first=await submit(c,a);
  const assignment=await db.selectFrom('assignment').selectAll().where('assignment_id','=',a).executeTakeFirstOrThrow();
  await actor('RESIDENT');const remark=await command(c.id,'resident-remark',{result_id:first.created.result_id,iteration_id:c.iteration,remark_text:'Нужна повторная проверка'});
  await actor('UK_EMPLOYEE');const key=randomUUID(),payload={result_id:first.created.result_id,feedback_id:remark.created.feedback_id};
  const request={method:'POST' as const,url:`/api/v1/cases/${c.id}/commands/return-to-rework`,payload,headers:{authorization:`Bearer ${token}`,'idempotency-key':key}};
  const returned=await app.inject(request);expect(returned.statusCode,returned.body).toBe(200);
  const retry=await app.inject(request);expect(retry.statusCode,retry.body).toBe(200);expect(retry.json()).toEqual(returned.json());
  c.iteration=returned.json().created.iteration_id;
  await actor('CONTRACTOR_EMPLOYEE');expect((await read(c.id)).statusCode).toBe(200);
  const next=await submit(c,a);await actor('RESIDENT');
  const confirmed=await command(c.id,'resident-confirmation',{result_id:next.created.result_id,iteration_id:c.iteration});
  await actor('UK_EMPLOYEE');await command(c.id,'complete',{result_id:next.created.result_id,basis:{type:'RESIDENT_CONFIRMATION',feedback_id:confirmed.created.feedback_id}});
  expect(await db.selectFrom('assignment').selectAll().where('assignment_id','=',a).executeTakeFirstOrThrow()).toEqual(assignment);
  expect(await db.selectFrom('case_iteration').select('iteration_no').where('case_id','=',c.id).orderBy('iteration_no').execute()).toEqual([{iteration_no:1},{iteration_no:2}]);
});
