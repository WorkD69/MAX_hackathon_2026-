import { ResidentCreateCaseOptionsQuerySchema, ResidentCreateCaseOptionsResponseSchema } from '@max-smart-city/contracts';
import type { DatabaseConnection } from '@max-smart-city/db';
import type { RuntimeConfig } from '../../../../config/types.js';
import { SessionError, verifySession } from '../../../auth/session-token.js';
import { createTransactionAuthorizationRepository } from '../../../commands/kernel/authorization.js';
import { AuthorizationError, AuthorizationPolicy } from '../../../authorization/policy.js';

export class IntakeError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

/** Display choices only. CreateCase repeats all checks under its transaction locks. */
export async function residentCreateOptions(database: DatabaseConnection, config: RuntimeConfig,
  token: string, query: unknown, nowSeconds = Math.floor(Date.now() / 1000)) {
  const claims = verifySession(token, config, nowSeconds);
  if (claims.demo_mode !== config.DEMO_MODE) throw new SessionError('SESSION_EXPIRED');
  const parsed = ResidentCreateCaseOptionsQuerySchema.safeParse(query);
  if (!parsed.success) throw new IntakeError('VALIDATION_FAILED', 400);
  return database.transaction().execute(async transaction => {
    const policy = new AuthorizationPolicy(createTransactionAuthorizationRepository(transaction));
    const principal = await policy.principal(claims);
    if (principal.binding.role !== 'RESIDENT') throw new AuthorizationError('FORBIDDEN');
    const premises = await transaction.selectFrom('resident_premises_access as access')
      .innerJoin('premises as p', 'p.premises_id', 'access.premises_id')
      .innerJoin('house as h', 'h.house_id', 'p.house_id')
      .innerJoin('organization as o', 'o.organization_id', 'h.organization_id')
      .select(['p.premises_id', 'h.address as house_address', 'p.number_or_label as premises_label',
        'o.organization_id'])
      .where('access.app_user_id', '=', principal.app_user_id)
      .where('access.active', '=', true).where('p.active', '=', true)
      .where('h.active', '=', true).where('o.active', '=', true)
      .orderBy('h.address').orderBy('p.number_or_label').orderBy('p.premises_id').execute();
    const selected = parsed.data.premises_id;
    const selectedRow = selected ? premises.find(row => row.premises_id === selected) : undefined;
    if (selected && !selectedRow) throw new AuthorizationError('NOT_FOUND');
    const categories = selectedRow ? await transaction.selectFrom('category as c')
      .leftJoin('contractor as contractor', 'contractor.contractor_id', 'c.default_contractor_id')
      .leftJoin('organization_contractor as mapping', join => join
        .onRef('mapping.contractor_id', '=', 'c.default_contractor_id')
        .onRef('mapping.organization_id', '=', 'c.organization_id'))
      .select(['c.category_id', 'c.name', 'c.description', 'c.requires_premises_access', 'c.result_requirement'])
      .where('c.organization_id', '=', selectedRow.organization_id).where('c.active', '=', true)
      .where(eb => eb.or([
        eb('c.default_contractor_id', 'is', null),
        eb.and([eb('contractor.active', '=', true), eb('mapping.active', '=', true)]),
      ]))
      .orderBy('c.name').orderBy('c.category_id').execute() : [];
    return ResidentCreateCaseOptionsResponseSchema.parse({
      premises: premises.map(row => ({ premises_id: row.premises_id,
        house_address: row.house_address, premises_label: row.premises_label })),
      selected_premises_id: selected ?? null, categories,
    });
  });
}
