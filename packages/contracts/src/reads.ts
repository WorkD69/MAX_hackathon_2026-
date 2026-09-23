import { z } from 'zod';
import {
  AssignmentDecisionSchema, CaseStateSchema, NonNegativeIntegerSchema,
  PositiveIntegerSchema, ResidentFeedbackTypeSchema, ResultRequirementSchema,
  RoleSchema, SemanticEventCodeSchema, UtcTimestampSchema, UuidSchema,
} from './primitives.js';
import { AttachmentMetadataSchema } from './attachments.js';

const HttpLimitSchema = z.string().regex(/^[1-9][0-9]*$/).transform((value, ctx) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    ctx.addIssue({ code: 'custom', message: 'limit must be a positive safe integer' });
    return z.NEVER;
  }
  return parsed;
});
export const CaseListQuerySchema = z.strictObject({
  state: CaseStateSchema.optional(),
  limit: HttpLimitSchema.optional(),
  cursor: z.string().optional(),
});
export const CaseListItemSchema = z.strictObject({
  case_id: UuidSchema, display_number: z.string(), state: CaseStateSchema,
  category: z.string(), location_label: z.string(),
  current_iteration_no: PositiveIntegerSchema, updated_at: UtcTimestampSchema,
  responsibility: z.string(),
});
export const CaseListResponseSchema = z.strictObject({
  items: z.array(CaseListItemSchema), next_cursor: z.string().nullable(),
});

export const ContractorReferenceSchema = z.strictObject({
  contractor_id: UuidSchema, name: z.string(),
});
export const ResultProjectionSchema = z.strictObject({
  result_id: UuidSchema, iteration_id: UuidSchema, description: z.string(),
  submitted_at: UtcTimestampSchema, attachments: z.array(AttachmentMetadataSchema),
});
export const FeedbackProjectionSchema = z.strictObject({
  feedback_id: UuidSchema, result_id: UuidSchema, type: ResidentFeedbackTypeSchema,
  remark_text: z.string().nullable(), created_at: UtcTimestampSchema,
});
export const CommentProjectionSchema = z.strictObject({
  comment_id: UuidSchema, body: z.string(), created_at: UtcTimestampSchema,
});
export const ActivityItemSchema = z.strictObject({
  activity_id: UuidSchema, event_id: UuidSchema, event_seq: PositiveIntegerSchema,
  semantic_code: SemanticEventCodeSchema, occurred_at: UtcTimestampSchema,
  iteration_no: PositiveIntegerSchema,
  actor: z.strictObject({ role: RoleSchema, display_name: z.string() }),
  text: z.string(),
  state_transition: z.strictObject({ from: CaseStateSchema, to: CaseStateSchema }).nullable(),
  domain: z.strictObject({
    result: ResultProjectionSchema.nullable(),
    feedback: FeedbackProjectionSchema.nullable(),
    comment: CommentProjectionSchema.nullable(),
  }),
  attachments: z.array(AttachmentMetadataSchema),
}).refine((item) => item.activity_id === item.event_id, {
  path: ['activity_id'], message: 'activity_id must equal event_id',
});

