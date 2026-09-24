/// <reference lib="dom" />
/// <reference types="node" />
import { expect, test } from 'vitest';
import * as C from './index.js';

const u = '11111111-1111-4111-8111-111111111111';
const v = '22222222-2222-4222-8222-222222222222';
const t = '2026-09-21T12:00:00Z';
const attachment = { attachment_id: u, file_name: 'photo.jpg', mime_type: 'image/jpeg', byte_size: 12 };
const context = {
  real_max_identity: { max_identity_id: u, display_name: 'MAX user', outbound_max_ready: true },
  demo_mode: true, demo_run_id: u, primary_case_id: null,
  effective_actor: { app_user_id: u, role: 'RESIDENT', display_name: 'Resident' },
};
const activity = {
  activity_id: u, event_id: u, event_seq: 1, semantic_code: 'EVT_001', occurred_at: t,
  iteration_no: 1, actor: { role: 'RESIDENT', display_name: 'Resident' }, text: 'Created',
  state_transition: { from: 'CREATED', to: 'ACCEPTED_BY_UK' },
  domain: { result: null, feedback: null, comment: null }, attachments: [],
};
const snapshot = {
  case_id: u, display_number: 'C-1', state: 'CREATED', revision: 1, created_at: t,
  updated_at: t, description: 'Leak', location: { house: '1', premises: '2' },
  category: { name: 'Heating', result_requirement: 'PHOTO' },
  current_iteration: { iteration_id: u, number: 1 },
  responsibility: { semantic_code: 'UK', text: 'UK' }, initial_attachments: [attachment],
  selection: null, assignment: null, current_executor: null, current_result: null,
  resident_feedback: null, activity: [activity], allowed_actions: [],
};
const success = { command_id: u, case_id: u, state: 'CREATED', revision: 1,
  created: { iteration_id: u }, event_ids: [u] };
