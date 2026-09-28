import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const importOptional = async (file) => {
  try { return await import(file); } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
};
const { readE2EProfile } = await importOptional('../../scripts/test/e2e-profile.mjs');
const { discoverIntegrationSuites } = await importOptional('../../scripts/test/integration.mjs');
const valid = {
  APPLICATION_BASE_URL: 'https://injected.example/application',
  TEST_AUTH_DEMO_PROFILE: 'TEST:external-profile',
  SEED_SCENARIO_REF: 'external-seed-ref',
};

test('E2E profile preserves canonical input fields without address defaults', () => {
  assert.equal(typeof readE2EProfile, 'function');
  assert.deepEqual(readE2EProfile(valid), {
    application_base_url: valid.APPLICATION_BASE_URL,
    test_auth_demo_profile: valid.TEST_AUTH_DEMO_PROFILE,
    seed_scenario_ref: valid.SEED_SCENARIO_REF,
  });
  assert.equal(readE2EProfile({ ...valid, API_BASE_URL: 'https://api.example' }).api_base_url, 'https://api.example');
});

test('E2E profile rejects missing inputs, production profiles and unsafe URLs', () => {
  assert.equal(typeof readE2EProfile, 'function');
  for (const key of Object.keys(valid)) {
    const input = { ...valid }; delete input[key];
    assert.throws(() => readE2EProfile(input), /MISSING/);
  }
  for (const url of ['file:///tmp/app', 'ftp://app.example', 'https://user:password@app.example', 'https://app.example/#token']) {
    assert.throws(() => readE2EProfile({ ...valid, APPLICATION_BASE_URL: url }), /INVALID/);
  }
  assert.throws(() => readE2EProfile({ ...valid, TEST_AUTH_DEMO_PROFILE: 'PRODUCTION' }), /TEST_ONLY/);
});

test('integration discovery includes canonical and existing workspace suites and reports missing coverage', async () => {
  assert.equal(typeof discoverIntegrationSuites, 'function');
  const root = await mkdtemp(path.join(tmpdir(), 'infra-discovery-'));
  try {
    await mkdir(path.join(root, 'packages/db/src'), { recursive: true });
    await writeFile(path.join(root, 'packages/db/src/existing.integration.test.ts'), '');
    let result = await discoverIntegrationSuites(root);
    assert.equal(result.groups[0].files.length, 1);
    assert.deepEqual(result.missing, ['db', 'concurrency', 'api']);
    for (const suite of ['db', 'concurrency', 'api']) {
      await mkdir(path.join(root, 'tests/integration', suite), { recursive: true });
      await writeFile(path.join(root, 'tests/integration', suite, 'owned.test.ts'), '');
    }
    result = await discoverIntegrationSuites(root);
    assert.deepEqual(result.missing, []);
    assert.equal(result.groups.reduce((n, group) => n + group.files.length, 0), 4);
    await mkdir(path.join(root, 'apps/api/test-integration'), { recursive: true });
    await mkdir(path.join(root, 'apps/api/src/modules/demo'), { recursive: true });
    await writeFile(path.join(root, 'apps/api/test-integration/tg013-seam.test.ts'), '');
    await writeFile(path.join(root, 'apps/api/src/modules/demo/demo.integration.test.ts'), '');
    result = await discoverIntegrationSuites(root);
    assert.deepEqual(result.groups.find(group => group.cwd === 'apps/api').files, [
      'apps/api/src/modules/demo/demo.integration.test.ts', 'apps/api/test-integration/tg013-seam.test.ts',
    ]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('integration runner rejects an empty tree and propagates a failing child suite', async () => {
  const runner = path.resolve('scripts/test/integration.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'infra-runner-'));
  try {
    let result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
    assert.match(result.stderr, /NO_INTEGRATION_TESTS/);
    assert.notEqual(result.status, 0);
    // A real child Vitest run: test-only fixture outside the repository.
    await mkdir(path.join(root, 'tests/integration/db'), { recursive: true });
    await writeFile(path.join(root, 'tests/integration/db/failing.test.ts'),
      `import { test, expect } from ${JSON.stringify(import.meta.resolve('vitest'))}; test('failure', () => expect(1).toBe(2));`);
    result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /CHILD_SUITE_FAILED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('root integration refuses legacy DB suites with arbitrary URLs and no owned receipts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'infra-unsafe-runner-'));
  try {
    await mkdir(path.join(root, 'packages/db/src'), { recursive: true });
    await writeFile(path.join(root, 'packages/db/src/unsafe.integration.test.ts'),
      "throw new Error('UNSAFE_CHILD_MUST_NOT_START');");
    await mkdir(path.join(root, 'apps/api/test-integration'), { recursive: true });
    await writeFile(path.join(root, 'apps/api/test-integration/unsafe.test.ts'),
      "throw new Error('UNSAFE_CHILD_MUST_NOT_START');");
    const result = spawnSync(process.execPath, [path.resolve('scripts/test/integration.mjs')], {
      cwd: root, encoding: 'utf8',
      env: {
        ...process.env, APP_ENV: 'test', TEST_DATABASE_TARGET: 'DISPOSABLE_TEST_ONLY',
        TG005_FOUNDATION_TEST_DATABASE_URL: 'postgresql://arbitrary.example/customer_tg005_test',
        TG006_TEST_DATABASE_URL: 'postgresql://arbitrary.example/customer_tg006_test',
        TG005_FOUNDATION_TEST_DATABASE_RECEIPT: '', TG006_TEST_DATABASE_RECEIPT: '',
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OWNED_TEST_TARGET_REQUIRED.*no child suite started/);
    assert.doesNotMatch(result.stdout + result.stderr, /UNSAFE_CHILD_MUST_NOT_START|RUN\s+v/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
