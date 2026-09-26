import type { NotificationIntentRecord } from '@max-smart-city/db';

export interface SqlQueryResult<Row> {
  readonly rows: Row[];
  readonly rowCount?: number | null;
}

export interface SqlExecutor {
  query<Row extends object>(text: string, values?: unknown[]): Promise<SqlQueryResult<Row>>;
}

export interface ClaimOptions {
  readonly claimToken: string;
  readonly claimedAt: Date;
  readonly leaseExpiresAt: Date;
  readonly maxAttempts: number;
}

export interface NotificationFailure {
  readonly code: string;
  readonly message: string;
}

export interface RedriveResult {
  readonly intent: NotificationIntentRecord;
  readonly previousAttemptCount: number;
}

export interface NotificationStore {
  recoverExpiredExhausted(now: Date, maxAttempts: number): Promise<NotificationIntentRecord | undefined>;
  claimNext(options: ClaimOptions): Promise<NotificationIntentRecord | undefined>;
  markDelivered(intentId: string, claimToken: string, deliveredAt: Date, providerMessageId: string | null): Promise<NotificationIntentRecord | undefined>;
  scheduleRetry(intentId: string, claimToken: string, nextAttemptAt: Date, failure: NotificationFailure): Promise<NotificationIntentRecord | undefined>;
  markPermanentFailure(intentId: string, claimToken: string, failure: NotificationFailure): Promise<NotificationIntentRecord | undefined>;
  redrive(intentId: string, nextAttemptAt: Date): Promise<RedriveResult | undefined>;
}

export class PostgresNotificationStore implements NotificationStore {
  constructor(private readonly sql: SqlExecutor) {}

  async recoverExpiredExhausted(now: Date, maxAttempts: number): Promise<NotificationIntentRecord | undefined> {
    const result = await this.sql.query<NotificationIntentRecord>(`
      WITH candidate AS (
        SELECT notification_intent_id, claim_token
          FROM notification_intent
         WHERE notification_kind = 'RESULT_READY'
           AND status = 'CLAIMED'
           AND lease_expires_at <= $1
           AND attempt_count >= $2
         ORDER BY lease_expires_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      UPDATE notification_intent AS intent
         SET status = 'PERMANENT_FAILURE',
             next_attempt_at = NULL,
             claim_token = NULL,
             claimed_at = NULL,
             lease_expires_at = NULL,
             last_error_code = 'ATTEMPTS_EXHAUSTED',
             last_error_message = 'Notification delivery attempts exhausted'
        FROM candidate
       WHERE intent.notification_intent_id = candidate.notification_intent_id
         AND intent.status = 'CLAIMED'
         AND intent.claim_token = candidate.claim_token
      RETURNING intent.*
    `, [now, maxAttempts]);
    return result.rows[0];
  }

  async claimNext(options: ClaimOptions): Promise<NotificationIntentRecord | undefined> {
    const result = await this.sql.query<NotificationIntentRecord>(`
      WITH candidate AS (
        SELECT notification_intent_id
          FROM notification_intent
         WHERE notification_kind = 'RESULT_READY'
           AND attempt_count < $4
           AND (
             (status IN ('PENDING','RETRY') AND next_attempt_at <= $2)
             OR (status = 'CLAIMED' AND lease_expires_at <= $2)
           )
         ORDER BY COALESCE(next_attempt_at, lease_expires_at), created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      UPDATE notification_intent AS intent
         SET status = 'CLAIMED',
             claim_token = $1::uuid,
             claimed_at = $2,
             lease_expires_at = $3,
             next_attempt_at = NULL,
             delivered_at = NULL,
             last_attempt_at = $2,
             attempt_count = intent.attempt_count + 1
        FROM candidate
       WHERE intent.notification_intent_id = candidate.notification_intent_id
      RETURNING intent.*
    `, [options.claimToken, options.claimedAt, options.leaseExpiresAt, options.maxAttempts]);
    return result.rows[0];
  }

  async markDelivered(intentId: string, claimToken: string, deliveredAt: Date, providerMessageId: string | null): Promise<NotificationIntentRecord | undefined> {
    const result = await this.sql.query<NotificationIntentRecord>(`
      UPDATE notification_intent
         SET status = 'DELIVERED', delivered_at = $3, provider_message_id = $4,
             next_attempt_at = NULL, claim_token = NULL, claimed_at = NULL, lease_expires_at = NULL,
             last_error_code = NULL, last_error_message = NULL
       WHERE notification_intent_id = $1 AND status = 'CLAIMED' AND claim_token = $2::uuid
      RETURNING *
    `, [intentId, claimToken, deliveredAt, providerMessageId]);
    return result.rows[0];
  }

  async scheduleRetry(intentId: string, claimToken: string, nextAttemptAt: Date, failure: NotificationFailure): Promise<NotificationIntentRecord | undefined> {
    const result = await this.sql.query<NotificationIntentRecord>(`
      UPDATE notification_intent
         SET status = 'RETRY', next_attempt_at = $3,
             claim_token = NULL, claimed_at = NULL, lease_expires_at = NULL,
             last_error_code = $4, last_error_message = $5
       WHERE notification_intent_id = $1 AND status = 'CLAIMED' AND claim_token = $2::uuid
      RETURNING *
    `, [intentId, claimToken, nextAttemptAt, failure.code, failure.message]);
    return result.rows[0];
  }

  async markPermanentFailure(intentId: string, claimToken: string, failure: NotificationFailure): Promise<NotificationIntentRecord | undefined> {
    const result = await this.sql.query<NotificationIntentRecord>(`
      UPDATE notification_intent
         SET status = 'PERMANENT_FAILURE', next_attempt_at = NULL,
             claim_token = NULL, claimed_at = NULL, lease_expires_at = NULL,
             last_error_code = $3, last_error_message = $4
       WHERE notification_intent_id = $1 AND status = 'CLAIMED' AND claim_token = $2::uuid
      RETURNING *
    `, [intentId, claimToken, failure.code, failure.message]);
    return result.rows[0];
  }

  async redrive(intentId: string, nextAttemptAt: Date): Promise<RedriveResult | undefined> {
    type Row = NotificationIntentRecord & { previous_attempt_count: number };
    const result = await this.sql.query<Row>(`
      WITH candidate AS (
        SELECT notification_intent_id, attempt_count AS previous_attempt_count
          FROM notification_intent
         WHERE notification_intent_id = $1 AND status = 'PERMANENT_FAILURE'
         FOR UPDATE
      )
      UPDATE notification_intent AS intent
         SET status = 'RETRY', attempt_count = 0, next_attempt_at = $2,
             claim_token = NULL, claimed_at = NULL, lease_expires_at = NULL,
             delivered_at = NULL, provider_message_id = NULL,
             last_error_code = NULL, last_error_message = NULL,
             operational_redrive_count = intent.operational_redrive_count + 1
        FROM candidate
       WHERE intent.notification_intent_id = candidate.notification_intent_id
      RETURNING intent.*, candidate.previous_attempt_count
    `, [intentId, nextAttemptAt]);
    const row = result.rows[0];
    if (!row) return undefined;
    const { previous_attempt_count, ...intent } = row;
    return { intent: intent as NotificationIntentRecord, previousAttemptCount: previous_attempt_count };
  }
}
