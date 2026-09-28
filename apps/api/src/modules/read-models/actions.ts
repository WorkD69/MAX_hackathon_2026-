import { AllowedActionSchema } from '@max-smart-city/contracts';
import type { AllowedActionOutput } from '@max-smart-city/contracts';
import type { CaseDecision } from '../authorization/policy.js';
import type { DomainSnapshot } from '@max-smart-city/domain';

export function allowedActions(decision:CaseDecision,snapshot:DomainSnapshot):AllowedActionOutput[] {
  const row=decision.case;
  const result:AllowedActionOutput[]=[];
  for(const code of decision.allowed_actions) {
    let target:Record<string,string>={};
    if(code==='RESIDENT_CONFIRM'||code==='RESIDENT_REMARK') {
      if(!snapshot.result||snapshot.feedback)continue;
      target={result_id:snapshot.result.id,iteration_id:snapshot.iteration.id};
    }else if(code==='RECORD_NO_RESIDENT_FEEDBACK') {
      if(!snapshot.result||snapshot.feedback||snapshot.noFeedback)continue;
      target={result_id:snapshot.result.id,iteration_id:snapshot.iteration.id};
    }else if(code==='COMPLETE_CASE') {
      if(!snapshot.result||!(snapshot.feedback?.type==='CONFIRMATION'||!snapshot.feedback&&snapshot.noFeedback))continue;
      target={result_id:snapshot.result.id};
    }else if(['REQUEST_CLARIFICATION','RETURN_TO_REWORK','COMPLETE_WITH_EXPLANATION'].includes(code)) {
      if(!snapshot.result||snapshot.feedback?.type!=='REMARK')continue;
      target={result_id:snapshot.result.id,feedback_id:snapshot.feedback.id};
    }else if(code==='SELECT_CONTRACTOR') target={iteration_id:snapshot.iteration.id};
    else if(code==='SEND_ASSIGNMENT') {
      if(!snapshot.selection||snapshot.selection.iterationId!==snapshot.iteration.id)continue;
      target={selection_id:snapshot.selection.id,iteration_id:snapshot.iteration.id};
    }else if(code==='ACCEPT_ASSIGNMENT'||code==='REJECT_ASSIGNMENT') {
      if(!row.current_assignment_id)continue;target={assignment_id:row.current_assignment_id};
    }else if(code==='ADD_RESULT_MATERIAL'||code==='SUBMIT_RESULT') {
      if(!snapshot.assignment||snapshot.assignment.decision!=='ACCEPTED'||snapshot.executorId!==decision.principal.binding.contractor_id)continue;
      target={assignment_id:snapshot.assignment.id,iteration_id:snapshot.iteration.id};
    }else if(code==='ADD_COMMENT'&&decision.access==='RESIDENT'&&row.current_state==='REMARKS_REVIEW') {
      if(!snapshot.clarifications.some(c=>c.resultId===snapshot.result?.id&&c.feedbackId===snapshot.feedback?.id&&c.iterationId===snapshot.iteration.id))continue;
    }
    result.push(AllowedActionSchema.parse({code,target,input:code==='REJECT_ASSIGNMENT'?{reject_reason_required:true}:{}}));
  }
  return result;
}
export function responsibility(state:DomainSnapshot['state'],hasExecutor:boolean,confirmed:boolean) {
  const values:Record<DomainSnapshot['state'],[string,string]>={
    CREATED:['UK','УК: принять случай'],ACCEPTED_BY_UK:['UK','УК: выбрать и передать исполнителю'],
    SENT_TO_CONTRACTOR:['CONTRACTOR','Подрядчик: принять либо отклонить назначение'],
    EXECUTION:['CONTRACTOR','Исполнитель: выполнить работу и отправить результат'],
    AWAITING_RESULT_CHECK:confirmed?['UK','УК: проверить основание и завершить случай']:['RESIDENT','Житель: проверить результат; затем УК завершает случай'],
    REMARKS_REVIEW:['UK','УК: рассмотреть замечание, уточнить или вернуть на доработку'],
    REWORK:hasExecutor?['CONTRACTOR','Исполнитель: повторно выполнить работу и отправить новый результат']:['UK','УК: передать работу новому исполнителю'],
    COMPLETED:['NONE','Случай завершён, действий нет'],
  };
  const [semantic_code,text]=values[state];return {semantic_code,text};
}
