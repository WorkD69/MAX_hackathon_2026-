// Наблюдать actual factory через Fastify diagnostics; не создавать replacement app.
import { channel } from 'node:diagnostics_channel';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pino from 'pino';
import { buildApp } from '../../apps/api/dist/app/app.js';
import { loadConfig } from '../../apps/api/dist/config/load-config.js';
import { createRuntimeLogger } from '../../apps/api/dist/logging/logger.js';
const routes = [];
const observe = ({ fastify }) => fastify.addHook('onRoute', route => {
  routes.push({ method: route.method, url: route.url });
});
const initialization = channel('fastify.initialization');
initialization.subscribe(observe);
const config = loadConfig({ APP_ENV:'production',DEMO_MODE:'true',DATABASE_URL:'postgresql://city@127.0.0.1:5432/city',
  APP_SESSION_SECRET:randomBytes(32).toString('hex'),MAX_ADAPTER_MODE:'live',MAX_BOT_TOKEN:randomBytes(32).toString('hex'),
  MAX_WEBHOOK_SECRET:randomBytes(32).toString('hex'),PUBLIC_APP_URL:'https://157-22-231-21.sslip.io/',
  PUBLIC_API_BASE_URL:'https://157-22-231-21.sslip.io/api/v1',BUILD_SHA:'5045dd220b85bbd89038821aac110ec46c44a9d3' });
const { events } = createRuntimeLogger(config);
const app = await buildApp({config,logger:pino({enabled:false}),events,
  staticAssets:{root:'/app/apps/web/dist',prefix:'/',index:'index.html'}});
try {
  await writeFile(process.argv[2] || 'actual-registry.json',JSON.stringify(routes,null,2)+'\n');
  console.log(`ACTUAL_REGISTRY_EXPORTED routes=${routes.length}; no listen or MAX calls`);
} finally {
  initialization.unsubscribe(observe);
  await app.close();
}
