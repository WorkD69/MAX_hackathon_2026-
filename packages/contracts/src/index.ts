import type { z } from 'zod';
import * as P from './primitives.js';
import * as S from './session.js';
import * as E from './errors.js';
import * as R from './reads.js';
import * as C from './commands.js';
import * as F from './configuration.js';
import * as D from './demo.js';
import * as A from './attachments.js';
import * as M from './max.js';

export {
  UuidSchema, UtcTimestampSchema, CASE_STATES, ROLES, CaseStateSchema, RoleSchema,
  ResultRequirementSchema, AssignmentDecisionSchema, ResidentFeedbackTypeSchema,
  DemoRunStatusSchema, MaxIdentityLinkStatusSchema, SemanticEventCodeSchema,
  RequestIdHeaderSchema, AuthorizationHeaderSchema, IdempotencyKeyHeaderSchema,
  IdempotencyReplayedHeaderSchema, ApplicationHeadersSchema, MutationHeadersSchema,
  IdempotencyReplayHeadersSchema, SystemInfoResponseSchema,
} from './primitives.js';
export {
  SessionContextSchema, AuthMaxSuccessSchema, SessionReadResponseSchema,
  ActorSwitchSuccessSchema,
} from './session.js';
export { SemanticErrorCodeSchema, ErrorResponseSchema } from './errors.js';
export {
  CaseListQuerySchema, CaseListItemSchema, CaseListResponseSchema,
  ContractorReferenceSchema, ResultProjectionSchema, FeedbackProjectionSchema,
  CommentProjectionSchema, ActivityItemSchema, AllowedActionSchema,
  CaseSnapshotProjectionSchema, CaseSnapshotSchema, ResidentCaseSnapshotSchema,
  UkCaseSnapshotSchema, ContractorCaseSnapshotSchema,
} from './reads.js';
export {
  CasePathSchema, CreateCasePayloadSchema, AcceptCaseRequestSchema,
  SelectContractorRequestSchema, SendAssignmentRequestSchema,
  AcceptAssignmentRequestSchema, RejectAssignmentRequestSchema,
  AddResultMaterialPayloadSchema, SubmitResultRequestSchema,
  ResidentConfirmationRequestSchema, ResidentRemarkPayloadSchema,
  RequestClarificationRequestSchema, RequestClarificationPayloadSchema,
  RecordNoResidentFeedbackRequestSchema, ReturnToReworkRequestSchema,
  CompleteCaseRequestSchema, CompleteWithExplanationRequestSchema,
  AddCommentPayloadSchema, NotificationQueuedSchema, CommandSuccessSchema,
  CreateCaseSuccessSchema, AcceptCaseSuccessSchema, SelectContractorSuccessSchema,
  SendAssignmentSuccessSchema, AcceptAssignmentSuccessSchema,
  RejectAssignmentSuccessSchema, AddResultMaterialSuccessSchema,
  SubmitResultSuccessSchema, ResidentConfirmationSuccessSchema,
  ResidentRemarkSuccessSchema, RequestClarificationSuccessSchema,
  RecordNoResidentFeedbackSuccessSchema, ReturnToReworkSuccessSchema,
  CompleteCaseSuccessSchema, CompleteWithExplanationSuccessSchema,
  AddCommentSuccessSchema,
} from './commands.js';
export {
  HousePathSchema, CategoryPathSchema, ContractorPathSchema, UserPathSchema,
  ContractorEmployeePathSchema, OrganizationPatchRequestSchema,
  HouseCreateRequestSchema, HousePatchRequestSchema, CategoryCreateRequestSchema,
  CategoryPatchRequestSchema, ContractorCreateRequestSchema,
  ContractorBindingPutRequestSchema, UserRoleBindingPutRequestSchema,
  ContractorEmployeePutRequestSchema, OrganizationReadResponseSchema,
  HouseReadSchema, HousesReadResponseSchema, CategoryReadSchema,
  CategoriesReadResponseSchema, ContractorReadSchema, ContractorsReadResponseSchema,
  UserReadSchema, UsersReadResponseSchema,
} from './configuration.js';
export { ActorSwitchRequestSchema, DemoRunStartRequestSchema, DemoRunStartResponseSchema } from './demo.js';
export {
  AttachmentPathSchema, AddResultMaterialFilePartsSchema,
  AttachmentMetadataSchema, DownloadCapabilityResponseSchema,
} from './attachments.js';
export {
  AuthMaxRequestSchema, WebhookHeadersSchema, WebhookOpaqueBodySchema,
  WebhookAckSchema,
} from './max.js';