const emptySuccess = { ...success, created: {} };
type Schema = { safeParse(value: unknown): { success: boolean }; parse(value: unknown): unknown };
const fixtures: [string, Schema, unknown, unknown][] = [
  ['01 CaseState', C.CaseStateSchema, 'CREATED', 'NINTH_STATE'],
  ['02 Role', C.RoleSchema, 'RESIDENT', 'FIFTH_ROLE'],
  ['03 support enums', C.ResultRequirementSchema, 'PHOTO', 'DELIVERED'],
  ['04 headers', C.MutationHeadersSchema, { authorization: 'Bearer token', 'idempotency-key': u }, { authorization: 'token', 'idempotency-key': u }],
  ['05 command success', C.CreateCaseSuccessSchema, success, { ...success, case: snapshot }],
  ['06 errors', C.ErrorResponseSchema, { error: { code: 'STALE_ASSIGNMENT', message: 'Stale', request_id: u, details: { target_assignment_id: u } } }, { error: { code: 'FORBIDDEN', message: 'No', request_id: u, details: { target_assignment_id: u } } }],
  ['07 error code', C.SemanticErrorCodeSchema, 'STALE_ASSIGNMENT', 'UNKNOWN_ERROR'],
  ['08 session', C.SessionReadResponseSchema, context, { ...context, session_token: 'secret' }],
  ['09 actor switch', C.ActorSwitchRequestSchema, { role_view: 'CONTRACTOR_EMPLOYEE' }, { role_view: 'CONTRACTOR_EMPLOYEE', actor_alias: 'A' }],
  ['10 demo run', C.DemoRunStartResponseSchema, { demo_run_id: u, status: 'ACTIVE', primary_case_id: null, role_views: ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'] }, { demo_run_id: u, status: 'ACTIVE', primary_case_id: null, role_views: ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE', 'CONTRACTOR_EMPLOYEE'] }],
  ['11 list query', C.CaseListQuerySchema, { limit: '50' }, { limit: '1.5' }],
  ['12 list response', C.CaseListResponseSchema, { items: [{ case_id: u, display_number: 'C-1', state: 'CREATED', category: 'Heating', location_label: '1', current_iteration_no: 1, updated_at: t, responsibility: 'UK' }], next_cursor: null }, { items: [], next_cursor: 9 }],
  ['13 snapshot wrapper', C.CaseSnapshotSchema, { case: snapshot }, snapshot],
  ['14 resident projection', C.ResidentCaseSnapshotSchema, { case: snapshot }, { case: { ...snapshot, assignment: { assignment_id: u, contractor: { contractor_id: u, name: 'A' }, decision: 'REJECTED', reject_reason: 'private' } } }],
  ['15 activity', C.ActivityItemSchema, activity, { ...activity, semantic_code: 'EVT_018' }],
  ['16 allowed action', C.AllowedActionSchema, { code: 'SEND_ASSIGNMENT', target: { selection_id: u, iteration_id: u }, input: {} }, { code: 'SEND_ASSIGNMENT', target: { contractor_id: u, iteration_id: u }, input: {} }],
  ['17 config write', C.HouseCreateRequestSchema, { address: 'Kazan', display_label: null, active: true }, { address: 'Kazan', display_label: null, active: true, organization_id: u }],
  ['18 config read', C.OrganizationReadResponseSchema, { organization_id: u, name: 'UK', active: true }, { organization_id: u, name: 'UK', active: true, secret: 'x' }],
  ['19 attachment', C.DownloadCapabilityResponseSchema, { download_url: 'https://example.com/opaque', file_name: 'x', expires_at: t }, { download_url: 'http://example.com/raw', file_name: 'x', expires_at: t }],
  ['20 MAX auth', C.AuthMaxRequestSchema, { init_data: 'raw=signed' }, { initDataUnsafe: {} }],
  ['21 webhook', C.WebhookHeadersSchema, { 'x-max-bot-api-secret': 'opaque' }, { 'x-max-bot-api-secret': '' }],
  ['22 queued', C.NotificationQueuedSchema, { status: 'QUEUED' }, { status: 'DELIVERED' }],
  ['23 system info', C.SystemInfoResponseSchema, { build_sha: 'abc' }, { build_sha: 'abc', env: 'prod' }],
  ['24 CreateCase', C.CreateCasePayloadSchema, { premises_id: u, category_id: u, description: 'Leak' }, { category_id: u, description: 'Leak' }],
  ['25 AcceptCase', C.AcceptCaseRequestSchema, {}, { state: 'ACCEPTED_BY_UK' }],
  ['26 SelectContractor', C.SelectContractorRequestSchema, { contractor_id: u, iteration_id: u }, { contractor_id: u }],
  ['27 SendAssignment', C.SendAssignmentRequestSchema, { selection_id: u, iteration_id: u }, { contractor_id: u, iteration_id: u }],
  ['28 AcceptAssignment', C.AcceptAssignmentRequestSchema, { assignment_id: u }, { selection_id: u }],
  ['29 RejectAssignment', C.RejectAssignmentRequestSchema, { assignment_id: u, reason: 'Busy' }, { assignment_id: u, reason: '' }],
  ['30 AddResultMaterial', C.AddResultMaterialPayloadSchema, { assignment_id: u, iteration_id: u }, { iteration_id: u }],
  ['31 SubmitResult', C.SubmitResultRequestSchema, { assignment_id: u, iteration_id: u, description: 'Done', material_attachment_ids: [u] }, { assignment_id: u, iteration_id: u, material_attachment_ids: [] }],
  ['32 ResidentConfirmation', C.ResidentConfirmationRequestSchema, { result_id: u, iteration_id: u }, { result_id: u, iteration_id: u, type: 'CONFIRMATION' }],
  ['33 ResidentRemark', C.ResidentRemarkPayloadSchema, { result_id: u, iteration_id: u, remark_text: 'Still leaks' }, { iteration_id: u, remark_text: 'Still leaks' }],
  ['34 RequestClarification', C.RequestClarificationRequestSchema, { result_id: u, feedback_id: u, message: 'Explain' }, { result_id: u, feedback_id: u, message: 'Explain', iteration_id: u }],
  ['35 RecordNoFeedback', C.RecordNoResidentFeedbackRequestSchema, { result_id: u, iteration_id: u, basis_confirmed: true, basis_note: 'Called' }, { result_id: u, iteration_id: u, basis_confirmed: false, basis_note: 'Timer' }],
  ['36 ReturnToRework', C.ReturnToReworkRequestSchema, { result_id: u, feedback_id: u }, { result_id: u, feedback_id: u, iteration_id: u }],
  ['37 CompleteCase', C.CompleteCaseRequestSchema, { result_id: u, basis: { type: 'RESIDENT_CONFIRMATION', feedback_id: u } }, { result_id: u, basis: { type: 'NO_RESIDENT_FEEDBACK', event_id: u } }],
  ['38 CompleteWithExplanation', C.CompleteWithExplanationRequestSchema, { result_id: u, feedback_id: u, explanation: 'Reason' }, { result_id: u, feedback_id: u, explanation: '' }],
  ['39 AddComment', C.AddCommentPayloadSchema, { body: '', clarification_request_id: null }, { body: 'Text', clarification_request_id: null, private_channel: true }],
];

