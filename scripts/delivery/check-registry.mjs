// Проверка экспортированного TG-029 onRoute registry. Не создаёт replacement registry.
// Формат input: [{ method: 'GET' | ['GET','HEAD'], url: '/api/v1/cases/:caseId', schema?: ... }].
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/delivery/check-registry.mjs <actual-onRoute-registry.json>');
const registry = JSON.parse(await readFile(file,'utf8'));
assert.ok(Array.isArray(registry) && registry.length,'Nonempty actual runtime registry required');
const normalize = path => path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g,'{$1}');
const observed = new Set();
for (const route of registry) {
  assert.ok(route.method && route.url,'Invalid onRoute export');
  if (!/^\/(api\/v1(?:\/|$)|health\/|integrations\/)/.test(route.url)) continue;
  for (const method of [route.method].flat()) if (method!=='HEAD') observed.add(`${method.toUpperCase()} ${normalize(route.url)}`);
}
const api = parse(await readFile('openapi.yaml','utf8'));
const documented = new Set(Object.entries(api.paths).flatMap(([path,methods])=>Object.keys(methods).map(method=>`${method.toUpperCase()} ${path}`)));
const missing = [...documented].filter(key=>!observed.has(key));
const extra = [...observed].filter(key=>!documented.has(key));
assert.deepEqual({missing,extra},{missing:[],extra:[]},'Final method/path parity mismatch');
process.stdout.write(`FINAL_METHOD_PATH_PARITY PASS operations=${observed.size}; schema/auth/body parity requires final owner evidence.\n`);
