import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { recoverSyntheticDemo } from './recovery.js';

const databaseUrl = process.env.DATABASE_URL;
const targetOrganizationId = process.env.TARGET_ORGANIZATION_ID;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!targetOrganizationId) throw new Error('TARGET_ORGANIZATION_ID is required');

const seedModuleUrl = pathToFileURL(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../../../packages/db/src/seed/index.ts',
)).href;
const seedModule = await import(seedModuleUrl) as {
  seedDemoCatalogInTransaction(client: import('pg').PoolClient): Promise<void>;
};
const logger = { warn: (fields: Readonly<Record<string, unknown>>, message: string) => {
  process.stderr.write(JSON.stringify({ level: 'warn', message, ...fields }) + '\n');
} };
const pool = new Pool({ connectionString: databaseUrl });
try {
  await recoverSyntheticDemo(pool, {
    environment: process.env.APP_ENV,
    demoMode: process.env.DEMO_MODE === 'true',
    targetOrganizationId,
    logger,
    reseed: seedModule.seedDemoCatalogInTransaction,
  });
} finally {
  await pool.end();
}