for (const [name, schema, valid, invalid] of fixtures) {
  test(`${name}: positive, negative and JSON roundtrip`, () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
    expect(schema.safeParse(JSON.parse(JSON.stringify(valid))).success).toBe(true);
  });
}

test('snapshot requires a top-level case wrapper', () => {
  expect(C.CaseSnapshotSchema.safeParse({ case: snapshot }).success).toBe(true);
  expect(C.CaseSnapshotSchema.safeParse(snapshot).success).toBe(false);
  expect(C.CaseSnapshotSchema.safeParse({ data: snapshot }).success).toBe(false);
  expect(C.CaseSnapshotSchema.safeParse({ item: snapshot }).success).toBe(false);
  expect(JSON.parse(JSON.stringify(C.CaseSnapshotSchema.parse({ case: snapshot })))).toHaveProperty('case');
});

test('HTTP limit parses a validated string to a safe integer and has no default', () => {
  const parsed = C.CaseListQuerySchema.parse({ limit: '50' });
  expect(parsed.limit).toBe(50);
  expect(typeof parsed.limit).toBe('number');
  expect(Number.isInteger(parsed.limit)).toBe(true);
  expect(C.CaseListQuerySchema.parse({})).toEqual({});
  for (const valid of ['1', '9007199254740991']) expect(C.CaseListQuerySchema.safeParse({ limit: valid }).success).toBe(true);
  for (const invalid of ['50abc', '1.5', 'Infinity', 'NaN', '0', '-1', '+50', '01', '5e1', '', ' 50 ', '9007199254740992', 50]) {
    expect(C.CaseListQuerySchema.safeParse({ limit: invalid }).success).toBe(false);
  }
});

test('states, roles and support wire enums are closed', () => {
  expect(C.CASE_STATES).toHaveLength(8);
  expect(C.ROLES).toHaveLength(4);
  for (const value of C.CASE_STATES) expect(C.CaseStateSchema.parse(value)).toBe(value);
  for (const value of C.ROLES) expect(C.RoleSchema.parse(value)).toBe(value);
  expect(C.AssignmentDecisionSchema.safeParse('REJECTED').success).toBe(true);
  expect(C.ResidentFeedbackTypeSchema.safeParse('REMARK').success).toBe(true);
  expect(C.DemoRunStatusSchema.safeParse('ARCHIVED').success).toBe(true);
  expect(C.MaxIdentityLinkStatusSchema.safeParse('LINKED_CONFIRMED').success).toBe(true);
});

