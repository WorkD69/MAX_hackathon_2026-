import { z } from 'zod';
import {
  CaseStateSchema, NonEmptyStringSchema, NonNegativeIntegerSchema,
  PositiveIntegerSchema, UuidSchema,
} from './primitives.js';

export const CasePathSchema = z.strictObject({ caseId: UuidSchema });
export const CreateCasePayloadSchema = z.strictObject({
  premises_id: UuidSchema, category_id: UuidSchema, description: NonEmptyStringSchema,
});
export const AcceptCaseRequestSchema = z.strictObject({
  client_revision: NonNegativeIntegerSchema.optional(),
});
export const SelectContractorRequestSchema = z.strictObject({
  contractor_id: UuidSchema, iteration_id: UuidSchema,
});
export const SendAssignmentRequestSchema = z.strictObject({
  selection_id: UuidSchema, iteration_id: UuidSchema,
});
export const AcceptAssignmentRequestSchema = z.strictObject({ assignment_id: UuidSchema });
export const RejectAssignmentRequestSchema = z.strictObject({
  assignment_id: UuidSchema, reason: NonEmptyStringSchema,
});
export const AddResultMaterialPayloadSchema = z.strictObject({
  assignment_id: UuidSchema, iteration_id: UuidSchema,
});
export const SubmitResultRequestSchema = z.strictObject({
  assignment_id: UuidSchema, iteration_id: UuidSchema,
  description: NonEmptyStringSchema, material_attachment_ids: z.array(UuidSchema),
});
export const ResidentConfirmationRequestSchema = z.strictObject({
  result_id: UuidSchema, iteration_id: UuidSchema,
});
export const ResidentRemarkPayloadSchema = z.strictObject({
  result_id: UuidSchema, iteration_id: UuidSchema, remark_text: NonEmptyStringSchema,
});
export const RequestClarificationRequestSchema = z.strictObject({
  result_id: UuidSchema, feedback_id: UuidSchema, message: NonEmptyStringSchema,
});
export const RequestClarificationPayloadSchema = RequestClarificationRequestSchema;
export const RecordNoResidentFeedbackRequestSchema = z.strictObject({
  result_id: UuidSchema, iteration_id: UuidSchema,
  basis_confirmed: z.literal(true), basis_note: NonEmptyStringSchema,
});
export const ReturnToReworkRequestSchema = z.strictObject({
  result_id: UuidSchema, feedback_id: UuidSchema,
});
const ConfirmationBasisSchema = z.strictObject({
  type: z.literal('RESIDENT_CONFIRMATION'), feedback_id: UuidSchema,
});
const NoFeedbackBasisSchema = z.strictObject({
  type: z.literal('NO_RESIDENT_FEEDBACK'), event_id: UuidSchema,
  completion_basis: z.strictObject({
    confirmed: z.literal(true), process_reference: NonEmptyStringSchema,
  }),
});
export const CompleteCaseRequestSchema = z.strictObject({
  result_id: UuidSchema,
  basis: z.discriminatedUnion('type', [ConfirmationBasisSchema, NoFeedbackBasisSchema]),
});
export const CompleteWithExplanationRequestSchema = z.strictObject({
  result_id: UuidSchema, feedback_id: UuidSchema, explanation: NonEmptyStringSchema,
});
export const AddCommentPayloadSchema = z.strictObject({
  body: z.string(), clarification_request_id: UuidSchema.nullable(),
});

export const NotificationQueuedSchema = z.strictObject({ status: z.literal('QUEUED') });
const successFields = {
  command_id: UuidSchema, case_id: UuidSchema, state: CaseStateSchema,
  revision: NonNegativeIntegerSchema, event_ids: z.array(UuidSchema),
};
const emptyCreated = z.strictObject({});
export const AcceptCaseSuccessSchema = z.strictObject({ ...successFields, created: emptyCreated });
export const AcceptAssignmentSuccessSchema = AcceptCaseSuccessSchema;
export const RejectAssignmentSuccessSchema = AcceptCaseSuccessSchema;
export const CompleteCaseSuccessSchema = AcceptCaseSuccessSchema;
export const CompleteWithExplanationSuccessSchema = AcceptCaseSuccessSchema;
export const CreateCaseSuccessSchema = z.strictObject({
  ...successFields, state: z.literal('CREATED'), revision: z.literal(1),
  created: z.strictObject({ iteration_id: UuidSchema }),
});
export const SelectContractorSuccessSchema = z.strictObject({
  ...successFields, created: z.strictObject({ selection_id: UuidSchema }),
});
export const SendAssignmentSuccessSchema = z.strictObject({
  ...successFields, created: z.strictObject({ assignment_id: UuidSchema }),
});
export const AddResultMaterialSuccessSchema = z.strictObject({
  ...successFields, created: z.strictObject({ attachment_id: UuidSchema }),
});
export const SubmitResultSuccessSchema = z.strictObject({
  ...successFields,
  created: z.strictObject({ result_id: UuidSchema, notification_intent_id: UuidSchema }),
  notification: NotificationQueuedSchema,
});
export const ResidentConfirmationSuccessSchema = z.strictObject({
  ...successFields, created: z.strictObject({ feedback_id: UuidSchema }),
});
export const ResidentRemarkSuccessSchema = ResidentConfirmationSuccessSchema;
export const RequestClarificationSuccessSchema = z.strictObject({
  ...successFields, created: z.strictObject({ comment_id: UuidSchema }),
});
export const RecordNoResidentFeedbackSuccessSchema = z.strictObject({
  ...successFields, created: emptyCreated, no_feedback_event_id: UuidSchema,
});
export const ReturnToReworkSuccessSchema = z.strictObject({
  ...successFields, event_ids: z.tuple([UuidSchema, UuidSchema]),
  created: z.strictObject({ iteration_id: UuidSchema, iteration_no: PositiveIntegerSchema }),
});
export const AddCommentSuccessSchema = RequestClarificationSuccessSchema;
export const CommandSuccessSchema = z.union([
  AcceptCaseSuccessSchema, CreateCaseSuccessSchema, SelectContractorSuccessSchema,
  SendAssignmentSuccessSchema, AddResultMaterialSuccessSchema,
  SubmitResultSuccessSchema, ResidentConfirmationSuccessSchema,
  RequestClarificationSuccessSchema, RecordNoResidentFeedbackSuccessSchema,
  ReturnToReworkSuccessSchema,
]);
