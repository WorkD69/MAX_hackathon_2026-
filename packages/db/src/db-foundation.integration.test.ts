import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { promises as fs } from 'node:fs';
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

test('migration up creates all tables and indexes with correct DDL', async () => {
  const schema = 'tg005_foundation';
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

  // Query constraints via pg catalog using original pool (like capture script)
  const constraints = await pool.query(
    `SELECT conname, contype, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE connamespace = to_regnamespace($1)
      ORDER BY conname`,
    [schema],
  );
  const defNames = constraints.rows.map((r) => r.def);

  // 13 primary keys (contype='p')
  const pkDefs = defNames.filter((d) => d.includes('PRIMARY KEY')).length;
  expect(pkDefs).toBe(13);

  // 4 UNIQUE constraints (contype='u')
  const uniqueDefs = defNames.filter((d) => d.includes('UNIQUE')).length;
  expect(uniqueDefs).toBe(4);

  // 7 CHECK constraints (contype='c')
  const checkDefs = defNames.filter((d) => d.includes('CHECK')).length;
  expect(checkDefs).toBe(7);

  // 19 FK constraints (contype='f')
  const fkDefs = defNames.filter((d) => d.includes('FOREIGN KEY')).length;
  expect(fkDefs).toBe(19);

  // Partial unique indexes def strings via pg_get_indexdef
  const indexes = await pool.query(
    `SELECT c.relname AS indexname, pg_get_indexdef(c.oid) AS def
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname IN
        ('uq_max_identity_mini_app_user_id','uq_max_identity_bot_user_id','uq_max_identity_app_user_id','uq_demo_run_active_per_identity')`,
    [schema],
  );
  const indexDefs = indexes.rows.map((r) => r.def);

  expect(indexDefs).toHaveLength(4);
  expect(indexDefs).toContain(
    "CREATE UNIQUE INDEX uq_max_identity_mini_app_user_id ON max_identity USING btree (mini_app_user_id) WHERE (mini_app_user_id IS NOT NULL)",
  );
  expect(indexDefs).toContain(
    "CREATE UNIQUE INDEX uq_max_identity_bot_user_id ON max_identity USING btree (bot_user_id) WHERE (bot_user_id IS NOT NULL)",
  );
  expect(indexDefs).toContain(
    "CREATE UNIQUE INDEX uq_max_identity_app_user_id ON max_identity USING btree (app_user_id) WHERE (app_user_id IS NOT NULL)",
  );
  expect(indexDefs).toContain(
    "CREATE UNIQUE INDEX uq_demo_run_active_per_identity ON demo_run USING btree (created_by_max_identity_id) WHERE (status = 'ACTIVE'::text)",
  );

  await pool.end();
}, 30000);