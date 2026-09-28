import { CaseListQuerySchema, CaseListResponseSchema, ResidentCaseSnapshotSchema, UkCaseSnapshotSchema,
  ContractorCaseSnapshotSchema, ContractorCandidatesResponseSchema } from '@max-smart-city/contracts';
import type { DatabaseConnection, DatabaseTransaction, LockedCase, CaseEventTable } from '@max-smart-city/db';
import type { Selectable } from 'kysely';
import type { RuntimeConfig } from '../../config/types.js';
import { SessionError, verifySession } from '../auth/session-token.js';
import { AuthorizationError, AuthorizationPolicy } from '../authorization/policy.js';
import { createTransactionAuthorizationRepository } from '../commands/kernel/authorization.js';
import { executionSnapshot } from '../cases/commands/execution/context.js';
import { IntakeError } from '../cases/commands/intake-assignment/options.js';
import { allowedActions, responsibility } from './actions.js';

const eventLabels:Record<CaseEventTable['event_type'],string>={
  EVT_001:'Случай создан',EVT_002:'УК приняла случай',EVT_003:'УК выбрала подрядчика',
  EVT_004:'Задание передано подрядчику',EVT_005:'Подрядчик принял работу',EVT_006:'УК выбирает другого исполнителя',
  EVT_007:'Комментарий',EVT_008:'Подрядчик сообщил о выполнении',EVT_009:'Добавлен материал работы',
  EVT_010:'Житель подтвердил результат',EVT_011:'Житель оставил замечание',EVT_012:'УК запросила уточнение',
  EVT_013:'УК вернула работу на доработку',EVT_014:'Началась новая итерация',EVT_015:'УК зафиксировала отсутствие ответа',
  EVT_016:'УК завершила случай',EVT_017:'УК завершила случай с объяснением',
};
export class CaseReadService {
  constructor(private readonly db:DatabaseConnection,private readonly config:RuntimeConfig,
    private readonly seconds:()=>number=()=>Math.floor(Date.now()/1000)) {}
  private claims(token:string) {
    const claims=verifySession(token,this.config,this.seconds());
    if(claims.demo_mode!==this.config.DEMO_MODE)throw new SessionError('SESSION_EXPIRED');return claims;
  }
  async list(token:string,rawQuery:unknown) {
    const claims=this.claims(token),parsed=CaseListQuerySchema.safeParse(rawQuery);
    if(!parsed.success)throw new IntakeError('VALIDATION_FAILED',400);
    const query=parsed.data;
    let cursor:{updated_at:string;case_id:string}|undefined;
    if(query.cursor)try {
      cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8')) as typeof cursor;
      if(!cursor||!Number.isFinite(Date.parse(cursor.updated_at))||!/^[0-9a-f-]{36}$/.test(cursor.case_id))throw new Error();
    }catch {throw new IntakeError('VALIDATION_FAILED',400);}
    return this.db.transaction().setIsolationLevel('repeatable read').execute(async tx=>{
      const repository=createTransactionAuthorizationRepository(tx),policy=new AuthorizationPolicy(repository);
      const scope=await policy.listScope(claims);
      let rowsQuery=tx.selectFrom('case_table as c').selectAll('c');
      rowsQuery=scope.demo_run_id?rowsQuery.where('c.demo_run_id','=',scope.demo_run_id):rowsQuery.where('c.demo_run_id','is',null);
      if(scope.role==='RESIDENT')rowsQuery=rowsQuery.where('c.resident_user_id','=',scope.principal.app_user_id)
        .where(eb=>eb.exists(eb.selectFrom('resident_premises_access as a').select('a.app_user_id')
          .whereRef('a.premises_id','=','c.premises_id').where('a.app_user_id','=',scope.principal.app_user_id).where('a.active','=',true)));
      if(scope.organization_id)rowsQuery=rowsQuery.where('c.organization_id','=',scope.organization_id);
      if(scope.role==='UK_EMPLOYEE')rowsQuery=rowsQuery.where(eb=>eb.exists(eb.selectFrom('uk_house_access as a').select('a.app_user_id')
        .whereRef('a.house_id','=','c.house_id').where('a.app_user_id','=',scope.principal.app_user_id).where('a.active','=',true)));
      if(scope.contractor_id)rowsQuery=rowsQuery.where(eb=>eb.exists(eb.selectFrom('assignment as task').select('task.assignment_id')
        .whereRef('task.assignment_id','=','c.current_assignment_id').where('task.contractor_id','=',scope.contractor_id!)
        .where(eb=>eb.or([
          eb.and([eb('task.decision_status','=','PENDING'),eb('c.current_state','=','SENT_TO_CONTRACTOR')]),
          eb.and([eb('task.decision_status','=','ACCEPTED'),eb('c.current_executor_contractor_id','=',scope.contractor_id!),eb('c.current_state','in',['EXECUTION','REWORK','AWAITING_RESULT_CHECK','REMARKS_REVIEW'])]),
        ]))));
      if(query.state)rowsQuery=rowsQuery.where('c.current_state','=',query.state);
      const rows=await rowsQuery.orderBy('c.updated_at','desc').orderBy('c.case_id','desc').execute();
      const limit=Math.min(query.limit??50,200),items=[];
      for(const row of rows) {
        if(cursor&&(row.updated_at.toISOString()>cursor.updated_at||row.updated_at.toISOString()===cursor.updated_at&&row.case_id>=cursor.case_id))continue;
        const context=await repository.caseById(row.case_id);
        if(!context||!await policy.listIncludes(scope,context))continue;
        const iteration=await tx.selectFrom('case_iteration').select('iteration_no').where('iteration_id','=',row.current_iteration_id).executeTakeFirstOrThrow();
        const summary=responsibility(row.current_state,Boolean(row.current_executor_contractor_id),context.current_feedback_type==='CONFIRMATION'||context.no_resident_feedback_recorded);
        items.push({case_id:row.case_id,display_number:row.display_number??row.case_id,state:row.current_state,
          category:row.category_name_snapshot,location_label:`${row.house_address_snapshot}, ${row.premises_label_snapshot}`,
          current_iteration_no:iteration.iteration_no,updated_at:row.updated_at.toISOString(),responsibility:summary.text});
        if(items.length>limit)break;
      }
      const more=items.length>limit;if(more)items.pop();const last=items.at(-1);
      return CaseListResponseSchema.parse({items,next_cursor:more&&last?Buffer.from(JSON.stringify({updated_at:last.updated_at,case_id:last.case_id})).toString('base64url'):null});
    });
  }
  async candidates(token:string,caseId:string) {
    const claims=this.claims(token);
    return this.db.transaction().setIsolationLevel('repeatable read').execute(async tx=>{
      const policy=new AuthorizationPolicy(createTransactionAuthorizationRepository(tx));
      const decision=await policy.case(claims,caseId);
      if(decision.access!=='UK')throw new AuthorizationError('FORBIDDEN');
      const row=decision.case;
      if(!['ACCEPTED_BY_UK','REWORK'].includes(row.current_state))throw new IntakeError('INVALID_STATE',409);
      let query=tx.selectFrom('contractor as c').innerJoin('organization_contractor as m','m.contractor_id','c.contractor_id')
        .select(['c.contractor_id','c.display_name']).where('m.organization_id','=',row.organization_id).where('m.active','=',true).where('c.active','=',true);
      if(row.current_state==='REWORK'&&row.current_executor_contractor_id)query=query.where('c.contractor_id','!=',row.current_executor_contractor_id);
      return ContractorCandidatesResponseSchema.parse({iteration_id:row.current_iteration_id,items:await query.orderBy('c.display_name').orderBy('c.contractor_id').execute()});
    });
  }
  async snapshot(token:string,caseId:string) {
    const claims=this.claims(token);
    return this.db.transaction().setIsolationLevel('repeatable read').execute(tx=>this.project(tx,claims,caseId));
  }
  private async project(tx:DatabaseTransaction,claims:ReturnType<CaseReadService['claims']>,caseId:string) {
    const policy=new AuthorizationPolicy(createTransactionAuthorizationRepository(tx));
    const decision=await policy.case(claims,caseId);
    const row=await tx.selectFrom('case_table').selectAll().where('case_id','=',caseId).executeTakeFirstOrThrow();
    const domain=await executionSnapshot(tx,row);
    const uk=decision.access==='UK',resident=decision.access==='RESIDENT',pending=decision.access==='PENDING_CONTRACTOR',executor=decision.access==='EXECUTOR';
    const contractorRef=async(id:string|null)=>{
      if(!id)return null;
      const contractor=await tx.selectFrom('contractor').select(['contractor_id','display_name']).where('contractor_id','=',id).executeTakeFirstOrThrow();
      return {contractor_id:contractor.contractor_id,name:contractor.display_name};
    };
    const metadata=async(ids:string[])=>{
      const items=[];
      for(const id of ids) {
        try{await policy.attachment(claims,id);}catch(error){if(error instanceof AuthorizationError)continue;throw error;}
        const a=await tx.selectFrom('attachment').select(['attachment_id','file_name','mime_type','byte_size']).where('attachment_id','=',id).executeTakeFirstOrThrow();
        items.push({...a,byte_size:Number(a.byte_size)});
      }return items;
    };
    const results=await tx.selectFrom('result').selectAll().where('case_id','=',caseId).execute();
    const feedbacks=await tx.selectFrom('resident_feedback').selectAll().where('case_id','=',caseId).execute();
    const comments=await tx.selectFrom('comment').selectAll().where('case_id','=',caseId).execute();
    const iterations=await tx.selectFrom('case_iteration').selectAll().where('case_id','=',caseId).execute();
    const currentIteration=iterations.find(i=>i.iteration_id===row.current_iteration_id)!;
    const resultProjection=async(id:string|null)=>{
      const r=results.find(r=>r.result_id===id);
      if(!r||pending||executor&&r.assignment_id!==row.current_assignment_id)return null;
      const links=await tx.selectFrom('result_attachment').select('attachment_id').where('result_id','=',r.result_id).execute();
      return {result_id:r.result_id,iteration_id:r.iteration_id,description:r.description,submitted_at:r.submitted_at.toISOString(),attachments:await metadata(links.map(a=>a.attachment_id))};
    };
    const feedbackProjection=(id:string|null)=>{
      const r=feedbacks.find(r=>r.feedback_id===id);
      if(!r||pending||executor&&(row.current_state==='REMARKS_REVIEW'||r.feedback_id!==currentIteration.source_feedback_id))return null;
      return {feedback_id:r.feedback_id,result_id:r.result_id,type:r.type,remark_text:r.remark_text,created_at:r.created_at.toISOString()};
    };
    const commentProjection=(id:string|null)=>{
      const c=comments.find(c=>c.comment_id===id);
      if(!c||pending)return null;
      if(executor&&(c.iteration_id!==row.current_iteration_id||c.comment_kind!=='WORKING'||c.actor_role_snapshot==='CONTRACTOR_EMPLOYEE'&&c.actor_contractor_id!==row.current_executor_contractor_id))return null;
      return {comment_id:c.comment_id,body:c.body,created_at:c.created_at.toISOString()};
    };
    const events=await tx.selectFrom('case_event').selectAll().where('case_id','=',caseId).orderBy('event_seq').execute();
    const activity=[];
    for(const event of events) {
      if(resident&&['EVT_003','EVT_015'].includes(event.event_type))continue;
      if(pending&&(event.event_type!=='EVT_004'||event.assignment_id!==row.current_assignment_id))continue;
      if(executor&&!this.workEvent(event,row,currentIteration.source_feedback_id))continue;
      const comment=['EVT_007','EVT_012'].includes(event.event_type)?commentProjection(event.comment_id):null;
      if(['EVT_007','EVT_012'].includes(event.event_type)&&!comment)continue;
      const result=event.event_type==='EVT_008'?await resultProjection(event.result_id):null;
      const feedback=['EVT_010','EVT_011'].includes(event.event_type)?feedbackProjection(event.feedback_id):null;
      const attachmentIds:string[]=[];
      if(event.attachment_id)attachmentIds.push(event.attachment_id);
      if(comment)attachmentIds.push(...(await tx.selectFrom('comment_attachment').select('attachment_id').where('comment_id','=',comment.comment_id).execute()).map(a=>a.attachment_id));
      if(feedback)attachmentIds.push(...(await tx.selectFrom('feedback_attachment').select('attachment_id').where('feedback_id','=',feedback.feedback_id).execute()).map(a=>a.attachment_id));
      const actor=event.actor_user_id?await tx.selectFrom('app_user').select('display_name').where('app_user_id','=',event.actor_user_id).executeTakeFirst():null;
      let text=comment?.body??result?.description??feedback?.remark_text??eventLabels[event.event_type];
      const presentation=event.presentation_data as Record<string,unknown>|null;
      if(uk&&event.event_type==='EVT_006'&&event.assignment_id) {
        const rejected=await tx.selectFrom('assignment').select('reject_reason').where('assignment_id','=',event.assignment_id).executeTakeFirst();
        if(rejected?.reject_reason)text=`Подрядчик отказал: ${rejected.reject_reason}`;
      }
      if(uk&&event.event_type==='EVT_015'&&typeof presentation?.basis_note==='string')text=`${text}: ${presentation.basis_note}`;
      if(event.event_type==='EVT_017'&&typeof presentation?.explanation==='string')text=`${text}: ${presentation.explanation}`;
      activity.push({activity_id:event.event_id,event_id:event.event_id,event_seq:Number(event.event_seq),semantic_code:event.event_type,
        occurred_at:event.occurred_at.toISOString(),iteration_no:iterations.find(i=>i.iteration_id===event.iteration_id)?.iteration_no??1,
        actor:{role:event.actor_role_snapshot??'UK_EMPLOYEE',display_name:actor?.display_name??'УК'},text,
        state_transition:event.from_state&&event.to_state&&event.from_state!==event.to_state?{from:event.from_state,to:event.to_state}:null,
        domain:{result,feedback,comment},attachments:await metadata(attachmentIds)});
    }
    const assignment=row.current_assignment_id?await tx.selectFrom('assignment').selectAll().where('assignment_id','=',row.current_assignment_id).executeTakeFirst():null;
    const initial=await tx.selectFrom('case_initial_attachment').select('attachment_id').where('case_id','=',caseId).execute();
    const selection=uk&&domain.selection?{selection_id:domain.selection.id,contractor:await contractorRef(domain.selection.contractorId)}:null;
    const projection={case_id:caseId,display_number:row.display_number??caseId,state:row.current_state,revision:Number(row.revision),
      created_at:row.created_at.toISOString(),updated_at:row.updated_at.toISOString(),description:row.description,
      location:{house:row.house_address_snapshot,premises:row.premises_label_snapshot},
      category:{name:row.category_name_snapshot,result_requirement:row.result_requirement_snapshot},
      current_iteration:{iteration_id:row.current_iteration_id,number:domain.iteration.number},
      responsibility:responsibility(row.current_state,Boolean(row.current_executor_contractor_id),domain.feedback?.type==='CONFIRMATION'||Boolean(domain.noFeedback)),
      initial_attachments:await metadata(initial.map(a=>a.attachment_id)),selection,
      assignment:assignment?{assignment_id:assignment.assignment_id,contractor:await contractorRef(assignment.contractor_id),decision:assignment.decision_status,
        ...(uk&&assignment.reject_reason?{reject_reason:assignment.reject_reason}:{})}:null,
      current_executor:await contractorRef(row.current_executor_contractor_id),current_result:await resultProjection(row.current_result_id),
      resident_feedback:feedbackProjection(resident||uk?domain.feedback?.id??null:currentIteration.source_feedback_id),activity,
      allowed_actions:allowedActions(decision,domain),
      ...(resident?{actionable_clarification_requests:row.current_state==='REMARKS_REVIEW'?domain.clarifications
        .filter(c=>c.resultId===domain.result?.id&&c.feedbackId===domain.feedback?.id&&c.iterationId===domain.iteration.id)
        .sort((a,b)=>events.findIndex(e=>e.comment_id===a.id)-events.findIndex(e=>e.comment_id===b.id))
        .map(c=>{const comment=comments.find(r=>r.comment_id===c.id)!;return {clarification_request_id:c.id,body:comment.body,created_at:comment.created_at.toISOString()};}):[]}:{}),
    };
    return (resident?ResidentCaseSnapshotSchema:uk?UkCaseSnapshotSchema:ContractorCaseSnapshotSchema).parse({case:projection});
  }
  private workEvent(event:Selectable<CaseEventTable>,row:LockedCase,sourceFeedbackId:string|null) {
    if(['EVT_001','EVT_002'].includes(event.event_type))return true;
    if(['EVT_004','EVT_005','EVT_008','EVT_009'].includes(event.event_type))return event.assignment_id===row.current_assignment_id;
    if(event.event_type==='EVT_007')return event.iteration_id===row.current_iteration_id;
    if(['EVT_011','EVT_013','EVT_014'].includes(event.event_type))return Boolean(sourceFeedbackId)&&event.feedback_id===sourceFeedbackId;
    return false;
  }
}
