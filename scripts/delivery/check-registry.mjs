// Read the final factory's actual Fastify onRoute events without listening or calling MAX.
import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import pino from 'pino';
import { buildApp } from '../../apps/api/dist/app/app.js';
import { loadConfig } from '../../apps/api/dist/config/load-config.js';

async function actualRegistry() {
  const routes = [];
  const initialization = channel('fastify.initialization');
  const observe = ({ fastify }) => fastify.addHook('onRoute', route => {
    routes.push({ method: route.method, url: route.url });
  });
  initialization.subscribe(observe);
  try {
    const config = loadConfig({ APP_ENV:'production', DEMO_MODE:'true',
      DATABASE_URL:'postgresql://city@127.0.0.1:5432/city',
      APP_SESSION_SECRET:randomBytes(32).toString('hex'), MAX_ADAPTER_MODE:'live',
      MAX_BOT_TOKEN:randomBytes(32).toString('hex'),
      MAX_WEBHOOK_SECRET:randomBytes(32).toString('hex'),
      PUBLIC_APP_URL:'https://157-22-231-21.sslip.io/',
      PUBLIC_API_BASE_URL:'https://157-22-231-21.sslip.io/api/v1',
      BUILD_SHA:'332ac4aee174a8743324b82b38853b3a3751d2e9' });
    const app = await buildApp({ config, logger:pino({enabled:false}), events:{} });
    try { return routes; }
    finally { await app.close(); }
  } finally { initialization.unsubscribe(observe); }
}

const registry = process.argv[2] ? JSON.parse(await readFile(process.argv[2],'utf8')) : await actualRegistry();
assert.ok(Array.isArray(registry) && registry.length,'Nonempty actual runtime registry required');
const normalize = path => path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g,'{$1}');
const observed = new Set();
for (const route of registry) {
  assert.ok(route.method && route.url,'Invalid onRoute export');
  if (!/^\/(api\/v1(?:\/|$)|health\/|integrations\/|downloads\/)/.test(route.url)) continue;
  for (const method of [route.method].flat()) if (method!=='HEAD') observed.add(`${method.toUpperCase()} ${normalize(route.url)}`);
}
const api = parse(await readFile('openapi.yaml','utf8'));
const documented = new Set(Object.entries(api.paths).flatMap(([path,methods])=>Object.keys(methods).map(method=>`${method.toUpperCase()} ${path}`)));
const missing = [...documented].filter(key=>!observed.has(key));
const extra = [...observed].filter(key=>!documented.has(key));
assert.deepEqual({missing,extra},{missing:[],extra:[]},'Final method/path parity mismatch');
process.stdout.write(`FINAL_METHOD_PATH_PARITY PASS operations=${observed.size}; runtime factory ready without listen or MAX calls.\n`);
