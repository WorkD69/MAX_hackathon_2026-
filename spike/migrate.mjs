// One-shot migration probe; not a canonical deployment command.
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { migrateToLatest } from '@max-smart-city/db';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});
try {
  const outcome = await migrateToLatest(db);
  process.stdout.write(JSON.stringify({ event: 'spike_migrations', outcome }) + '\n');
} finally {
  await db.destroy();
}
