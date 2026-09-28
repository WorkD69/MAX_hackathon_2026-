import assert from 'node:assert/strict';
import { readFile, readdir, stat, lstat, realpath, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtimeRoot = process.env.PACKAGING_RUNTIME_ROOT || root;
const runtimePath = artifact => path.join(runtimeRoot, process.env.PACKAGING_RUNTIME_ROOT
  ? artifact.replace('apps/api/dist-production', 'apps/api/dist') : artifact);
const apiOutput = runtimePath('apps/api/dist-production');
const run = promisify(execFile);
const npmCli = [process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]
  .find(candidate => candidate && existsSync(candidate));
assert.ok(npmCli, 'npm CLI unavailable');
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
const manifests = ['package.json', 'package-lock.json', ...['apps/api', 'apps/web',
  'packages/contracts', 'packages/domain', 'packages/db'].map(dir => `${dir}/package.json`)];
const forbiddenPath = /(?:^|[\\/])(?:tests?|__tests__|test-integration|fixtures?|__fixtures__|e2e|harness)(?:[\\/]|$)|(?:^|[\\/])fake\.(?:js|ts)(?:\.map)?$|(?:test-helpers|harness)|\.(?:test|spec|integration|e2e|typecheck|fixture)\.(?:[cm]?[jt]sx?)(?:\.map)?$/i;
const forbiddenMarker = /SECRET_SENTINEL_91|TEST_CASE_FIXTURE|FAKE_MAX_ADAPTER_TEST_ONLY|tg013-secret|spike_only_disposable|postgresql:\/\/user:pass@db|11111111-1111-4111-8111-111111111111/i;

function assertRuntimeContent(relative, content, owner) {
  if (owner === 'team') assert.doesNotMatch(relative, forbiddenPath, `team test-only runtime path: ${relative}`);
  assert.doesNotMatch(content, forbiddenMarker, `team credential/sentinel in ${owner} runtime content: ${relative}`);
}

test('vendor test paths are allowed, while team test paths and sentinels are rejected', () => {
  assertRuntimeContent('node_modules/pino/test/fixtures/public.js', 'public vendor fixture', 'vendor');
  assert.throws(() => assertRuntimeContent('apps/api/dist/tests/local.js', '', 'team'), /team test-only/);
  for (const owner of ['team', 'vendor']) {
    const file = owner === 'team' ? 'apps/api/dist/config/local.js' : 'node_modules/pino/test/fixture.js';
    assert.throws(() => assertRuntimeContent(file, 'SECRET_SENTINEL_91', owner), /credential\/sentinel/);
  }
});

async function filesUnder(target) {
  const info = await lstat(target);
  if (info.isSymbolicLink()) return []; // Workspaces are scanned as owned artifacts.
  if (info.isFile()) return [target];
  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => filesUnder(path.join(target, entry.name))));
  return nested.flat();
}

