import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

const PG_OPTS = {
  host: 'tg005-pg',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'max_tg005_test',
};

test('readiness constraint blocks LINKED_CONFIRMED with missing chat fields', async () => {
  const schema = 'tg005_constraints';
  // Pool for schema + catalog (like capture script)
  const pool = new Pool({ ...PG_OPTS, options: `-c search_path=${schema}`, max: 2 });
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.query(`CREATE SCHEMA ${schema}`);
  
  // Separate pool for migration (like capture script)
  const migrationPool = new Pool({ ...PG_OPTS, options: `-c search_path=${schema}`, max: 2 });
  const db = new Kysely({ dialect: new PostgresDialect({ pool: migrationPool }) });

  // Dynamic import of dist module (like standalone script)
  const cwd = process.cwd();
  const m = await import(pathToFileURL(path.join(cwd, 'packages/db/dist/index.js')).href);

  await m.migrateToLatest(db);

  // Insert a row that violates ck_max_identity_readiness
  await pool.query(
    `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, link_status, app_user_id, first_seen_at, last_seen_at, linked_at)
     VALUES ('test-viol-1', NULL, NULL, NULL, 'LINKED_CONFIRMED', NULL, now(), now(), NULL)`,
  );

  // A second insert with the same violating pattern should fail the check constraint
  try {
    await pool.query(
      `INSERT INTO max_identity (max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type, link_status, app_user_id, first_seen_at, last_seen_at, linked_at)
       VALUES ('test-viol-2', NULL, NULL, NULL, 'LINKED_CONFIRMED', NULL, now(), now(), NULL)`,
    );
    throw new Error('Expected constraint violation but insert succeeded');
  } catch (err: any) {
    // PostgreSQL check constraint violation => SQLSTATE 23514
    expect(err.code).toBe('23514');
    // Message must contain the constraint name
    expect(err.message).toContain('ck_max_identity_readiness');
  }

  await pool.end();
}, 30000);