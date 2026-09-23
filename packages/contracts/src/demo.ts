import { z } from 'zod';
import { RoleSchema, UuidSchema } from './primitives.js';

export const ActorSwitchRequestSchema = z.strictObject({ role_view: RoleSchema });
export const DemoRunStartRequestSchema = z.strictObject({
  scenario_key: z.literal('primary-housing-demo'),
});
export const DemoRunStartResponseSchema = z.strictObject({
  demo_run_id: UuidSchema,
  status: z.literal('ACTIVE'),
  primary_case_id: UuidSchema.nullable(),
  role_views: z.tuple([
    z.literal('RESIDENT'),
    z.literal('UK_EMPLOYEE'),
    z.literal('UK_ADMIN'),
    z.literal('CONTRACTOR_EMPLOYEE'),
  ]),
});
