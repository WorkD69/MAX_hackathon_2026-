import { z } from 'zod';
import { UuidSchema, NonNegativeIntegerSchema } from './primitives.js';

export const SemanticErrorCodeSchema = z.enum([
  'MALFORMED_REQUEST', 'UNAUTHENTICATED', 'SESSION_EXPIRED', 'FORBIDDEN',
  'RESOURCE_NOT_FOUND', 'INVALID_STATE', 'TERMINAL_CASE', 'STALE_SELECTION',
  'STALE_ASSIGNMENT', 'STALE_ITERATION', 'STALE_RESULT', 'NOT_CURRENT_EXECUTOR',
  'FEEDBACK_ALREADY_SUBMITTED', 'NO_FEEDBACK_ALREADY_RECORDED',
  'COMPLETION_BASIS_INVALID', 'RESULT_MATERIAL_REQUIRED', 'RESULT_MATERIAL_INVALID',
  'REJECT_REASON_REQUIRED', 'EXPLANATION_REQUIRED', 'CATEGORY_INACTIVE',
  'CONTRACTOR_NOT_AVAILABLE', 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSE',
  'VALIDATION_FAILED', 'MAX_NOTIFICATION_CONFIGURATION_ERROR',
  'MAX_DELIVERY_TARGET_NOT_READY', 'DEMO_RUN_MISMATCH', 'DEMO_PRIMARY_CASE_EXISTS',
  'CLARIFICATION_CONTEXT_REQUIRED', 'INTERNAL_ERROR', 'INVALID_INIT_DATA_FORMAT',
  'MAX_INIT_DATA_INVALID_SIGNATURE', 'MAX_INIT_DATA_EXPIRED', 'APP_USER_NOT_MAPPED',
  'AUTH_BOOTSTRAP_FAILED', 'DEMO_MODE_DISABLED',
]);
const ErrorBodySchema = z.strictObject({
  code: SemanticErrorCodeSchema,
  message: z.string(),
  request_id: UuidSchema,
  case_id: UuidSchema.optional(),
  current_revision: NonNegativeIntegerSchema.optional(),
  details: z.strictObject({ target_assignment_id: UuidSchema }).optional(),
}).superRefine((value, ctx) => {
  if (value.details !== undefined && value.code !== 'STALE_ASSIGNMENT') {
    ctx.addIssue({ code: 'custom', path: ['details'], message: 'Details are only documented for STALE_ASSIGNMENT' });
  }
});
export const ErrorResponseSchema = z.strictObject({ error: ErrorBodySchema });
