import { Pool } from 'pg';
import { seedDemoCatalog } from './index.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl });
try {
  await seedDemoCatalog(pool);
  process.stderr.write(JSON.stringify({ event: 'demo_seed', version: 'tg008.v1', outcome: 'success' }) + '\n');
} finally {
  await pool.end();
}
