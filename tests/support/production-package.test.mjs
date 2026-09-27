import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const apiOutput = path.join(root, 'apps/api/dist-production');
const apiSource = path.join(root, 'apps/api/src');
const requiredApiModules = [
  'index',
  'app/main', 'app/app', 'app/lifecycle', 'app/static',
  'config/load-config', 'config/schema', 'config/types',
  'modules/auth/init-data', 'modules/auth/plugin', 'modules/auth/service', 'modules/auth/session-token',
  'modules/demo/index', 'modules/demo/plugin', 'modules/demo/repository', 'modules/demo/service',
  'modules/authorization/boundary', 'modules/authorization/policy',
  'modules/commands/kernel/index', 'modules/commands/kernel/authorization',
  'modules/max-adapter/index', 'modules/max-adapter/factory', 'modules/max-adapter/real',
  'integrations/max/index', 'integrations/max/webhook', 'integrations/max/subscription-reconciler',
  'modules/notifications/index', 'modules/notifications/store', 'modules/notifications/worker',
  'modules/notifications/redrive-command', 'modules/notifications/redrive-cli',
  'maintenance/recovery', 'maintenance/cli',
  'modules/health/plugin', 'modules/health/readiness',
];
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
const forbiddenPath = /(?:^|[\\/])(?:tests?|__tests__|test-integration|fixtures?|__fixtures__|test-helpers|e2e|harness)(?:[\\/]|$)|(?:^|[\\/])fake\.(?:js|ts)(?:\.map)?$|\.(?:test|spec|fixture|typecheck|integration|e2e)\.(?:[cm]?[jt]sx?)(?:\.map)?$/i;
const forbiddenMarker = /SECRET_SENTINEL_91|TEST_CASE_FIXTURE|FAKE_MAX_ADAPTER_TEST_ONLY|tg013-secret|spike_only_disposable|postgresql:\/\/user:pass@db|11111111-1111-4111-8111-111111111111/i;

async function filesUnder(target) {
  const info = await stat(target);
  if (info.isFile()) return [target];
  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => filesUnder(path.join(target, entry.name))));
  return nested.flat();
}

test('production output contains required application artifacts and no test material', async () => {
  for (const module of requiredApiModules) {
    const artifact = path.join(apiOutput, `${module}.js`);
    assert.ok((await stat(artifact)).size > 0, `${module}.js missing or empty`);
  }
  for (const required of [
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

test('every production API source is emitted and every local output import resolves', async () => {
  const testOnlySource = /(?:^|\/)(?:tests?|__tests__|test-integration|fixtures?|__fixtures__|e2e|test-helpers|harness)(?:\/|$)|(?:^|\/)fake\.ts$|\.(?:test|spec|fixture|typecheck)\.ts$/i;
  for (const source of await filesUnder(apiSource)) {
    const relative = path.relative(apiSource, source).replaceAll('\\', '/');
    if (!relative.endsWith('.ts') || testOnlySource.test(relative)) continue;
    const emitted = path.join(apiOutput, relative.replace(/\.ts$/, '.js'));
    assert.ok((await stat(emitted)).size > 0, `production source not emitted: ${relative}`);
  }

  for (const artifact of await filesUnder(apiOutput)) {
    if (!artifact.endsWith('.js')) continue;
    const code = await readFile(artifact, 'utf8');
    const imports = code.matchAll(/\b(?:from\s*|import\s*|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g);
    for (const match of imports) {
      const target = path.resolve(path.dirname(artifact), match[1]);
      assert.ok((await stat(target)).isFile(), `unresolved import in ${path.relative(apiOutput, artifact)}: ${match[1]}`);
    }
  }
});

test('representative production modules import with runtime dependencies', async () => {
  for (const [module, exported] of [
    ['config/load-config', 'loadConfig'],
    ['modules/auth/plugin', 'registerAuthRoutes'],
    ['modules/demo/service', 'DemoService'],
    ['modules/authorization/policy', 'AuthorizationPolicy'],
    ['modules/commands/kernel/index', 'createCommandFingerprint'],
    ['modules/max-adapter/real', 'RealMaxAdapter'],
    ['integrations/max/webhook', 'createMaxWebhookPlugin'],
    ['modules/notifications/worker', 'DurableNotificationWorker'],
    ['maintenance/recovery', 'recoverSyntheticDemo'],
    ['modules/health/plugin', 'registerHealthRoutes'],
  ]) {
    const loaded = await import(pathToFileURL(path.join(apiOutput, `${module}.js`)).href);
    assert.ok(exported in loaded, `${module}.js does not export ${exported}`);
  }
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
