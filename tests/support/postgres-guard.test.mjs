import assert from 'node:assert/strict';
import { test } from 'node:test';

let guards = {};
try { guards = await import('./postgres.mjs'); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

test('APP_ENV=test alone never authorizes a disposable target', () => {
  assert.equal(typeof guards.requireTestProvisioning, 'function');
  assert.throws(() => guards.requireTestProvisioning({ APP_ENV: 'test' }), /TEST_TARGET_MARKER/);
  assert.throws(() => guards.requireTestProvisioning({ APP_ENV: 'production', TEST_DATABASE_TARGET: 'DISPOSABLE_TEST_ONLY' }), /TEST_ENV/);
  guards.requireTestProvisioning({ APP_ENV: 'test', TEST_DATABASE_TARGET: 'DISPOSABLE_TEST_ONLY' });
});

test('receipt rejects arbitrary targets, forged names, mismatched identity and foreign tokens', () => {
  assert.equal(typeof guards.validateReceipt, 'function');
  assert.throws(() => guards.validateReceipt({ database: 'production' }), /UNSAFE_TEST_RECEIPT/);
  const receipt = {
    version: 1, suite: 'tg026', runId: 'a'.repeat(32), ownerToken: 'b'.repeat(64),
    systemIdentifier: '123456789', provisionerOid: 10,
    database: 'tg026_' + 'a'.repeat(32) + '_tg026_test',
    migrationRole: 'tg026_' + 'a'.repeat(32) + '_migration',
    runtimeRole: 'tg026_' + 'a'.repeat(32) + '_runtime',
    databaseOid: 101, migrationRoleOid: 102, runtimeRoleOid: 103,
  };
  guards.validateReceipt(receipt);
  for (const suite of ['tg005', 'tg006', 'tg007', 'tg008', 'tg012']) {
    const prefix = `${suite}_${receipt.runId}`;
    guards.validateReceipt({ ...receipt, suite,
      database: `${prefix}_${suite}_test`,
      migrationRole: `${prefix}_migration`, runtimeRole: `${prefix}_runtime` });
  }
  for (const patch of [{ database: 'production' }, { runtimeRole: receipt.migrationRole }, { ownerToken: '' }, { suite: 'production' }]) {
    assert.throws(() => guards.validateReceipt({ ...receipt, ...patch }), /UNSAFE_TEST_RECEIPT/);
  }
  const resource = { oid: 101, marker: guards.ownershipMarker(receipt), owner: 10 };
  assert.equal(typeof guards.assertOwnedResource, 'function');
  guards.assertOwnedResource(receipt, 'database', resource);
  for (const patch of [{ oid: 999 }, { marker: 'another-run' }, { owner: 999 }]) {
    assert.throws(() => guards.assertOwnedResource(receipt, 'database', { ...resource, ...patch }), /OWNERSHIP_MISMATCH/);
  }
  const prefix = `tg005_${receipt.runId}`;
  const legacy = { ...receipt, suite: 'tg005', legacyKey: 'TG005_FOUNDATION',
    database: `${prefix}_tg005_test`, migrationRole: `${prefix}_migration`, runtimeRole: `${prefix}_runtime` };
  const marker = guards.ownershipMarker(legacy);
  assert.notEqual(marker, guards.ownershipMarker({ ...legacy, legacyKey: 'TG005_CONSTRAINTS' }));
  assert.throws(() => guards.validateReceipt({ ...receipt, legacyKey: 'TG005_FOUNDATION' }), /UNSAFE_TEST_RECEIPT/);
});

test('concurrent legacy suites cannot reuse a database or ownership receipt', () => {
  assert.equal(typeof guards.assertDistinctLegacyTargets, 'function');
  const env = {
    TG005_FOUNDATION_TEST_DATABASE_URL: 'postgresql://localhost/a_tg005_test',
    TG005_FOUNDATION_TEST_DATABASE_RECEIPT: 'foundation-receipt',
    TG005_CONSTRAINTS_TEST_DATABASE_URL: 'postgresql://localhost/b_tg005_test',
    TG005_CONSTRAINTS_TEST_DATABASE_RECEIPT: 'constraints-receipt',
  };
  guards.assertDistinctLegacyTargets(env);
  assert.throws(() => guards.assertDistinctLegacyTargets({
    ...env, TG005_CONSTRAINTS_TEST_DATABASE_RECEIPT: 'foundation-receipt',
  }), /REUSED_OWNED_TARGET/);
  assert.throws(() => guards.assertDistinctLegacyTargets({
    ...env, TG005_CONSTRAINTS_TEST_DATABASE_URL: env.TG005_FOUNDATION_TEST_DATABASE_URL,
  }), /REUSED_OWNED_TARGET/);
  assert.throws(() => guards.assertDistinctLegacyTargets({
    ...env, TG005_CONSTRAINTS_TEST_DATABASE_RECEIPT: '',
  }), /MISSING_OWNED_TARGET_INPUT/);
});
