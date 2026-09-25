import { describe, expect, it } from 'vitest';
import { CASE_STATES, ROLES } from '@max-smart-city/contracts';
import { loadConfig } from '../../config/load-config.js';
import { issueSession } from '../auth/session-token.js';
import type { SessionClaims } from '../auth/session-token.js';
import { AuthorizationBoundary } from './boundary.js';
import {
  AuthorizationError, AuthorizationPolicy,
} from './policy.js';
import type { AuthorizationRepository, Binding, CaseContext, Role } from './policy.js';

const ids = {
  max: 'max', resident: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', uk: 'uk', admin: 'admin', contractorA: 'contractor-a', contractorB: 'contractor-b',
  org: 'org', otherOrg: 'other-org', house: 'house', otherHouse: 'other-house', premises: 'premises',
  case: 'case', run: 'run', assignment: 'assignment', contractor: 'contractor', otherContractor: 'other-contractor',
};
const binding = (user: string, role: Role, organization_id: string | null = null, contractor_id: string | null = null): Binding => ({
  role_binding_id: `binding-${user}`, app_user_id: user, role, organization_id, contractor_id, active: true,
});
const baseCase = (): CaseContext => ({
  case_id: ids.case, organization_id: ids.org, house_id: ids.house, premises_id: ids.premises,
  resident_user_id: ids.resident, demo_run_id: null, current_state: 'EXECUTION',
  current_iteration_id: 'iteration', current_selection_id: 'selection',
  current_assignment_id: ids.assignment, current_assignment_contractor_id: ids.contractor,
  current_assignment_decision: 'ACCEPTED', current_executor_contractor_id: ids.contractor,
  current_result_id: null, current_feedback_id: null, current_feedback_type: null,
  current_clarification_request_id: null,
  no_resident_feedback_recorded: false,
});
type Fixture = ReturnType<typeof fixture>;
function fixture() {
  const users = new Map<string, boolean>([[ids.resident, true], [ids.uk, true], [ids.admin, true],
    [ids.contractorA, true], [ids.contractorB, true]]);
  const bindings = new Map<string, Binding[]>([
    [ids.resident, [binding(ids.resident, 'RESIDENT')]],
    [ids.uk, [binding(ids.uk, 'UK_EMPLOYEE', ids.org)]],
    [ids.admin, [binding(ids.admin, 'UK_ADMIN', ids.org)]],
    [ids.contractorA, [binding(ids.contractorA, 'CONTRACTOR_EMPLOYEE', null, ids.contractor)]],
    [ids.contractorB, [binding(ids.contractorB, 'CONTRACTOR_EMPLOYEE', null, ids.otherContractor)]],
  ]);
  const row = baseCase();
  const residentAccess = new Set([`${ids.resident}/${ids.premises}`]);
  const houseAccess = new Set([`${ids.uk}/${ids.house}`]);
  const organizationContractors = new Set([`${ids.org}/${ids.contractor}`, `${ids.org}/${ids.otherContractor}`]);
  const attachments = new Map([['initial', { attachment_id: 'initial', case_id: ids.case,
    kind: 'INITIAL' as const, assignment_id: null, iteration_id: null }],
  ['material', { attachment_id: 'material', case_id: ids.case,
    kind: 'WORK_MATERIAL' as const, assignment_id: ids.assignment, iteration_id: 'iteration' }]]);
  let runStatus: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
  let actorRole: Role | null = 'RESIDENT';
  const repository: AuthorizationRepository = {
    identity: async () => ({ app_user_id: currentIdentityUser }),
    appUser: async (id) => users.has(id) ? { active: users.get(id)! } : null,
    bindings: async (id) => bindings.get(id) ?? [],
    organization: async (id) => [ids.org, ids.otherOrg].includes(id) ? { active: true } : null,
    contractor: async (id) => [ids.contractor, ids.otherContractor].includes(id) ? { active: true } : null,
    demoRun: async (id) => id === ids.run ? { status: runStatus, created_by_max_identity_id: ids.max } : null,
    demoActor: async (_run, _user) => actorRole ? { role: actorRole } : null,
    house: async (id) => id === ids.house ? { active: true, organization_id: ids.org }
      : id === ids.otherHouse ? { active: true, organization_id: ids.otherOrg } : null,
    premises: async (id) => id === ids.premises ? { active: true, house_id: ids.house } : null,
    residentAccess: async (user, premises) => residentAccess.has(`${user}/${premises}`),
    ukHouseAccess: async (user, house) => houseAccess.has(`${user}/${house}`),
    organizationContractor: async (org, contractor) => organizationContractors.has(`${org}/${contractor}`),
    caseById: async (id) => id === row.case_id ? { ...row } : null,
    attachmentById: async (id) => attachments.get(id) ?? null,
  };
  let currentIdentityUser = ids.resident;
  const policy = new AuthorizationPolicy(repository);
  const claims = (user: string, role: Role, demo = false): SessionClaims => ({
    schema_version: 1, sid: '00000000-0000-4000-8000-000000000001', max_identity_id: ids.max,
    app_user_id: user, role_binding_id: demo ? null : `binding-${user}`, role,
    demo_mode: demo, demo_run_id: demo ? ids.run : null, real_display_name: 'Real', iat: 1, exp: 100,
  });
  const as = (user: string, role: Role) => { currentIdentityUser = user; return claims(user, role); };
  const demoAs = (user: string, role: Role) => { actorRole = role; return claims(user, role, true); };
  return { policy, repository, row, users, bindings, residentAccess, houseAccess, organizationContractors,
    attachments, as, demoAs, setRunStatus: (status: 'ACTIVE' | 'ARCHIVED') => { runStatus = status; },
    setActorRole: (role: Role | null) => { actorRole = role; } };
}
const code = (value: unknown) => value instanceof AuthorizationError ? value.code : undefined;
const denied = async (promise: Promise<unknown>, expected: 'FORBIDDEN' | 'NOT_FOUND' = 'NOT_FOUND') => {
  await expect(promise).rejects.toMatchObject({ code: expected });
};

