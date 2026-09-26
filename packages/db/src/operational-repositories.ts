import { sql } from 'kysely';
import type { Insertable, Kysely, Selectable } from 'kysely';
import type {
  AttachmentTable,
  CommandExecutionTable,
  ConfigurationChangeTable,
  Database,
  NotificationIntentTable,
} from './index.js';

export type AttachmentRecord = Selectable<AttachmentTable>;
export type CommandExecutionRecord = Selectable<CommandExecutionTable>;
export type NotificationIntentRecord = Selectable<NotificationIntentTable>;
export type ConfigurationChangeRecord = Selectable<ConfigurationChangeTable>;

export interface ClaimNotificationInput {
  claimToken: string;
  claimedAt: Date;
  leaseExpiresAt: Date;
}

export function createOperationalRepositories(db: Kysely<Database>) {
  return {
    attachments: {
      async create(values: Insertable<AttachmentTable>): Promise<AttachmentRecord> {
        return db.insertInto('attachment').values(values).returningAll().executeTakeFirstOrThrow();
      },

      async findById(attachmentId: string): Promise<AttachmentRecord | undefined> {
        return db.selectFrom('attachment').selectAll().where('attachment_id', '=', attachmentId).executeTakeFirst();
      },

      async associateInitial(caseId: string, attachmentId: string): Promise<void> {
        await db.insertInto('case_initial_attachment').values({ case_id: caseId, attachment_id: attachmentId }).executeTakeFirstOrThrow();
      },

      async associateWorkMaterial(values: Database['work_material_attachment']): Promise<void> {
        await db.insertInto('work_material_attachment').values(values).executeTakeFirstOrThrow();
      },

      async associateResult(values: Database['result_attachment']): Promise<void> {
        await db.insertInto('result_attachment').values(values).executeTakeFirstOrThrow();
      },

      async associateFeedback(values: Database['feedback_attachment']): Promise<void> {
        await db.insertInto('feedback_attachment').values(values).executeTakeFirstOrThrow();
      },

      async associateComment(values: Database['comment_attachment']): Promise<void> {
        await db.insertInto('comment_attachment').values(values).executeTakeFirstOrThrow();
      },
    },

    commandExecutions: {
      async reserve(values: Insertable<CommandExecutionTable>): Promise<CommandExecutionRecord> {
        return db.insertInto('command_execution').values(values).returningAll().executeTakeFirstOrThrow();
      },

      async findById(commandId: string): Promise<CommandExecutionRecord | undefined> {
        return db.selectFrom('command_execution').selectAll().where('command_id', '=', commandId).executeTakeFirst();
      },

      async succeed(
        commandId: string,
        response: { httpStatus: number; responseBody: unknown; completedAt: Date },
      ): Promise<CommandExecutionRecord | undefined> {
        return db
          .updateTable('command_execution')
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
    },

    notificationIntents: {
      async create(values: Insertable<NotificationIntentTable>): Promise<NotificationIntentRecord> {
        return db.insertInto('notification_intent').values(values).returningAll().executeTakeFirstOrThrow();
      },

      async claimNext(input: ClaimNotificationInput): Promise<NotificationIntentRecord | undefined> {
        const result = await sql<NotificationIntentRecord>`
          WITH candidate AS (
            SELECT notification_intent_id
              FROM notification_intent
             WHERE (status IN ('PENDING','RETRY') AND next_attempt_at <= ${input.claimedAt})
                OR (status = 'CLAIMED' AND lease_expires_at <= ${input.claimedAt})
             ORDER BY COALESCE(next_attempt_at, lease_expires_at), created_at
             FOR UPDATE SKIP LOCKED
             LIMIT 1
          )
          UPDATE notification_intent AS intent
             SET status = 'CLAIMED',
                 claim_token = ${input.claimToken}::uuid,
                 claimed_at = ${input.claimedAt},
                 lease_expires_at = ${input.leaseExpiresAt},
                 delivered_at = NULL,
                 last_attempt_at = ${input.claimedAt},
                 attempt_count = intent.attempt_count + 1
            FROM candidate
           WHERE intent.notification_intent_id = candidate.notification_intent_id
          RETURNING intent.*
        `.execute(db);
        return result.rows[0];
      },

      async markDelivered(
        intentId: string,
        claimToken: string,
        deliveredAt: Date,
        providerMessageId: string | null,
      ): Promise<NotificationIntentRecord | undefined> {
        return db
          .updateTable('notification_intent')
          .set({
            status: 'DELIVERED',
            delivered_at: deliveredAt,
            provider_message_id: providerMessageId,
            claim_token: null,
            claimed_at: null,
            lease_expires_at: null,
          })
          .where('notification_intent_id', '=', intentId)
          .where('status', '=', 'CLAIMED')
          .where('claim_token', '=', claimToken)
          .returningAll()
          .executeTakeFirst();
      },

      async scheduleRetry(
        intentId: string,
        claimToken: string,
        nextAttemptAt: Date,
        error: { code: string | null; message: string | null },
      ): Promise<NotificationIntentRecord | undefined> {
        return db
          .updateTable('notification_intent')
          .set({
            status: 'RETRY',
            next_attempt_at: nextAttemptAt,
            claim_token: null,
            claimed_at: null,
            lease_expires_at: null,
            last_error_code: error.code,
            last_error_message: error.message,
          })
          .where('notification_intent_id', '=', intentId)
          .where('status', '=', 'CLAIMED')
          .where('claim_token', '=', claimToken)
          .returningAll()
          .executeTakeFirst();
      },

      async markPermanentFailure(
        intentId: string,
        claimToken: string,
        error: { code: string | null; message: string | null },
      ): Promise<NotificationIntentRecord | undefined> {
        return db
          .updateTable('notification_intent')
          .set({
            status: 'PERMANENT_FAILURE',
            next_attempt_at: null,
            claim_token: null,
            claimed_at: null,
            lease_expires_at: null,
            last_error_code: error.code,
            last_error_message: error.message,
          })
          .where('notification_intent_id', '=', intentId)
          .where('status', '=', 'CLAIMED')
          .where('claim_token', '=', claimToken)
          .returningAll()
          .executeTakeFirst();
      },

      async redrive(intentId: string, nextAttemptAt: Date): Promise<NotificationIntentRecord | undefined> {
        return db
          .updateTable('notification_intent')
          .set((eb) => ({
            status: 'RETRY',
            next_attempt_at: nextAttemptAt,
            last_error_code: null,
            last_error_message: null,
            operational_redrive_count: eb('operational_redrive_count', '+', 1),
          }))
          .where('notification_intent_id', '=', intentId)
          .where('status', '=', 'PERMANENT_FAILURE')
          .returningAll()
          .executeTakeFirst();
      },
    },

    configurationChanges: {
      async append(values: Insertable<ConfigurationChangeTable>): Promise<ConfigurationChangeRecord> {
        return db.insertInto('configuration_change').values(values).returningAll().executeTakeFirstOrThrow();
      },
    },
  };
}
