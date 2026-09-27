import { randomBytes, createHash } from 'node:crypto';
import { writeFile, rename, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

const ident = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const suites = ['tg026', 'tg005', 'tg006', 'tg007', 'tg008', 'tg012'];

export function requireTestProvisioning(env = process.env) {
  if (env.APP_ENV !== 'test') throw new Error('TEST_ENV_REQUIRED');
  if (env.TEST_DATABASE_TARGET !== 'DISPOSABLE_TEST_ONLY') throw new Error('TEST_TARGET_MARKER_REQUIRED');
}

export function validateReceipt(receipt) {
  const prefix = `${receipt?.suite}_${receipt?.runId}`;
  if (receipt?.version !== 1 || !suites.includes(receipt.suite) ||
      !/^[a-f0-9]{32}$/.test(receipt.runId) || !/^[a-f0-9]{64}$/.test(receipt.ownerToken) ||
      !/^\d+$/.test(receipt.systemIdentifier) || !Number.isInteger(receipt.provisionerOid) ||
      receipt.database !== `${prefix}_${receipt.suite}_test` ||
      receipt.migrationRole !== `${prefix}_migration` || receipt.runtimeRole !== `${prefix}_runtime` ||
      ['databaseOid', 'migrationRoleOid', 'runtimeRoleOid'].some(key => receipt[key] !== null && (!Number.isInteger(receipt[key]) || receipt[key] <= 0))) {
    throw new Error('UNSAFE_TEST_RECEIPT');
  }
}

export function ownershipMarker(receipt) {
  validateReceipt(receipt);
  // Keep the capability secret in the private receipt. Catalogs reveal only its digest.
  const digest = createHash('sha256').update(receipt.ownerToken).digest('hex');
  return `DISPOSABLE_TEST_ONLY:v1:${receipt.runId}:${digest}`;
}

export function assertOwnedResource(receipt, kind, row) {
  validateReceipt(receipt);
  if (!row) return;
  if (row.oid !== receipt[`${kind}Oid`] || row.marker !== ownershipMarker(receipt) ||
      (kind === 'database' && row.owner !== receipt.provisionerOid)) {
    throw new Error(`OWNERSHIP_MISMATCH:${kind}`);
  }
}

async function connect(url) {
  if (!url) throw new Error('MISSING_TEST_POSTGRES_ADMIN_URL');
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}

async function serverIdentity(client) {
  const { rows } = await client.query(`SELECT system_identifier::text AS system_identifier,
    (SELECT oid FROM pg_roles WHERE rolname=current_user) AS principal_oid,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser
    FROM pg_control_system()`);
  if (!rows[0].superuser) throw new Error('DEDICATED_TEST_PROVISIONER_REQUIRED');
  return rows[0];
}

async function inventory(client, receipt) {
  validateReceipt(receipt);
  await client.query('BEGIN READ ONLY');
  try {
    const identity = await serverIdentity(client);
    if (identity.system_identifier !== receipt.systemIdentifier || identity.principal_oid !== receipt.provisionerOid) {
      throw new Error('OWNERSHIP_MISMATCH:server');
    }
    const db = await client.query(`SELECT oid,datdba AS owner,shobj_description(oid,'pg_database') AS marker
      FROM pg_database WHERE datname=$1`, [receipt.database]);
    const roles = await client.query(`SELECT oid,rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
      shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=ANY($1)`,
    [[receipt.migrationRole, receipt.runtimeRole]]);
    const state = { database: db.rows[0] };
    for (const kind of ['migrationRole', 'runtimeRole']) state[kind] = roles.rows.find(row => row.rolname === receipt[kind]);
    for (const kind of ['database', 'migrationRole', 'runtimeRole']) assertOwnedResource(receipt, kind, state[kind]);
    for (const kind of ['migrationRole', 'runtimeRole']) {
      const row = state[kind];
      if (row && ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls'].some(key => row[key])) {
        throw new Error(`UNSAFE_ROLE_PRIVILEGES:${kind}`);
      }
    }
    const memberships = await client.query('SELECT 1 FROM pg_auth_members WHERE member=ANY($1::oid[])',
      [[receipt.migrationRoleOid, receipt.runtimeRoleOid].filter(Boolean)]);
    if (memberships.rowCount) throw new Error('UNSAFE_ROLE_MEMBERSHIP');
    await client.query('COMMIT');
    return state;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

async function saveReceipt(receipt, file) {
  if (!file) return;
  // Atomic replacement; caller supplies a private path outside the versioned tree.
  const temporary = `${file}.${receipt.runId}.tmp`;
  await writeFile(temporary, JSON.stringify(receipt), { mode: 0o600 });
  await rename(temporary, file);
}

function targetUrl(adminUrl, database, role, password) {
  if (!adminUrl) throw new Error('MISSING_TEST_POSTGRES_ADMIN_URL');
  const url = new URL(adminUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_POSTGRES_URL');
  // Connection parameters cannot override target or principal.
  if ([...url.searchParams.keys()].some(key => ['host', 'port', 'user', 'password', 'database', 'dbname', 'options', 'service'].includes(key))) {
    throw new Error('UNSAFE_CONNECTION_PARAMETERS');
  }
  url.pathname = `/${database}`;
  url.username = role;
  url.password = password;
  return url.href;
}

export async function verifyOwnedPostgresConnection(options, receipt, connectionUrl) {
  requireTestProvisioning(options.env);
  validateReceipt(receipt);
  const supplied = new URL(connectionUrl);
  const bootstrap = new URL(options.adminUrl);
  const principal = decodeURIComponent(supplied.username);
  if (supplied.hostname !== bootstrap.hostname || (supplied.port || '5432') !== (bootstrap.port || '5432') ||
      decodeURIComponent(supplied.pathname.slice(1)) !== receipt.database ||
      ![receipt.migrationRole, receipt.runtimeRole].includes(principal)) {
    throw new Error('OWNERSHIP_MISMATCH:connectionTarget');
  }
  targetUrl(connectionUrl, receipt.database, principal, decodeURIComponent(supplied.password));
  const admin = await connect(options.adminUrl);
  try {
    const state = await inventory(admin, receipt);
    if (!state.database || !state.migrationRole || !state.runtimeRole) throw new Error('MISSING_OWNED_TARGET');
  } finally { await admin.end(); }
  const client = await connect(connectionUrl);
  try {
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(`SELECT current_database() AS db,current_user AS principal,
      (SELECT oid FROM pg_database WHERE datname=current_database()) AS database_oid,
      (SELECT oid FROM pg_roles WHERE rolname=current_user) AS role_oid,
      shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') AS marker`);
    const row = rows[0];
    if (row.db !== receipt.database || row.principal !== principal || row.database_oid !== receipt.databaseOid ||
        row.role_oid !== (principal === receipt.migrationRole ? receipt.migrationRoleOid : receipt.runtimeRoleOid) ||
        row.marker !== ownershipMarker(receipt)) throw new Error('OWNERSHIP_MISMATCH:connection');
    await client.query('COMMIT');
  } finally { await client.end(); }
}

export async function cleanupPostgres(options, receipt) {
  requireTestProvisioning(options.env);
  validateReceipt(receipt);
  const admin = await connect(options.adminUrl);
  try {
    await inventory(admin, receipt); // Verify EVERY resource before deleting any.
    let state = await inventory(admin, receipt);
    if (state.database) await admin.query(`DROP DATABASE ${ident(receipt.database)} WITH (FORCE)`);
    for (const kind of ['runtimeRole', 'migrationRole']) {
      state = await inventory(admin, receipt);
      if (state[kind]) await admin.query(`DROP ROLE ${ident(receipt[kind])}`);
    }
  } finally { await admin.end(); }
}

export async function provisionPostgres(options) {
  requireTestProvisioning(options.env);
  if (options.targetUrl !== undefined || options.database !== undefined || options.receipt !== undefined) {
    throw new Error('ARBITRARY_TARGET_REJECTED');
  }
  const suite = options.suite ?? 'tg026';
  if (!suites.includes(suite)) throw new Error('UNSAFE_TEST_RECEIPT');
  const runId = randomBytes(16).toString('hex');
  const prefix = `${suite}_${runId}`;
  const migrationPassword = randomBytes(32).toString('hex');
  const runtimePassword = randomBytes(32).toString('hex');
  // Validate connection parameters before any writes.
  const migrationUrl = targetUrl(options.adminUrl, `${prefix}_${suite}_test`, `${prefix}_migration`, migrationPassword);
  const runtimeUrl = targetUrl(options.adminUrl, `${prefix}_${suite}_test`, `${prefix}_runtime`, runtimePassword);
  const receiptPath = options.receiptPath ?? path.join(await mkdtemp(path.join(tmpdir(), 'tg026-owned-')), 'receipt.json');
  const admin = await connect(options.adminUrl);
  let receipt;
  try {
    const identity = await serverIdentity(admin);
    receipt = {
      version: 1, suite, runId, ownerToken: randomBytes(32).toString('hex'),
      systemIdentifier: identity.system_identifier, provisionerOid: identity.principal_oid,
      database: `${prefix}_${suite}_test`, migrationRole: `${prefix}_migration`, runtimeRole: `${prefix}_runtime`,
      databaseOid: null, migrationRoleOid: null, runtimeRoleOid: null,
    };
    await saveReceipt(receipt, receiptPath);
    // No IF NOT EXISTS: a collision is not a reservation and must fail closed.
    for (const [kind, password] of [['migrationRole', migrationPassword], ['runtimeRole', runtimePassword]]) {
      await admin.query(`CREATE ROLE ${ident(receipt[kind])} LOGIN PASSWORD ${literal(password)}
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
      await admin.query(`COMMENT ON ROLE ${ident(receipt[kind])} IS ${literal(ownershipMarker(receipt))}`);
      receipt[`${kind}Oid`] = (await admin.query('SELECT oid FROM pg_roles WHERE rolname=$1', [receipt[kind]])).rows[0].oid;
      await saveReceipt(receipt, receiptPath);
    }
    await admin.query(`CREATE DATABASE ${ident(receipt.database)} TEMPLATE template0`);
    await admin.query(`COMMENT ON DATABASE ${ident(receipt.database)} IS ${literal(ownershipMarker(receipt))}`);
    receipt.databaseOid = (await admin.query('SELECT oid FROM pg_database WHERE datname=$1', [receipt.database])).rows[0].oid;
    await saveReceipt(receipt, receiptPath);
    await inventory(admin, receipt);
    await admin.query(`REVOKE ALL ON DATABASE ${ident(receipt.database)} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, CREATE ON DATABASE ${ident(receipt.database)} TO ${ident(receipt.migrationRole)}`);
    await admin.query(`GRANT CONNECT ON DATABASE ${ident(receipt.database)} TO ${ident(receipt.runtimeRole)}`);
    const targetAdmin = await connect(targetUrl(options.adminUrl, receipt.database, new URL(options.adminUrl).username, new URL(options.adminUrl).password));
    try {
      await targetAdmin.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      await targetAdmin.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${ident(receipt.migrationRole)}`);
      await targetAdmin.query(`GRANT USAGE ON SCHEMA public TO ${ident(receipt.runtimeRole)}`);
    } finally { await targetAdmin.end(); }
  } catch (error) {
    if (receipt) {
      try { await cleanupPostgres(options, receipt); }
      catch { throw new AggregateError([error], `PROVISION_FAILED; CLEANUP_REFUSED; receipt=${receiptPath}`); }
    }
    throw error;
  } finally { await admin.end(); }

  const preflight = async () => {
    requireTestProvisioning(options.env);
    const client = await connect(options.adminUrl);
    let state;
    try { state = await inventory(client, receipt); } finally { await client.end(); }
    if (!state.database || !state.migrationRole || !state.runtimeRole) throw new Error('MISSING_OWNED_TARGET');
    const principals = [];
    for (const [url, role] of [[migrationUrl, receipt.migrationRole], [runtimeUrl, receipt.runtimeRole]]) {
      const connection = await connect(url);
      try {
        await connection.query('BEGIN READ ONLY');
        const { rows } = await connection.query(`SELECT current_database() AS db,current_user AS principal,
          current_setting('transaction_isolation') AS isolation,current_setting('server_version') AS version`);
        if (rows[0].db !== receipt.database || rows[0].principal !== role) throw new Error('OWNERSHIP_MISMATCH:connection');
        if (role === receipt.runtimeRole) {
          const grants = await connection.query(`SELECT
            has_database_privilege(current_database(),'CREATE') AS db_ddl,
            has_database_privilege(current_database(),'TEMP') AS temp_ddl,
            has_schema_privilege('public','CREATE') AS schema_ddl,
            EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_relation`);
          if (Object.values(grants.rows[0]).some(Boolean)) throw new Error('UNSAFE_RUNTIME_DDL_PRIVILEGES');
        }
        principals.push(rows[0]);
        await connection.query('COMMIT');
      } finally { await connection.end(); }
    }
    return { systemIdentifier: receipt.systemIdentifier, principals };
  };

  return {
    receipt: Object.freeze(receipt), receiptPath, migrationUrl, runtimeUrl, preflight,
    cleanup: () => cleanupPostgres(options, receipt),
    migrate: async () => {
      await preflight();
      const { migrateToLatest } = await import('@max-smart-city/db');
      const pool = new pg.Pool({ connectionString: migrationUrl });
      const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
      let result;
      try { result = await migrateToLatest(db); } finally { await db.destroy(); }
      await preflight();
      const client = await connect(migrationUrl);
      try {
        const { rows } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
          AND tablename NOT IN ('kysely_migration','kysely_migration_lock')`);
        for (const row of rows) await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${ident(row.tablename)} TO ${ident(receipt.runtimeRole)}`);
        await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(receipt.runtimeRole)}`);
      } finally { await client.end(); }
      await preflight();
      return result;
    },
  };
}

export async function withDisposablePostgres(options, callback) {
  const target = await provisionPostgres(options);
  let interruptedCleanup;
  const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
    interruptedCleanup ??= target.cleanup().then(
      () => process.exit(signal === 'SIGINT' ? 130 : 143),
      () => { console.error(`INTERRUPTED_CLEANUP_REFUSED; receipt=${target.receiptPath}`); process.exit(1); },
    );
  }]));
  for (const [signal, handler] of handlers) process.once(signal, handler);
  let failure;
  try { await target.preflight(); return await callback(target); }
  catch (error) { failure = error; throw error; }
  finally {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    try { await (interruptedCleanup ?? target.cleanup()); }
    catch (cleanupError) {
      if (failure) throw new AggregateError([failure, cleanupError], 'TEST_AND_CLEANUP_FAILED');
      throw cleanupError;
    }
  }
}
