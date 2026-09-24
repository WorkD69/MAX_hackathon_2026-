import { z } from 'zod';

export const UuidSchema = z.uuid();
export const UtcTimestampSchema = z.iso.datetime();
export const NonEmptyStringSchema = z.string().min(1);
export const NonNegativeIntegerSchema = z.int().min(0);
export const PositiveIntegerSchema = z.int().min(1);

export const CASE_STATES = [
  'CREATED', 'ACCEPTED_BY_UK', 'SENT_TO_CONTRACTOR', 'EXECUTION',
  'AWAITING_RESULT_CHECK', 'REMARKS_REVIEW', 'REWORK', 'COMPLETED',
] as const;
export const ROLES = ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'] as const;
export const CaseStateSchema = z.enum(CASE_STATES);
export const RoleSchema = z.enum(ROLES);
export const ResultRequirementSchema = z.enum(['NONE', 'PHOTO', 'FILE']);
export const AssignmentDecisionSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export const ResidentFeedbackTypeSchema = z.enum(['CONFIRMATION', 'REMARK']);
export const DemoRunStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const MaxIdentityLinkStatusSchema = z.enum(['UNLINKED', 'LINKED_CONFIRMED']);
export const SemanticEventCodeSchema = z.enum([
  'EVT_001', 'EVT_002', 'EVT_003', 'EVT_004', 'EVT_005', 'EVT_006',
  'EVT_007', 'EVT_008', 'EVT_009', 'EVT_010', 'EVT_011', 'EVT_012',
  'EVT_013', 'EVT_014', 'EVT_015', 'EVT_016', 'EVT_017',
]);

export const RequestIdHeaderSchema = UuidSchema;
export const AuthorizationHeaderSchema = z.string().regex(/^Bearer [^\s]+$/);
export const IdempotencyKeyHeaderSchema = z.string().regex(/^\S+$/);
export const IdempotencyReplayedHeaderSchema = z.literal('true');
export const ApplicationHeadersSchema = z.strictObject({
  authorization: AuthorizationHeaderSchema,
  'x-request-id': RequestIdHeaderSchema.optional(),
});
export const MutationHeadersSchema = ApplicationHeadersSchema.safeExtend({
  'idempotency-key': IdempotencyKeyHeaderSchema,
});
export const IdempotencyReplayHeadersSchema = z.strictObject({
  'idempotency-replayed': IdempotencyReplayedHeaderSchema.optional(),
});
export const SystemInfoResponseSchema = z.strictObject({ build_sha: NonEmptyStringSchema });
