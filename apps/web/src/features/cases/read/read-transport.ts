import {
  CaseListResponseSchema, ResidentCaseSnapshotSchema, UkCaseSnapshotSchema,
  ContractorCaseSnapshotSchema,
  type CaseListResponseOutput, type CaseSnapshotOutput, type RoleOutput,
} from '@max-smart-city/contracts';

export class CaseReadHttpError extends Error {
  constructor(readonly status: number) { super(`Case read failed (${status})`); }
}

export interface CaseReadTransport {
  list(): Promise<CaseListResponseOutput>;
  snapshot(caseId: string, role: RoleOutput): Promise<CaseSnapshotOutput>;
}

export function createHttpCaseReadTransport(
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
): CaseReadTransport {
  async function get(path: string): Promise<unknown> {
    const response = await authorizedFetch(path, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new CaseReadHttpError(response.status);
    return response.json();
  }
  return {
    list: async () => CaseListResponseSchema.parse(await get('/api/v1/cases')),
    snapshot: async (caseId, role) => {
      const schema = role === 'RESIDENT' ? ResidentCaseSnapshotSchema
        : role === 'CONTRACTOR_EMPLOYEE' ? ContractorCaseSnapshotSchema
          : UkCaseSnapshotSchema;
      return schema.parse(await get(`/api/v1/cases/${encodeURIComponent(caseId)}`));
    },
  };
}