test('production output contains required application artifacts and no test material', async t => {
  for (const required of [
    'apps/api/dist-production/app/main.js',
    'apps/api/dist-production/app/app.js',
    'apps/web/dist/index.html',
    'packages/db/dist/migrations/0001_foundation.js',
    'packages/db/dist/migrations/0002_case_workflow.js',
    'packages/db/dist/migrations/0003_operational_persistence.js',
    'packages/db/src/seed/cli.ts',
    'packages/db/src/seed/index.ts',
  ]) assert.ok((await stat(runtimePath(required))).size > 0, `${required} missing or empty`);

  // Exhaustive source→output parity catches independent modules/CLIs unreachable
  // from main, including any future Case/configuration modules added to this tree.
  const sources = (await filesUnder(path.join(root, 'apps/api/src'))).filter(file =>
    file.endsWith('.ts') && !file.endsWith('.d.ts') && !forbiddenPath.test(file));
  const expected = sources.map(file => path.relative(path.join(root, 'apps/api/src'), file).replace(/\.ts$/, '.js')).sort();
  const emitted = (await filesUnder(apiOutput)).map(file => path.relative(apiOutput, file)).sort();
  assert.deepEqual(emitted, expected, 'production source/output inventory differs');
  t.diagnostic(`${emitted.length} production API modules; exhaustive source/output parity`);

  for (const artifact of [...runtimeArtifacts, ...manifests]) {
    for (const file of await filesUnder(runtimePath(artifact))) {
      const relative = path.relative(runtimeRoot, file).replaceAll('\\', '/');
      assert.doesNotMatch(relative, forbiddenPath, `test-only path in runtime output: ${relative}`);
      if (/\.(?:js|mjs|ts|json|map|html|css)$/.test(file)) {
        assertRuntimeContent(relative, await readFile(file, 'utf8'), 'team');
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
    '/app/apps/api/package.json ./apps/api/package.json',
    '/app/apps/web/package.json ./apps/web/package.json',
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
  assert.match(runtime, /COPY --from=production-dependencies --chown=node:node \/app\/node_modules \.\/node_modules/);
  assert.match(dockerfile, /RUN npm ci --omit=dev --ignore-scripts/);
  assert.doesNotMatch(dockerfile, /npm (?:install|prune)\b(?! --global)/);
  assert.match(dockerfile, /node --test tests\/support\/production-package\.test\.mjs/);
  assert.doesNotMatch(runtime, /COPY\s+(?:--[^\s]+\s+)*\.\s+/m, 'runtime must not copy the full context');
  const copiedSources = [...runtime.matchAll(/^COPY\s+(?:--\S+\s+)*(.+)$/gm)]
    .flatMap(match => match[1].trim().split(/\s+/).slice(0, -1))
    .map(source => source.replace(/^\/app\//, '')).sort();
  assert.deepEqual(copiedSources, [...manifests, ...runtimeArtifacts, 'node_modules'].sort(),
    'Docker runtime COPY sources differ from the scanned artifact boundary');

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

test('all production modules resolve; entrypoints fail safely before external I/O', async () => {
  const entrypoints = ['app/main.js', 'maintenance/cli.js', 'modules/notifications/redrive-cli.js'];
  for (const file of await filesUnder(apiOutput)) {
    const relative = path.relative(apiOutput, file).replaceAll('\\', '/');
    if (!entrypoints.includes(relative)) await import(pathToFileURL(file).href);
  }
  for (const workspace of ['contracts', 'domain', 'db']) {
    await import(pathToFileURL(path.join(runtimeRoot, `packages/${workspace}/dist/index.js`)).href);
  }
  for (const file of await filesUnder(path.join(runtimeRoot, 'packages/db/dist/migrations'))) {
    if (file.endsWith('.js')) {
      const migration = await import(pathToFileURL(file).href);
      assert.equal(typeof migration.up, 'function');
      assert.equal(typeof migration.down, 'function');
    }
  }
  const seed = await import(pathToFileURL(path.join(runtimeRoot, 'packages/db/src/seed/index.ts')).href);
  assert.equal(typeof seed.seedDemoCatalog, 'function');
  const env = { ...process.env };
  for (const key of ['DATABASE_URL', 'TARGET_ORGANIZATION_ID', 'APP_ENV', 'DEMO_MODE',
    'APP_SESSION_SECRET', 'MAX_BOT_TOKEN', 'MAX_WEBHOOK_SECRET', 'BUILD_SHA']) delete env[key];
  for (const [file, expected] of [
    ['apps/api/dist-production/app/main.js', /"error_code":"CONFIG_INVALID"/],
    ['apps/api/dist-production/maintenance/cli.js', /DATABASE_URL is required/],
    ['apps/api/dist-production/modules/notifications/redrive-cli.js', /REDRIVE_USAGE_INVALID/],
    ['packages/db/src/seed/cli.ts', /DATABASE_URL is required/],
    ['spike/migrate.mjs', /DATABASE_URL is required/],
  ]) {
    await assert.rejects(run(process.execPath, [runtimePath(file)], { env, timeout: 15000 }), error => {
      assert.equal(error.code, 1, `${file} did not fail closed`);
      assert.match(error.stderr, expected, `${file} entrypoint did not resolve`);
      assert.doesNotMatch(error.stderr, /ERR_MODULE_NOT_FOUND|Cannot find|SyntaxError/);
      return true;
    });
  }
  // Exercise the recovery CLI's dynamic seed import, then stop at its production
  // safety guard before any DB connection or destructive maintenance operation.
  await assert.rejects(run(process.execPath, [runtimePath('apps/api/dist-production/maintenance/cli.js')], {
    env: { ...env, APP_ENV: 'production', DEMO_MODE: 'false',
      DATABASE_URL: 'postgresql://127.0.0.1:1/packaging_smoke', TARGET_ORGANIZATION_ID: seed.DEMO_IDS.organization },
    timeout: 15000,
  }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /MAINTENANCE_RECOVERY_REFUSED: PRODUCTION_ENVIRONMENT/);
    assert.doesNotMatch(error.stderr, /ERR_MODULE_NOT_FOUND|Cannot find|ECONNREFUSED/);
    return true;
  });
  const { createMaxAdapter, RealMaxAdapter, PerChatSendCoordinator } = await import(
    pathToFileURL(path.join(apiOutput, 'modules/max-adapter/index.js')).href);
  assert.ok(createMaxAdapter({ MAX_ADAPTER_MODE: 'live', MAX_BOT_TOKEN: randomBytes(16).toString('hex') },
    new PerChatSendCoordinator()) instanceof RealMaxAdapter);
  assert.throws(() => createMaxAdapter({ MAX_ADAPTER_MODE: 'fake' }, new PerChatSendCoordinator()), /MAX_ADAPTER_MODE_NOT_LIVE/);
});

test('isolated Docker COPY boundary with clean locked production dependencies', {
  skip: !!process.env.PACKAGING_RUNTIME_ROOT,
}, async () => {
  const staged = await mkdtemp(path.join(tmpdir(), 'tg030-runtime-'));
  try {
    for (const artifact of [...manifests, ...runtimeArtifacts]) {
      const destination = path.join(staged, artifact.replace('apps/api/dist-production', 'apps/api/dist'));
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(root, artifact), destination, { recursive: true });
    }
    // Same manifest/lock/install policy as Docker; no vendor edits or lifecycle hooks.
    await run(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
      { cwd: staged, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const childEnv = { ...process.env, PACKAGING_RUNTIME_ROOT: staged, npm_execpath: npmCli };
    delete childEnv.NODE_TEST_CONTEXT; // Force a standalone runner, not inherited IPC mode.
    const result = await run(process.execPath, ['--test', fileURLToPath(import.meta.url)], {
      cwd: staged, env: childEnv,
      timeout: 300000, maxBuffer: 4 * 1024 * 1024,
    });
    process.stdout.write(result.stdout);
  } finally { await rm(staged, { recursive: true, force: true }); }
});

test('production dependency tree, imports, sentinels and vendor provenance', {
  skip: !process.env.PACKAGING_RUNTIME_ROOT,
}, async t => {
  const lock = JSON.parse(await readFile(path.join(runtimeRoot, 'package-lock.json'), 'utf8'));
  const require = createRequire(path.join(runtimeRoot, 'apps/api/package.json'));
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location.includes('node_modules/')) continue;
    const target = path.join(runtimeRoot, location);
    const info = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (entry.dev) { assert.equal(info, null, `dev-only package installed: ${location}`); continue; }
    if (!info) { assert.ok(entry.optional, `production package missing: ${location}`); continue; }
    if (entry.link) {
      assert.equal(await realpath(target), await realpath(path.join(runtimeRoot, entry.resolved)));
      continue;
    }
    const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
    assert.equal(manifest.version, entry.version, `lock version mismatch: ${location}`);
    assert.ok(entry.integrity && entry.resolved, `vendor without lock provenance: ${location}`);
    // Vendor test path is public package content. Never waive team sentinel checks.
    const files = await filesUnder(target);
    for (let offset = 0; offset < files.length; offset += 16) {
      await Promise.all(files.slice(offset, offset + 16).map(async file => {
        assertRuntimeContent(path.relative(runtimeRoot, file), await readFile(file, 'utf8'), 'vendor');
      }));
    }
  }
  await run(process.execPath, [npmCli, 'ls', '--omit=dev', '--all'], { cwd: runtimeRoot, timeout: 60000 });
  const dependencies = ['fastify', '@fastify/static', 'pino', 'pg', 'zod', 'kysely', 'kysely/migration',
    '@max-smart-city/contracts', '@max-smart-city/domain', '@max-smart-city/db'];
  await run(process.execPath, ['--input-type=module', '-e',
    `for (const name of ${JSON.stringify(dependencies)}) await import(name);`],
  { cwd: runtimeRoot, timeout: 60000 });
  const pino = require('pino');
  const records = [];
  pino({ base: null, timestamp: false }, { write: line => records.push(JSON.parse(line)) }).info('packaging smoke');
  assert.equal(records[0].msg, 'packaging smoke');

  const pinned = lock.packages['node_modules/pino'];
  assert.equal(pinned.version, '10.3.1');
  const packed = await mkdtemp(path.join(tmpdir(), 'tg030-pino-tarball-'));
  try {
    const result = await run(process.execPath, [npmCli, 'pack', pinned.resolved, '--offline', '--ignore-scripts',
      '--json', '--pack-destination', packed], { cwd: runtimeRoot, timeout: 60000 });
    const tarball = await readFile(path.join(packed, JSON.parse(result.stdout)[0].filename));
    const [algorithm, digest] = pinned.integrity.split('-');
    assert.equal(createHash(algorithm).update(tarball).digest('base64'), digest, 'pino tarball integrity mismatch');
    const tar = gunzipSync(tarball);
    const published = [];
    for (let offset = 0; offset + 512 <= tar.length && tar[offset] !== 0;) {
      const header = tar.subarray(offset, offset + 512);
      const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
      const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
      const type = String.fromCharCode(header[156]);
      assert.ok(type === '0' || type === '\0' || type === '5', `unsupported tar entry: ${name}`);
      if (type !== '5') {
        assert.ok(name.startsWith('package/') && !name.includes('..'), `unsafe package path: ${name}`);
        const relative = name.slice('package/'.length);
        published.push(relative);
        assert.deepEqual(await readFile(path.join(runtimeRoot, 'node_modules/pino', relative)),
          tar.subarray(offset + 512, offset + 512 + size), `vendor content changed: pino/${relative}`);
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    assert.deepEqual((await filesUnder(path.join(runtimeRoot, 'node_modules/pino')))
      .map(file => path.relative(path.join(runtimeRoot, 'node_modules/pino'), file).replaceAll('\\', '/')).sort(), published.sort());
    assert.ok(published.some(file => file.startsWith('test/')), 'expected published pino tests absent');
    t.diagnostic(`pino@${pinned.version}: ${published.length} unchanged tarball files, ` +
      `${published.filter(file => file.startsWith('test/')).length} published test files retained; import/logging PASS`);
  } finally { await rm(packed, { recursive: true, force: true }); }
});
