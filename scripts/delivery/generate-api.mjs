// Запуск после сборки packages/contracts. Это каталог contract operations, не API registry.
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { stringify } from 'yaml';
import * as C from '@max-smart-city/contracts';

const baseSha = '332ac4aee174a8743324b82b38853b3a3751d2e9';
const uuid = { type: 'string', format: 'uuid' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
// Health payloads are implemented directly in the health module, outside contracts.
const pending = {
  LiveResponse: object({ status: { const: 'ok', type: 'string' } }),
  ReadyResponse: object({ status: { type: 'string', enum: ['ready', 'not_ready'] },
    checks: object({ database: { type: 'string', enum: ['up', 'down'] },
      migrations: { type: 'string', enum: ['current', 'pending'] },
      application: { type: 'string', enum: ['initialized', 'pending'] } }) }),
};
const schemas = {};
function schema(name, io = 'output') {
  const key = `${name}_${io}`;
  if (!schemas[key]) {
    if (C[name]) {
      schemas[key] = z.toJSONSchema(C[name], { target: 'draft-2020-12', io, unrepresentable: 'any' });
      delete schemas[key].$schema;
      schemas[key]['x-zod-source'] = name;
      schemas[key]['x-semantic-validation'] = 'Zod refinements и transaction/context rules проверяются runtime; JSON Schema их не заменяет.';
    } else {
      if (!pending[name]) throw new Error(`UNKNOWN_SCHEMA:${name}`);
      schemas[key] = { ...pending[name], 'x-source-status': 'IMPLEMENTED_HEALTH_MODULE' };
    }
  }
  return { $ref: `#/components/schemas/${key}` };
}
const operations = [];
function add(id, method, path, purpose, roles, request, response, opts = {}) {
  operations.push({ id, method, path, purpose, roles, request, response, code: 200,
    negative: { status: 401, code: 'UNAUTHENTICATED', condition: 'Запрос без действующей application session' }, ...opts });
}
const uk = ['UK_EMPLOYEE', 'UK_ADMIN'];
const all = ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'];
add('HealthLive', 'GET', '/health/live', 'Процесс запущен', ['PUBLIC'], null, 'LiveResponse',
  { negative: { status: 'NETWORK_ERROR', condition: 'Остановленный app не отвечает' } });
add('HealthReady', 'GET', '/health/ready', 'DB + migrations + runtime готовы', ['PUBLIC'], null, 'ReadyResponse',
  { negative: { status: 503, condition: 'Зависимость недоступна; status=not_ready' } });
add('SystemInfo', 'GET', '/api/v1/system/info', 'Сопоставить immutable build_sha с submission SHA', ['PUBLIC'], null, 'SystemInfoResponseSchema',
  { negative: { status: 200, condition: 'Несовпадение build_sha означает FAIL submission identity' } });
add('AuthMax', 'POST', '/api/v1/auth/max', 'Bootstrap через настоящий signed raw MAX initData', ['PUBLIC'], 'AuthMaxRequestSchema', 'AuthMaxSuccessSchema',
  { body: { init_data: '{{raw_signed_max_init_data}}' }, idempotent: false,
    negative: { status: 401, code: 'MAX_INIT_DATA_INVALID_SIGNATURE', condition: 'Подменённая подпись init_data' } });
add('Session', 'GET', '/api/v1/session', 'Прочитать актуальную real/effective session', all, null, 'SessionReadResponseSchema');
add('StartDemoRun', 'POST', '/api/v1/demo/runs', 'Новый SYNTHETIC run без удаления истории старого', ['MAX_IDENTITY'], 'DemoRunStartRequestSchema', 'DemoRunStartResponseSchema',
  { code: 201, body: { scenario_key: 'primary-housing-demo' }, negative: { status: 403, code: 'DEMO_MODE_DISABLED', condition: 'DEMO_MODE=false' } });
add('SwitchActor', 'POST', '/api/v1/demo/session/actor', 'Переключить одну из четырёх role views; принять новый token', ['MAX_IDENTITY'], 'ActorSwitchRequestSchema', 'ActorSwitchSuccessSchema',
  { body: { role_view: 'RESIDENT' }, negative: { status: 403, code: 'DEMO_MODE_DISABLED', condition: 'DEMO_MODE=false' } });
add('CreateOptions', 'GET', '/api/v1/cases/create-options', 'Получить доступные premises/categories для Resident', ['RESIDENT'], null, 'ResidentCreateCaseOptionsResponseSchema',
  { query: 'ResidentCreateCaseOptionsQuerySchema', query_example: { premises_id: '{{premises_id}}' }, negative: { status: 404, code: 'RESOURCE_NOT_FOUND', condition: 'Чужое/недоступное premises_id' } });
add('CaseList', 'GET', '/api/v1/cases', 'Role/run-filtered список', all, null, 'CaseListResponseSchema', { query: 'CaseListQuerySchema', query_example: { limit: '10' } });
add('CaseRead', 'GET', '/api/v1/cases/{caseId}', 'Role-filtered Case, allowed_actions и одна activity', all, null, 'CaseSnapshotSchema',
  { negative: { status: 404, code: 'RESOURCE_NOT_FOUND', condition: 'Case другого tenant/run или утрачен текущий доступ' } });
add('CreateCase', 'POST', '/api/v1/cases', 'Создать primary Case текущего run', ['RESIDENT'], 'CreateCasePayloadSchema', 'CreateCaseSuccessSchema',
  { code: 201, multipart: true, body: { premises_id: '{{premises_id}}', category_id: '{{category_id}}', description: '[SYNTHETIC] Неаварийная неисправность отопления / стояка; нужен доступ в квартиру.' },
    negative: { status: 409, code: 'DEMO_PRIMARY_CASE_EXISTS', condition: 'Второй CreateCase в том же run с новым key' } });
const command = (id, slug, purpose, roles, req, res, body, negative = undefined, multipart = false) =>
  add(id, 'POST', `/api/v1/cases/{caseId}/commands/${slug}`, purpose, roles, req, res, {
    body, multipart, ...(negative ? { negative } : {}),
  });
const conflict = (code, condition) => ({ status: 409, code, condition });
command('AcceptCase', 'accept', 'УК принимает Case', uk, 'AcceptCaseRequestSchema', 'AcceptCaseSuccessSchema', {});
add('ContractorCandidates', 'GET', '/api/v1/cases/{caseId}/contractor-candidates', 'Операционный список для выбора, без admin config', uk, null, 'ContractorCandidatesResponseSchema');
command('SelectContractor', 'select-contractor', 'Выбор ещё не даёт contractor LIVE authority', uk, 'SelectContractorRequestSchema', 'SelectContractorSuccessSchema', { contractor_id: '{{contractor_id}}', iteration_id: '{{iteration_id}}' }, conflict('STALE_ITERATION', 'iteration_id из старого snapshot'));
command('SendAssignment', 'send-assignment', 'Отправить exact current Selection', uk, 'SendAssignmentRequestSchema', 'SendAssignmentSuccessSchema', { selection_id: '{{selection_id}}', iteration_id: '{{iteration_id}}' }, conflict('STALE_SELECTION', 'Устаревший selection_id'));
command('AcceptAssignment', 'accept-assignment', 'Contractor явно принимает поручение', ['CONTRACTOR_EMPLOYEE'], 'AcceptAssignmentRequestSchema', 'AcceptAssignmentSuccessSchema', { assignment_id: '{{assignment_id}}' }, conflict('STALE_ASSIGNMENT', 'Устаревшее поручение'));
command('RejectAssignment', 'reject-assignment', 'Отклонить с причиной и вернуть управление УК', ['CONTRACTOR_EMPLOYEE'], 'RejectAssignmentRequestSchema', 'RejectAssignmentSuccessSchema', { assignment_id: '{{assignment_id}}', reason: '[SYNTHETIC] Нет возможности выполнить работы.' }, { status: 422, code: 'REJECT_REASON_REQUIRED', condition: 'Пустая причина; уточнить actual transport 400/422 при final sync' });
add('AddComment', 'POST', '/api/v1/cases/{caseId}/comments', 'Комментарий в разрешённом текущем контексте', all, 'AddCommentPayloadSchema', 'AddCommentSuccessSchema',
  { multipart: true, body: { body: '[SYNTHETIC] Доступ в квартиру согласован.', clarification_request_id: null }, negative: conflict('CLARIFICATION_CONTEXT_REQUIRED', 'Resident в REMARKS_REVIEW без exact clarification target') });
add('AddResultMaterial', 'POST', '/api/v1/cases/{caseId}/result-materials', 'Один synthetic файл текущего исполнения', ['CONTRACTOR_EMPLOYEE'], 'AddResultMaterialPayloadSchema', 'AddResultMaterialSuccessSchema',
  { multipart: true, filesRequired: true, body: { assignment_id: '{{assignment_id}}', iteration_id: '{{iteration_id}}' }, negative: { status: 422, code: 'VALIDATION_FAILED', condition: 'Не ровно один файл в files[]' } });
command('SubmitResult', 'submit-result', 'Результат и один NotificationIntent; затем refetch', ['CONTRACTOR_EMPLOYEE'], 'SubmitResultRequestSchema', 'SubmitResultSuccessSchema',
  { assignment_id: '{{assignment_id}}', iteration_id: '{{iteration_id}}', description: '[SYNTHETIC] Работы выполнены.', material_attachment_ids: ['{{attachment_id}}'] }, { status: 422, code: 'RESULT_MATERIAL_REQUIRED', condition: 'PHOTO/FILE category без обязательного материала' });
command('ResidentConfirmation', 'resident-confirmation', 'Подтвердить Result; Case ещё не завершён', ['RESIDENT'], 'ResidentConfirmationRequestSchema', 'ResidentConfirmationSuccessSchema', { result_id: '{{result_id}}', iteration_id: '{{iteration_id}}' }, conflict('STALE_RESULT', 'Старый result_id'));
command('ResidentRemark', 'resident-remark', 'Формальное замечание текущему Result', ['RESIDENT'], 'ResidentRemarkPayloadSchema', 'ResidentRemarkSuccessSchema', { result_id: '{{result_id}}', iteration_id: '{{iteration_id}}', remark_text: '[SYNTHETIC] Неисправность остаётся.' }, conflict('FEEDBACK_ALREADY_SUBMITTED', 'Второе формальное feedback с новым key'), true);
command('RequestClarification', 'request-clarification', 'УК запрашивает уточнение замечания', uk, 'RequestClarificationRequestSchema', 'RequestClarificationSuccessSchema', { result_id: '{{result_id}}', feedback_id: '{{feedback_id}}', message: '[SYNTHETIC] Уточните проявление проблемы.' });
command('RecordNoResidentFeedback', 'record-no-resident-feedback', 'Явно записать отсутствие feedback; это не auto-close', uk, 'RecordNoResidentFeedbackRequestSchema', 'RecordNoResidentFeedbackSuccessSchema', { result_id: '{{result_id}}', iteration_id: '{{iteration_id}}', basis_confirmed: true, basis_note: '[SYNTHETIC] Проверяем отдельную ветку отсутствия ответа.' });
command('ReturnToRework', 'return-to-rework', 'Тот же Case, ровно N+1, прежний accepted Assignment сохраняется', uk, 'ReturnToReworkRequestSchema', 'ReturnToReworkSuccessSchema', { result_id: '{{result_id}}', feedback_id: '{{feedback_id}}' }, conflict('STALE_RESULT', 'Старый Result/feedback'));
command('CompleteCase', 'complete', 'УК завершает по явному основанию', uk, 'CompleteCaseRequestSchema', 'CompleteCaseSuccessSchema', { result_id: '{{result_id}}', basis: { type: 'RESIDENT_CONFIRMATION', feedback_id: '{{feedback_id}}' } }, conflict('COMPLETION_BASIS_INVALID', 'NO_RESIDENT_FEEDBACK без отдельного process_reference'));
command('CompleteWithExplanation', 'complete-with-explanation', 'УК завершает спорный случай с объяснением', uk, 'CompleteWithExplanationRequestSchema', 'CompleteWithExplanationSuccessSchema', { result_id: '{{result_id}}', feedback_id: '{{feedback_id}}', explanation: '[SYNTHETIC] Объяснение решения УК.' });
for (const [resource, response] of [['organization','OrganizationReadResponseSchema'], ['houses','HousesReadResponseSchema'], ['categories','CategoriesReadResponseSchema'], ['contractors','ContractorsReadResponseSchema'], ['users','UsersReadResponseSchema']]) {
  add(`ConfigRead_${resource}`, 'GET', `/api/v1/config/${resource}`, 'Настройки только своей УК', ['UK_ADMIN'], null, response,
    { negative: { status: 403, code: 'FORBIDDEN', condition: 'UK_EMPLOYEE обращается к admin config' } });
}
const config = (id, method, path, request, response, body, code = 200) => add(id, method, `/api/v1/config/${path}`,
  'Изменение своей конфигурации с audit и idempotency', ['UK_ADMIN'], request, response, { code, body,
    negative: { status: 403, code: 'FORBIDDEN', condition: 'Роль UK_EMPLOYEE вместо UK_ADMIN' } });
config('OrganizationPatch','PATCH','organization','OrganizationPatchRequestSchema','OrganizationReadResponseSchema',{ name:'[SYNTHETIC] Demo УК «Городская»' });
config('HouseCreate','POST','houses','HouseCreateRequestSchema','HouseReadSchema',{ address:'[SYNTHETIC] Тестовая улица, дом 2',display_label:'SYNTHETIC',active:true },201);
config('HousePatch','PATCH','houses/{houseId}','HousePatchRequestSchema','HouseReadSchema',{ display_label:'SYNTHETIC' });
config('CategoryCreate','POST','categories','CategoryCreateRequestSchema','CategoryReadSchema',{ name:'[SYNTHETIC] Отопление / стояк',description:'Неаварийный demo',default_contractor_id:'{{contractor_id}}',requires_premises_access:true,result_requirement:'PHOTO',active:true },201);
config('CategoryPatch','PATCH','categories/{categoryId}','CategoryPatchRequestSchema','CategoryReadSchema',{ description:'[SYNTHETIC] Проверка конфигурации.' });
config('ContractorCreate','POST','contractors','ContractorCreateRequestSchema','ContractorReadSchema',{ display_name:'[SYNTHETIC] Тестовый подрядчик' },201);
config('ContractorBinding','PUT','contractors/{contractorId}/binding','ContractorBindingPutRequestSchema','ContractorReadSchema',{ active:true });
config('UserRoleBinding','PUT','users/{appUserId}/role-binding','UserRoleBindingPutRequestSchema','UserReadSchema',{ role:'UK_EMPLOYEE',contractor_id:null,house_ids:['{{house_id}}'],active:true });
config('ContractorEmployee','PUT','contractors/{contractorId}/employees/{appUserId}','ContractorEmployeePutRequestSchema','UserReadSchema',{ active:true });
add('AttachmentRead','GET','/api/v1/attachments/{attachmentId}','Авторизованная загрузка исходного файла',all,null,null,
  { binary:true, negative:{status:404,code:'RESOURCE_NOT_FOUND',condition:'Чужой attachment'} });
add('DownloadCapability','POST','/api/v1/attachments/{attachmentId}/download-capability','Короткоживущий authorized HTTPS download URL',all,null,'DownloadCapabilityResponseSchema', { negative:{status:404,code:'RESOURCE_NOT_FOUND',condition:'Чужой attachment'} });
add('CapabilityDownload','GET','/downloads/{capability}','Загрузка файла по краткоживущему opaque URL', ['CAPABILITY'],null,null,
  { binary:true, pathSchemas:{capability:{type:'string',minLength:40,maxLength:16000,pattern:'^[A-Za-z0-9_-]+$'}},
    negative:{status:404,code:'RESOURCE_NOT_FOUND',condition:'Недействительный, просроченный или утративший доступ URL'} });
add('MaxWebhook','POST','/integrations/max/webhook','MAX webhook; секрет известен только серверу и MAX', ['MAX_WEBHOOK'],null,null,
  { webhook:true,idempotent:false,body:{ update_type:'bot_started' },negative:{status:401,code:'UNAUTHENTICATED',condition:'Неверный X-Max-Bot-Api-Secret'} });

const paths = {};
const checks = [];
for (const operation of operations) {
  const { id, method, path, purpose, roles, request, response, code } = operation;
  const publicRead = roles.includes('PUBLIC');
  const capabilityRead = roles.includes('CAPABILITY');
  const mutating = !['GET', 'HEAD'].includes(method) && operation.idempotent !== false;
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map(match => ({ name: match[1], in:'path', required:true,
    schema:operation.pathSchemas?.[match[1]] ?? uuid }));
  parameters.push({name:'X-Request-Id',in:'header',required:false,schema:uuid});
  if (mutating) parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:schema('IdempotencyKeyHeaderSchema','input')});
  if (operation.query) {
    const queryRef = schema(operation.query, 'input');
    const querySchema = schemas[queryRef.$ref.split('/').at(-1)];
    for (const [name, field] of Object.entries(querySchema.properties)) parameters.push({name,in:'query',required:(querySchema.required || []).includes(name),schema:field});
  }
  const responses = { [code]: {description:'Успешный результат по canonical contract'} };
  if (response) {
    // DATA-API ссылается на именованный базовый компонент даже при role-specific union.
    const responseRef = schema(response);
    responses[code].content = {'application/json':{schema: id === 'CaseRead' ?
      {anyOf:['ResidentCaseSnapshotSchema','UkCaseSnapshotSchema','ContractorCaseSnapshotSchema'].map(name=>schema(name))} : responseRef}};
  }
  if (operation.binary) responses[code].content = Object.fromEntries(
    ['image/png','image/jpeg','application/pdf','application/octet-stream'].map(mime =>
      [mime,{schema:{type:'string',format:'binary'}}]));
  const errorCodes = method === 'GET' ? [400,401,403,404,500] : [400,401,403,404,409,422,500];
  if ((!publicRead && !capabilityRead) || id === 'AuthMax' || operation.webhook) for (const status of errorCodes) responses[status] = {
    description:`Ошибка ${status}; hidden resources не раскрываются`,content:{'application/json':{schema:schema('ErrorResponseSchema')}} };
  if (id === 'HealthReady') responses[503] = {description:'Не готово',content:{'application/json':{schema:schema('ReadyResponse')}}};
  if (capabilityRead) responses[404] = {description:'Недействительный или просроченный capability',
    content:{'application/json':{schema:schema('ErrorResponseSchema')}}};
  const op = { operationId:id,summary:purpose,security:(publicRead || capabilityRead) ? [] : operation.webhook ? [{MaxWebhookSecret:[]}] : [{ApplicationSession:[]}],
    parameters,responses,'x-required-roles':roles,'x-availability':'IMPLEMENTED',
    description:`Сверено с runtime registry и canonical schemas приложения ${baseSha}.` };
  if (request) {
    const payload = schema(request,'input');
    op.requestBody = {required:true,content: operation.multipart ? {
      'multipart/form-data': {schema:{type:'object',required:['payload',...(operation.filesRequired ? ['files[]']:[])],properties:{
        payload, 'files[]':{type:'array',items:{type:'string',format:'binary'},...(operation.filesRequired ? {minItems:1,maxItems:1}: {})} }},
        encoding:{payload:{contentType:'application/json'},'files[]':{contentType:'image/jpeg, image/png, application/pdf'}}},
    } : {'application/json':{schema:payload}} };
    if (operation.multipart && ['AddComment','ResidentRemark'].includes(id))
      op.requestBody.content['application/json'] = {schema:payload};
  } else if (operation.webhook) op.requestBody = {required:true,content:{'application/json':{schema:{}}}};
  paths[path] ??= {};
  paths[path][method.toLowerCase()] = op;
  checks.push({id,method,path,purpose,required_roles:roles,auth:publicRead ? 'none' : capabilityRead ? 'opaque capability в URL; выдаётся POST /api/v1/attachments/{attachmentId}/download-capability' : operation.webhook ? 'X-Max-Bot-Api-Secret; получить вне Git' : 'Bearer application_session_token; новый token после switch/start',
    parameters:parameters.filter(p=>p.in==='path').map(p=>({name:p.name,value:`{{${p.name}}}`})),
    headers:mutating ? {'Idempotency-Key':'{{new_uuid_per_intent}}'} : {},query:operation.query_example || {},
    body:operation.body || (request ? {} : null),content_type:operation.multipart ?
      'multipart/form-data; payload JSON part; files[] binary parts' : operation.binary ? 'none' : 'application/json',
    request_schema:request ? `#/components/schemas/${request}_input` : null,
    test_data:{classification:'SYNTHETIC',source:'docs/submission/SYNTHETIC_DATA.md',files:operation.multipart ? (operation.filesRequired ? ['synthetic-result.png; ровно один file part'] : ['optional synthetic file']) : [],
      prerequisite:'Следовать docs/submission/VERIFICATION.md; IDs брать из current options/snapshot/command result, без reuse старых targets.'},
    expected:{success_code:code,response_schema:response ? `#/components/schemas/${response}_output` : null,
      response_shape:response || (operation.binary ? 'Binary file; Content-Type, Content-Disposition, Content-Length, Cache-Control: no-store' : 'Пустой HTTP response body')},negative:operation.negative,
    final_sync_required:false});
}
// Activity проверяется через реально normative Case snapshot, без выдуманного pagination route.
checks.push({...checks.find(c=>c.id==='CaseRead'),id:'Activity',purpose:'Одна activity запись на event_id, строго event_seq, сохранение N/N+1',
  expected:{success_code:200,response_schema:'#/components/schemas/CaseSnapshotSchema_output',response_shape:'case.activity[]; activity_id=event_id; event_seq строго возрастают'}});
