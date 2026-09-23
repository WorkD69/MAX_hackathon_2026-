import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE organization (
      organization_id uuid PRIMARY KEY,
      name text NOT NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE house (
      house_id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      address text NOT NULL,
      display_label text NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE premises (
      premises_id uuid PRIMARY KEY,
      house_id uuid NOT NULL,
      number_or_label text NOT NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE app_user (
      app_user_id uuid PRIMARY KEY,
      display_name text NOT NULL,
      is_synthetic boolean NOT NULL DEFAULT false,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE user_role_binding (
      role_binding_id uuid PRIMARY KEY,
      app_user_id uuid NOT NULL,
      role text NOT NULL,
      organization_id uuid NULL,
      contractor_id uuid NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE resident_premises_access (
      app_user_id uuid NOT NULL,
      premises_id uuid NOT NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE uk_house_access (
      app_user_id uuid NOT NULL,
      house_id uuid NOT NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE max_identity (
      max_identity_id uuid PRIMARY KEY,
      mini_app_user_id text NULL,
      delivery_chat_id text NULL,
      delivery_chat_type text NULL,
      bot_user_id text NULL,
      link_status text NOT NULL,
      app_user_id uuid NULL,
      first_seen_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      linked_at timestamptz NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE category (
      category_id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      name text NOT NULL,
      description text NULL,
      default_contractor_id uuid NULL,
      requires_premises_access boolean NOT NULL,
      result_requirement text NOT NULL,
      active boolean NOT NULL,
      config_revision bigint NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      updated_by_user_id uuid NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE contractor (
      contractor_id uuid PRIMARY KEY,
      display_name text NOT NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE organization_contractor (
      organization_id uuid NOT NULL,
      contractor_id uuid NOT NULL,
      active boolean NOT NULL,
      created_at timestamptz NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE demo_run (
      demo_run_id uuid PRIMARY KEY,
      scenario_key text NOT NULL,
      status text NOT NULL,
      created_by_max_identity_id uuid NOT NULL,
      notification_recipient_max_identity_id uuid NOT NULL,
      primary_case_id uuid NULL,
      created_at timestamptz NOT NULL,
      archived_at timestamptz NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE demo_run_actor (
      demo_run_id uuid NOT NULL,
      app_user_id uuid NOT NULL,
      role text NOT NULL,
      actor_alias text NOT NULL
    )
  `.execute(db);

  await sql`
    ALTER TABLE resident_premises_access ADD CONSTRAINT pk_resident_premises_access PRIMARY KEY (app_user_id, premises_id)
  `.execute(db);

  await sql`
    ALTER TABLE uk_house_access ADD CONSTRAINT pk_uk_house_access PRIMARY KEY (app_user_id, house_id)
  `.execute(db);

  await sql`
    ALTER TABLE organization_contractor ADD CONSTRAINT pk_organization_contractor PRIMARY KEY (organization_id, contractor_id)
  `.execute(db);

  await sql`
    ALTER TABLE demo_run_actor ADD CONSTRAINT pk_demo_run_actor PRIMARY KEY (demo_run_id, app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE house ADD CONSTRAINT cq_house_organization_house UNIQUE (organization_id, house_id)
  `.execute(db);

  await sql`
    ALTER TABLE premises ADD CONSTRAINT cq_premises_house_premises UNIQUE (house_id, premises_id)
  `.execute(db);

  await sql`
    ALTER TABLE category ADD CONSTRAINT cq_category_organization_category UNIQUE (organization_id, category_id)
  `.execute(db);

  await sql`
    ALTER TABLE demo_run_actor ADD CONSTRAINT uq_demo_run_actor_role_alias UNIQUE (demo_run_id, role, actor_alias)
  `.execute(db);

  await sql`
    ALTER TABLE user_role_binding ADD CONSTRAINT ck_user_role_binding_role CHECK (role IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE'))
  `.execute(db);

  await sql`
    ALTER TABLE user_role_binding ADD CONSTRAINT ck_user_role_binding_shape CHECK (
      (role = 'RESIDENT' AND organization_id IS NULL AND contractor_id IS NULL)
      OR (role IN ('UK_EMPLOYEE','UK_ADMIN') AND organization_id IS NOT NULL AND contractor_id IS NULL)
      OR (role = 'CONTRACTOR_EMPLOYEE' AND contractor_id IS NOT NULL AND organization_id IS NULL)
    )
  `.execute(db);

  await sql`
    ALTER TABLE max_identity ADD CONSTRAINT ck_max_identity_link_status CHECK (link_status IN ('UNLINKED','LINKED_CONFIRMED'))
  `.execute(db);

  await sql`
    ALTER TABLE max_identity ADD CONSTRAINT ck_max_identity_readiness CHECK (link_status <> 'LINKED_CONFIRMED' OR (delivery_chat_id IS NOT NULL AND delivery_chat_type IS NOT NULL))
  `.execute(db);

  await sql`
    ALTER TABLE demo_run ADD CONSTRAINT ck_demo_run_status CHECK (status IN ('ACTIVE','ARCHIVED'))
  `.execute(db);

  await sql`
    ALTER TABLE demo_run_actor ADD CONSTRAINT ck_demo_run_actor_role CHECK (role IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE'))
  `.execute(db);

  await sql`
    ALTER TABLE category ADD CONSTRAINT ck_category_result_requirement CHECK (result_requirement IN ('NONE','PHOTO','FILE'))
  `.execute(db);

  await sql`
    ALTER TABLE house ADD CONSTRAINT fk_house_organization_id FOREIGN KEY (organization_id) REFERENCES organization (organization_id)
  `.execute(db);

  await sql`
    ALTER TABLE premises ADD CONSTRAINT fk_premises_house_id FOREIGN KEY (house_id) REFERENCES house (house_id)
  `.execute(db);

  await sql`
    ALTER TABLE category ADD CONSTRAINT fk_category_organization_id FOREIGN KEY (organization_id) REFERENCES organization (organization_id)
  `.execute(db);

  await sql`
    ALTER TABLE category ADD CONSTRAINT fk_category_default_contractor_id FOREIGN KEY (default_contractor_id) REFERENCES contractor (contractor_id)
  `.execute(db);

  await sql`
    ALTER TABLE category ADD CONSTRAINT fk_category_updated_by_user_id FOREIGN KEY (updated_by_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE user_role_binding ADD CONSTRAINT fk_user_role_binding_app_user_id FOREIGN KEY (app_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE user_role_binding ADD CONSTRAINT fk_user_role_binding_organization_id FOREIGN KEY (organization_id) REFERENCES organization (organization_id)
  `.execute(db);

  await sql`
    ALTER TABLE user_role_binding ADD CONSTRAINT fk_user_role_binding_contractor_id FOREIGN KEY (contractor_id) REFERENCES contractor (contractor_id)
  `.execute(db);

  await sql`
    ALTER TABLE resident_premises_access ADD CONSTRAINT fk_resident_premises_access_app_user_id FOREIGN KEY (app_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE resident_premises_access ADD CONSTRAINT fk_resident_premises_access_premises_id FOREIGN KEY (premises_id) REFERENCES premises (premises_id)
  `.execute(db);

  await sql`
    ALTER TABLE uk_house_access ADD CONSTRAINT fk_uk_house_access_app_user_id FOREIGN KEY (app_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE uk_house_access ADD CONSTRAINT fk_uk_house_access_house_id FOREIGN KEY (house_id) REFERENCES house (house_id)
  `.execute(db);

  await sql`
    ALTER TABLE max_identity ADD CONSTRAINT fk_max_identity_app_user_id FOREIGN KEY (app_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE demo_run ADD CONSTRAINT fk_demo_run_created_by_max_identity_id FOREIGN KEY (created_by_max_identity_id) REFERENCES max_identity (max_identity_id)
  `.execute(db);

  await sql`
    ALTER TABLE demo_run ADD CONSTRAINT fk_demo_run_notification_recipient_max_identity_id FOREIGN KEY (notification_recipient_max_identity_id) REFERENCES max_identity (max_identity_id)
  `.execute(db);

  await sql`
    ALTER TABLE demo_run_actor ADD CONSTRAINT fk_demo_run_actor_demo_run_id FOREIGN KEY (demo_run_id) REFERENCES demo_run (demo_run_id)
  `.execute(db);

  await sql`
    ALTER TABLE demo_run_actor ADD CONSTRAINT fk_demo_run_actor_app_user_id FOREIGN KEY (app_user_id) REFERENCES app_user (app_user_id)
  `.execute(db);

  await sql`
    ALTER TABLE organization_contractor ADD CONSTRAINT fk_organization_contractor_organization_id FOREIGN KEY (organization_id) REFERENCES organization (organization_id)
  `.execute(db);

  await sql`
    ALTER TABLE organization_contractor ADD CONSTRAINT fk_organization_contractor_contractor_id FOREIGN KEY (contractor_id) REFERENCES contractor (contractor_id)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_max_identity_mini_app_user_id ON max_identity (mini_app_user_id) WHERE mini_app_user_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_max_identity_bot_user_id ON max_identity (bot_user_id) WHERE bot_user_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_max_identity_app_user_id ON max_identity (app_user_id) WHERE app_user_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_demo_run_active_per_identity ON demo_run (created_by_max_identity_id) WHERE status = 'ACTIVE'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP INDEX uq_max_identity_mini_app_user_id;
    DROP INDEX uq_max_identity_bot_user_id;
    DROP INDEX uq_max_identity_app_user_id;
    DROP INDEX uq_demo_run_active_per_identity;
    DROP TABLE demo_run_actor;
    DROP TABLE demo_run;
    DROP TABLE organization_contractor;
    DROP TABLE user_role_binding;
    DROP TABLE category;
    DROP TABLE max_identity;
    DROP TABLE uk_house_access;
    DROP TABLE resident_premises_access;
    DROP TABLE premises;
    DROP TABLE house;
    DROP TABLE contractor;
    DROP TABLE app_user;
    DROP TABLE organization
  `.execute(db);
}