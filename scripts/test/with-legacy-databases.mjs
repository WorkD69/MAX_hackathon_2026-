import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withDisposablePostgres } from '../../tests/support/postgres.mjs';

const mode = process.argv[2];
if (!['test', 'test:integration'].includes(mode)) throw new Error('EXPECTED_TEST_OR_INTEGRATION_COMMAND');
const options = { adminUrl: process.env.TEST_POSTGRES_ADMIN_URL };

try {
  await withDisposablePostgres({ ...options, suite: 'tg005' }, async foundation => {
    await withDisposablePostgres({ ...options, suite: 'tg006' }, async workflow => {
      const env = {
        ...process.env,
        TG005_TEST_DATABASE_URL: foundation.migrationUrl,
        TG006_TEST_DATABASE_URL: workflow.migrationUrl,
        TG005_TEST_DATABASE_RECEIPT: foundation.receiptPath,
        TG006_TEST_DATABASE_RECEIPT: workflow.receiptPath,
      };
      // npm_execpath is the caller's pinned npm CLI; invoke without a shell.
      const npmCli = process.env.npm_execpath;
      const args = mode === 'test:integration'
        ? [fileURLToPath(new URL('./integration.mjs', import.meta.url))]
        : [npmCli, 'run', 'test', '--workspaces', '--', '--no-file-parallelism'];
      if (mode === 'test' && !npmCli) throw new Error('RUN_VIA_NPM_FOR_PINNED_CLI');
      process.exitCode = await new Promise(resolve => {
        const child = spawn(process.execPath, args, { stdio: 'inherit', env });
        child.once('error', () => resolve(1));
        child.once('exit', code => resolve(code ?? 1));
      });
    });
  });
} catch {
  console.error('OWNED_LEGACY_DB_RUN_FAILED; preserve receipt if cleanup was refused');
  process.exitCode = 1;
}
