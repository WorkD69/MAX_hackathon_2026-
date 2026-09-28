import { glob, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requiredSuites = ['db', 'concurrency', 'api'];

export async function discoverIntegrationSuites(root) {
  const files = [];
  for await (const file of glob([
    'tests/integration/**/*.test.{ts,tsx,js,mjs}',
    'packages/*/src/**/*.integration.test.{ts,js,mjs}',
    'apps/*/src/**/*.integration.test.{ts,js,mjs}',
    'apps/*/test-integration/**/*.test.{ts,js,mjs}',
    'apps/*/tests/**/*.integration.test.{ts,js,mjs}',
  ], { cwd: root })) files.push(file.replaceAll('\\', '/'));
  const groups = new Map();
  for (const file of files.sort()) {
    const cwd = file.startsWith('tests/') ? '.' : file.split('/').slice(0, 2).join('/');
    if (!groups.has(cwd)) groups.set(cwd, { cwd, files: [] });
    groups.get(cwd).files.push(file);
  }
  return {
    groups: [...groups.values()],
    missing: requiredSuites.filter(suite => !files.some(file => file.startsWith(`tests/integration/${suite}/`))),
  };
}

export async function runIntegration(root = process.cwd()) {
  const { groups, missing } = await discoverIntegrationSuites(root);
  if (!groups.length) {
    console.error('NO_INTEGRATION_TESTS; status=NOT_RUN');
    return 1;
  }
  const manifestPath = fileURLToPath(import.meta.resolve('vitest/package.json'));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.vitest);
  let failed = false;
  for (const group of groups) {
    if (group.cwd === 'packages/db' || group.cwd === 'apps/api') {
      try {
        const { LEGACY_TEST_TARGETS, verifyOwnedLegacySuite } = await import('../../tests/support/postgres.mjs');
        for (const { key } of LEGACY_TEST_TARGETS) await verifyOwnedLegacySuite(key);
      } catch {
        console.error(`OWNED_TEST_TARGET_REQUIRED: ${group.cwd}; no child suite started`);
        failed = true;
        continue;
      }
    }
    const args = ['run', ...group.files.map(file => path.relative(path.resolve(root, group.cwd), path.resolve(root, file)))];
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [cli, ...args], { cwd: path.resolve(root, group.cwd), stdio: 'inherit' });
      child.once('error', () => resolve(1));
      child.once('exit', code => resolve(code ?? 1));
    });
    if (code !== 0) { console.error(`CHILD_SUITE_FAILED: ${group.cwd}; exit=${code}`); failed = true; }
  }
  if (missing.length) console.error(`MISSING_REQUIRED_SUITE: ${missing.join(',')}; TG026/TG027 runtime evidence=INCOMPLETE`);
  return failed || missing.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await runIntegration(); }
  catch { console.error('INTEGRATION_RUNNER_FAILED'); process.exitCode = 1; }
}
