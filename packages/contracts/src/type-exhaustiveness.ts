import type { z } from 'zod';
import { CaseStateSchema, RoleSchema } from './primitives.js';

type CaseState = z.output<typeof CaseStateSchema>;
type Role = z.output<typeof RoleSchema>;
const states: Record<CaseState, true> = {
  CREATED: true, ACCEPTED_BY_UK: true, SENT_TO_CONTRACTOR: true,
  EXECUTION: true, AWAITING_RESULT_CHECK: true, REMARKS_REVIEW: true,
  REWORK: true, COMPLETED: true,
};
const roles: Record<Role, true> = {
  RESIDENT: true, UK_EMPLOYEE: true, UK_ADMIN: true, CONTRACTOR_EMPLOYEE: true,
};
// @ts-expect-error A ninth state is outside the canonical union.
const ninthState: CaseState = 'NINTH_STATE';
// @ts-expect-error A fifth role is outside the canonical union.
const fifthRole: Role = 'FIFTH_ROLE';
void states;
void roles;
void ninthState;
void fifthRole;