test('command responses constrain created IDs and special fields', () => {
  expect(C.CommandSuccessSchema.safeParse(emptySuccess).success).toBe(true);
  expect(C.CommandSuccessSchema.safeParse(success).success).toBe(true);
  expect(C.SubmitResultSuccessSchema.safeParse({ ...success, created: { result_id: u, notification_intent_id: v }, notification: { status: 'QUEUED' } }).success).toBe(true);
  expect(C.SubmitResultSuccessSchema.safeParse({ ...success, created: { result_id: u, notification_intent_id: v }, notification: { status: 'DELIVERED' } }).success).toBe(false);
  expect(C.RecordNoResidentFeedbackSuccessSchema.safeParse({ ...emptySuccess, no_feedback_event_id: u }).success).toBe(true);
  expect(C.ReturnToReworkSuccessSchema.safeParse({ ...success, created: { iteration_id: u, iteration_no: 2 }, event_ids: [u, v] }).success).toBe(true);
});

test('activity has one item per event in event sequence order', () => {
  const second = { ...activity, activity_id: v, event_id: v, event_seq: 2, occurred_at: '2026-09-20T12:00:00Z' };
  expect(C.CaseSnapshotSchema.safeParse({ case: { ...snapshot, activity: [activity, second] } }).success).toBe(true);
  expect(C.CaseSnapshotSchema.safeParse({ case: { ...snapshot, activity: [activity, activity] } }).success).toBe(false);
  expect(C.CaseSnapshotSchema.safeParse({ case: { ...snapshot, activity: [second, activity] } }).success).toBe(false);
  expect(C.ActivityItemSchema.safeParse({ ...activity, activity_id: v }).success).toBe(false);
});

test('complete case accepts both exact basis branches', () => {
  expect(C.CompleteCaseRequestSchema.safeParse({ result_id: u, basis: { type: 'NO_RESIDENT_FEEDBACK', event_id: v, completion_basis: { confirmed: true, process_reference: 'Call log' } } }).success).toBe(true);
  expect(C.CompleteCaseRequestSchema.safeParse({ result_id: u, basis: { type: 'RESIDENT_CONFIRMATION', feedback_id: v, event_id: v } }).success).toBe(false);
});

test('multipart JSON excludes binary bytes and webhook ack has no JSON body', () => {
  expect(C.AddResultMaterialPayloadSchema.safeParse({ assignment_id: u, iteration_id: u, files: [new Uint8Array([1])] }).success).toBe(false);
  expect(C.AddResultMaterialFilePartsSchema.safeParse([Symbol('file-part')]).success).toBe(true);
  expect(C.AddResultMaterialFilePartsSchema.safeParse([]).success).toBe(false);
  expect(C.AddResultMaterialFilePartsSchema.safeParse([undefined]).success).toBe(false);
  expect(C.AddResultMaterialFilePartsSchema.safeParse([Symbol('a'), Symbol('b')]).success).toBe(false);
  expect(C.AddCommentPayloadSchema.safeParse({ body: '', clarification_request_id: null }).success).toBe(true);
  expect(C.WebhookOpaqueBodySchema.safeParse({ arbitrary_max_payload: true }).success).toBe(true);
  expect(C.WebhookAckSchema.safeParse(undefined).success).toBe(true);
  expect(C.WebhookAckSchema.safeParse({ ok: true }).success).toBe(false);
});

