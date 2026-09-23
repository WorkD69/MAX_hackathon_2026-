import { z } from 'zod';
import { RoleSchema, UtcTimestampSchema, UuidSchema, NonEmptyStringSchema } from './primitives.js';

export const SessionContextSchema = z.strictObject({
  real_max_identity: z.strictObject({
    max_identity_id: UuidSchema,
    display_name: z.string(),
    outbound_max_ready: z.boolean(),
  }),
  demo_mode: z.boolean(),
  demo_run_id: UuidSchema.nullable(),
  primary_case_id: UuidSchema.nullable(),
  effective_actor: z.strictObject({
    app_user_id: UuidSchema.nullable(),
    role: RoleSchema.nullable(),
    display_name: z.string(),
  }),
});
export const AuthMaxSuccessSchema = z.strictObject({
  session_token: NonEmptyStringSchema,
  expires_at: UtcTimestampSchema,
  session: SessionContextSchema,
});
export const SessionReadResponseSchema = SessionContextSchema;
export const ActorSwitchSuccessSchema = AuthMaxSuccessSchema;
