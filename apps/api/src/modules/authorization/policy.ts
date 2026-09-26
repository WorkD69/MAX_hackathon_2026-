import { CASE_STATES, ROLES } from '@max-smart-city/contracts';
import type { SessionClaims } from '../auth/session-token.js';

export type Role = (typeof ROLES)[number];
export type CaseState = (typeof CASE_STATES)[number];
export type Action =
  | 'CREATE_CASE' | 'ACCEPT_CASE' | 'SELECT_CONTRACTOR' | 'SEND_ASSIGNMENT'
  | 'ACCEPT_ASSIGNMENT' | 'REJECT_ASSIGNMENT' | 'ADD_RESULT_MATERIAL'
  | 'SUBMIT_RESULT' | 'RESIDENT_CONFIRM' | 'RESIDENT_REMARK'
  | 'RECORD_NO_RESIDENT_FEEDBACK' | 'REQUEST_CLARIFICATION'
  | 'RETURN_TO_REWORK' | 'COMPLETE_CASE' | 'COMPLETE_WITH_EXPLANATION'
  | 'ADD_COMMENT';
export type CaseAccess = 'RESIDENT' | 'UK' | 'PENDING_CONTRACTOR' | 'EXECUTOR';
export type Visibility = 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'PENDING_CONTRACTOR' | 'EXECUTOR';

export interface Binding {
  role_binding_id: string;
  app_user_id: string;
  role: Role;
  organization_id: string | null;
  contractor_id: string | null;
  active: boolean;
}
export interface CaseContext {
  case_id: string;
  organization_id: string;
  house_id: string;
  premises_id: string;
  resident_user_id: string;
  demo_run_id: string | null;
  current_state: CaseState;
  current_iteration_id: string;
  current_selection_id: string | null;
  current_assignment_id: string | null;
  current_assignment_contractor_id: string | null;
  current_assignment_decision: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  current_executor_contractor_id: string | null;
  current_result_id: string | null;
  current_feedback_id: string | null;
  current_feedback_type: 'CONFIRMATION' | 'REMARK' | null;
  current_clarification_request_id: string | null;
  no_resident_feedback_recorded: boolean;
}
export interface AttachmentContext {
  attachment_id: string;
  case_id: string;
  kind: 'INITIAL' | 'RESULT' | 'WORK_MATERIAL' | 'COMMENT';
  assignment_id: string | null;
  iteration_id: string | null;
}

/** Every method reads authoritative rows in the caller's read/transaction context. */
export interface AuthorizationRepository {
  identity(maxIdentityId: string): Promise<{ app_user_id: string | null } | null>;
  appUser(appUserId: string): Promise<{ active: boolean } | null>;
  bindings(appUserId: string): Promise<readonly Binding[]>;
  organization(organizationId: string): Promise<{ active: boolean } | null>;
  contractor(contractorId: string): Promise<{ active: boolean } | null>;
  demoRun(runId: string): Promise<{ status: 'ACTIVE' | 'ARCHIVED'; created_by_max_identity_id: string } | null>;
  demoActor(runId: string, appUserId: string): Promise<{ role: Role } | null>;
  house(houseId: string): Promise<{ organization_id: string; active: boolean } | null>;
  premises(premisesId: string): Promise<{ house_id: string; active: boolean } | null>;
  residentAccess(appUserId: string, premisesId: string): Promise<boolean>;
  ukHouseAccess(appUserId: string, houseId: string): Promise<boolean>;
  organizationContractor(organizationId: string, contractorId: string): Promise<boolean>;
  caseById(caseId: string): Promise<CaseContext | null>;
  attachmentById(attachmentId: string): Promise<AttachmentContext | null>;
}

export class AuthorizationError extends Error {
  readonly status: 401 | 403 | 404;
  constructor(readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND') {
    super(code);
    this.status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : 404;
  }
}
const unauthenticated = (): never => { throw new AuthorizationError('UNAUTHENTICATED'); };
const forbidden = (): never => { throw new AuthorizationError('FORBIDDEN'); };
const hidden = (): never => { throw new AuthorizationError('NOT_FOUND'); };