const actionTargets: [string, Record<string, string>][] = [
  ['ACCEPT_CASE', {}],
  ['SELECT_CONTRACTOR', { iteration_id: u }],
  ['SEND_ASSIGNMENT', { selection_id: u, iteration_id: u }],
  ['ACCEPT_ASSIGNMENT', { assignment_id: u }],
  ['REJECT_ASSIGNMENT', { assignment_id: u }],
  ['ADD_RESULT_MATERIAL', { assignment_id: u, iteration_id: u }],
  ['SUBMIT_RESULT', { assignment_id: u, iteration_id: u }],
  ['RESIDENT_CONFIRM', { result_id: u, iteration_id: u }],
  ['RESIDENT_REMARK', { result_id: u, iteration_id: u }],
  ['RECORD_NO_RESIDENT_FEEDBACK', { result_id: u, iteration_id: u }],
  ['REQUEST_CLARIFICATION', { result_id: u, feedback_id: u }],
  ['RETURN_TO_REWORK', { result_id: u, feedback_id: u }],
  ['COMPLETE_CASE', { result_id: u }],
  ['COMPLETE_WITH_EXPLANATION', { result_id: u, feedback_id: u }],
  ['ADD_COMMENT', {}],
];
for (const [code, target] of actionTargets) {
  test(`allowed action ${code} has only exact target IDs`, () => {
    const valid = { code, target, input: {} };
    expect(C.AllowedActionSchema.safeParse(valid).success).toBe(true);
    expect(C.AllowedActionSchema.safeParse(JSON.parse(JSON.stringify(valid))).success).toBe(true);
    const missing = { ...target };
    const first = Object.keys(missing)[0];
    if (first) delete missing[first];
    else missing.actor_alias = u;
    expect(C.AllowedActionSchema.safeParse({ code, target: missing, input: {} }).success).toBe(false);
    expect(C.AllowedActionSchema.safeParse({ code, target, input: { unknown_hint: true } }).success).toBe(false);
  });
}

const configWrites: [string, Schema, unknown, unknown][] = [
  ['organization PATCH', C.OrganizationPatchRequestSchema, { name: 'UK' }, { name: 'UK', organization_id: u }],
  ['house POST', C.HouseCreateRequestSchema, { address: 'Kazan', display_label: null, active: true }, { address: 'Kazan', active: true }],
  ['house PATCH', C.HousePatchRequestSchema, { active: false }, {}],
  ['category POST', C.CategoryCreateRequestSchema, { name: 'Heating', description: null, default_contractor_id: null, requires_premises_access: true, result_requirement: 'PHOTO', active: true }, { name: 'Heating', description: null, default_contractor_id: null, requires_premises_access: true, result_requirement: 'PHOTO' }],
  ['category PATCH', C.CategoryPatchRequestSchema, { result_requirement: 'FILE' }, {}],
  ['contractor POST', C.ContractorCreateRequestSchema, { display_name: 'A' }, { display_name: 'A', app_user_id: u }],
  ['contractor binding PUT', C.ContractorBindingPutRequestSchema, { active: false }, { active: false, organization_id: u }],
  ['user role PUT', C.UserRoleBindingPutRequestSchema, { role: 'UK_EMPLOYEE', contractor_id: null, house_ids: [u], active: false }, { role: 'FIFTH_ROLE', contractor_id: null, house_ids: [] }],
  ['contractor employee PUT', C.ContractorEmployeePutRequestSchema, { active: true }, { active: true, invite: true }],
];
for (const [name, schema, valid, invalid] of configWrites) {
  test(`configuration ${name} uses exact body`, () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
    expect(schema.safeParse(JSON.parse(JSON.stringify(valid))).success).toBe(true);
  });
}

