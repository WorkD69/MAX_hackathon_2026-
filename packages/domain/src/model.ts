import type {
  CaseStateOutput, ResultRequirementOutput, RoleOutput,
} from '@max-smart-city/contracts';

export type CaseState = CaseStateOutput;
export type ResultRequirement = ResultRequirementOutput;
export type Role = RoleOutput;

export const DOMAIN_STATES = [
  'CREATED', 'ACCEPTED_BY_UK', 'SENT_TO_CONTRACTOR', 'EXECUTION',
  'AWAITING_RESULT_CHECK', 'REMARKS_REVIEW', 'REWORK', 'COMPLETED',
] as const satisfies readonly CaseState[];

export type Actor =
  | { role: 'RESIDENT'; userId: string }
  | { role: 'UK_EMPLOYEE' | 'UK_ADMIN'; organizationId: string }
  | { role: 'CONTRACTOR_EMPLOYEE'; contractorId: string };

export interface DomainSnapshot {
  readonly caseId: string;
  readonly residentId: string;
  readonly organizationId: string;
  readonly state: CaseState;
  readonly iteration: { readonly id: string; readonly number: number };
  readonly resultRequirement: ResultRequirement;
  readonly selection: {
    readonly id: string; readonly contractorId: string; readonly iterationId: string;
  } | null;
  readonly assignment: {
    readonly id: string; readonly selectionId: string; readonly contractorId: string;
    readonly decision: 'PENDING' | 'ACCEPTED';
  } | null;
  readonly executorId: string | null;
  readonly result: {
    readonly id: string; readonly iterationId: string; readonly assignmentId: string;
  } | null;
  readonly feedback: {
    readonly id: string; readonly resultId: string; readonly iterationId: string;
    readonly type: 'CONFIRMATION' | 'REMARK';
  } | null;
  readonly noFeedback: { readonly eventId: string; readonly resultId: string } | null;
  readonly clarifications: readonly {
    readonly id: string; readonly resultId: string; readonly feedbackId: string;
    readonly iterationId: string; readonly visibleToResident: boolean;
  }[];
  readonly materials: readonly {
    readonly id: string; readonly assignmentId: string; readonly iterationId: string;
    readonly contractorId: string; readonly kind: 'PHOTO' | 'FILE';
  }[];
}

export type DomainCommand =
  | {
    kind: 'CREATE_CASE'; organizationId: string; premisesId: string; categoryId: string;
    description: string; resultRequirement: ResultRequirement;
    premisesAvailable: boolean; categoryActive: boolean;
  }
  | { kind: 'ACCEPT_CASE' }
  | {
    kind: 'SELECT_CONTRACTOR'; iterationId: string; contractorId: string;
    contractorAvailable: boolean;
  }
  | {
    kind: 'SEND_ASSIGNMENT'; iterationId: string; selectionId: string;
    contractorAvailable: boolean;
  }
  | { kind: 'ACCEPT_ASSIGNMENT'; assignmentId: string }
  | { kind: 'REJECT_ASSIGNMENT'; assignmentId: string; reason: string }
  | {
    kind: 'ADD_RESULT_MATERIAL'; assignmentId: string; iterationId: string;
    materialKind: 'PHOTO' | 'FILE'; materialValidated: boolean;
  }
  | {
    kind: 'SUBMIT_RESULT'; assignmentId: string; iterationId: string;
    description: string; materialAttachmentIds: readonly string[];
  }
  | { kind: 'RESIDENT_CONFIRM'; resultId: string; iterationId: string }
  | { kind: 'RESIDENT_REMARK'; resultId: string; iterationId: string; remarkText: string }
  | {
    kind: 'RECORD_NO_FEEDBACK'; resultId: string; iterationId: string;
    basisConfirmed: boolean; basisNote: string;
  }
  | {
    kind: 'COMPLETE_CASE'; resultId: string;
    basis:
      | { type: 'RESIDENT_CONFIRMATION'; feedbackId: string }
      | {
        type: 'NO_RESIDENT_FEEDBACK'; eventId: string;
        completionBasis: { confirmed: boolean; processReference: string };
      };
  }
  | {
    kind: 'REQUEST_CLARIFICATION'; resultId: string; feedbackId: string;
    message: string;
  }
  | { kind: 'RETURN_TO_REWORK'; resultId: string; feedbackId: string }
  | {
    kind: 'COMPLETE_WITH_EXPLANATION'; resultId: string; feedbackId: string;
    explanation: string;
  }
  | {
    kind: 'ADD_COMMENT'; body: string; attachmentIds: readonly string[];
    clarificationRequestId: string | null;
  };

export type TransitionId =
  | 'TR-001' | 'TR-002' | 'TR-003' | 'TR-004' | 'TR-005' | 'TR-006'
  | 'TR-007' | 'TR-008' | 'TR-009' | 'TR-010' | 'TR-011' | 'TR-012'
  | 'TR-013' | 'TR-014' | 'TR-015' | 'TR-016' | 'TR-017' | 'TR-018'
  | 'TR-019' | 'TR-020' | 'TR-021' | 'TR-022' | 'ADD_RESULT_MATERIAL';

