import { describe, expect, it } from 'vitest';
import { CategoryReadSchema, ContractorReadSchema } from '@max-smart-city/contracts';
import { categoryView, contractorView } from './repository.js';
import type { Category, Contractor, OrganizationContractor } from './repository.js';

describe('configuration public projections', () => {
  it('keeps Category revision and authoritative actor in persisted metadata only', () => {
    const row = {
      category_id: 'e0180000-0000-4000-8000-000000000001',
      organization_id: 'e0180000-0000-4000-8000-000000000002',
      name: 'Name', description: null, default_contractor_id: null,
      requires_premises_access: true, result_requirement: 'PHOTO', active: false,
      config_revision: '37', updated_by_user_id: 'e0180000-0000-4000-8000-000000000003',
      created_at: new Date(), updated_at: new Date(),
    } satisfies Category;
    const projected = categoryView(row);
    expect(CategoryReadSchema.parse(projected)).toEqual(projected);
    expect(projected).not.toHaveProperty('config_revision');
    expect(projected).not.toHaveProperty('updated_by_user_id');
    expect(projected).not.toHaveProperty('organization_id');
  });

  it('reports global Contractor and own binding active flags separately', () => {
    const contractor = { contractor_id: 'e0180000-0000-4000-8000-000000000004',
      display_name: 'Contractor', active: true, created_at: new Date(), updated_at: new Date(),
    } satisfies Contractor;
    const binding = { organization_id: 'e0180000-0000-4000-8000-000000000002',
      contractor_id: contractor.contractor_id, active: false, created_at: new Date(),
    } satisfies OrganizationContractor;
    expect(ContractorReadSchema.parse(contractorView(contractor, binding))).toMatchObject({
      contractor: { active: true }, organization_contractor: { active: false },
    });
  });
});