export interface Principal {
  readonly app_user_id: string;
  readonly binding: Binding;
  readonly demo_run_id: string | null;
}
export interface CaseDecision {
  readonly principal: Principal;
  readonly case: CaseContext;
  readonly access: CaseAccess;
  readonly visibility: Visibility;
  readonly projection: ProjectionScope;
  readonly allowed_actions: readonly Action[];
}
/** Select permitted fields/events at query time; never serialize a broad object then mask it. */
export interface ProjectionScope {
  readonly initial_attachments: boolean;
  readonly exact_reject_reason: boolean;
  readonly internal_uk_events: boolean;
  readonly full_assignment_history: boolean;
  readonly resident_details: 'SELF' | 'WORK_MINIMAL' | 'UK_WORK';
  readonly current_assignment_id: string | null;
}
export interface ListScope {
  readonly principal: Principal;
  readonly role: Role;
  readonly organization_id: string | null;
  readonly contractor_id: string | null;
  readonly demo_run_id: string | null;
  /** Query consumers apply these conjunctively before selecting or projecting rows. */
  readonly requires_current_assignment_or_executor: boolean;
}

const ukActions: Action[] = ['ACCEPT_CASE', 'SELECT_CONTRACTOR', 'SEND_ASSIGNMENT',
  'RECORD_NO_RESIDENT_FEEDBACK', 'REQUEST_CLARIFICATION', 'RETURN_TO_REWORK',
  'COMPLETE_CASE', 'COMPLETE_WITH_EXPLANATION', 'ADD_COMMENT'];
const residentActions: Action[] = ['RESIDENT_CONFIRM', 'RESIDENT_REMARK', 'ADD_COMMENT'];
const contractorActions: Action[] = ['ACCEPT_ASSIGNMENT', 'REJECT_ASSIGNMENT',
  'ADD_RESULT_MATERIAL', 'SUBMIT_RESULT', 'ADD_COMMENT'];

export class AuthorizationPolicy {
  constructor(private readonly repository: AuthorizationRepository) {}

  /** Call after TG-010 verifySession, on every protected request. */
  async principal(claims: SessionClaims): Promise<Principal> {
    const identity = await this.repository.identity(claims.max_identity_id);
    if (!identity) return unauthenticated();
    if (!claims.app_user_id || !claims.role) return forbidden();
    if (!claims.demo_mode && identity.app_user_id !== claims.app_user_id) return unauthenticated();
    if (claims.demo_mode) {
      if (!claims.demo_run_id || claims.role_binding_id !== null) return forbidden();
      const run = await this.repository.demoRun(claims.demo_run_id);
      if (!run || run.status !== 'ACTIVE' || run.created_by_max_identity_id !== claims.max_identity_id) return forbidden();
      const actor = await this.repository.demoActor(claims.demo_run_id, claims.app_user_id);
      if (!actor || actor.role !== claims.role) return forbidden();
    } else if (claims.demo_run_id !== null || !claims.role_binding_id) return forbidden();
    if (!(await this.repository.appUser(claims.app_user_id))?.active) return forbidden();
    const bindings = (await this.repository.bindings(claims.app_user_id)).filter((row) => row.active);
    const matching = claims.demo_mode
      ? bindings.filter((row) => row.role === claims.role)
      : bindings.filter((row) => row.role_binding_id === claims.role_binding_id && row.role === claims.role);
    // Normal bootstrap has one active binding; demo actor must have one unambiguous binding for its role.
    if (matching.length !== 1 || (!claims.demo_mode && bindings.length !== 1)) return forbidden();
    const binding = matching[0]!;
    if (binding.app_user_id !== claims.app_user_id) return forbidden();
    if (binding.role === 'RESIDENT') {
      if (binding.organization_id !== null || binding.contractor_id !== null) return forbidden();
    } else if (binding.role === 'CONTRACTOR_EMPLOYEE') {
      if (!binding.contractor_id || binding.organization_id !== null ||
        !(await this.repository.contractor(binding.contractor_id))?.active) return forbidden();
    } else if (!binding.organization_id || binding.contractor_id !== null ||
      !(await this.repository.organization(binding.organization_id))?.active) return forbidden();
    return { app_user_id: claims.app_user_id, binding, demo_run_id: claims.demo_run_id };
  }

  async listScope(claims: SessionClaims): Promise<ListScope> {
    const principal = await this.principal(claims);
    return {
      principal, role: principal.binding.role,
      organization_id: principal.binding.organization_id,
      contractor_id: principal.binding.contractor_id,
      demo_run_id: principal.demo_run_id,
      requires_current_assignment_or_executor: principal.binding.role === 'CONTRACTOR_EMPLOYEE',
    };
  }