const configReads: [string, Schema, unknown, unknown][] = [
  ['organization', C.OrganizationReadResponseSchema, { organization_id: u, name: 'UK', active: true }, { organization_id: u, name: 'UK', active: true, secret: 'x' }],
  ['houses', C.HousesReadResponseSchema, [{ house_id: u, address: 'Kazan', display_label: null, active: false }], [{ house_id: u, address: 'Kazan', display_label: null, active: false, tenant: v }]],
  ['categories', C.CategoriesReadResponseSchema, [{ category_id: u, name: 'Heating', description: null, default_contractor_id: null, requires_premises_access: true, result_requirement: 'PHOTO', active: true }], [{ category_id: u, name: 'Heating', description: null, default_contractor_id: 'bad', requires_premises_access: true, result_requirement: 'PHOTO', active: true }]],
  ['contractors', C.ContractorsReadResponseSchema, [{ contractor: { contractor_id: u, display_name: 'A', active: true }, organization_contractor: { organization_id: v, contractor_id: u, active: false } }], [{ contractor: { contractor_id: u, display_name: 'A', active: true }, organization_contractor: { organization_id: v, contractor_id: u, active: false }, binding_active: false }]],
  ['users', C.UsersReadResponseSchema, [{ app_user: { app_user_id: u, display_name: 'A', active: true }, role_bindings: [{ role_binding_id: v, role: 'UK_ADMIN', organization_id: u, contractor_id: null, active: true }], uk_house_access: [{ house_id: u, active: false }] }], [{ app_user: { app_user_id: u, display_name: 'A', active: true }, role_bindings: [{ role_binding_id: v, role: 'FIFTH_ROLE', organization_id: u, contractor_id: null, active: true }], uk_house_access: [] }]],
];
for (const [name, schema, valid, invalid] of configReads) {
  test(`configuration ${name} read is a direct strict projection`, () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
    expect(schema.safeParse(JSON.parse(JSON.stringify(valid))).success).toBe(true);
  });
}

const commandResponses: [string, Schema, Record<string, unknown>, Record<string, unknown>][] = [
  ['CreateCase', C.CreateCaseSuccessSchema, { iteration_id: u }, {}],
  ['AcceptCase', C.AcceptCaseSuccessSchema, {}, { state: 'CLIENT_STATE' }],
  ['SelectContractor', C.SelectContractorSuccessSchema, { selection_id: u }, {}],
  ['SendAssignment', C.SendAssignmentSuccessSchema, { assignment_id: u }, {}],
  ['AcceptAssignment', C.AcceptAssignmentSuccessSchema, {}, { selection_id: u }],
  ['RejectAssignment', C.RejectAssignmentSuccessSchema, {}, { assignment_id: u }],
  ['AddResultMaterial', C.AddResultMaterialSuccessSchema, { attachment_id: u }, {}],
  ['SubmitResult', C.SubmitResultSuccessSchema, { result_id: u, notification_intent_id: v }, { result_id: u }],
  ['ResidentConfirmation', C.ResidentConfirmationSuccessSchema, { feedback_id: u }, {}],
  ['ResidentRemark', C.ResidentRemarkSuccessSchema, { feedback_id: u }, {}],
  ['RequestClarification', C.RequestClarificationSuccessSchema, { comment_id: u }, {}],
  ['RecordNoResidentFeedback', C.RecordNoResidentFeedbackSuccessSchema, {}, { event_id: u }],
  ['ReturnToRework', C.ReturnToReworkSuccessSchema, { iteration_id: u, iteration_no: 2 }, { iteration_id: u }],
  ['CompleteCase', C.CompleteCaseSuccessSchema, {}, { result_id: u }],
  ['CompleteWithExplanation', C.CompleteWithExplanationSuccessSchema, {}, { result_id: u }],
  ['AddComment', C.AddCommentSuccessSchema, { comment_id: u }, {}],
];
for (const [name, schema, created, badCreated] of commandResponses) {
  test(`${name} success has exact created entity IDs`, () => {
    const special = name === 'SubmitResult' ? { notification: { status: 'QUEUED' } }
      : name === 'RecordNoResidentFeedback' ? { no_feedback_event_id: u } : {};
    const event_ids = name === 'ReturnToRework' ? [u, v] : [u];
    const valid = { ...success, created, event_ids, ...special };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, created: badCreated }).success).toBe(false);
    expect(schema.safeParse(JSON.parse(JSON.stringify(valid))).success).toBe(true);
  });
}

