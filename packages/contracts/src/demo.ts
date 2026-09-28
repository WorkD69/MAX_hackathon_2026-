import { z } from 'zod';
import { RoleSchema, UuidSchema } from './primitives.js';
import { AuthMaxSuccessSchema } from './session.js';

export const ActorSwitchRequestSchema = z.strictObject({ role_view: RoleSchema });
export const DemoRunStartRequestSchema = z.strictObject({
  scenario_key: z.literal('primary-housing-demo'),
});
export const DemoRunStartResponseSchema = z.strictObject({
  demo_run_id: UuidSchema,
  status: z.literal('ACTIVE'),
  primary_case_id: z.null(),
  role_views: z.tuple([
    z.literal('RESIDENT'),
    z.literal('UK_EMPLOYEE'),
    z.literal('UK_ADMIN'),
    z.literal('CONTRACTOR_EMPLOYEE'),
  ]),
  ...AuthMaxSuccessSchema.shape,
}).refine(value =>
  value.session.demo_mode &&
  value.session.demo_run_id === value.demo_run_id &&
  value.session.primary_case_id === null &&
  value.session.effective_actor.app_user_id === null &&
  value.session.effective_actor.role === null,
  { message: 'Start must issue an actor-null session for the new DemoRun' },
);
