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
  for (const patch of [{ database: 'production' }, { runtimeRole: receipt.migrationRole }, { ownerToken: '' }, { suite: 'production' }]) {
    assert.throws(() => guards.validateReceipt({ ...receipt, ...patch }), /UNSAFE_TEST_RECEIPT/);
  }
  const resource = { oid: 101, marker: guards.ownershipMarker(receipt), owner: 10 };
  assert.equal(typeof guards.assertOwnedResource, 'function');
  guards.assertOwnedResource(receipt, 'database', resource);
  for (const patch of [{ oid: 999 }, { marker: 'another-run' }, { owner: 999 }]) {
    assert.throws(() => guards.assertOwnedResource(receipt, 'database', { ...resource, ...patch }), /OWNERSHIP_MISMATCH/);
  }
});
