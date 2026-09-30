// Delivery orchestration: только существующие migrations и idempotent TG-008 seed.
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { migrateToLatest } from '@max-smart-city/db';
import { seedDemoCatalog } from '../../packages/db/src/seed/index.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
try {
  await migrateToLatest(db);
  await seedDemoCatalog(pool);
  process.stdout.write('{"event":"delivery_migrate_seed","outcome":"success","data":"SYNTHETIC"}\n');
} catch {
  // Не печатать connection string или произвольные DB exception details.
  process.stderr.write('{"event":"delivery_migrate_seed","outcome":"failed"}\n');
  process.exitCode = 1;
} finally {
  await db.destroy();
}
