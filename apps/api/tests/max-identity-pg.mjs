import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { up as migrateFoundation } from '../../../packages/db/migrations/0001_foundation.ts';
import { PostgresMaxIdentityRepository } from '../dist/modules/max-identity/repository.js';

const connectionString = process.argv[2];
if (!connectionString || new URL(connectionString).pathname !== '/tg010_test') {
  throw new Error('REQUIRES_DEDICATED_TG010_TEST_DATABASE');
}
const schema = `tg010_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString });
let pool;
let db;
let assertions = 0;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 24 });
  db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  await migrateFoundation(db);
  const repository = new PostgresMaxIdentityRepository(pool);
  const userId = randomUUID();
  await pool.query('INSERT INTO app_user (app_user_id, display_name, active, created_at, updated_at) VALUES ($1,$2,true,now(),now())', [userId, 'Resident']);
  const launch = {
    miniAppUserId: '9007199254740993', chatId: '9007199254740993123',
    chatType: 'DIALOG', displayName: 'Max User', authDate: 1771409719,
  };
  const results = await Promise.all(Array.from({ length: 24 }, () => repository.upsertValidated(launch, new Date())));
  assert.equal(new Set(results.map(row => row.max_identity_id)).size, 1); assertions++;
  const count = await pool.query('SELECT count(*)::int AS n FROM max_identity WHERE mini_app_user_id = $1', [launch.miniAppUserId]);
  assert.equal(count.rows[0].n, 1); assertions++;
  await pool.query('UPDATE max_identity SET app_user_id = $1 WHERE mini_app_user_id = $2', [userId, launch.miniAppUserId]);
  const updated = await repository.upsertValidated({ ...launch, chatId: '12345', chatType: 'CHAT' }, new Date());
  assert.equal(updated.app_user_id, userId); assertions++;
  assert.equal(updated.delivery_chat_id, '12345'); assertions++;
  assert.equal(updated.delivery_chat_type, 'CHAT'); assertions++;
  assert.equal(updated.mini_app_user_id, '9007199254740993'); assertions++;
  const stored = await pool.query('SELECT * FROM max_identity WHERE max_identity_id = $1', [updated.max_identity_id]);
  assert.equal(stored.rows[0].bot_user_id, null); assertions++;
  assert.equal(stored.rows[0].link_status, 'LINKED_CONFIRMED'); assertions++;
  for (const sensitive of ['auth_date', 'hash', 'raw_init_data', 'session_token', 'APP_SESSION_SECRET']) {
    assert.equal(Object.hasOwn(stored.rows[0], sensitive), false); assertions++;
  }
  let uniqueRejected = false;
  try {
    await pool.query(`INSERT INTO max_identity (
      max_identity_id, mini_app_user_id, delivery_chat_id, delivery_chat_type,
      bot_user_id, link_status, app_user_id, first_seen_at, last_seen_at, linked_at
    ) VALUES ($1,$2,$3,$4,NULL,'LINKED_CONFIRMED',$5,now(),now(),now())`,
    [randomUUID(), '777', '777', 'CHANNEL', userId]);
  } catch (error) { uniqueRejected = error.code === '23505'; }
  assert.equal(uniqueRejected, true); assertions++;
  const relation = await pool.query('SELECT count(*)::int AS n FROM max_identity WHERE app_user_id = $1', [userId]);
  assert.equal(relation.rows[0].n, 1); assertions++;
  console.log(`TG010_REAL_POSTGRES_PASS assertions=${assertions} concurrent_upserts=24`);
} finally {
  if (db) await db.destroy();
  else if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