describe('TG-011 per-request authorization', () => {
  it.each(CASE_STATES)('resident own Case in %s', async (state) => {
    const f = fixture(); f.row.current_state = state;
    const decision = await f.policy.case(f.as(ids.resident, 'RESIDENT'), ids.case);
    expect(decision.visibility).toBe('RESIDENT');
    expect(decision.allowed_actions.every((action) => ['RESIDENT_CONFIRM', 'RESIDENT_REMARK', 'ADD_COMMENT'].includes(action))).toBe(true);
  });
  it.each(CASE_STATES)('UK employee own house in %s', async (state) => {
    const f = fixture(); f.row.current_state = state;
    expect((await f.policy.case(f.as(ids.uk, 'UK_EMPLOYEE'), ids.case)).visibility).toBe('UK_EMPLOYEE');
  });
  it.each(CASE_STATES)('UK admin own organization in %s', async (state) => {
    const f = fixture(); f.row.current_state = state;
    expect((await f.policy.case(f.as(ids.admin, 'UK_ADMIN'), ids.case)).visibility).toBe('UK_ADMIN');
  });
  it.each(CASE_STATES)('contractor selected-only is hidden in %s', async (state) => {
    const f = fixture(); f.row.current_state = state; f.row.current_assignment_id = null;
    f.row.current_assignment_contractor_id = null; f.row.current_executor_contractor_id = null;
    await denied(f.policy.case(f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE'), ids.case));
  });
  it.each(CASE_STATES)('contractor pending only has sent/current acceptance context in %s', async (state) => {
    const f = fixture(); f.row.current_state = state; f.row.current_assignment_decision = 'PENDING';
    f.row.current_executor_contractor_id = null;
    const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    if (state === 'SENT_TO_CONTRACTOR') {
      const decision = await f.policy.case(claim, ids.case);
      expect(decision.visibility).toBe('PENDING_CONTRACTOR');
      expect(decision.allowed_actions).toEqual(['ACCEPT_ASSIGNMENT', 'REJECT_ASSIGNMENT']);
      expect((await f.policy.attachment(claim, 'initial')).access).toBe('PENDING_CONTRACTOR');
      await denied(f.policy.attachment(claim, 'material'));
    } else await denied(f.policy.case(claim, ids.case));
  });
  it.each(CASE_STATES)('accepted executor only has current work context in %s', async (state) => {
    const f = fixture(); f.row.current_state = state;
    const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    if (['EXECUTION', 'AWAITING_RESULT_CHECK', 'REMARKS_REVIEW', 'REWORK'].includes(state)) {
      const decision = await f.policy.case(claim, ids.case);
      expect(decision.access).toBe('EXECUTOR');
      expect(decision.allowed_actions).not.toContain('COMPLETE_CASE');
    } else await denied(f.policy.case(claim, ids.case));
  });
  it.each(ROLES)('foreign organization is hidden for %s', async (role) => {
    const f = fixture(); f.row.organization_id = ids.otherOrg; f.row.house_id = ids.otherHouse;
    const [user] = role === 'RESIDENT' ? [ids.resident] : role === 'UK_EMPLOYEE' ? [ids.uk]
      : role === 'UK_ADMIN' ? [ids.admin] : [ids.contractorA];
    await denied(f.policy.case(f.as(user, role), ids.case));
  });
  it('resident foreign Case, revoked premises and guessed Case deny', async () => {
    const f = fixture(); const claim = f.as(ids.resident, 'RESIDENT');
    f.row.resident_user_id = 'other'; await denied(f.policy.case(claim, ids.case));
    f.row.resident_user_id = ids.resident; f.residentAccess.clear();
    await denied(f.policy.case(claim, ids.case));
    await denied(f.policy.case(claim, 'guessed'));
  });
  it('projection omits exact contractor reason and internal UK events for Resident', async () => {
    const f = fixture();
    const resident = await f.policy.case(f.as(ids.resident, 'RESIDENT'), ids.case);
    const uk = await f.policy.case(f.as(ids.uk, 'UK_EMPLOYEE'), ids.case);
    expect(resident.projection).toMatchObject({ exact_reject_reason: false, internal_uk_events: false,
      full_assignment_history: false, resident_details: 'SELF' });
    expect(uk.projection).toMatchObject({ exact_reject_reason: true, internal_uk_events: true,
      full_assignment_history: true, resident_details: 'UK_WORK' });
  });
  it('state-specific actions use current result, feedback and clarification context', async () => {
    const f = fixture();
    f.row.current_state = 'AWAITING_RESULT_CHECK'; f.row.current_result_id = 'result';
    expect((await f.policy.case(f.as(ids.resident, 'RESIDENT'), ids.case)).allowed_actions)
      .toEqual(['RESIDENT_CONFIRM', 'RESIDENT_REMARK']);
    f.row.current_feedback_type = 'CONFIRMATION';
    expect((await f.policy.case(f.as(ids.uk, 'UK_EMPLOYEE'), ids.case)).allowed_actions)
      .toContain('COMPLETE_CASE');
    f.row.current_state = 'REMARKS_REVIEW'; f.row.current_feedback_type = 'REMARK';
    expect((await f.policy.case(f.as(ids.resident, 'RESIDENT'), ids.case)).allowed_actions).toEqual([]);
    f.row.current_clarification_request_id = 'clarification';
    expect((await f.policy.case(f.as(ids.resident, 'RESIDENT'), ids.case)).allowed_actions).toEqual(['ADD_COMMENT']);
  });
  it('UK employee foreign house denied; UK admin own org still allowed', async () => {
    const f = fixture(); f.houseAccess.clear();
    await denied(f.policy.case(f.as(ids.uk, 'UK_EMPLOYEE'), ids.case));
    expect((await f.policy.case(f.as(ids.admin, 'UK_ADMIN'), ids.case)).access).toBe('UK');
  });
  it('CreateCase requires own live premises; configuration requires admin of own organization', async () => {
    const f = fixture();
    expect((await f.policy.createCase(f.as(ids.resident, 'RESIDENT'), ids.premises)).app_user_id).toBe(ids.resident);
    await denied(f.policy.createCase(f.as(ids.uk, 'UK_EMPLOYEE'), ids.premises));
    await denied(f.policy.createCase(f.as(ids.resident, 'RESIDENT'), 'guessed'));
    f.residentAccess.clear();
    await denied(f.policy.createCase(f.as(ids.resident, 'RESIDENT'), ids.premises));
    expect((await f.policy.configuration(f.as(ids.admin, 'UK_ADMIN'), ids.org)).binding.role).toBe('UK_ADMIN');
    await denied(f.policy.configuration(f.as(ids.admin, 'UK_ADMIN'), ids.otherOrg));
    await denied(f.policy.configuration(f.as(ids.uk, 'UK_EMPLOYEE'), ids.org), 'FORBIDDEN');
  });
  it('revoked user, exact binding and organization-contractor take effect next request', async () => {
    const f = fixture(); const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    expect((await f.policy.case(claim, ids.case)).access).toBe('EXECUTOR');
    f.organizationContractors.clear(); await denied(f.policy.case(claim, ids.case));
    f.organizationContractors.add(`${ids.org}/${ids.contractor}`);
    f.bindings.get(ids.contractorA)![0]!.active = false;
    await denied(f.policy.case(claim, ids.case), 'FORBIDDEN');
    f.bindings.get(ids.contractorA)![0]!.active = true; f.users.set(ids.contractorA, false);
    await denied(f.policy.case(claim, ids.case), 'FORBIDDEN');
  });
  it('multiple bindings never union or fall back after selected binding revoke', async () => {
    const f = fixture(); const claim = f.as(ids.uk, 'UK_EMPLOYEE');
    f.bindings.get(ids.uk)!.push({ ...binding(ids.uk, 'UK_ADMIN', ids.org), role_binding_id: 'second' });
    await denied(f.policy.case(claim, ids.case), 'FORBIDDEN');
    f.bindings.get(ids.uk)![0]!.active = false;
    await denied(f.policy.case(claim, ids.case), 'FORBIDDEN');
  });
  it('demo requires active owned run, actor allowlist and exact run Case scope', async () => {
    const f = fixture(); const claim = f.demoAs(ids.resident, 'RESIDENT');
    f.row.demo_run_id = ids.run;
    expect((await f.policy.case(claim, ids.case)).access).toBe('RESIDENT');
    f.row.demo_run_id = 'guessed'; await denied(f.policy.case(claim, ids.case));
    f.row.demo_run_id = ids.run; f.setActorRole(null);
    await denied(f.policy.case(claim, ids.case), 'FORBIDDEN');
    f.setActorRole('RESIDENT'); f.setRunStatus('ARCHIVED');
    await denied(f.policy.case(claim, ids.case), 'FORBIDDEN');
  });
  it('old contractor loses list, snapshot, attachment and mutation after reassignment', async () => {
    const f = fixture(); const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    const scope = await f.policy.listScope(claim);
    expect(await f.policy.listIncludes(scope, f.row)).toBe(true);
    f.row.current_assignment_id = 'new-assignment'; f.row.current_assignment_contractor_id = ids.otherContractor;
    f.row.current_executor_contractor_id = ids.otherContractor;
    expect(await f.policy.listIncludes(scope, f.row)).toBe(false);
    await denied(f.policy.case(claim, ids.case));
    await denied(f.policy.attachment(claim, 'initial'));
    await denied(f.policy.command(claim, ids.case, 'ADD_COMMENT'));
    expect((await f.policy.case(f.as(ids.contractorB, 'CONTRACTOR_EMPLOYEE'), ids.case)).access).toBe('EXECUTOR');
  });
  it('rejected assignment also removes old contractor from every LIVE surface', async () => {
    const f = fixture(); const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    f.row.current_state = 'ACCEPTED_BY_UK'; f.row.current_assignment_id = null;
    f.row.current_assignment_contractor_id = null; f.row.current_executor_contractor_id = null;
    expect(await f.policy.listIncludes(await f.policy.listScope(claim), f.row)).toBe(false);
    await denied(f.policy.case(claim, ids.case));
    await denied(f.policy.attachment(claim, 'initial'));
    await denied(f.policy.command(claim, ids.case, 'ACCEPT_ASSIGNMENT'));
    await denied(f.policy.replay(claim, ids.case, 'ACCEPT_ASSIGNMENT', ids.assignment));
  });
  it('hidden resource wins before terminal, stale or forbidden-action detail', async () => {
    const f = fixture(); const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    f.row.current_state = 'COMPLETED';
    await denied(f.policy.command(claim, ids.case, 'COMPLETE_CASE'));
    await denied(f.policy.replay(claim, ids.case, 'SUBMIT_RESULT', ids.assignment));
    await denied(f.policy.attachment(claim, 'material'));
    f.row.current_state = 'EXECUTION';
    await denied(f.policy.command(claim, ids.case, 'COMPLETE_CASE'), 'FORBIDDEN');
  });
  it('replay revocation denies stored success even with live claims', async () => {
    const f = fixture(); const claim = f.as(ids.resident, 'RESIDENT');
    const stored = { secret: 'successful response' };
    const replay = async () => { await f.policy.replay(claim, ids.case, 'RESIDENT_CONFIRM'); return stored; };
    expect(await replay()).toBe(stored);
    f.bindings.get(ids.resident)![0]!.active = false;
    await denied(replay(), 'FORBIDDEN');
  });
  it('signed-token boundary reauthorizes before retrieving replay body', async () => {
    const f = fixture();
    const signedBindingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    f.bindings.get(ids.resident)![0]!.role_binding_id = signedBindingId;
    const config = loadConfig({
      APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
      APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
      PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
      BUILD_SHA: 'a'.repeat(40), APP_SESSION_TTL_SECONDS: '900',
    });
    const token = issueSession({
      max_identity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      app_user_id: ids.resident, role_binding_id: signedBindingId,
      role: 'RESIDENT', demo_mode: false, demo_run_id: null, real_display_name: 'Real',
    }, config, 1000).token;
    const boundary = new AuthorizationBoundary(config, f.repository, () => 1001);
    let retrieved = 0;
    const replay = async () => {
      await boundary.replay(token, ids.case, 'RESIDENT_CONFIRM');
      retrieved++;
      return 'stored success';
    };
    expect(await replay()).toBe('stored success');
    f.bindings.get(ids.resident)![0]!.active = false;
    await denied(replay(), 'FORBIDDEN');
    expect(retrieved).toBe(1);
    await expect(boundary.replay('forged', ids.case, 'RESIDENT_CONFIRM')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('replay reassignment hides old contractor success; unchanged executor can replay', async () => {
    const f = fixture(); const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    expect((await f.policy.replay(claim, ids.case, 'SUBMIT_RESULT', ids.assignment)).access).toBe('EXECUTOR');
    f.row.current_assignment_id = 'new-assignment'; f.row.current_assignment_contractor_id = ids.otherContractor;
    f.row.current_executor_contractor_id = ids.otherContractor;
    await denied(f.policy.replay(claim, ids.case, 'SUBMIT_RESULT', ids.assignment));
  });
  it('accepted contractor can replay own accepted assignment without rerunning transition', async () => {
    const f = fixture(); const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    expect((await f.policy.replay(claim, ids.case, 'ACCEPT_ASSIGNMENT', ids.assignment)).access).toBe('EXECUTOR');
  });
  it('replay of guessed resource reveals neither entry nor state', async () => {
    const f = fixture(); const claim = f.as(ids.resident, 'RESIDENT');
    await denied(f.policy.replay(claim, 'guessed', 'RESIDENT_CONFIRM'));
  });
  it('attachment IDs and mismatched current work material remain hidden', async () => {
    const f = fixture(); const claim = f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE');
    await denied(f.policy.attachment(claim, 'guessed'));
    f.attachments.get('material')!.assignment_id = 'historical';
    await denied(f.policy.attachment(claim, 'material'));
  });
  it('list scope carries exact binding and never client-supplied authority', async () => {
    const f = fixture(); const scope = await f.policy.listScope(f.as(ids.contractorA, 'CONTRACTOR_EMPLOYEE'));
    expect(scope.contractor_id).toBe(ids.contractor);
    expect(scope.requires_current_assignment_or_executor).toBe(true);
    expect(code(new AuthorizationError('NOT_FOUND'))).toBe('NOT_FOUND');
  });
});
