import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const apiOutput = path.join(root, 'apps/api/dist-production');
const runtimeArtifacts = [
  'apps/api/dist-production',
  'apps/web/dist',
  'packages/contracts/dist',
  'packages/domain/dist',
  'packages/db/dist',
  'packages/db/src/seed/cli.ts',
  'packages/db/src/seed/index.ts',
  'spike/entrypoint.mjs',
  'spike/migrate.mjs',
];
const forbiddenPath = /(?:^|[\\/])(?:tests?|test-integration|fixtures?|__fixtures__|e2e|harness)(?:[\\/]|$)|(?:^|[\\/])fake\.(?:js|ts)(?:\.map)?$|\.(?:test|spec|integration|e2e)\.(?:[cm]?[jt]sx?)(?:\.map)?$/i;
const forbiddenMarker = /SECRET_SENTINEL_91|TEST_CASE_FIXTURE|FAKE_MAX_ADAPTER_TEST_ONLY|tg013-secret|spike_only_disposable|postgresql:\/\/user:pass@db|11111111-1111-4111-8111-111111111111/i;

async function filesUnder(target) {
  const info = await stat(target);
  if (info.isFile()) return [target];
  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => filesUnder(path.join(target, entry.name))));
  return nested.flat();
}

test('production output contains required application artifacts and no test material', async () => {
  for (const required of [
    'apps/api/dist-production/app/main.js',
    'apps/api/dist-production/app/app.js',
    'apps/web/dist/index.html',
    'packages/db/dist/migrations/0001_foundation.js',
    'packages/db/dist/migrations/0002_case_workflow.js',
    'packages/db/dist/migrations/0003_operational_persistence.js',
    'packages/db/src/seed/cli.ts',
    'packages/db/src/seed/index.ts',
  ]) assert.ok((await stat(path.join(root, required))).size > 0, `${required} missing or empty`);

  for (const artifact of runtimeArtifacts) {
    for (const file of await filesUnder(path.join(root, artifact))) {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      assert.doesNotMatch(relative, forbiddenPath, `test-only path in runtime output: ${relative}`);
      if (/\.(?:js|mjs|ts|json|map|html|css)$/.test(file)) {
        assert.doesNotMatch(await readFile(file, 'utf8'), forbiddenMarker, `test fixture marker in runtime output: ${relative}`);
      }
    }
  }
  assert.ok((await readdir(apiOutput)).length > 0);
});

test('Docker runtime stage copies only production API output and keeps the runtime contract', async () => {
  const dockerfile = await readFile(path.join(root, 'Dockerfile.spike'), 'utf8');
  const runtime = dockerfile.split(/FROM\s+toolchain\s+AS\s+runtime/i)[1];
  assert.ok(runtime, 'runtime stage missing');
  assert.match(runtime, /\/app\/apps\/api\/dist-production\s+\.\/apps\/api\/dist/);
  assert.doesNotMatch(runtime, /\/app\/apps\/api\/dist\s+\.\/apps\/api\/dist/);
  assert.match(runtime, /^USER node$/m);
  assert.match(runtime, /^HEALTHCHECK .*health\/live/m);
  assert.match(runtime, /^ARG BUILD_SHA$/m);
  assert.match(runtime, /grep -Eq '\^\[0-9a-f\]\{40\}\$'/);
  assert.match(runtime, /^ENV BUILD_SHA=/m);
  assert.match(runtime, /^LABEL org\.opencontainers\.image\.revision=/m);
  for (const required of [
    '/app/package.json /app/package-lock.json ./',
    '/app/node_modules ./node_modules',
    '/app/apps/api/package.json ./apps/api/package.json',
    '/app/apps/web/dist ./apps/web/dist',
    '/app/packages/contracts/package.json ./packages/contracts/package.json',
    '/app/packages/contracts/dist ./packages/contracts/dist',
    '/app/packages/domain/package.json ./packages/domain/package.json',
    '/app/packages/domain/dist ./packages/domain/dist',
    '/app/packages/db/package.json ./packages/db/package.json',
    '/app/packages/db/dist ./packages/db/dist',
    '/app/packages/db/src/seed/cli.ts ./packages/db/src/seed/cli.ts',
    '/app/packages/db/src/seed/index.ts ./packages/db/src/seed/index.ts',
  ]) assert.ok(runtime.includes(required), `Docker runtime copy missing: ${required}`);
  assert.doesNotMatch(runtime, /COPY\s+(?:--[^\s]+\s+)*\.\s+/m, 'runtime must not copy the full context');

  const compose = await readFile(path.join(root, 'compose.spike.yaml'), 'utf8');
  assert.match(compose, /BUILD_SHA:\s*\$\{BUILD_SHA:\?/);
  assert.doesNotMatch(compose.split(/^\s*environment:\s*$/m).at(-1), /^\s*BUILD_SHA:/m);

  const dockerignore = await readFile(path.join(root, '.dockerignore'), 'utf8');
  for (const excluded of ['**/tests', '**/test-integration', '**/e2e', '**/fixtures', '**/harness',
    '**/*.test.*', '**/*.spec.*', '**/*.integration.*', '**/*.fixture.*', '**/*fixtures*',
    '**/*harness*', '**/*e2e*', '**/*test-helpers*', '**/dist-production']) {
    assert.ok(dockerignore.split(/\r?\n/).includes(excluded), `build context exclusion missing: ${excluded}`);
  }
});
