import type { RuntimeConfig } from '../../config/types.js';
import { verifySession } from '../auth/session-token.js';
import { AuthorizationPolicy } from './policy.js';
import type { Action, AuthorizationRepository, CaseContext } from './policy.js';

/** Request entry point. Pass the same transaction-scoped repository after a Case lock for mutations. */
export class AuthorizationBoundary {
  private readonly policy: AuthorizationPolicy;
  constructor(
    private readonly config: RuntimeConfig,
    repository: AuthorizationRepository,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) { this.policy = new AuthorizationPolicy(repository); }

  private claims(token: string) { return verifySession(token, this.config, this.nowSeconds()); }

  async list<T>(token: string, query: (scope: Awaited<ReturnType<AuthorizationPolicy['listScope']>>,
    includes: (row: CaseContext) => Promise<boolean>) => Promise<T>): Promise<T> {
    const scope = await this.policy.listScope(this.claims(token));
    return query(scope, (row) => this.policy.listIncludes(scope, row));
  }
  async case(token: string, caseId: string) { return this.policy.case(this.claims(token), caseId); }
  async createCase(token: string, premisesId: string) { return this.policy.createCase(this.claims(token), premisesId); }
  async configuration(token: string, organizationId: string) {
    return this.policy.configuration(this.claims(token), organizationId);
  }
  async attachment(token: string, attachmentId: string) { return this.policy.attachment(this.claims(token), attachmentId); }
  async command(token: string, caseId: string, action: Action) {
    return this.policy.command(this.claims(token), caseId, action);
  }
  /** Await this gate before reading or sending TG-012's stored success. */
  async replay(token: string, caseId: string, action: Action, targetAssignmentId?: string) {
    return this.policy.replay(this.claims(token), caseId, action, targetAssignmentId);
  }
}
