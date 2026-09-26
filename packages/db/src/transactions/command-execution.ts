import type { Insertable, Kysely, Selectable, Transaction } from 'kysely';
import type { CaseTable, CommandExecutionTable, Database } from '../index.js';

export type DatabaseConnection = Kysely<Database>;
export type DatabaseTransaction = Transaction<Database>;
export type LockedCase = Selectable<CaseTable>;
export type CommandExecutionRecord = Selectable<CommandExecutionTable>;

export type CommandPrincipal =
  | { readonly type: 'APP_USER'; readonly appUserId: string }
  | { readonly type: 'MAX_IDENTITY'; readonly maxIdentityId: string };

export interface CommandReservationInput {
  readonly commandId: string;
  readonly principal: CommandPrincipal;
  readonly idempotencyKey: string;
  readonly commandType: string;
  readonly caseId: string | null;
  readonly requestHash: string;
  readonly createdAt: Date;
}

export type CommandReservation =
  | { readonly owner: true; readonly execution: CommandExecutionRecord }
  | { readonly owner: false; readonly execution: CommandExecutionRecord };

const principalColumns = (principal: CommandPrincipal) => principal.type === 'APP_USER'
  ? { principal_type: principal.type, app_user_id: principal.appUserId, max_identity_id: null }
  : { principal_type: principal.type, app_user_id: null, max_identity_id: principal.maxIdentityId };

export function createCommandExecutionRepository(db: DatabaseConnection | DatabaseTransaction) {
  const findByPrincipalAndKey = async (
    principal: CommandPrincipal,
    idempotencyKey: string,
  ): Promise<CommandExecutionRecord | undefined> => {
    let query = db.selectFrom('command_execution').selectAll().where('idempotency_key', '=', idempotencyKey);
    query = principal.type === 'APP_USER'
      ? query.where('principal_type', '=', 'APP_USER').where('app_user_id', '=', principal.appUserId)
      : query.where('principal_type', '=', 'MAX_IDENTITY').where('max_identity_id', '=', principal.maxIdentityId);
    return query.executeTakeFirst();
  };

  return {
    async reserve(values: Insertable<CommandExecutionTable>): Promise<CommandExecutionRecord> {
      return db.insertInto('command_execution').values(values).returningAll().executeTakeFirstOrThrow();
    },

    async reserveOrFind(input: CommandReservationInput): Promise<CommandReservation> {
      const values: Insertable<CommandExecutionTable> = {
        command_id: input.commandId,
        ...principalColumns(input.principal),
        idempotency_key: input.idempotencyKey,
        command_type: input.commandType,
        case_id: input.caseId,
        request_hash: input.requestHash,
        execution_status: 'IN_PROGRESS',
        http_status: null,
        response_body: null,
        created_at: input.createdAt,
        completed_at: null,
      };

      const insert = db.insertInto('command_execution').values(values);
      const reserved = input.principal.type === 'APP_USER'
        ? await insert
          .onConflict((conflict) => conflict
            .columns(['app_user_id', 'idempotency_key'])
            .where('principal_type', '=', 'APP_USER')
            .doNothing())
          .returningAll()
          .executeTakeFirst()
        : await insert
          .onConflict((conflict) => conflict
            .columns(['max_identity_id', 'idempotency_key'])
            .where('principal_type', '=', 'MAX_IDENTITY')
            .doNothing())
          .returningAll()
          .executeTakeFirst();

      if (reserved) return { owner: true, execution: reserved };

      // PostgreSQL waits for the conflicting transaction before DO NOTHING returns.
      // A committed duplicate must therefore be visible in this transaction snapshot.
      const existing = await findByPrincipalAndKey(input.principal, input.idempotencyKey);
      if (!existing) throw new Error('COMMAND_RESERVATION_CONFLICT_WITHOUT_VISIBLE_EXECUTION');
      return { owner: false, execution: existing };
    },

    findByPrincipalAndKey,

    async findById(commandId: string): Promise<CommandExecutionRecord | undefined> {
      return db.selectFrom('command_execution').selectAll().where('command_id', '=', commandId).executeTakeFirst();
    },

    async lockCases(caseIds: readonly string[]): Promise<readonly LockedCase[]> {
      const ordered = [...new Set(caseIds)].sort((left, right) => left.localeCompare(right));
      const rows: LockedCase[] = [];
      // Individual statements guarantee acquisition order even if PostgreSQL changes its plan.
      for (const caseId of ordered) {
        const row = await db.selectFrom('case_table').selectAll()
          .where('case_id', '=', caseId).forUpdate().executeTakeFirst();
        if (row) rows.push(row);
      }
      return rows;
    },

    async readCase(caseId: string): Promise<LockedCase | undefined> {
      return db.selectFrom('case_table').selectAll().where('case_id', '=', caseId).executeTakeFirst();
    },

    async incrementCaseRevision(caseId: string): Promise<number> {
      const row = await db.updateTable('case_table')
        .set((expression) => ({ revision: expression('revision', '+', 1) }))
        .where('case_id', '=', caseId)
        .returning('revision')
        .executeTakeFirst();
      if (!row) throw new Error('COMMAND_CASE_DISAPPEARED');
      const revision = Number(row.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('COMMAND_CASE_REVISION_INVALID');
      return revision;
    },

    async readCaseRevision(caseId: string): Promise<number> {
      const row = await db.selectFrom('case_table').select('revision').where('case_id', '=', caseId).executeTakeFirst();
      if (!row) throw new Error('COMMAND_CREATED_CASE_MISSING');
      const revision = Number(row.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('COMMAND_CASE_REVISION_INVALID');
      return revision;
    },

    async succeed(
      commandId: string,
      response: { httpStatus: number; responseBody: unknown; completedAt: Date },
    ): Promise<CommandExecutionRecord | undefined> {
      return db.updateTable('command_execution')
        .set({
          execution_status: 'SUCCEEDED',
          http_status: response.httpStatus,
          response_body: response.responseBody,
          completed_at: response.completedAt,
        })
        .where('command_id', '=', commandId)
        .where('execution_status', '=', 'IN_PROGRESS')
        .returningAll()
        .executeTakeFirst();
    },
  };
}
