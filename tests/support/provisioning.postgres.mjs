import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

let infra = {};
try { infra = await import('./postgres.mjs'); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const options = {
  adminUrl: process.env.TEST_POSTGRES_ADMIN_URL,
  env: { APP_ENV: 'test', TEST_DATABASE_TARGET: 'DISPOSABLE_TEST_ONLY' },
};
const query = async (url, sql, values) => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { return await client.query(sql, values); } finally { await client.end(); }
};
const absent = async receipt => {
  const result = await query(options.adminUrl,
    'SELECT datname FROM pg_database WHERE datname=$1 UNION ALL SELECT rolname FROM pg_roles WHERE rolname=ANY($2)',
    [receipt.database, [receipt.migrationRole, receipt.runtimeRole]]);
  assert.equal(result.rowCount, 0);
};

test('real PostgreSQL: ownership, canonical migration, runtime role and cleanup after success', async () => {
  assert.equal(typeof infra.withDisposablePostgres, 'function');
  let receipt;
  await infra.withDisposablePostgres(options, async target => {
    receipt = target.receipt;
    await target.preflight();
    await infra.verifyOwnedPostgresConnection(options, receipt, target.migrationUrl);
    await assert.rejects(infra.verifyOwnedPostgresConnection(options, receipt, options.adminUrl), /OWNERSHIP_MISMATCH/);
    await target.migrate();
    const migration = await query(target.migrationUrl, 'SELECT current_user');
    const runtime = await query(target.runtimeUrl, 'SELECT current_user');
    assert.notEqual(migration.rows[0].current_user, runtime.rows[0].current_user);
    assert.equal(runtime.rows[0].current_user, receipt.runtimeRole);
    await query(target.runtimeUrl, 'SELECT * FROM organization');
    for (const sql of [
      'CREATE TABLE forbidden_ddl(id int)',
      'ALTER TABLE organization DISABLE TRIGGER ALL',
      'TRUNCATE organization',
      'SELECT * FROM kysely_migration',
      `SET ROLE "${receipt.migrationRole}"`,
    ]) await assert.rejects(() => query(target.runtimeUrl, sql), error => error.code === '42501');
    const flags = await query(target.runtimeUrl,
      'SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user');
    assert.ok(Object.values(flags.rows[0]).every(value => value === false));
  });
  await absent(receipt);
});

test('real PostgreSQL: callback failure still removes only owned target', async () => {
  assert.equal(typeof infra.withDisposablePostgres, 'function');
  let receipt;
  await assert.rejects(infra.withDisposablePostgres(options, async target => {
    receipt = target.receipt;
    throw new Error('EXPECTED_CALLBACK_FAILURE');
  }), /EXPECTED_CALLBACK_FAILURE/);
  await absent(receipt);
});

test('real PostgreSQL: arbitrary DB, forged receipt and changed marker are rejected without deletion', async () => {
  assert.equal(typeof infra.provisionPostgres, 'function');
  await assert.rejects(infra.provisionPostgres({ ...options, targetUrl: options.adminUrl }), /ARBITRARY_TARGET/);
  await assert.rejects(infra.cleanupPostgres(options, { database: 'postgres' }), /UNSAFE_TEST_RECEIPT/);
  const target = await infra.provisionPostgres(options);
  try {
    await assert.rejects(infra.cleanupPostgres(options, { ...target.receipt, ownerToken: 'f'.repeat(64) }), /OWNERSHIP_MISMATCH/);
    await query(options.adminUrl, `COMMENT ON DATABASE "${target.receipt.database}" IS 'foreign-marker'`);
    await assert.rejects(target.preflight(), /OWNERSHIP_MISMATCH/);
    await assert.rejects(target.cleanup(), /OWNERSHIP_MISMATCH/);
    assert.equal((await query(options.adminUrl, 'SELECT 1 FROM pg_database WHERE datname=$1', [target.receipt.database])).rowCount, 1);
  } finally {
    const marker = infra.ownershipMarker(target.receipt).replaceAll("'", "''");
    await query(options.adminUrl, `COMMENT ON DATABASE "${target.receipt.database}" IS '${marker}'`);
    await target.cleanup();
  }
  assert.equal((await query(options.adminUrl, 'SELECT current_database()')).rows[0].current_database, 'postgres');
});

test('real PostgreSQL: interrupted-run receipt supports repeatable recovery', async () => {
  assert.equal(typeof infra.provisionPostgres, 'function');
  const target = await infra.provisionPostgres(options);
  const recoveredReceipt = JSON.parse(JSON.stringify(target.receipt));
  await infra.cleanupPostgres(options, recoveredReceipt);
  await infra.cleanupPostgres(options, recoveredReceipt);
  await absent(recoveredReceipt);
});

test('real PostgreSQL: a receipt reconstructed from public catalog cannot delete another run', async () => {
  const target = await infra.provisionPostgres(options);
  try {
    const result = await query(options.adminUrl,
      "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
      [target.receipt.database]);
    // Worst case: every identity/OID is known; the attacker only lacks the private receipt token.
    const publicToken = result.rows[0].marker.split(':').at(-1);
    const forged = { ...target.receipt, ownerToken: publicToken };
    await assert.rejects(infra.cleanupPostgres(options, forged), /OWNERSHIP_MISMATCH/);
    assert.equal((await query(options.adminUrl, 'SELECT 1 FROM pg_database WHERE datname=$1', [target.receipt.database])).rowCount, 1);
  } finally { await target.cleanup(); }
});

test('real PostgreSQL: abrupt child-process interruption recovers from persisted receipt', { timeout: 30_000 }, async () => {
  assert.equal(typeof infra.cleanupPostgres, 'function');
  const child = fork(fileURLToPath(new URL('./fixtures/interrupted-run.mjs', import.meta.url)), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, APP_ENV: 'test', TEST_DATABASE_TARGET: 'DISPOSABLE_TEST_ONLY' },
  });
  let receipt;
  try {
    const message = await new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
      child.once('exit', () => reject(new Error('CHILD_EXITED_BEFORE_RECEIPT')));
    });
    receipt = JSON.parse(await readFile(message.receiptPath, 'utf8'));
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
    await infra.cleanupPostgres(options, receipt);
    await absent(receipt);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (receipt) await infra.cleanupPostgres(options, receipt);
  }
});
