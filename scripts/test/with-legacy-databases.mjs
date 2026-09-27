import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LEGACY_TEST_TARGETS, withDisposablePostgres } from '../../tests/support/postgres.mjs';

const mode = process.argv[2];
if (!['test', 'test:integration'].includes(mode)) throw new Error('EXPECTED_TEST_OR_INTEGRATION_COMMAND');
const options = { adminUrl: process.env.TEST_POSTGRES_ADMIN_URL };
const suites = LEGACY_TEST_TARGETS;

try {
  async function runWithTargets(index, env) {
    if (index < suites.length) {
      const { key, suite } = suites[index];
      return withDisposablePostgres({ ...options, suite, legacyKey: key }, async target => runWithTargets(index + 1, {
        ...env,
        [`${key}_TEST_DATABASE_URL`]: target.migrationUrl,
        [`${key}_TEST_DATABASE_RECEIPT`]: target.receiptPath,
      }));
    }
    // npm_execpath is the caller's pinned npm CLI; invoke without a shell.
    const npmCli = process.env.npm_execpath;
    const args = mode === 'test:integration'
      ? [fileURLToPath(new URL('./integration.mjs', import.meta.url))]
      : [npmCli, 'test'];
    if (mode === 'test' && !npmCli) throw new Error('RUN_VIA_NPM_FOR_PINNED_CLI');
    process.exitCode = await new Promise(resolve => {
      const child = spawn(process.execPath, args, { stdio: 'inherit', env });
      child.once('error', () => resolve(1));
      child.once('exit', code => resolve(code ?? 1));
    });
  }
  await runWithTargets(0, process.env);
} catch {
  console.error('OWNED_LEGACY_DB_RUN_FAILED; preserve receipt if cleanup was refused');
  process.exitCode = 1;
}
