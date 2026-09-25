import type { ColumnType, Generated } from 'kysely';
import type {
  AppUserTable,
  CategoryTable,
  CaseTable,
  CaseEventTable,
  DB,
  Database,
  DemoRunStatus,
  MaxIdentityLinkStatus,
  ResultRequirement,
  Role,
} from './index.js';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type _DbKeysExact = Expect<
  Equal<
    keyof Database,
    | 'organization'
    | 'house'
    | 'premises'
    | 'app_user'
    | 'user_role_binding'
    | 'resident_premises_access'
    | 'uk_house_access'
    | 'max_identity'
    | 'category'
    | 'contractor'
    | 'organization_contractor'
    | 'demo_run'
    | 'demo_run_actor'
    | 'case_table'
    | 'case_iteration'
    | 'contractor_selection'
    | 'assignment'
    | 'result'
    | 'resident_feedback'
    | 'comment'
    | 'case_event'
  >
>;
type _DbAliasExact = Expect<Equal<DB, Database>>;
type _RoleClosed = Expect<Equal<Role, 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE'>>;
type _ResultRequirementClosed = Expect<Equal<ResultRequirement, 'NONE' | 'PHOTO' | 'FILE'>>;
type _DemoRunStatusClosed = Expect<Equal<DemoRunStatus, 'ACTIVE' | 'ARCHIVED'>>;
type _MaxIdentityLinkStatusClosed = Expect<Equal<MaxIdentityLinkStatus, 'UNLINKED' | 'LINKED_CONFIRMED'>>;
type _ConfigRevisionType = Expect<Equal<CategoryTable['config_revision'], ColumnType<string, number | string, number | string>>>;
type _IsSyntheticType = Expect<Equal<AppUserTable['is_synthetic'], Generated<boolean>>>;
type _CaseStateClosed = Expect<Equal<import('./index.js').CaseState, 'CREATED' | 'ACCEPTED_BY_UK' | 'SENT_TO_CONTRACTOR' | 'EXECUTION' | 'AWAITING_RESULT_CHECK' | 'REMARKS_REVIEW' | 'REWORK' | 'COMPLETED'>>;
type _AssignmentDecisionClosed = Expect<Equal<import('./index.js').AssignmentDecision, 'PENDING' | 'ACCEPTED' | 'REJECTED'>>;
type _ResidentFeedbackTypeClosed = Expect<Equal<import('./index.js').ResidentFeedbackType, 'CONFIRMATION' | 'REMARK'>>;
type _ClosureKindClosed = Expect<Equal<import('./index.js').ClosureKind, 'CONFIRMED_RESULT' | 'NO_RESIDENT_FEEDBACK' | 'DISPUTED_WITH_EXPLANATION'>>;
type _CommentKindClosed = Expect<Equal<import('./index.js').CommentKind, 'WORKING' | 'CLARIFICATION_REQUEST' | 'CLARIFICATION_REPLY'>>;
type _CaseEventTypeClosed = Expect<Equal<import('./index.js').CaseEventType, 'EVT_001' | 'EVT_002' | 'EVT_003' | 'EVT_004' | 'EVT_005' | 'EVT_006' | 'EVT_007' | 'EVT_008' | 'EVT_009' | 'EVT_010' | 'EVT_011' | 'EVT_012' | 'EVT_013' | 'EVT_014' | 'EVT_015' | 'EVT_016' | 'EVT_017'>>;
type _IterationStartReasonClosed = Expect<Equal<import('./index.js').IterationStartReason, 'INITIAL' | 'REWORK'>>;

export type TypecheckGate<
  TDbKeys extends true,
  TDbAlias extends true,
  TRole extends true,
  TResultRequirement extends true,
  TDemoRunStatus extends true,
  TLinkStatus extends true,
  TConfigRevision extends true,
  TIsSynthetic extends true,
  TCaseState extends true,
  TAssignmentDecision extends true,
  TResidentFeedbackType extends true,
  TClosureKind extends true,
  TCommentKind extends true,
  TCaseEventType extends true,
  TIterationStartReason extends true,
> = [
  TDbKeys,
  TDbAlias,
  TRole,
  TResultRequirement,
  TDemoRunStatus,
  TLinkStatus,
  TConfigRevision,
  TIsSynthetic,
  TCaseState,
  TAssignmentDecision,
  TResidentFeedbackType,
  TClosureKind,
  TCommentKind,
  TCaseEventType,
  TIterationStartReason,
];

export type GateResult = TypecheckGate<
  _DbKeysExact,
  _DbAliasExact,
  _RoleClosed,
  _ResultRequirementClosed,
  _DemoRunStatusClosed,
  _MaxIdentityLinkStatusClosed,
  _ConfigRevisionType,
  _IsSyntheticType,
  _CaseStateClosed,
  _AssignmentDecisionClosed,
  _ResidentFeedbackTypeClosed,
  _ClosureKindClosed,
  _CommentKindClosed,
  _CaseEventTypeClosed,
  _IterationStartReasonClosed
>;