import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE command_execution (
      command_id uuid CONSTRAINT pk_command_execution PRIMARY KEY,
      principal_type text NOT NULL,
      app_user_id uuid NULL,
      max_identity_id uuid NULL,
      idempotency_key text NOT NULL,
      command_type text NOT NULL,
      case_id uuid NULL,
      request_hash text NOT NULL,
      execution_status text NOT NULL,
      http_status integer NULL,
      response_body jsonb NULL,
      created_at timestamptz NOT NULL,
      completed_at timestamptz NULL,
      CONSTRAINT ck_command_execution_principal_type CHECK (principal_type IN ('APP_USER','MAX_IDENTITY')),
      CONSTRAINT ck_command_execution_principal_shape CHECK (
        (principal_type = 'APP_USER' AND app_user_id IS NOT NULL AND max_identity_id IS NULL)
        OR (principal_type = 'MAX_IDENTITY' AND max_identity_id IS NOT NULL AND app_user_id IS NULL)
      ),
      CONSTRAINT ck_command_execution_status CHECK (execution_status IN ('IN_PROGRESS','SUCCEEDED')),
      CONSTRAINT ck_command_execution_response_shape CHECK (
        (execution_status = 'IN_PROGRESS' AND http_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
        OR (execution_status = 'SUCCEEDED' AND http_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
      ),
      CONSTRAINT ck_command_execution_http_status CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
      CONSTRAINT fk_command_execution_app_user FOREIGN KEY (app_user_id) REFERENCES app_user (app_user_id),
      CONSTRAINT fk_command_execution_max_identity FOREIGN KEY (max_identity_id) REFERENCES max_identity (max_identity_id),
      CONSTRAINT fk_command_execution_case FOREIGN KEY (case_id) REFERENCES case_table (case_id)
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_command_execution_app_user_key
      ON command_execution (app_user_id, idempotency_key)
      WHERE principal_type = 'APP_USER'
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_command_execution_max_identity_key
      ON command_execution (max_identity_id, idempotency_key)
      WHERE principal_type = 'MAX_IDENTITY'
  `.execute(db);

  await sql`
    CREATE TABLE attachment (
      attachment_id uuid CONSTRAINT pk_attachment PRIMARY KEY,
      case_id uuid NOT NULL,
      uploaded_by_user_id uuid NOT NULL,
      file_name text NOT NULL,
      mime_type text NOT NULL,
      byte_size bigint NOT NULL,
      sha256 text NOT NULL,
      content bytea NOT NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT cq_attachment_case_attachment UNIQUE (case_id, attachment_id),
      CONSTRAINT ck_attachment_file_name CHECK (btrim(file_name) <> ''),
      CONSTRAINT ck_attachment_mime_type CHECK (btrim(mime_type) <> ''),
      CONSTRAINT ck_attachment_byte_size CHECK (byte_size >= 0 AND byte_size = octet_length(content)),
      CONSTRAINT ck_attachment_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT fk_attachment_case FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_attachment_uploaded_by_user FOREIGN KEY (uploaded_by_user_id) REFERENCES app_user (app_user_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE case_initial_attachment (
      case_id uuid NOT NULL,
      attachment_id uuid NOT NULL,
      CONSTRAINT pk_case_initial_attachment PRIMARY KEY (case_id, attachment_id),
      CONSTRAINT fk_case_initial_attachment_case FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_case_initial_attachment_attachment FOREIGN KEY (case_id, attachment_id) REFERENCES attachment (case_id, attachment_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE work_material_attachment (
      case_id uuid NOT NULL,
      iteration_id uuid NOT NULL,
      assignment_id uuid NOT NULL,
      attachment_id uuid NOT NULL,
      created_event_id uuid NOT NULL,
      CONSTRAINT pk_work_material_attachment PRIMARY KEY (attachment_id),
      CONSTRAINT fk_work_material_attachment_case FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_work_material_attachment_attachment FOREIGN KEY (case_id, attachment_id) REFERENCES attachment (case_id, attachment_id),
      CONSTRAINT fk_work_material_attachment_iteration FOREIGN KEY (case_id, iteration_id) REFERENCES case_iteration (case_id, iteration_id),
      CONSTRAINT fk_work_material_attachment_assignment FOREIGN KEY (case_id, assignment_id) REFERENCES assignment (case_id, assignment_id),
      CONSTRAINT fk_work_material_attachment_event FOREIGN KEY (case_id, created_event_id) REFERENCES case_event (case_id, event_id) DEFERRABLE INITIALLY DEFERRED
    )
  `.execute(db);

  await sql`
    CREATE TABLE result_attachment (
      case_id uuid NOT NULL,
      result_id uuid NOT NULL,
      attachment_id uuid NOT NULL,
      CONSTRAINT pk_result_attachment PRIMARY KEY (result_id, attachment_id),
      CONSTRAINT fk_result_attachment_case FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_result_attachment_result FOREIGN KEY (case_id, result_id) REFERENCES result (case_id, result_id),
      CONSTRAINT fk_result_attachment_attachment FOREIGN KEY (case_id, attachment_id) REFERENCES attachment (case_id, attachment_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE feedback_attachment (
      case_id uuid NOT NULL,
      feedback_id uuid NOT NULL,
      attachment_id uuid NOT NULL,
      CONSTRAINT pk_feedback_attachment PRIMARY KEY (feedback_id, attachment_id),
      CONSTRAINT fk_feedback_attachment_case FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_feedback_attachment_feedback FOREIGN KEY (case_id, feedback_id) REFERENCES resident_feedback (case_id, feedback_id),
      CONSTRAINT fk_feedback_attachment_attachment FOREIGN KEY (case_id, attachment_id) REFERENCES attachment (case_id, attachment_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE comment_attachment (
      case_id uuid NOT NULL,
      comment_id uuid NOT NULL,
      attachment_id uuid NOT NULL,
      CONSTRAINT pk_comment_attachment PRIMARY KEY (comment_id, attachment_id),
      CONSTRAINT fk_comment_attachment_case FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_comment_attachment_comment FOREIGN KEY (case_id, comment_id) REFERENCES comment (case_id, comment_id),
      CONSTRAINT fk_comment_attachment_attachment FOREIGN KEY (case_id, attachment_id) REFERENCES attachment (case_id, attachment_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE notification_intent (
      notification_intent_id uuid CONSTRAINT pk_notification_intent PRIMARY KEY,
      case_id uuid NOT NULL,
      result_id uuid NOT NULL,
      recipient_max_identity_id uuid NOT NULL,
      delivery_chat_id text NOT NULL,
      delivery_chat_type text NOT NULL,
      notification_kind text NOT NULL,
      dedupe_key text NOT NULL,
      payload jsonb NOT NULL,
      status text NOT NULL,
      attempt_count integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NULL,
      last_attempt_at timestamptz NULL,
      claim_token uuid NULL,
      claimed_at timestamptz NULL,
      lease_expires_at timestamptz NULL,
      delivered_at timestamptz NULL,
      provider_message_id text NULL,
      last_error_code text NULL,
      last_error_message text NULL,
      operational_redrive_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_notification_intent_dedupe_key UNIQUE (dedupe_key),
      CONSTRAINT uq_notification_intent_result_kind UNIQUE (result_id, notification_kind),
      CONSTRAINT ck_notification_intent_kind CHECK (notification_kind IN ('RESULT_READY')),
      CONSTRAINT ck_notification_intent_status CHECK (status IN ('PENDING','RETRY','CLAIMED','DELIVERED','PERMANENT_FAILURE')),
      CONSTRAINT ck_notification_intent_counters CHECK (attempt_count >= 0 AND operational_redrive_count >= 0),
      CONSTRAINT ck_notification_intent_status_shape CHECK (
        (status IN ('PENDING','RETRY') AND claim_token IS NULL AND claimed_at IS NULL AND lease_expires_at IS NULL AND delivered_at IS NULL AND next_attempt_at IS NOT NULL)
        OR (status = 'CLAIMED' AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL AND delivered_at IS NULL)
        OR (status = 'DELIVERED' AND delivered_at IS NOT NULL AND claim_token IS NULL AND claimed_at IS NULL AND lease_expires_at IS NULL)
        OR (status = 'PERMANENT_FAILURE' AND claim_token IS NULL AND claimed_at IS NULL AND lease_expires_at IS NULL AND delivered_at IS NULL AND next_attempt_at IS NULL)
      ),
      CONSTRAINT ck_notification_intent_lease CHECK (status <> 'CLAIMED' OR lease_expires_at > claimed_at),
      CONSTRAINT fk_notification_intent_case FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_notification_intent_result FOREIGN KEY (case_id, result_id) REFERENCES result (case_id, result_id),
      CONSTRAINT fk_notification_intent_recipient FOREIGN KEY (recipient_max_identity_id) REFERENCES max_identity (max_identity_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE configuration_change (
      config_change_id uuid CONSTRAINT pk_configuration_change PRIMARY KEY,
      organization_id uuid NOT NULL,
      entity_type text NOT NULL,
      entity_id uuid NOT NULL,
      action text NOT NULL,
      before_data jsonb NULL,
      after_data jsonb NOT NULL,
      actor_user_id uuid NOT NULL,
      occurred_at timestamptz NOT NULL,
      command_id uuid NOT NULL,
      CONSTRAINT ck_configuration_change_entity_type CHECK (btrim(entity_type) <> ''),
      CONSTRAINT ck_configuration_change_action CHECK (btrim(action) <> ''),
      CONSTRAINT fk_configuration_change_organization FOREIGN KEY (organization_id) REFERENCES organization (organization_id),
      CONSTRAINT fk_configuration_change_actor FOREIGN KEY (actor_user_id) REFERENCES app_user (app_user_id),
      CONSTRAINT fk_configuration_change_command FOREIGN KEY (command_id) REFERENCES command_execution (command_id)
    )
  `.execute(db);

  await sql`
    ALTER TABLE case_event
      ADD CONSTRAINT fk_event_command_id FOREIGN KEY (command_id) REFERENCES command_execution (command_id),
      ADD CONSTRAINT fk_event_attachment_id FOREIGN KEY (case_id, attachment_id) REFERENCES attachment (case_id, attachment_id)
  `.execute(db);

  await sql`
    CREATE FUNCTION tg007_attachment_is_associated(target_attachment_id uuid) RETURNS boolean
    LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM case_initial_attachment WHERE attachment_id = target_attachment_id)
          OR EXISTS (SELECT 1 FROM work_material_attachment WHERE attachment_id = target_attachment_id)
          OR EXISTS (SELECT 1 FROM result_attachment WHERE attachment_id = target_attachment_id)
          OR EXISTS (SELECT 1 FROM feedback_attachment WHERE attachment_id = target_attachment_id)
          OR EXISTS (SELECT 1 FROM comment_attachment WHERE attachment_id = target_attachment_id)
          OR EXISTS (SELECT 1 FROM case_event WHERE attachment_id = target_attachment_id)
    $$
  `.execute(db);

  await sql`
    CREATE FUNCTION tg007_guard_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF tg007_attachment_is_associated(OLD.attachment_id) THEN
        IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
          RAISE EXCEPTION 'tg007_attachment_immutable: associated Attachment cannot be changed or deleted';
        END IF;
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END
    $$
  `.execute(db);

  await sql`
    CREATE TRIGGER tg007_attachment_immutable
      BEFORE UPDATE OR DELETE ON attachment
      FOR EACH ROW EXECUTE FUNCTION tg007_guard_attachment()
  `.execute(db);

  await sql`
    CREATE FUNCTION tg007_reject_append_only_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'tg007_append_only: % does not allow %', TG_TABLE_NAME, TG_OP;
    END
    $$
  `.execute(db);

  for (const table of [
    'case_initial_attachment',
    'work_material_attachment',
    'result_attachment',
    'feedback_attachment',
    'comment_attachment',
    'configuration_change',
  ]) {
    await sql.raw(`
      CREATE TRIGGER tg007_${table}_append_only
        BEFORE UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION tg007_reject_append_only_change()
    `).execute(db);
  }

  await sql`
    CREATE FUNCTION tg007_guard_command_execution() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'tg007_command_execution_immutable: DELETE is prohibited';
      END IF;

      IF NEW.command_id IS DISTINCT FROM OLD.command_id
        OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
        OR NEW.app_user_id IS DISTINCT FROM OLD.app_user_id
        OR NEW.max_identity_id IS DISTINCT FROM OLD.max_identity_id
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.command_type IS DISTINCT FROM OLD.command_type
        OR NEW.case_id IS DISTINCT FROM OLD.case_id
        OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'tg007_command_execution_immutable: reservation identity and fingerprint are immutable';
      END IF;

      IF OLD.execution_status = 'IN_PROGRESS' AND NEW.execution_status = 'SUCCEEDED' THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'tg007_command_execution_transition: only IN_PROGRESS to SUCCEEDED is allowed';
    END
    $$
  `.execute(db);

  await sql`
    CREATE TRIGGER tg007_command_execution_immutable
      BEFORE UPDATE OR DELETE ON command_execution
      FOR EACH ROW EXECUTE FUNCTION tg007_guard_command_execution()
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE case_event DROP CONSTRAINT IF EXISTS fk_event_attachment_id`.execute(db);
  await sql`ALTER TABLE case_event DROP CONSTRAINT IF EXISTS fk_event_command_id`.execute(db);

  await sql`DROP TRIGGER IF EXISTS tg007_command_execution_immutable ON command_execution`.execute(db);
  await sql`DROP TRIGGER IF EXISTS tg007_attachment_immutable ON attachment`.execute(db);
  for (const table of [
    'case_initial_attachment',
    'work_material_attachment',
    'result_attachment',
    'feedback_attachment',
    'comment_attachment',
    'configuration_change',
  ]) {
    await sql.raw(`DROP TRIGGER IF EXISTS tg007_${table}_append_only ON ${table}`).execute(db);
  }

  await sql`DROP FUNCTION IF EXISTS tg007_guard_command_execution()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS tg007_guard_attachment()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS tg007_attachment_is_associated(uuid)`.execute(db);
  await sql`DROP FUNCTION IF EXISTS tg007_reject_append_only_change()`.execute(db);

  await sql`DROP TABLE IF EXISTS configuration_change`.execute(db);
  await sql`DROP TABLE IF EXISTS notification_intent`.execute(db);
  await sql`DROP TABLE IF EXISTS comment_attachment`.execute(db);
  await sql`DROP TABLE IF EXISTS feedback_attachment`.execute(db);
  await sql`DROP TABLE IF EXISTS result_attachment`.execute(db);
  await sql`DROP TABLE IF EXISTS work_material_attachment`.execute(db);
  await sql`DROP TABLE IF EXISTS case_initial_attachment`.execute(db);
  await sql`DROP TABLE IF EXISTS attachment`.execute(db);
  await sql`DROP TABLE IF EXISTS command_execution`.execute(db);
}
