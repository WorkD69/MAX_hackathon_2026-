// Запускать только внутри production container. Выводить лишь безопасные результаты.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = new URL(process.env.PUBLIC_APP_URL).origin;
const headers = {Authorization:process.env.MAX_BOT_TOKEN};
const me = await fetch('https://platform-api2.max.ru/me',{headers,signal:AbortSignal.timeout(15000)});
assert.equal(me.status,200,'GET_ME_HTTP');
const identity = await me.json();
assert.equal(identity.is_bot,true,'GET_ME_BOT');
console.log(JSON.stringify({check:'GET_ME',http:me.status,bot_id:String(identity.user_id),username:identity.username,
  max_container_tls:'PASS',ca:process.env.NODE_EXTRA_CA_CERTS}));
if (process.argv.includes('--identity-only')) process.exit(0);
const subscriptions = await fetch('https://platform-api2.max.ru/subscriptions',{headers,signal:AbortSignal.timeout(15000)});
assert.equal(subscriptions.status,200,'SUBSCRIPTIONS_HTTP');
const payload = await subscriptions.json();
const expected = `${origin}/integrations/max/webhook`;
const found = payload.subscriptions?.find(subscription=>subscription.url === expected);
console.log(JSON.stringify({check:'WEBHOOK_SUBSCRIPTION',exists:!!found,url:expected,update_types:found?.update_types}));
assert.ok(found,'SUBSCRIPTION_MISSING');
const endpoint = `${origin}/integrations/max/webhook`;
for (const [name,secret,status] of [['missing',undefined,401],['invalid','invalid-smoke-secret',401],
  ['valid',process.env.MAX_WEBHOOK_SECRET,200]]) {
  const start = performance.now();
  const requestHeaders = {'Content-Type':'application/json','X-Request-Id':randomUUID()};
  if (secret !== undefined) requestHeaders['X-Max-Bot-Api-Secret'] = secret;
  // Ignored update avoids a synthetic bot greeting or notification.
  const response = await fetch(endpoint,{method:'POST',headers:requestHeaders,
    body:JSON.stringify({update_type:'deployment_smoke_ignored',timestamp:Date.now()}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,status,`WEBHOOK_${name}`);
  if (status===401) assert.equal((await response.json()).error.code,'UNAUTHENTICATED');
  console.log(JSON.stringify({check:'WEBHOOK_SECRET',case:name,status:response.status,elapsed_ms:Math.round(performance.now()-start),
    source:'CONTROLLED_HTTP_NOT_REAL_MAX'}));
}