const ActionInputSchema = z.strictObject({ reject_reason_required: z.boolean().optional() });
const action = <Code extends string, Target extends z.ZodType>(
  code: Code, target: Target,
) => z.strictObject({ code: z.literal(code), target, input: ActionInputSchema });
const emptyTarget = z.strictObject({});
const iterationTarget = z.strictObject({ iteration_id: UuidSchema });
const assignmentTarget = z.strictObject({ assignment_id: UuidSchema });
const assignmentIterationTarget = z.strictObject({ assignment_id: UuidSchema, iteration_id: UuidSchema });
const resultIterationTarget = z.strictObject({ result_id: UuidSchema, iteration_id: UuidSchema });
const resultFeedbackTarget = z.strictObject({ result_id: UuidSchema, feedback_id: UuidSchema });
export const AllowedActionSchema = z.discriminatedUnion('code', [
  action('ACCEPT_CASE', emptyTarget),
  action('SELECT_CONTRACTOR', iterationTarget),
  action('SEND_ASSIGNMENT', z.strictObject({ selection_id: UuidSchema, iteration_id: UuidSchema })),
  action('ACCEPT_ASSIGNMENT', assignmentTarget),
  action('REJECT_ASSIGNMENT', assignmentTarget),
  action('ADD_RESULT_MATERIAL', assignmentIterationTarget),
  action('SUBMIT_RESULT', assignmentIterationTarget),
  action('RESIDENT_CONFIRM', resultIterationTarget),
  action('RESIDENT_REMARK', resultIterationTarget),
  action('RECORD_NO_RESIDENT_FEEDBACK', resultIterationTarget),
  action('REQUEST_CLARIFICATION', resultFeedbackTarget),
  action('RETURN_TO_REWORK', resultFeedbackTarget),
  action('COMPLETE_CASE', z.strictObject({ result_id: UuidSchema })),
  action('COMPLETE_WITH_EXPLANATION', resultFeedbackTarget),
  action('ADD_COMMENT', emptyTarget),
]);

const AssignmentBaseSchema = z.strictObject({
  assignment_id: UuidSchema, contractor: ContractorReferenceSchema,
  decision: AssignmentDecisionSchema,
});
const UkAssignmentSchema = AssignmentBaseSchema.safeExtend({
  reject_reason: z.string().optional(),
});
const SnapshotFields = {
  case_id: UuidSchema,
  display_number: z.string(),
  state: CaseStateSchema,
  revision: NonNegativeIntegerSchema,
  created_at: UtcTimestampSchema,
  updated_at: UtcTimestampSchema,
  description: z.string(),
  location: z.strictObject({ house: z.string(), premises: z.string() }),
  category: z.strictObject({ name: z.string(), result_requirement: ResultRequirementSchema }),
  current_iteration: z.strictObject({ iteration_id: UuidSchema, number: PositiveIntegerSchema }),
  responsibility: z.strictObject({ semantic_code: z.string(), text: z.string() }),
  initial_attachments: z.array(AttachmentMetadataSchema),
  selection: z.strictObject({
    selection_id: UuidSchema, contractor: ContractorReferenceSchema,
  }).nullable(),
  current_executor: ContractorReferenceSchema.nullable(),
  current_result: ResultProjectionSchema.nullable(),
  resident_feedback: FeedbackProjectionSchema.nullable(),
  activity: z.array(ActivityItemSchema),
  allowed_actions: z.array(AllowedActionSchema),
};
const orderedActivity = <T extends { activity: { event_id: string; event_seq: number }[] }>(value: T, ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  let previous = 0;
  for (const [index, item] of value.activity.entries()) {
    if (seen.has(item.event_id) || item.event_seq <= previous) {
      ctx.addIssue({ code: 'custom', path: ['activity', index], message: 'Activity must be unique and ordered by event_seq' });
    }
    seen.add(item.event_id);
    previous = item.event_seq;
  }
};
export const CaseSnapshotProjectionSchema = z.strictObject({
  ...SnapshotFields, assignment: UkAssignmentSchema.nullable(),
}).superRefine(orderedActivity);
const ResidentProjectionSchema = z.strictObject({
  ...SnapshotFields, assignment: AssignmentBaseSchema.nullable(),
}).superRefine(orderedActivity);
const ContractorProjectionSchema = z.strictObject({
  ...SnapshotFields, assignment: AssignmentBaseSchema.nullable(),
}).superRefine(orderedActivity);
export const CaseSnapshotSchema = z.strictObject({ case: CaseSnapshotProjectionSchema });
export const ResidentCaseSnapshotSchema = z.strictObject({ case: ResidentProjectionSchema });
export const UkCaseSnapshotSchema = CaseSnapshotSchema;
export const ContractorCaseSnapshotSchema = z.strictObject({ case: ContractorProjectionSchema });
