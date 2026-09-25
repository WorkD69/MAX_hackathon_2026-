import { randomUUID } from 'node:crypto';
import type { ValidatedMaxLaunch } from '../auth/init-data.js';

export interface SqlClient {
  query<Row extends object = Record<string, unknown>>(text: string, values: unknown[]): Promise<{ rows: Row[] }>;
}

export interface MaxIdentityRow {
  max_identity_id: string;
  mini_app_user_id: string | null;
  delivery_chat_id: string | null;
  delivery_chat_type: string | null;
  link_status: 'UNLINKED' | 'LINKED_CONFIRMED';
  app_user_id: string | null;
}

export interface NormalActorRow {
  app_user_id: string;
  display_name: string;
  user_active: boolean;
  role_binding_id: string | null;
  role: 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE' | null;
  organization_id: string | null;
  contractor_id: string | null;
  organization_active: boolean | null;
  contractor_active: boolean | null;
}

export interface DemoRunRow {
  demo_run_id: string;
  primary_case_id: string | null;
}

export interface DemoActorRow {
  app_user_id: string;
  display_name: string;
  role: 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE';
  active: boolean;
}

export interface MaxIdentityRepository {
  upsertValidated(launch: ValidatedMaxLaunch, now: Date): Promise<MaxIdentityRow>;
  findById(id: string): Promise<MaxIdentityRow | null>;
  normalActors(appUserId: string): Promise<NormalActorRow[]>;
  currentDemoRun(maxIdentityId: string): Promise<DemoRunRow | null>;
  demoActor(runId: string, appUserId: string): Promise<DemoActorRow | null>;
}

export class PostgresMaxIdentityRepository implements MaxIdentityRepository {
  constructor(private readonly sql: SqlClient) {}

  async upsertValidated(launch: ValidatedMaxLaunch, now: Date): Promise<MaxIdentityRow> {
    const result = await this.sql.query<MaxIdentityRow>(`
      INSERT INTO max_identity (
        max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type,
        bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at
      ) VALUES ($1, $2, $3, $4, NULL, 'LINKED_CONFIRMED', NULL, $5, $5, $5)
      ON CONFLICT (mini_app_user_id) WHERE mini_app_user_id IS NOT NULL
      DO UPDATE SET delivery_chat_id = EXCLUDED.delivery_chat_id,
        delivery_chat_type = EXCLUDED.delivery_chat_type,
        link_status = 'LINKED_CONFIRMED', last_seen_at = EXCLUDED.last_seen_at,
        linked_at = COALESCE(max_identity.linked_at, EXCLUDED.linked_at)
      RETURNING max_identity_id, mini_app_user_id, delivery_chat_id,
        delivery_chat_type, link_status, app_user_id
    `, [randomUUID(), launch.miniAppUserId, launch.chatId, launch.chatType, now]);
    const row = result.rows[0];
    if (!row) throw new Error('MAX_IDENTITY_UPSERT_FAILED');
    return row;
  }

  async findById(id: string): Promise<MaxIdentityRow | null> {
    const result = await this.sql.query<MaxIdentityRow>(`
      SELECT max_identity_id, mini_app_user_id, delivery_chat_id,
        delivery_chat_type, link_status, app_user_id
      FROM max_identity WHERE max_identity_id = $1
    `, [id]);
    return result.rows[0] ?? null;
  }

  async normalActors(appUserId: string): Promise<NormalActorRow[]> {
    const result = await this.sql.query<NormalActorRow>(`
      SELECT u.app_user_id, u.display_name, u.active AS user_active,
        b.role_binding_id, b.role, b.organization_id, b.contractor_id,
        o.active AS organization_active, c.active AS contractor_active
      FROM app_user u
      LEFT JOIN user_role_binding b ON b.app_user_id = u.app_user_id AND b.active = true
      LEFT JOIN organization o ON o.organization_id = b.organization_id
      LEFT JOIN contractor c ON c.contractor_id = b.contractor_id
      WHERE u.app_user_id = $1
    `, [appUserId]);
    return result.rows;
  }

  async currentDemoRun(maxIdentityId: string): Promise<DemoRunRow | null> {
    const result = await this.sql.query<DemoRunRow>(`
      SELECT demo_run_id, primary_case_id FROM demo_run
      WHERE created_by_max_identity_id = $1 AND status = 'ACTIVE'
    `, [maxIdentityId]);
    return result.rows[0] ?? null;
  }

  async demoActor(runId: string, appUserId: string): Promise<DemoActorRow | null> {
    const result = await this.sql.query<DemoActorRow>(`
      SELECT a.app_user_id, u.display_name, a.role, u.active
      FROM demo_run_actor a JOIN app_user u ON u.app_user_id = a.app_user_id
      WHERE a.demo_run_id = $1 AND a.app_user_id = $2
    `, [runId, appUserId]);
    return result.rows[0] ?? null;
  }
}
