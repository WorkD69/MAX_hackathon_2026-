import { request as httpRequest } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { migrateToLatest } from '../../packages/db/dist/index.js';
import { seedDemoCatalog } from '../../packages/db/src/seed/index.ts';

// This launcher exists only on loopback in the canonical isolated synthetic-auth profile.
if (process.env.APP_ENV !== 'test' || process.env.TEST_AUTH_DEMO_PROFILE !== 'TEST_DEMO_E2E_V1' ||
    !process.env.DATABASE_URL || !process.env.LOCAL_TLS_KEY || !process.env.LOCAL_TLS_CERT) {
  throw new Error('LOCAL_TEST_PROFILE_DATABASE_AND_TLS_REQUIRED');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.LOCAL_DEMO_PORT ?? 4301);
const apiPort = Number(process.env.LOCAL_API_PORT ?? 4300);
const base = `https://localhost:${port}`;
const tls = { key: readFileSync(process.env.LOCAL_TLS_KEY), cert: readFileSync(process.env.LOCAL_TLS_CERT) };
const signingKey = randomBytes(32);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
await migrateToLatest(db);
await seedDemoCatalog(pool);
await seedDemoCatalog(pool);
await db.destroy();
const child = spawn(process.execPath, ['apps/api/dist/app/main.js'], { cwd: root, stdio: 'inherit', env: {
  ...process.env, HOST: '127.0.0.1', PORT: String(apiPort), DEMO_MODE: 'true', MAX_ADAPTER_MODE: 'fake',
  MAX_BOT_TOKEN: undefined, MAX_WEBHOOK_SECRET: undefined,
  TEST_MAX_INIT_DATA_SIGNING_KEY: signingKey.toString('hex'), APP_SESSION_SECRET: randomBytes(32).toString('hex'),
  PUBLIC_APP_URL: `${base}/`, PUBLIC_API_BASE_URL: `${base}/api/v1`,
  BUILD_SHA: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
} });
function signedLaunch() {
  const values = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 29001, first_name: 'Локальная', last_name: 'проверка' }),
    chat: JSON.stringify({ id: 29002, type: 'DIALOG' }), query_id: randomBytes(16).toString('hex') });
  const canonical = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  values.set('hash', createHmac('sha256', signingKey).update(canonical).digest('hex'));
  return [...values.entries()].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}
const server = createTlsServer(tls, (req, res) => {
  if (req.method === 'GET' && req.url === '/launch') {
    res.writeHead(302, { location: `/#WebAppData=${encodeURIComponent(signedLaunch())}`, 'cache-control': 'no-store' });
    res.end(); return;
  }
  const upstream = httpRequest({ host: '127.0.0.1', port: apiPort, method: req.method, path: req.url,
    headers: { ...req.headers, host: `localhost:${port}` } }, incoming => {
    res.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(503); res.end('API запускается. Обновите страницу.'); });
  req.pipe(upstream);
});
server.listen(port, '127.0.0.1', () => { process.stdout.write(`LOCAL_URL=${base}/launch\n`); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); child.kill(signal); });
child.once('exit', code => { server.close(); process.exitCode = code ?? 1; });