  /** CreateCase has no Case row yet; resolve the target premises from authoritative topology. */
  async createCase(claims: SessionClaims, premisesId: string): Promise<Principal> {
    const principal = await this.principal(claims);
    const premises = await this.repository.premises(premisesId);
    if (!premises?.active) return hidden();
    const house = await this.repository.house(premises.house_id);
    if (!house?.active || !(await this.repository.organization(house.organization_id))?.active) return hidden();
    if (principal.binding.role !== 'RESIDENT' ||
      !(await this.repository.residentAccess(principal.app_user_id, premisesId))) return hidden();
    return principal;
  }

  /** TG-021 configuration consumers must still lock/recheck their target rows. */
  async configuration(claims: SessionClaims, organizationId: string): Promise<Principal> {
    const principal = await this.principal(claims);
    if (principal.binding.organization_id !== organizationId ||
      !(await this.repository.organization(organizationId))?.active) return hidden();
    if (principal.binding.role !== 'UK_ADMIN') return forbidden();
    return principal;
  }

  /** Query consumers use this predicate against each current row, before projection. */
  async listIncludes(scope: ListScope, row: CaseContext): Promise<boolean> {
    try { await this.visible(scope.principal, row); return true; }
    catch (error) { if (error instanceof AuthorizationError && error.code === 'NOT_FOUND') return false; throw error; }
  }

  async case(claims: SessionClaims, caseId: string): Promise<CaseDecision> {
    const principal = await this.principal(claims);
    const row = await this.repository.caseById(caseId);
    if (!row) return hidden();
    const access = await this.visible(principal, row);
    const visibility: Visibility = access === 'UK'
      ? principal.binding.role === 'UK_ADMIN' ? 'UK_ADMIN' : 'UK_EMPLOYEE'
      : access === 'RESIDENT' ? 'RESIDENT' : access;
    const projection: ProjectionScope = {
      initial_attachments: true,
      exact_reject_reason: access === 'UK',
      internal_uk_events: access === 'UK',
      full_assignment_history: access === 'UK',
      resident_details: access === 'RESIDENT' ? 'SELF' : access === 'UK' ? 'UK_WORK' : 'WORK_MINIMAL',
      current_assignment_id: access === 'PENDING_CONTRACTOR' || access === 'EXECUTOR' ? row.current_assignment_id : null,
    };
    return { principal, case: row, access, visibility, projection, allowed_actions: this.actions(access, row) };
  }

  async attachment(claims: SessionClaims, attachmentId: string): Promise<CaseDecision> {
    await this.principal(claims);
    const attachment = await this.repository.attachmentById(attachmentId);
    if (!attachment) return hidden();
    const decision = await this.case(claims, attachment.case_id);
    if (decision.access === 'PENDING_CONTRACTOR' && attachment.kind !== 'INITIAL') return hidden();
    if (decision.access === 'EXECUTOR' && (attachment.kind === 'WORK_MATERIAL' || attachment.kind === 'RESULT') &&
      (attachment.assignment_id !== decision.case.current_assignment_id ||
        (attachment.kind === 'WORK_MATERIAL' && attachment.iteration_id !== decision.case.current_iteration_id))) return hidden();
    if (decision.access === 'EXECUTOR' && attachment.kind === 'COMMENT') return hidden();
    return decision;
  }

  /** Visibility first; semantic state, stale target and terminal checks stay with TG-012. */
  async command(claims: SessionClaims, caseId: string, action: Action): Promise<CaseDecision> {
    const decision = await this.case(claims, caseId);
    const roleAllowed = decision.access === 'UK' ? ukActions.includes(action)
      : decision.access === 'RESIDENT' ? residentActions.includes(action)
      : decision.access === 'PENDING_CONTRACTOR' ? ['ACCEPT_ASSIGNMENT', 'REJECT_ASSIGNMENT'].includes(action)
      : contractorActions.includes(action);
    if (!roleAllowed) return forbidden();
    return decision;
  }

  /** TG-012 calls this before returning a stored successful response. No transition recheck. */
  async replay(claims: SessionClaims, caseId: string, action: Action, targetAssignmentId?: string): Promise<CaseDecision> {
    const decision = await this.case(claims, caseId);
    const roleAllowed = decision.access === 'UK' ? ukActions.includes(action)
      : decision.access === 'RESIDENT' ? residentActions.includes(action)
      : decision.access === 'PENDING_CONTRACTOR' ? ['ACCEPT_ASSIGNMENT', 'REJECT_ASSIGNMENT'].includes(action)
      : contractorActions.includes(action) || action === 'ACCEPT_ASSIGNMENT';
    if (!roleAllowed) return forbidden();
    if ((decision.access === 'PENDING_CONTRACTOR' || decision.access === 'EXECUTOR') &&
      (!targetAssignmentId || targetAssignmentId !== decision.case.current_assignment_id)) return hidden();
    return decision;
  }

