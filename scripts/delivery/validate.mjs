import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseDocument } from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const text = path => readFile(path,'utf8');
async function yaml(path) {
  const document = parseDocument(await text(path),{uniqueKeys:true});
  assert.equal(document.errors.length,0,`${path}: YAML parsing failed`);
  return document.toJS();
}
const [api,data,compose,vps] = await Promise.all(['openapi.yaml','DATA-API.yaml','compose.yaml','compose.vps.yaml'].map(yaml));
assert.equal(api.openapi,'3.1.0');
assert.equal(api['x-delivery'].FINAL_SYNC_REQUIRED,'NO');
assert.equal(data.FINAL_SYNC_REQUIRED,'NO');
assert.equal(api['x-delivery'].route_parity,'VERIFIED');
assert.equal(data.route_parity,'VERIFIED');
assert.equal(data.config_version,'1.0');
assert.equal(data.solution_id,'max-smart-city');
assert.match(data.base_url,/^https:\/\//);
assert.equal(new URL(data.base_url).pathname,'/');
assert.equal(api.servers[0].url,data.base_url);
const ajv = new Ajv({strict:false,allErrors:true});
addFormats(ajv);
for (const [name,schema] of Object.entries(api.components.schemas)) {
  assert.notEqual(schema,undefined,name);
  ajv.compile(schema);
}
function resolveRef(ref) {
  assert.match(ref,/^#\/components\/schemas\//);
  const schema = api.components.schemas[ref.split('/').at(-1)];
  assert.ok(schema,`Unresolved reference ${ref}`);
  return schema;
}
function walk(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) resolveRef(value.$ref);
  for (const child of Object.values(value)) walk(child);
}
walk(api);
const checkIds = new Set();
const covered = new Set();
const exampleUuid = 'd0080000-0000-4000-8000-000000000003';
function substitute(value) {
  if (typeof value==='string' && /^\{\{.*\}\}$/.test(value)) return value.includes('init_data') ? 'synthetic-schema-only-not-authentic' : exampleUuid;
  if (Array.isArray(value)) return value.map(substitute);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,substitute(v)]));
  return value;
}
for (const check of data.mandatory_checks) {
  assert.ok(!checkIds.has(check.id),`duplicate check ${check.id}`);checkIds.add(check.id);
  const operation = api.paths[check.path]?.[check.method.toLowerCase()];
  assert.ok(operation,`${check.id}: undocumented route`);
  assert.ok(check.purpose && check.auth && check.required_roles.length && check.test_data.classification==='SYNTHETIC');
  assert.ok(operation.responses[String(check.expected.success_code)],`${check.id}: response code drift`);
  assert.ok(check.expected.response_shape && check.negative.condition && check.negative.status);
  assert.equal(check.final_sync_required,false);
  for (const name of [...check.path.matchAll(/\{([^}]+)\}/g)].map(m=>m[1])) {
    assert.ok(check.parameters.some(p=>p.name===name),`${check.id}: path parameter ${name} missing`);
  }
  if (check.request_schema) {
    const validate = ajv.compile(resolveRef(check.request_schema));
    assert.ok(validate(substitute(check.body)),`${check.id}: fixture/schema mismatch: ${JSON.stringify(validate.errors)}`);
  }
  if (check.expected.response_schema) resolveRef(check.expected.response_schema);
  covered.add(`${check.method} ${check.path}`);
}
for (const [path,methods] of Object.entries(api.paths)) for (const method of Object.keys(methods)) {
  assert.ok(covered.has(`${method.toUpperCase()} ${path}`),`DATA-API coverage gap ${method} ${path}`);
}
process.stdout.write(`YAML/DATA_API/JSON_SCHEMA PASS operations=${covered.size} checks=${checkIds.size}\n`);

