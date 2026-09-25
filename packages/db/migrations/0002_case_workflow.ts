import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE case_table (
      case_id uuid PRIMARY KEY,
      display_number text NULL,
      organization_id uuid NOT NULL,
      house_id uuid NOT NULL,
      premises_id uuid NOT NULL,
      resident_user_id uuid NOT NULL,
      category_id uuid NOT NULL,
      description text NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      created_by_user_id uuid NOT NULL,
      demo_run_id uuid NULL,
      category_name_snapshot text NOT NULL,
      requires_access_snapshot boolean NOT NULL,
      result_requirement_snapshot text NOT NULL,
      default_contractor_snapshot_id uuid NULL,
      house_address_snapshot text NOT NULL,
      premises_label_snapshot text NOT NULL,
      current_state text NOT NULL,
      current_iteration_id uuid NOT NULL,
      current_selection_id uuid NULL,
      current_assignment_id uuid NULL,
      current_executor_contractor_id uuid NULL,
      current_result_id uuid NULL,
      closed_at timestamptz NULL,
      closed_by_user_id uuid NULL,
      closure_kind text NULL,
      closure_explanation text NULL,
      revision bigint NOT NULL DEFAULT 1,
      last_event_seq bigint NOT NULL DEFAULT 0,
      CONSTRAINT ck_case_current_state CHECK (current_state IN ('CREATED','ACCEPTED_BY_UK','SENT_TO_CONTRACTOR','EXECUTION','AWAITING_RESULT_CHECK','REMARKS_REVIEW','REWORK','COMPLETED')),
      CONSTRAINT ck_case_result_requirement_snapshot CHECK (result_requirement_snapshot IN ('NONE','PHOTO','FILE')),
      CONSTRAINT ck_case_closure_kind CHECK (closure_kind IS NULL OR closure_kind IN ('CONFIRMED_RESULT','NO_RESIDENT_FEEDBACK','DISPUTED_WITH_EXPLANATION')),
      CONSTRAINT ck_case_closure_consistency CHECK (
        (current_state = 'COMPLETED' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND closure_kind IS NOT NULL)
        OR (closure_kind = 'DISPUTED_WITH_EXPLANATION' AND closure_explanation IS NOT NULL AND btrim(closure_explanation) <> '')
        OR (current_state <> 'COMPLETED' AND closed_at IS NULL AND closed_by_user_id IS NULL AND closure_kind IS NULL AND closure_explanation IS NULL)
      ),
      CONSTRAINT ck_case_revision CHECK (revision >= 1),
      CONSTRAINT ck_case_last_event_seq CHECK (last_event_seq >= 0),
      CONSTRAINT uq_case_display_number UNIQUE (display_number) WHERE display_number IS NOT NULL,
      CONSTRAINT uq_case_demo_run_case UNIQUE (demo_run_id, case_id)
    )
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_organization_house FOREIGN KEY (organization_id, house_id) REFERENCES house (organization_id, house_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_house_premises FOREIGN KEY (house_id, premises_id) REFERENCES premises (house_id, premises_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_organization_category FOREIGN KEY (organization_id, category_id) REFERENCES category (organization_id, category_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_demo_run_id FOREIGN KEY (demo_run_id) REFERENCES demo_run (demo_run_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_current_iteration FOREIGN KEY (case_id, current_iteration_id) REFERENCES case_iteration (case_id, iteration_id) DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_current_selection FOREIGN KEY (case_id, current_selection_id) REFERENCES contractor_selection (case_id, selection_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_current_assignment FOREIGN KEY (case_id, current_assignment_id) REFERENCES assignment (case_id, assignment_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_current_result FOREIGN KEY (case_id, current_result_id) REFERENCES result (case_id, result_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_resident_user_id FOREIGN KEY (resident_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_category_id FOREIGN KEY (category_id) REFERENCES category (category_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_created_by_user_id FOREIGN KEY (created_by_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_default_contractor_snapshot_id FOREIGN KEY (default_contractor_snapshot_id) REFERENCES contractor (contractor_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_closed_by_user_id FOREIGN KEY (closed_by_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE case_table ADD CONSTRAINT fk_case_current_executor_contractor_id FOREIGN KEY (current_executor_contractor_id) REFERENCES contractor (contractor_id)
  `.execute(db);

  await sql`
    CREATE TABLE case_iteration (
      iteration_id uuid PRIMARY KEY,
      case_id uuid NOT NULL,
      iteration_no integer NOT NULL,
      start_reason text NOT NULL,
      started_at timestamptz NOT NULL,
      started_by_user_id uuid NOT NULL,
      source_result_id uuid NULL,
      source_feedback_id uuid NULL,
      started_by_event_id uuid NULL,
      CONSTRAINT cq_iteration_case_iteration UNIQUE (case_id, iteration_id),
      CONSTRAINT cq_iteration_case_no UNIQUE (case_id, iteration_no),
      CONSTRAINT ck_iteration_number CHECK (iteration_no >= 1),
      CONSTRAINT ck_iteration_start_reason CHECK (start_reason IN ('INITIAL','REWORK')),
      CONSTRAINT fk_iteration_case_id FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_iteration_started_by_user_id FOREIGN KEY (started_by_user_id) REFERENCES app_user (app_user_id),
      CONSTRAINT fk_iteration_source_result_id FOREIGN KEY (case_id, source_result_id) REFERENCES result (case_id, result_id),
      CONSTRAINT fk_iteration_source_feedback_id FOREIGN KEY (case_id, source_feedback_id) REFERENCES resident_feedback (case_id, feedback_id),
      CONSTRAINT fk_iteration_started_by_event_id FOREIGN KEY (case_id, started_by_event_id) REFERENCES case_event (case_id, event_id) DEFERRABLE INITIALLY DEFERRED
    )
  `.execute(db);

  await sql`
    CREATE TABLE contractor_selection (
      selection_id uuid PRIMARY KEY,
      case_id uuid NOT NULL,
      created_iteration_id uuid NOT NULL,
      contractor_id uuid NOT NULL,
      selected_by_user_id uuid NOT NULL,
      selected_at timestamptz NOT NULL,
      selection_no integer NOT NULL,
      CONSTRAINT cq_selection_case_selection UNIQUE (case_id, selection_id),
      CONSTRAINT cq_selection_case_no UNIQUE (case_id, selection_no),
      CONSTRAINT fk_selection_case_id FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_selection_created_iteration_id FOREIGN KEY (case_id, created_iteration_id) REFERENCES case_iteration (case_id, iteration_id),
      CONSTRAINT fk_selection_contractor_id FOREIGN KEY (contractor_id) REFERENCES contractor (contractor_id),
      CONSTRAINT fk_selection_selected_by_user_id FOREIGN KEY (selected_by_user_id) REFERENCES app_user (app_user_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE assignment (
      assignment_id uuid PRIMARY KEY,
      case_id uuid NOT NULL,
      selection_id uuid NOT NULL,
      contractor_id uuid NOT NULL,
      created_iteration_id uuid NOT NULL,
      assignment_no integer NOT NULL,
      sent_by_user_id uuid NOT NULL,
      sent_at timestamptz NOT NULL,
      decision_status text NOT NULL DEFAULT 'PENDING',
      accepted_at timestamptz NULL,
      accepted_by_user_id uuid NULL,
      rejected_at timestamptz NULL,
      rejected_by_user_id uuid NULL,
      reject_reason text NULL,
      CONSTRAINT cq_assignment_case_assignment UNIQUE (case_id, assignment_id),
      CONSTRAINT cq_assignment_case_no UNIQUE (case_id, assignment_no),
      CONSTRAINT uq_assignment_selection_id UNIQUE (selection_id),
      CONSTRAINT ck_assignment_decision CHECK (
        (decision_status = 'PENDING' AND accepted_at IS NULL AND rejected_at IS NULL AND accepted_by_user_id IS NULL AND rejected_by_user_id IS NULL AND reject_reason IS NULL)
        OR (decision_status = 'ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL AND rejected_at IS NULL AND rejected_by_user_id IS NULL AND reject_reason IS NULL)
        OR (decision_status = 'REJECTED' AND rejected_at IS NOT NULL AND rejected_by_user_id IS NOT NULL AND reject_reason IS NOT NULL AND reject_reason <> '' AND accepted_at IS NULL AND accepted_by_user_id IS NULL)
      ),
      CONSTRAINT fk_assignment_case_id FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_assignment_selection_id FOREIGN KEY (case_id, selection_id) REFERENCES contractor_selection (case_id, selection_id),
      CONSTRAINT fk_assignment_created_iteration_id FOREIGN KEY (case_id, created_iteration_id) REFERENCES case_iteration (case_id, iteration_id),
      CONSTRAINT fk_assignment_contractor_id FOREIGN KEY (contractor_id) REFERENCES contractor (contractor_id),
      CONSTRAINT fk_assignment_sent_by_user_id FOREIGN KEY (sent_by_user_id) REFERENCES app_user (app_user_id),
      CONSTRAINT fk_assignment_accepted_by_user_id FOREIGN KEY (accepted_by_user_id) REFERENCES app_user (app_user_id),
      CONSTRAINT fk_assignment_rejected_by_user_id FOREIGN KEY (rejected_by_user_id) REFERENCES app_user (app_user_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE result (
      result_id uuid PRIMARY KEY,
      case_id uuid NOT NULL,
      iteration_id uuid NOT NULL,
      assignment_id uuid NOT NULL,
      contractor_id uuid NOT NULL,
      author_user_id uuid NOT NULL,
      description text NOT NULL,
      submitted_at timestamptz NOT NULL,
      CONSTRAINT uq_result_iteration_id UNIQUE (iteration_id),
      CONSTRAINT cq_result_case_result UNIQUE (case_id, result_id),
      CONSTRAINT ck_result_description_not_empty CHECK (length(description) > 0),
      CONSTRAINT fk_result_case_id FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_result_iteration_id FOREIGN KEY (case_id, iteration_id) REFERENCES case_iteration (case_id, iteration_id),
      CONSTRAINT fk_result_assignment_id FOREIGN KEY (case_id, assignment_id) REFERENCES assignment (case_id, assignment_id),
      CONSTRAINT fk_result_contractor_id FOREIGN KEY (contractor_id) REFERENCES contractor (contractor_id),
      CONSTRAINT fk_result_author_user_id FOREIGN KEY (author_user_id) REFERENCES app_user (app_user_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE resident_feedback (
      feedback_id uuid PRIMARY KEY,
      case_id uuid NOT NULL,
      iteration_id uuid NOT NULL,
      result_id uuid NOT NULL,
      resident_user_id uuid NOT NULL,
      type text NOT NULL,
      remark_text text NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_feedback_result_id UNIQUE (result_id),
      CONSTRAINT cq_feedback_case_feedback UNIQUE (case_id, feedback_id),
      CONSTRAINT ck_feedback_type CHECK (type IN ('CONFIRMATION','REMARK')),
      CONSTRAINT ck_feedback_remark CHECK (
        (type = 'REMARK' AND length(remark_text) > 0)
        OR (type = 'CONFIRMATION' AND (remark_text IS NULL OR remark_text = ''))
      ),
      CONSTRAINT fk_feedback_case_id FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_feedback_iteration_id FOREIGN KEY (case_id, iteration_id) REFERENCES case_iteration (case_id, iteration_id),
      CONSTRAINT fk_feedback_result_id FOREIGN KEY (case_id, result_id) REFERENCES result (case_id, result_id),
      CONSTRAINT fk_feedback_resident_user_id FOREIGN KEY (resident_user_id) REFERENCES app_user (app_user_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE comment (
      comment_id uuid PRIMARY KEY,
      case_id uuid NOT NULL,
      iteration_id uuid NOT NULL,
      author_user_id uuid NOT NULL,
      actor_role_snapshot text NOT NULL,
      actor_organization_id uuid NULL,
      actor_contractor_id uuid NULL,
      comment_kind text NOT NULL,
      context_result_id uuid NULL,
      context_feedback_id uuid NULL,
      in_reply_to_comment_id uuid NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT ck_comment_kind CHECK (comment_kind IN ('WORKING','CLARIFICATION_REQUEST','CLARIFICATION_REPLY')),
      CONSTRAINT ck_comment_actor_role_snapshot CHECK (actor_role_snapshot IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE')),
      CONSTRAINT cq_comment_case_comment UNIQUE (case_id, comment_id),
      CONSTRAINT fk_comment_case_id FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_comment_iteration_id FOREIGN KEY (case_id, iteration_id) REFERENCES case_iteration (case_id, iteration_id),
      CONSTRAINT fk_comment_author_user_id FOREIGN KEY (author_user_id) REFERENCES app_user (app_user_id),
      CONSTRAINT fk_comment_context_result_id FOREIGN KEY (case_id, context_result_id) REFERENCES result (case_id, result_id),
      CONSTRAINT fk_comment_context_feedback_id FOREIGN KEY (case_id, context_feedback_id) REFERENCES resident_feedback (case_id, feedback_id),
      CONSTRAINT fk_comment_in_reply_to_comment_id FOREIGN KEY (case_id, in_reply_to_comment_id) REFERENCES comment (case_id, comment_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE case_event (
      event_id uuid PRIMARY KEY,
      case_id uuid NOT NULL,
      event_seq bigint NOT NULL,
      event_type text NOT NULL,
      occurred_at timestamptz NOT NULL,
      actor_user_id uuid NULL,
      actor_role_snapshot text NULL,
      actor_organization_id uuid NULL,
      actor_contractor_id uuid NULL,
      from_state text NULL,
      to_state text NULL,
      iteration_id uuid NULL,
      selection_id uuid NULL,
      assignment_id uuid NULL,
      result_id uuid NULL,
      feedback_id uuid NULL,
      comment_id uuid NULL,
      attachment_id uuid NULL,
      description text NOT NULL,
      presentation_data jsonb NULL,
      command_id uuid NOT NULL,
      caused_by_event_id uuid NULL,
      derived boolean NOT NULL DEFAULT false,
      CONSTRAINT uq_event_case_seq UNIQUE (case_id, event_seq),
      CONSTRAINT cq_event_case_event UNIQUE (case_id, event_id),
      CONSTRAINT ck_event_type CHECK (event_type IN ('EVT_001','EVT_002','EVT_003','EVT_004','EVT_005','EVT_006','EVT_007','EVT_008','EVT_009','EVT_010','EVT_011','EVT_012','EVT_013','EVT_014','EVT_015','EVT_016','EVT_017')),
      CONSTRAINT ck_event_actor_role_snapshot CHECK (actor_role_snapshot IS NULL OR actor_role_snapshot IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE')),
      CONSTRAINT ck_event_from_state CHECK (from_state IS NULL OR from_state IN ('CREATED','ACCEPTED_BY_UK','SENT_TO_CONTRACTOR','EXECUTION','AWAITING_RESULT_CHECK','REMARKS_REVIEW','REWORK','COMPLETED')),
      CONSTRAINT ck_event_to_state CHECK (to_state IS NULL OR to_state IN ('CREATED','ACCEPTED_BY_UK','SENT_TO_CONTRACTOR','EXECUTION','AWAITING_RESULT_CHECK','REMARKS_REVIEW','REWORK','COMPLETED')),
      CONSTRAINT ck_event_evt015_result CHECK (event_type <> 'EVT_015' OR result_id IS NOT NULL),
      CONSTRAINT uq_evt015_per_result UNIQUE (result_id, event_type) WHERE event_type = 'EVT_015',
      CONSTRAINT fk_event_case_id FOREIGN KEY (case_id) REFERENCES case_table (case_id),
      CONSTRAINT fk_event_iteration_id FOREIGN KEY (case_id, iteration_id) REFERENCES case_iteration (case_id, iteration_id) DEFERRABLE INITIALLY DEFERRED,
      CONSTRAINT fk_event_selection_id FOREIGN KEY (case_id, selection_id) REFERENCES contractor_selection (case_id, selection_id),
      CONSTRAINT fk_event_assignment_id FOREIGN KEY (case_id, assignment_id) REFERENCES assignment (case_id, assignment_id),
      CONSTRAINT fk_event_result_id FOREIGN KEY (case_id, result_id) REFERENCES result (case_id, result_id),
      CONSTRAINT fk_event_feedback_id FOREIGN KEY (case_id, feedback_id) REFERENCES resident_feedback (case_id, feedback_id),
      CONSTRAINT fk_event_comment_id FOREIGN KEY (case_id, comment_id) REFERENCES comment (case_id, comment_id),
      CONSTRAINT fk_event_caused_by_event_id FOREIGN KEY (case_id, caused_by_event_id) REFERENCES case_event (case_id, event_id),
      CONSTRAINT fk_event_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES app_user (app_user_id)
    )
  `.execute(db);

  await sql`
    ALTER TABLE demo_run ADD CONSTRAINT fk_demo_run_primary_case FOREIGN KEY (demo_run_id, primary_case_id) REFERENCES case_table (demo_run_id, case_id) DEFERRABLE INITIALLY DEFERRED
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE demo_run DROP CONSTRAINT IF EXISTS fk_demo_run_primary_case;
    DROP TABLE IF EXISTS case_event;
    DROP TABLE IF EXISTS comment;
    DROP TABLE IF EXISTS resident_feedback;
    DROP TABLE IF EXISTS result;
    DROP TABLE IF EXISTS assignment;
    DROP TABLE IF EXISTS contractor_selection;
    DROP TABLE IF EXISTS case_iteration;
    DROP TABLE IF EXISTS case_table;
  `.execute(db);
}