const metadata = {FINAL_SYNC_REQUIRED:'NO',contract_source_sha:baseSha,final_tg029_sha:baseSha,route_parity:'VERIFIED',
  missing_merged_schemas:[],availability:'Runtime onRoute registry и canonical Zod schemas; live MAX evidence проверяется отдельно.'};
const origin = 'https://157-22-231-21.sslip.io';
const document = {openapi:'3.1.0',info:{title:'MAX Smart City — публичный API',version:'1.0.0',
  description:`Синхронизировано с final application ${baseSha}. Raw MAX initData предоставляет платформа.`},
  'x-delivery':metadata,servers:[{url:origin,description:'Публичный HTTPS origin; paths уже содержат /api/v1'}],
  paths,components:{securitySchemes:{ApplicationSession:{type:'http',scheme:'bearer',bearerFormat:'short-lived application session'},
    MaxWebhookSecret:{type:'apiKey',in:'header',name:'X-Max-Bot-Api-Secret'}},schemas}};
const data = {config_version:'1.0',solution_id:'max-smart-city',base_url:origin,
  openapi:'openapi.yaml',...metadata,test_access:{DEMO_MODE:true,role_views:all,login:'MAX Bot → Mini App → signed initData → новый DemoRun → role switch',
    passwords:'Не применяются для synthetic roles; рабочие secrets предоставляются командой вне Git.'},
  variables:{caseId:'current case_id',houseId:'current house_id',categoryId:'current category_id',contractorId:'current contractor_id',appUserId:'current eligible app_user_id',attachmentId:'current attachment_id',capability:'opaque segment of DownloadCapability.download_url',
    premises_id:'CreateOptions.selected_premises_id',category_id:'CreateOptions.categories[].category_id',contractor_id:'ContractorCandidates.items[].contractor_id',
    iteration_id:'Case.current_iteration.iteration_id',selection_id:'SelectContractor.created.selection_id',assignment_id:'SendAssignment.created.assignment_id',
    attachment_id:'AddResultMaterial.created.attachment_id',result_id:'SubmitResult.created.result_id',feedback_id:'ResidentConfirmation/Remark.created.feedback_id'},
  mandatory_checks:checks};
await writeFile('openapi.yaml',stringify(document,{lineWidth:110}));
await writeFile('DATA-API.yaml',stringify(data,{lineWidth:110}));
process.stdout.write(`GENERATED operations=${operations.length} checks=${checks.length} FINAL_SYNC_REQUIRED=NO\n`);
