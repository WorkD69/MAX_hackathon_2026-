// Experimental entrypoint: wires the existing static-assets hook for packaging proof.
import { fileURLToPath } from 'node:url';
import { buildApp } from '../apps/api/dist/app/app.js';
import { RuntimeLifecycle } from '../apps/api/dist/app/lifecycle.js';
import { loadConfig } from '../apps/api/dist/config/load-config.js';
import { createRuntimeLogger } from '../apps/api/dist/logging/logger.js';
import { defaultReadinessProbe } from '../apps/api/dist/modules/health/readiness.js';

const adapter = {
  writeStderr: line => { process.stderr.write(line); },
  addSignalListener: (signal, handler) => { process.on(signal, handler); },
  removeSignalListener: (signal, handler) => { process.off(signal, handler); },
  setTimer: (handler, milliseconds) => setTimeout(handler, milliseconds),
  clearTimer: handle => clearTimeout(handle),
  hardExit: code => { process.exit(code); },
};

const lifecycle = new RuntimeLifecycle({
  loadConfig,
  createLogger: config => createRuntimeLogger(config),
  buildApp,
  listen: (app, config) => app.listen({ host: config.HOST, port: config.PORT }),
}, adapter, defaultReadinessProbe, {
  root: fileURLToPath(new URL('../apps/web/dist/', import.meta.url)),
  prefix: '/',
  index: 'index.html',
});

void lifecycle.start();