export type UuidInput = z.input<typeof P.UuidSchema>;
export type UuidOutput = z.output<typeof P.UuidSchema>;
export type UtcTimestampInput = z.input<typeof P.UtcTimestampSchema>;
export type UtcTimestampOutput = z.output<typeof P.UtcTimestampSchema>;
export type CaseStateInput = z.input<typeof P.CaseStateSchema>;
export type CaseStateOutput = z.output<typeof P.CaseStateSchema>;
export type RoleInput = z.input<typeof P.RoleSchema>;
export type RoleOutput = z.output<typeof P.RoleSchema>;
export type ResultRequirementInput = z.input<typeof P.ResultRequirementSchema>;
export type ResultRequirementOutput = z.output<typeof P.ResultRequirementSchema>;
export type AssignmentDecisionInput = z.input<typeof P.AssignmentDecisionSchema>;
export type AssignmentDecisionOutput = z.output<typeof P.AssignmentDecisionSchema>;
export type ResidentFeedbackTypeInput = z.input<typeof P.ResidentFeedbackTypeSchema>;
export type ResidentFeedbackTypeOutput = z.output<typeof P.ResidentFeedbackTypeSchema>;
export type DemoRunStatusInput = z.input<typeof P.DemoRunStatusSchema>;
export type DemoRunStatusOutput = z.output<typeof P.DemoRunStatusSchema>;
export type MaxIdentityLinkStatusInput = z.input<typeof P.MaxIdentityLinkStatusSchema>;
export type MaxIdentityLinkStatusOutput = z.output<typeof P.MaxIdentityLinkStatusSchema>;
export type SemanticEventCodeInput = z.input<typeof P.SemanticEventCodeSchema>;
export type SemanticEventCodeOutput = z.output<typeof P.SemanticEventCodeSchema>;
export type RequestIdHeaderInput = z.input<typeof P.RequestIdHeaderSchema>;
export type RequestIdHeaderOutput = z.output<typeof P.RequestIdHeaderSchema>;
export type AuthorizationHeaderInput = z.input<typeof P.AuthorizationHeaderSchema>;
export type AuthorizationHeaderOutput = z.output<typeof P.AuthorizationHeaderSchema>;
export type IdempotencyKeyHeaderInput = z.input<typeof P.IdempotencyKeyHeaderSchema>;
export type IdempotencyKeyHeaderOutput = z.output<typeof P.IdempotencyKeyHeaderSchema>;
export type IdempotencyReplayedHeaderInput = z.input<typeof P.IdempotencyReplayedHeaderSchema>;
export type IdempotencyReplayedHeaderOutput = z.output<typeof P.IdempotencyReplayedHeaderSchema>;
export type ApplicationHeadersInput = z.input<typeof P.ApplicationHeadersSchema>;
export type ApplicationHeadersOutput = z.output<typeof P.ApplicationHeadersSchema>;
export type MutationHeadersInput = z.input<typeof P.MutationHeadersSchema>;
export type MutationHeadersOutput = z.output<typeof P.MutationHeadersSchema>;
export type IdempotencyReplayHeadersInput = z.input<typeof P.IdempotencyReplayHeadersSchema>;
export type IdempotencyReplayHeadersOutput = z.output<typeof P.IdempotencyReplayHeadersSchema>;
export type SystemInfoResponseInput = z.input<typeof P.SystemInfoResponseSchema>;
export type SystemInfoResponseOutput = z.output<typeof P.SystemInfoResponseSchema>;
export type SessionContextInput = z.input<typeof S.SessionContextSchema>;
export type SessionContextOutput = z.output<typeof S.SessionContextSchema>;
export type AuthMaxSuccessInput = z.input<typeof S.AuthMaxSuccessSchema>;
export type AuthMaxSuccessOutput = z.output<typeof S.AuthMaxSuccessSchema>;
export type SessionReadResponseInput = z.input<typeof S.SessionReadResponseSchema>;
export type SessionReadResponseOutput = z.output<typeof S.SessionReadResponseSchema>;
export type ActorSwitchSuccessInput = z.input<typeof S.ActorSwitchSuccessSchema>;
export type ActorSwitchSuccessOutput = z.output<typeof S.ActorSwitchSuccessSchema>;
export type SemanticErrorCodeInput = z.input<typeof E.SemanticErrorCodeSchema>;
export type SemanticErrorCodeOutput = z.output<typeof E.SemanticErrorCodeSchema>;
export type ErrorResponseInput = z.input<typeof E.ErrorResponseSchema>;
export type ErrorResponseOutput = z.output<typeof E.ErrorResponseSchema>;
export type CaseListQueryInput = z.input<typeof R.CaseListQuerySchema>;
export type CaseListQueryOutput = z.output<typeof R.CaseListQuerySchema>;
export type CaseListItemInput = z.input<typeof R.CaseListItemSchema>;
export type CaseListItemOutput = z.output<typeof R.CaseListItemSchema>;
export type CaseListResponseInput = z.input<typeof R.CaseListResponseSchema>;
export type CaseListResponseOutput = z.output<typeof R.CaseListResponseSchema>;
export type ContractorReferenceInput = z.input<typeof R.ContractorReferenceSchema>;
export type ContractorReferenceOutput = z.output<typeof R.ContractorReferenceSchema>;
export type ResultProjectionInput = z.input<typeof R.ResultProjectionSchema>;
export type ResultProjectionOutput = z.output<typeof R.ResultProjectionSchema>;
export type FeedbackProjectionInput = z.input<typeof R.FeedbackProjectionSchema>;
export type FeedbackProjectionOutput = z.output<typeof R.FeedbackProjectionSchema>;
export type CommentProjectionInput = z.input<typeof R.CommentProjectionSchema>;
export type CommentProjectionOutput = z.output<typeof R.CommentProjectionSchema>;
export type ActivityItemInput = z.input<typeof R.ActivityItemSchema>;
export type ActivityItemOutput = z.output<typeof R.ActivityItemSchema>;
export type AllowedActionInput = z.input<typeof R.AllowedActionSchema>;
export type AllowedActionOutput = z.output<typeof R.AllowedActionSchema>;
export type CaseSnapshotProjectionInput = z.input<typeof R.CaseSnapshotProjectionSchema>;
export type CaseSnapshotProjectionOutput = z.output<typeof R.CaseSnapshotProjectionSchema>;
export type CaseSnapshotInput = z.input<typeof R.CaseSnapshotSchema>;
export type CaseSnapshotOutput = z.output<typeof R.CaseSnapshotSchema>;
export type ResidentCaseSnapshotInput = z.input<typeof R.ResidentCaseSnapshotSchema>;
export type ResidentCaseSnapshotOutput = z.output<typeof R.ResidentCaseSnapshotSchema>;
export type UkCaseSnapshotInput = z.input<typeof R.UkCaseSnapshotSchema>;
export type UkCaseSnapshotOutput = z.output<typeof R.UkCaseSnapshotSchema>;
export type ContractorCaseSnapshotInput = z.input<typeof R.ContractorCaseSnapshotSchema>;
export type ContractorCaseSnapshotOutput = z.output<typeof R.ContractorCaseSnapshotSchema>;
export type CasePathInput = z.input<typeof C.CasePathSchema>;
export type CasePathOutput = z.output<typeof C.CasePathSchema>;
export type CreateCasePayloadInput = z.input<typeof C.CreateCasePayloadSchema>;
export type CreateCasePayloadOutput = z.output<typeof C.CreateCasePayloadSchema>;
export type AcceptCaseRequestInput = z.input<typeof C.AcceptCaseRequestSchema>;
export type AcceptCaseRequestOutput = z.output<typeof C.AcceptCaseRequestSchema>;
export type SelectContractorRequestInput = z.input<typeof C.SelectContractorRequestSchema>;
export type SelectContractorRequestOutput = z.output<typeof C.SelectContractorRequestSchema>;
export type SendAssignmentRequestInput = z.input<typeof C.SendAssignmentRequestSchema>;
export type SendAssignmentRequestOutput = z.output<typeof C.SendAssignmentRequestSchema>;
export type AcceptAssignmentRequestInput = z.input<typeof C.AcceptAssignmentRequestSchema>;
export type AcceptAssignmentRequestOutput = z.output<typeof C.AcceptAssignmentRequestSchema>;
export type RejectAssignmentRequestInput = z.input<typeof C.RejectAssignmentRequestSchema>;
export type RejectAssignmentRequestOutput = z.output<typeof C.RejectAssignmentRequestSchema>;
export type AddResultMaterialPayloadInput = z.input<typeof C.AddResultMaterialPayloadSchema>;
export type AddResultMaterialPayloadOutput = z.output<typeof C.AddResultMaterialPayloadSchema>;
export type SubmitResultRequestInput = z.input<typeof C.SubmitResultRequestSchema>;
export type SubmitResultRequestOutput = z.output<typeof C.SubmitResultRequestSchema>;
export type ResidentConfirmationRequestInput = z.input<typeof C.ResidentConfirmationRequestSchema>;
export type ResidentConfirmationRequestOutput = z.output<typeof C.ResidentConfirmationRequestSchema>;
export type ResidentRemarkPayloadInput = z.input<typeof C.ResidentRemarkPayloadSchema>;
export type ResidentRemarkPayloadOutput = z.output<typeof C.ResidentRemarkPayloadSchema>;
export type RequestClarificationRequestInput = z.input<typeof C.RequestClarificationRequestSchema>;
export type RequestClarificationRequestOutput = z.output<typeof C.RequestClarificationRequestSchema>;
export type RequestClarificationPayloadInput = z.input<typeof C.RequestClarificationPayloadSchema>;
export type RequestClarificationPayloadOutput = z.output<typeof C.RequestClarificationPayloadSchema>;
export type RecordNoResidentFeedbackRequestInput = z.input<typeof C.RecordNoResidentFeedbackRequestSchema>;
export type RecordNoResidentFeedbackRequestOutput = z.output<typeof C.RecordNoResidentFeedbackRequestSchema>;
export type ReturnToReworkRequestInput = z.input<typeof C.ReturnToReworkRequestSchema>;
export type ReturnToReworkRequestOutput = z.output<typeof C.ReturnToReworkRequestSchema>;
export type CompleteCaseRequestInput = z.input<typeof C.CompleteCaseRequestSchema>;
export type CompleteCaseRequestOutput = z.output<typeof C.CompleteCaseRequestSchema>;
export type CompleteWithExplanationRequestInput = z.input<typeof C.CompleteWithExplanationRequestSchema>;
export type CompleteWithExplanationRequestOutput = z.output<typeof C.CompleteWithExplanationRequestSchema>;
export type AddCommentPayloadInput = z.input<typeof C.AddCommentPayloadSchema>;
export type AddCommentPayloadOutput = z.output<typeof C.AddCommentPayloadSchema>;
export type NotificationQueuedInput = z.input<typeof C.NotificationQueuedSchema>;
export type NotificationQueuedOutput = z.output<typeof C.NotificationQueuedSchema>;
export type CommandSuccessInput = z.input<typeof C.CommandSuccessSchema>;
export type CommandSuccessOutput = z.output<typeof C.CommandSuccessSchema>;
export type CreateCaseSuccessInput = z.input<typeof C.CreateCaseSuccessSchema>;
export type CreateCaseSuccessOutput = z.output<typeof C.CreateCaseSuccessSchema>;
export type AcceptCaseSuccessInput = z.input<typeof C.AcceptCaseSuccessSchema>;
export type AcceptCaseSuccessOutput = z.output<typeof C.AcceptCaseSuccessSchema>;
export type SelectContractorSuccessInput = z.input<typeof C.SelectContractorSuccessSchema>;
export type SelectContractorSuccessOutput = z.output<typeof C.SelectContractorSuccessSchema>;
export type SendAssignmentSuccessInput = z.input<typeof C.SendAssignmentSuccessSchema>;
export type SendAssignmentSuccessOutput = z.output<typeof C.SendAssignmentSuccessSchema>;
export type AcceptAssignmentSuccessInput = z.input<typeof C.AcceptAssignmentSuccessSchema>;
export type AcceptAssignmentSuccessOutput = z.output<typeof C.AcceptAssignmentSuccessSchema>;
export type RejectAssignmentSuccessInput = z.input<typeof C.RejectAssignmentSuccessSchema>;
export type RejectAssignmentSuccessOutput = z.output<typeof C.RejectAssignmentSuccessSchema>;
export type AddResultMaterialSuccessInput = z.input<typeof C.AddResultMaterialSuccessSchema>;
export type AddResultMaterialSuccessOutput = z.output<typeof C.AddResultMaterialSuccessSchema>;
export type SubmitResultSuccessInput = z.input<typeof C.SubmitResultSuccessSchema>;
export type SubmitResultSuccessOutput = z.output<typeof C.SubmitResultSuccessSchema>;
export type ResidentConfirmationSuccessInput = z.input<typeof C.ResidentConfirmationSuccessSchema>;
export type ResidentConfirmationSuccessOutput = z.output<typeof C.ResidentConfirmationSuccessSchema>;
export type ResidentRemarkSuccessInput = z.input<typeof C.ResidentRemarkSuccessSchema>;
export type ResidentRemarkSuccessOutput = z.output<typeof C.ResidentRemarkSuccessSchema>;
export type RequestClarificationSuccessInput = z.input<typeof C.RequestClarificationSuccessSchema>;
export type RequestClarificationSuccessOutput = z.output<typeof C.RequestClarificationSuccessSchema>;
export type RecordNoResidentFeedbackSuccessInput = z.input<typeof C.RecordNoResidentFeedbackSuccessSchema>;
export type RecordNoResidentFeedbackSuccessOutput = z.output<typeof C.RecordNoResidentFeedbackSuccessSchema>;
export type ReturnToReworkSuccessInput = z.input<typeof C.ReturnToReworkSuccessSchema>;
export type ReturnToReworkSuccessOutput = z.output<typeof C.ReturnToReworkSuccessSchema>;
export type CompleteCaseSuccessInput = z.input<typeof C.CompleteCaseSuccessSchema>;
export type CompleteCaseSuccessOutput = z.output<typeof C.CompleteCaseSuccessSchema>;
export type CompleteWithExplanationSuccessInput = z.input<typeof C.CompleteWithExplanationSuccessSchema>;
export type CompleteWithExplanationSuccessOutput = z.output<typeof C.CompleteWithExplanationSuccessSchema>;
export type AddCommentSuccessInput = z.input<typeof C.AddCommentSuccessSchema>;
export type AddCommentSuccessOutput = z.output<typeof C.AddCommentSuccessSchema>;
export type HousePathInput = z.input<typeof F.HousePathSchema>;
export type HousePathOutput = z.output<typeof F.HousePathSchema>;
export type CategoryPathInput = z.input<typeof F.CategoryPathSchema>;
export type CategoryPathOutput = z.output<typeof F.CategoryPathSchema>;
export type ContractorPathInput = z.input<typeof F.ContractorPathSchema>;
export type ContractorPathOutput = z.output<typeof F.ContractorPathSchema>;
export type UserPathInput = z.input<typeof F.UserPathSchema>;
export type UserPathOutput = z.output<typeof F.UserPathSchema>;
export type ContractorEmployeePathInput = z.input<typeof F.ContractorEmployeePathSchema>;
export type ContractorEmployeePathOutput = z.output<typeof F.ContractorEmployeePathSchema>;
export type OrganizationPatchRequestInput = z.input<typeof F.OrganizationPatchRequestSchema>;
export type OrganizationPatchRequestOutput = z.output<typeof F.OrganizationPatchRequestSchema>;
export type HouseCreateRequestInput = z.input<typeof F.HouseCreateRequestSchema>;
export type HouseCreateRequestOutput = z.output<typeof F.HouseCreateRequestSchema>;
export type HousePatchRequestInput = z.input<typeof F.HousePatchRequestSchema>;
export type HousePatchRequestOutput = z.output<typeof F.HousePatchRequestSchema>;
export type CategoryCreateRequestInput = z.input<typeof F.CategoryCreateRequestSchema>;
export type CategoryCreateRequestOutput = z.output<typeof F.CategoryCreateRequestSchema>;
export type CategoryPatchRequestInput = z.input<typeof F.CategoryPatchRequestSchema>;
export type CategoryPatchRequestOutput = z.output<typeof F.CategoryPatchRequestSchema>;
export type ContractorCreateRequestInput = z.input<typeof F.ContractorCreateRequestSchema>;
export type ContractorCreateRequestOutput = z.output<typeof F.ContractorCreateRequestSchema>;
export type ContractorBindingPutRequestInput = z.input<typeof F.ContractorBindingPutRequestSchema>;
export type ContractorBindingPutRequestOutput = z.output<typeof F.ContractorBindingPutRequestSchema>;
export type UserRoleBindingPutRequestInput = z.input<typeof F.UserRoleBindingPutRequestSchema>;
export type UserRoleBindingPutRequestOutput = z.output<typeof F.UserRoleBindingPutRequestSchema>;
export type ContractorEmployeePutRequestInput = z.input<typeof F.ContractorEmployeePutRequestSchema>;
export type ContractorEmployeePutRequestOutput = z.output<typeof F.ContractorEmployeePutRequestSchema>;
export type OrganizationReadResponseInput = z.input<typeof F.OrganizationReadResponseSchema>;
export type OrganizationReadResponseOutput = z.output<typeof F.OrganizationReadResponseSchema>;
export type HouseReadInput = z.input<typeof F.HouseReadSchema>;
export type HouseReadOutput = z.output<typeof F.HouseReadSchema>;
export type HousesReadResponseInput = z.input<typeof F.HousesReadResponseSchema>;
export type HousesReadResponseOutput = z.output<typeof F.HousesReadResponseSchema>;
export type CategoryReadInput = z.input<typeof F.CategoryReadSchema>;
export type CategoryReadOutput = z.output<typeof F.CategoryReadSchema>;
export type CategoriesReadResponseInput = z.input<typeof F.CategoriesReadResponseSchema>;
export type CategoriesReadResponseOutput = z.output<typeof F.CategoriesReadResponseSchema>;
export type ContractorReadInput = z.input<typeof F.ContractorReadSchema>;
export type ContractorReadOutput = z.output<typeof F.ContractorReadSchema>;
export type ContractorsReadResponseInput = z.input<typeof F.ContractorsReadResponseSchema>;
export type ContractorsReadResponseOutput = z.output<typeof F.ContractorsReadResponseSchema>;
export type UserReadInput = z.input<typeof F.UserReadSchema>;
export type UserReadOutput = z.output<typeof F.UserReadSchema>;
export type UsersReadResponseInput = z.input<typeof F.UsersReadResponseSchema>;
export type UsersReadResponseOutput = z.output<typeof F.UsersReadResponseSchema>;
export type ActorSwitchRequestInput = z.input<typeof D.ActorSwitchRequestSchema>;
export type ActorSwitchRequestOutput = z.output<typeof D.ActorSwitchRequestSchema>;
export type DemoRunStartRequestInput = z.input<typeof D.DemoRunStartRequestSchema>;
export type DemoRunStartRequestOutput = z.output<typeof D.DemoRunStartRequestSchema>;
export type DemoRunStartResponseInput = z.input<typeof D.DemoRunStartResponseSchema>;
export type DemoRunStartResponseOutput = z.output<typeof D.DemoRunStartResponseSchema>;
export type AttachmentPathInput = z.input<typeof A.AttachmentPathSchema>;
export type AttachmentPathOutput = z.output<typeof A.AttachmentPathSchema>;
export type AddResultMaterialFilePartsInput = z.input<typeof A.AddResultMaterialFilePartsSchema>;
export type AddResultMaterialFilePartsOutput = z.output<typeof A.AddResultMaterialFilePartsSchema>;
export type AttachmentMetadataInput = z.input<typeof A.AttachmentMetadataSchema>;
export type AttachmentMetadataOutput = z.output<typeof A.AttachmentMetadataSchema>;
export type DownloadCapabilityResponseInput = z.input<typeof A.DownloadCapabilityResponseSchema>;
export type DownloadCapabilityResponseOutput = z.output<typeof A.DownloadCapabilityResponseSchema>;
export type AuthMaxRequestInput = z.input<typeof M.AuthMaxRequestSchema>;
export type AuthMaxRequestOutput = z.output<typeof M.AuthMaxRequestSchema>;
export type WebhookHeadersInput = z.input<typeof M.WebhookHeadersSchema>;
export type WebhookHeadersOutput = z.output<typeof M.WebhookHeadersSchema>;
export type WebhookOpaqueBodyInput = z.input<typeof M.WebhookOpaqueBodySchema>;
export type WebhookOpaqueBodyOutput = z.output<typeof M.WebhookOpaqueBodySchema>;
export type WebhookAckInput = z.input<typeof M.WebhookAckSchema>;
export type WebhookAckOutput = z.output<typeof M.WebhookAckSchema>;