  private async visible(principal: Principal, row: CaseContext): Promise<CaseAccess> {
    if (row.demo_run_id !== principal.demo_run_id) return hidden();
    const house = await this.repository.house(row.house_id);
    const premises = await this.repository.premises(row.premises_id);
    if (!house?.active || !premises?.active || house.organization_id !== row.organization_id ||
      premises.house_id !== row.house_id || !(await this.repository.organization(row.organization_id))?.active) return hidden();
    const { binding, app_user_id } = principal;
    if (binding.role === 'RESIDENT') {
      if (row.resident_user_id !== app_user_id || !(await this.repository.residentAccess(app_user_id, row.premises_id))) return hidden();
      return 'RESIDENT';
    }
    if (binding.role === 'UK_EMPLOYEE' || binding.role === 'UK_ADMIN') {
      if (binding.organization_id !== row.organization_id ||
        (binding.role === 'UK_EMPLOYEE' && !(await this.repository.ukHouseAccess(app_user_id, row.house_id)))) return hidden();
      return 'UK';
    }
    const contractorId = binding.contractor_id;
    if (!contractorId || !(await this.repository.organizationContractor(row.organization_id, contractorId))) return hidden();
    if (row.current_assignment_contractor_id !== contractorId || !row.current_assignment_id) return hidden();
    if (row.current_state === 'SENT_TO_CONTRACTOR' && row.current_assignment_decision === 'PENDING' &&
      row.current_executor_contractor_id === null) return 'PENDING_CONTRACTOR';
    if (row.current_assignment_decision === 'ACCEPTED' && row.current_executor_contractor_id === contractorId &&
      ['EXECUTION', 'AWAITING_RESULT_CHECK', 'REMARKS_REVIEW', 'REWORK'].includes(row.current_state)) return 'EXECUTOR';
    return hidden();
  }

  private actions(access: CaseAccess, row: CaseContext): readonly Action[] {
    switch (access) {
      case 'PENDING_CONTRACTOR': return ['ACCEPT_ASSIGNMENT', 'REJECT_ASSIGNMENT'];
      case 'EXECUTOR': return row.current_state === 'EXECUTION' || row.current_state === 'REWORK'
        ? ['ADD_RESULT_MATERIAL', 'SUBMIT_RESULT', 'ADD_COMMENT'] : [];
      case 'RESIDENT':
        if (row.current_state === 'EXECUTION' || row.current_state === 'REWORK') return ['ADD_COMMENT'];
        if (row.current_state === 'AWAITING_RESULT_CHECK' && row.current_result_id) return ['RESIDENT_CONFIRM', 'RESIDENT_REMARK'];
        if (row.current_state === 'REMARKS_REVIEW' && row.current_clarification_request_id) return ['ADD_COMMENT'];
        return [];
      case 'UK':
        if (row.current_state === 'CREATED') return ['ACCEPT_CASE', 'ADD_COMMENT'];
        if (row.current_state === 'ACCEPTED_BY_UK' || row.current_state === 'REWORK') {
          return row.current_selection_id ? ['SELECT_CONTRACTOR', 'SEND_ASSIGNMENT', 'ADD_COMMENT'] : ['SELECT_CONTRACTOR', 'ADD_COMMENT'];
        }
        if (row.current_state === 'AWAITING_RESULT_CHECK') return row.no_resident_feedback_recorded || row.current_feedback_type === 'CONFIRMATION'
          ? ['COMPLETE_CASE', 'ADD_COMMENT'] : ['RECORD_NO_RESIDENT_FEEDBACK', 'ADD_COMMENT'];
        if (row.current_state === 'REMARKS_REVIEW' && row.current_feedback_type === 'REMARK')
          return ['REQUEST_CLARIFICATION', 'RETURN_TO_REWORK', 'COMPLETE_WITH_EXPLANATION', 'ADD_COMMENT'];
        return row.current_state === 'COMPLETED' ? [] : ['ADD_COMMENT'];
    }
  }
}
