import { buildApp } from './app.js';
import { RuntimeLifecycle } from './lifecycle.js';
import type { ProcessBoundaryAdapter } from './lifecycle.js';
import { loadConfig } from '../config/load-config.js';
import { createRuntimeLogger } from '../logging/logger.js';
import { defaultReadinessProbe } from '../modules/health/readiness.js';

const adapter: ProcessBoundaryAdapter = {
  writeStderr: line => { process.stderr.write(line); },
  addSignalListener: (signal, handler) => { process.on(signal, handler); },
  removeSignalListener: (signal, handler) => { process.off(signal, handler); },
  setTimer: (handler, milliseconds) => setTimeout(handler, milliseconds),
  clearTimer: handle => clearTimeout(handle as NodeJS.Timeout),
  hardExit: code => { process.exit(code); },
};

const lifecycle = new RuntimeLifecycle({
  loadConfig,
  createLogger: config => createRuntimeLogger(config),
  buildApp,
  listen: (app, config) => app.listen({ host: config.HOST, port: config.PORT }),
}, adapter, defaultReadinessProbe);

void lifecycle.start();
