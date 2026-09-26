import { CompiledQuery } from 'kysely';
import type { DatabaseConnection, DatabaseTransaction, Role } from '@max-smart-city/db';
import { PostgresMaxIdentityRepository } from '../max-identity/repository.js';
import { demoActors, defaultContractorActor } from './catalog.js';
import { DemoError } from './errors.js';

type ReadDatabase = Pick<DatabaseConnection, 'selectFrom' | 'executeQuery'>;

/** TG-010 repository reads on the same connection/transaction as the command. */
export function demoIdentityRepository(db: ReadDatabase): PostgresMaxIdentityRepository {
  return new PostgresMaxIdentityRepository({
    async query<Row extends object>(text: string, values: unknown[]) {
      return db.executeQuery<Row>(CompiledQuery.raw(text, values));
    },
  });
}

/** NO KEY UPDATE serializes writers without upgrading the reservation/Case FK's KEY SHARE. */
export async function lockDemoIdentity(tx: DatabaseTransaction, identityId: string): Promise<void> {
  const identity = await tx.selectFrom('max_identity').select('max_identity_id')
    .where('max_identity_id', '=', identityId).forNoKeyUpdate().executeTakeFirst();
  if (!identity) throw new DemoError('RESOURCE_NOT_FOUND', 404);
  await tx.selectFrom('demo_run').select('demo_run_id')
    .where('created_by_max_identity_id', '=', identityId).where('status', '=', 'ACTIVE').forNoKeyUpdate().execute();
}

/** Internal only: public role_view never supplies an actor, binding or tenant selector. */
export async function resolveDemoActor(db: Pick<DatabaseConnection, 'selectFrom'>, runId: string,
  role: Role, primaryCaseId: string | null): Promise<string | null> {
  const run = await db.selectFrom('demo_run').select(['status', 'primary_case_id'])
    .where('demo_run_id', '=', runId).executeTakeFirst();
  if (!run || run.status !== 'ACTIVE' || run.primary_case_id !== primaryCaseId) return null;
  let candidates = demoActors.filter(actor => actor.role === role);
  if (role === 'CONTRACTOR_EMPLOYEE') {
    let contractorId: string | null = null;
    if (primaryCaseId) {
      const row = await db.selectFrom('case_table').select(['demo_run_id', 'current_assignment_id',
        'current_executor_contractor_id', 'current_state']).where('case_id', '=', primaryCaseId).executeTakeFirst();
      if (!row || row.demo_run_id !== runId) return null;
      if (row.current_assignment_id) {
        const assignment = await db.selectFrom('assignment').select(['contractor_id', 'decision_status'])
          .where('assignment_id', '=', row.current_assignment_id).where('case_id', '=', primaryCaseId).executeTakeFirst();
        if (!assignment) return null;
        if (assignment.decision_status === 'PENDING') contractorId = assignment.contractor_id;
      }
      contractorId ??= row.current_executor_contractor_id;
      if (!contractorId && !['CREATED', 'ACCEPTED_BY_UK', 'REWORK'].includes(row.current_state)) return null;
    }
    if (contractorId) {
      const bindings = await db.selectFrom('user_role_binding').select('app_user_id')
        .where('role', '=', role).where('contractor_id', '=', contractorId).where('active', '=', true).execute();
      candidates = candidates.filter(actor => bindings.some(binding => binding.app_user_id === actor.appUserId));
    } else candidates = candidates.filter(actor => actor.appUserId === defaultContractorActor.appUserId);
  }
  if (candidates.length !== 1) return null;
  const candidate = candidates[0]!;
  const member = await db.selectFrom('demo_run_actor').select('app_user_id')
    .where('demo_run_id', '=', runId).where('app_user_id', '=', candidate.appUserId)
    .where('role', '=', candidate.role).where('actor_alias', '=', candidate.actorAlias).executeTakeFirst();
  return member?.app_user_id ?? null;
}

/** Call inside TG-014's CreateCase/kernel transaction; never opens or commits a transaction. */
export async function bindPrimaryCase(tx: DatabaseTransaction, identityId: string,
  runId: string, caseId: string): Promise<void> {
  await lockDemoIdentity(tx, identityId);
  const run = await tx.selectFrom('demo_run').selectAll().where('demo_run_id', '=', runId).forNoKeyUpdate().executeTakeFirst();
  if (!run || run.status !== 'ACTIVE' || run.created_by_max_identity_id !== identityId) {
    throw new DemoError('RESOURCE_NOT_FOUND', 404);
  }
  const row = await tx.selectFrom('case_table').select(['demo_run_id', 'resident_user_id'])
    .where('case_id', '=', caseId).executeTakeFirst();
  if (!row || row.demo_run_id !== runId ||
    await resolveDemoActor(tx, runId, 'RESIDENT', run.primary_case_id) !== row.resident_user_id) {
    throw new DemoError('RESOURCE_NOT_FOUND', 404);
  }
  if (run.primary_case_id !== null && run.primary_case_id !== caseId) throw new DemoError('DEMO_PRIMARY_CASE_EXISTS', 409);
  if (run.primary_case_id === null) {
    await tx.updateTable('demo_run').set({ primary_case_id: caseId }).where('demo_run_id', '=', runId)
      .where('primary_case_id', 'is', null).execute();
  }
}