test('bootstrap, switch and session read have distinct token semantics', () => {
  const token = { session_token: 'opaque', expires_at: t, session: context };
  expect(C.AuthMaxSuccessSchema.safeParse(token).success).toBe(true);
  expect(C.ActorSwitchSuccessSchema.safeParse(token).success).toBe(true);
  expect(C.SessionReadResponseSchema.safeParse(context).success).toBe(true);
  expect(C.AuthMaxSuccessSchema.safeParse(context).success).toBe(false);
  expect(C.ActorSwitchSuccessSchema.safeParse({ session: context }).success).toBe(false);
  expect(C.SessionReadResponseSchema.safeParse(token).success).toBe(false);
});

test('demo start and normalized headers reject invented client authority', () => {
  expect(C.DemoRunStartRequestSchema.safeParse({ scenario_key: 'primary-housing-demo' }).success).toBe(true);
  expect(C.DemoRunStartRequestSchema.safeParse({ scenario_key: 'primary-housing-demo', actor_alias: 'A' }).success).toBe(false);
  expect(C.RequestIdHeaderSchema.safeParse(u).success).toBe(true);
  expect(C.RequestIdHeaderSchema.safeParse('bad').success).toBe(false);
  expect(C.IdempotencyKeyHeaderSchema.safeParse('opaque-key').success).toBe(true);
  expect(C.IdempotencyKeyHeaderSchema.safeParse('').success).toBe(false);
  expect(C.IdempotencyKeyHeaderSchema.safeParse(' ').success).toBe(false);
  expect(C.IdempotencyReplayedHeaderSchema.safeParse('true').success).toBe(true);
  expect(C.IdempotencyReplayedHeaderSchema.safeParse('false').success).toBe(false);
});

test('role snapshots keep the wrapper and omit forbidden fields', () => {
  const uk = { case: { ...snapshot, assignment: { assignment_id: u, contractor: { contractor_id: u, name: 'A' }, decision: 'REJECTED', reject_reason: 'private' } } };
  expect(C.UkCaseSnapshotSchema.safeParse(uk).success).toBe(true);
  expect(C.ResidentCaseSnapshotSchema.safeParse(uk).success).toBe(false);
  expect(C.ContractorCaseSnapshotSchema.safeParse(uk).success).toBe(false);
  expect(C.ContractorCaseSnapshotSchema.safeParse({ case: snapshot }).success).toBe(true);
  expect(C.ContractorCaseSnapshotSchema.safeParse({ case: { ...snapshot, resident_identity: u } }).success).toBe(false);
  for (const schema of [C.ResidentCaseSnapshotSchema, C.UkCaseSnapshotSchema, C.ContractorCaseSnapshotSchema]) {
    expect(schema.safeParse(snapshot).success).toBe(false);
    expect(schema.safeParse({ case: snapshot }).success).toBe(true);
  }
});

test('request and projection boundaries reject hidden and malformed fields', () => {
  expect(C.CreateCasePayloadSchema.safeParse({ premises_id: u, category_id: u, description: '' }).success).toBe(false);
  expect(C.AcceptCaseRequestSchema.safeParse({ client_revision: 0 }).success).toBe(true);
  expect(C.AcceptCaseRequestSchema.safeParse({ client_revision: -1 }).success).toBe(false);
  expect(C.AttachmentMetadataSchema.safeParse(attachment).success).toBe(true);
  expect(C.AttachmentMetadataSchema.safeParse({ ...attachment, sha256: 'internal' }).success).toBe(false);
  expect(C.CaseSnapshotSchema.safeParse({ case: { ...snapshot, raw_content: 'secret' } }).success).toBe(false);
  expect(C.CaseSnapshotSchema.safeParse({ case: { ...snapshot, state: 'NINTH_STATE' } }).success).toBe(false);
  expect(C.ErrorResponseSchema.safeParse({ error: { code: 'FORBIDDEN', message: 'No', request_id: u, secret: 'x' } }).success).toBe(false);
});
