import { readFile } from 'node:fs/promises';
import { cleanupPostgres } from '../../tests/support/postgres.mjs';

try {
  if (!process.argv[2]) throw new Error('MISSING_RECEIPT_PATH');
  const receipt = JSON.parse(await readFile(process.argv[2], 'utf8'));
  await cleanupPostgres({ adminUrl: process.env.TEST_POSTGRES_ADMIN_URL }, receipt);
  console.log('OWNED_TEST_TARGET_CLEANUP_COMPLETE');
} catch {
  console.error('TEST_TARGET_CLEANUP_REFUSED; verify test markers, receipt and server identity');
  process.exitCode = 1;
}