export type EventCode =
  | 'EVT_001' | 'EVT_002' | 'EVT_003' | 'EVT_004' | 'EVT_005' | 'EVT_006'
  | 'EVT_007' | 'EVT_008' | 'EVT_009' | 'EVT_010' | 'EVT_011' | 'EVT_012'
  | 'EVT_013' | 'EVT_014' | 'EVT_015' | 'EVT_016' | 'EVT_017';

export interface EventPlan {
  readonly code: EventCode;
  readonly iterationNo: number;
  readonly target?: {
    readonly selectionId?: string; readonly assignmentId?: string;
    readonly resultId?: string; readonly feedbackId?: string;
    readonly clarificationId?: string;
  };
}

export type DomainFact =
  | {
    kind: 'CASE'; organizationId: string; residentId: string; premisesId: string;
    categoryId: string; description: string; resultRequirement: ResultRequirement;
  }
  | { kind: 'ITERATION'; number: number; cause: 'CREATE_CASE' | 'RETURN_TO_REWORK' }
  | { kind: 'CASE_ACCEPTANCE' }
  | { kind: 'SELECTION'; contractorId: string; iterationId: string }
  | { kind: 'ASSIGNMENT'; selectionId: string; contractorId: string; iterationId: string }
  | { kind: 'ASSIGNMENT_DECISION'; assignmentId: string; decision: 'ACCEPTED' | 'REJECTED'; reason?: string }
  | { kind: 'MATERIAL'; assignmentId: string; iterationId: string; materialKind: 'PHOTO' | 'FILE' }
  | {
    kind: 'RESULT'; assignmentId: string; iterationId: string;
    description: string; materialAttachmentIds: readonly string[];
  }
  | {
    kind: 'FEEDBACK'; resultId: string; iterationId: string;
    type: 'CONFIRMATION' | 'REMARK'; text?: string;
  }
  | { kind: 'NO_FEEDBACK'; resultId: string; basisNote: string }
  | {
    kind: 'COMMENT'; body: string; attachmentIds: readonly string[];
    iterationId: string; contextResultId?: string; contextFeedbackId?: string;
    inReplyToClarificationId?: string; clarificationRequest: boolean;
  }
  | { kind: 'REWORK_DECISION'; resultId: string; feedbackId: string; iterationNo: number }
  | {
    kind: 'COMPLETION'; basis: 'RESIDENT_CONFIRMATION' | 'NO_RESIDENT_FEEDBACK' | 'DISPUTED_WITH_EXPLANATION';
    resultId: string; feedbackId?: string; noFeedbackEventId?: string;
    processReference?: string; explanation?: string;
  };

export interface ProjectionPlan {
  readonly state: CaseState;
  readonly iteration?: { readonly operation: 'CREATE'; readonly number: number };
  readonly selection?:
    | { readonly operation: 'CREATE'; readonly contractorId: string; readonly iterationId: string }
    | { readonly operation: 'CLEAR' };
  readonly assignment?:
    | { readonly operation: 'CREATE'; readonly selectionId: string; readonly contractorId: string }
    | { readonly operation: 'DECIDE'; readonly decision: 'ACCEPTED' }
    | { readonly operation: 'CLEAR' };
  readonly executor?:
    | { readonly operation: 'SET'; readonly contractorId: string }
    | { readonly operation: 'CLEAR' };
  readonly result?:
    | { readonly operation: 'CREATE'; readonly assignmentId: string; readonly iterationId: string }
    | { readonly operation: 'CLEAR' };
  readonly feedback?:
    | { readonly operation: 'CREATE'; readonly type: 'CONFIRMATION' | 'REMARK'; readonly resultId: string }
    | { readonly operation: 'CLEAR' };
  readonly noFeedback?:
    | { readonly operation: 'CREATE'; readonly resultId: string }
    | { readonly operation: 'CLEAR' };
  readonly closure?: { readonly operation: 'SET'; readonly basis: 'RESIDENT_CONFIRMATION' | 'NO_RESIDENT_FEEDBACK' | 'DISPUTED_WITH_EXPLANATION' };
}

export interface DomainPlan {
  readonly transition: TransitionId;
  readonly caseIdentity: { readonly kind: 'NEW' } | { readonly kind: 'EXISTING'; readonly id: string };
  readonly fromState: CaseState | null;
  readonly nextState: CaseState;
  readonly projection: ProjectionPlan;
  readonly facts: readonly DomainFact[];
  readonly events: readonly EventPlan[];
}

export type RejectionCode =
  | 'TERMINAL' | 'INVALID_ACTOR' | 'INVALID_STATE' | 'INVALID_SNAPSHOT'
  | 'INVALID_COMMAND' | 'STALE_ITERATION' | 'STALE_SELECTION'
  | 'STALE_ASSIGNMENT' | 'STALE_RESULT' | 'STALE_FEEDBACK'
  | 'STALE_CLARIFICATION' | 'STALE_COMPLETION_BASIS'
  | 'BUSINESS_INPUT' | 'INVARIANT';
export type RejectionReason =
  | 'TERMINAL' | 'ACTOR' | 'STATE' | 'STALE_TARGET' | 'BUSINESS_INPUT' | 'INVARIANT';
export type DomainValidation =
  | { readonly ok: true; readonly plan: DomainPlan }
  | { readonly ok: false; readonly reason: RejectionReason; readonly code: RejectionCode };