const env = Object.fromEntries((await text('.env.example')).split(/\r?\n/).filter(line=>/^[A-Z][A-Z0-9_]*=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const source = await text('apps/api/src/config/schema.ts');
const keyList = source.match(/export const ENV_KEYS = \[([\s\S]*?)\] as const/);
assert.ok(keyList,'Typed ENV_KEYS registry missing');
const canonical = [...keyList[1].matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map(match=>match[1]);
const deliveryKeys = ['APP_PORT','POSTGRES_USER','POSTGRES_DB','POSTGRES_PASSWORD','NODE_EXTRA_CA_CERTS'];
assert.deepEqual(Object.keys(env).sort(),[...canonical,...deliveryKeys].sort(),'Bidirectional ENV parity');
const secretKeys = ['APP_SESSION_SECRET','MAX_BOT_TOKEN','MAX_WEBHOOK_SECRET','DATABASE_URL','POSTGRES_PASSWORD','TEST_MAX_INIT_DATA_SIGNING_KEY'];
for (const key of secretKeys) assert.equal(env[key],'',`Secret/connection example must be empty: ${key}`);
assert.equal(env.TEST_AUTH_DEMO_PROFILE,'');
const optional = ['TEST_AUTH_DEMO_PROFILE','TEST_MAX_INIT_DATA_SIGNING_KEY'];
for (const key of canonical) {
  if (optional.includes(key)) assert.ok(!(key in compose.services.app.environment));
  else if (key !== 'BUILD_SHA') assert.ok(key in compose.services.app.environment,`Compose config missing ${key}`);
}
// Реальная typed validation выполняется только если compile output доступен.
try {
  const { loadConfig } = await import('../../apps/api/dist/config/load-config.js');
  const ephemeral = {...env,DATABASE_URL:'postgresql://city@postgres:5432/city',
    APP_SESSION_SECRET:randomBytes(32).toString('hex'),MAX_BOT_TOKEN:randomBytes(32).toString('hex'),
    MAX_WEBHOOK_SECRET:randomBytes(32).toString('hex'),BUILD_SHA:'0'.repeat(40)};
  delete ephemeral.TEST_AUTH_DEMO_PROFILE;delete ephemeral.TEST_MAX_INIT_DATA_SIGNING_KEY;
  const parsed = loadConfig(ephemeral);
  assert.equal(parsed.MAX_ADAPTER_MODE,'live');
  process.stdout.write('ENV_TYPED_VALIDATION PASS (ephemeral values in memory only)\n');
} catch (error) {
  if (error.code==='ERR_MODULE_NOT_FOUND') process.stdout.write('ENV_TYPED_VALIDATION DEFERRED (compile API first)\n');
  else throw error;
}
process.stdout.write(`ENV_PARITY PASS canonical=${canonical.length} delivery=${deliveryKeys.length}\n`);

assert.deepEqual(Object.keys(compose.services).sort(),['app','migrate','postgres']);
assert.ok(!compose.services.postgres.ports,'PostgreSQL must not publish ports');
assert.ok(!compose.services.migrate.ports,'Migration service must not publish ports');
assert.equal(compose.services.app.ports?.length,1,'App publishes exactly one loopback port');
assert.match(compose.services.app.ports[0],/^127\.0\.0\.1:/,'App port must bind loopback only');
assert.equal(compose.services.postgres.volumes[0],'postgres-data:/var/lib/postgresql/data');
assert.ok('postgres-data' in compose.volumes);
assert.equal(compose.services.migrate.depends_on.postgres.condition,'service_healthy');
assert.equal(compose.services.app.depends_on.migrate.condition,'service_completed_successfully');
assert.equal(compose.services.app.depends_on.postgres.condition,'service_healthy');
assert.equal(compose.services.migrate.restart,'no');
assert.ok(compose.services.postgres.healthcheck && compose.services.app.expose);
const mount = vps.services.app.volumes[0];
assert.equal(mount.source,'/etc/max-smart-city/russian-trusted-root-ca.pem');
assert.equal(mount.target,'/etc/ssl/custom/max-root-ca.pem');
assert.equal(mount.read_only,true);assert.equal(mount.bind.create_host_path,false);
assert.equal(vps.services.app.environment.NODE_EXTRA_CA_CERTS,mount.target);
const dockerfile = await text('Dockerfile');
assert.match(dockerfile,/node:24\.21\.0-bookworm-slim@sha256:[0-9a-f]{64}/);
assert.match(dockerfile,/npm@11\.19\.0/);
assert.match(dockerfile,/npm ci/);
assert.match(dockerfile,/USER node/);
assert.match(dockerfile,/HEALTHCHECK/);
assert.ok(!dockerfile.includes('COPY . .'),'Unrestricted Docker context COPY');
const manifest = JSON.parse(await text('package.json'));
const lock = JSON.parse(await text('package-lock.json'));
assert.equal(manifest.engines.node,'24.21.0');assert.equal(manifest.packageManager,'npm@11.19.0');
assert.equal(lock.packages[''].name,manifest.name);
const ignore = await text('.dockerignore');
for (const pattern of ['.git','.env','.env.*','**/node_modules','**/*.pem','**/*.key']) assert.ok(ignore.split(/\r?\n/).includes(pattern),`dockerignore missing ${pattern}`);
process.stdout.write('DOCKERFILE/COMPOSE/DOCKERIGNORE/LOCKFILE STRUCTURE PASS (not a Docker build)\n');

const files = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const findings = [];
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b/,/\bAKIA[A-Z0-9]{16}\b/,/\bxox[baprs]-[0-9A-Za-z-]{20,}\b/];
for (const file of files) {
  if (/\.(pdf|png|jpg|jpeg|woff2?)$/i.test(file)) continue;
  const content = await text(file);
  // Scanner patterns are code, not secrets.
  if (file !== 'scripts/delivery/validate.mjs' && patterns.some(pattern=>pattern.test(content))) findings.push(file);
}
assert.deepEqual(findings,[],`SECRET_PATTERN_SCAN findings in files: ${findings.join(',')}`);
process.stdout.write(`SECRET_PATTERN_SCAN PASS files=${files.length}; example secrets empty. Это pattern scan, не proof working-secret absence.\n`);
await import('./check-registry.mjs');
