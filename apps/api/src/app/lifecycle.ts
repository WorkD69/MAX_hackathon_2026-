import type pino from 'pino';
import type { RuntimeConfig } from '../config/types.js';
import type { RuntimeEventLogger } from '../logging/logger.js';
import { serializeRuntimeError } from '../logging/logger.js';
import type { ReadinessProbe } from '../modules/health/readiness.js';
import type { StaticAssets } from './static.js';
import type { RuntimeFastifyInstance } from './static.js';

export interface ProcessBoundaryAdapter {
  writeStderr(line: string): void;
  addSignalListener(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void;
  removeSignalListener(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void;
  setTimer(handler: () => void, milliseconds: 10000): unknown;
  clearTimer(handle: unknown): void;
  hardExit(code: 1): never | void;
}

export interface RuntimePhases {
  loadConfig(): RuntimeConfig;
  createLogger(config: RuntimeConfig): Readonly<{ loggerInstance: pino.Logger; events: RuntimeEventLogger }>;
  buildApp(options: { config: RuntimeConfig; logger: pino.Logger; events: RuntimeEventLogger; readiness: ReadinessProbe; staticAssets?: StaticAssets }): Promise<RuntimeFastifyInstance> | RuntimeFastifyInstance;
  listen(app: RuntimeFastifyInstance, config: RuntimeConfig): Promise<unknown>;
}

type ShutdownTrigger = 'SIGINT' | 'SIGTERM' | 'manual' | 'startup_failure';
type CloseResult = { kind: 'closed' } | { kind: 'failed'; error: unknown } | { kind: 'timeout' };

export class TerminationController {
  private terminated = false;
  constructor(private readonly adapter: ProcessBoundaryAdapter) {}
  terminateOnce(code: 1): void {
    if (this.terminated) return;
    this.terminated = true;
    this.adapter.hardExit(code);
  }
}

export class RuntimeLifecycle {
  private started = false;
  private app?: RuntimeFastifyInstance;
  private events?: RuntimeEventLogger;
  private shutdownPromise?: Promise<void>;
  private readonly termination: TerminationController;
  private readonly signalHandlers: Record<'SIGINT' | 'SIGTERM', () => void>;
  private signalsInstalled = false;

  constructor(
    private readonly phases: RuntimePhases,
    private readonly adapter: ProcessBoundaryAdapter,
    private readonly readiness: ReadinessProbe,
    private readonly staticAssets?: StaticAssets,
  ) {
    this.termination = new TerminationController(adapter);
    this.signalHandlers = {
      SIGINT: () => { void this.stop('SIGINT').catch(() => {}); },
      SIGTERM: () => { void this.stop('SIGTERM').catch(() => {}); },
    };
  }

  async start(): Promise<RuntimeFastifyInstance> {
    if (this.started) throw new Error('RUNTIME_ALREADY_STARTED');
    this.started = true;

    let config: RuntimeConfig;
    try { config = this.phases.loadConfig(); }
    catch {
      try { this.adapter.writeStderr('{"level":"fatal","event":"runtime_startup_failed","phase":"config","error_code":"CONFIG_INVALID"}\n'); }
      catch { /* termination is mandatory */ }
      finally { this.termination.terminateOnce(1); }
      throw new Error('CONFIG_STARTUP_FAILED');
    }

    let loggerPair: Readonly<{ loggerInstance: pino.Logger; events: RuntimeEventLogger }>;
    try { loggerPair = this.phases.createLogger(config); }
    catch {
      try { this.adapter.writeStderr('{"level":"fatal","event":"runtime_startup_failed","phase":"logger","error_code":"LOGGER_CONSTRUCTION_FAILED"}\n'); }
      catch { /* termination is mandatory */ }
      finally { this.termination.terminateOnce(1); }
      throw new Error('LOGGER_STARTUP_FAILED');
    }
    this.events = loggerPair.events;
    if (config.APP_ENV === 'production' && config.DEMO_MODE) this.safeEvent(() => loggerPair.events.productionDemoModeEnabled());

    try {
      this.app = await this.phases.buildApp({
        config, logger: loggerPair.loggerInstance, events: loggerPair.events,
        readiness: this.readiness, ...(this.staticAssets ? { staticAssets: this.staticAssets } : {}),
      });
    } catch (error) {
      try { this.safeEvent(() => loggerPair.events.runtimeStartupFailed({ phase: 'factory', ...serializeRuntimeError(error, 'FACTORY_BUILD_FAILED') })); }
      finally { this.termination.terminateOnce(1); }
      throw new Error('FACTORY_STARTUP_FAILED');
    }

    try {
      await this.phases.listen(this.app, config);
    } catch (error) {
      this.safeEvent(() => loggerPair.events.runtimeStartupFailed({ phase: 'listen', ...serializeRuntimeError(error, 'LISTEN_FAILED') }));
      const outcome = await this.closeBounded('startup_failure');
      if (outcome === 'closed') {
        this.termination.terminateOnce(1);
        throw new Error('LISTEN_STARTUP_FAILED');
      }
      throw new Error(outcome === 'failed' ? 'SHUTDOWN_CLOSE_FAILED' : 'SHUTDOWN_TIMEOUT');
    }
    this.safeEvent(() => loggerPair.events.runtimeListening({ host: config.HOST, port: config.PORT }));
    this.adapter.addSignalListener('SIGINT', this.signalHandlers.SIGINT);
    this.adapter.addSignalListener('SIGTERM', this.signalHandlers.SIGTERM);
    this.signalsInstalled = true;
    return this.app;
  }

  stop(trigger: Exclude<ShutdownTrigger, 'startup_failure'> = 'manual'): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    if (!this.app || !this.signalsInstalled) return Promise.reject(new Error('RUNTIME_NOT_RUNNING'));
    this.shutdownPromise = this.closeBounded(trigger).then(outcome => {
      if (outcome === 'failed') throw new Error('SHUTDOWN_CLOSE_FAILED');
      if (outcome === 'timeout') throw new Error('SHUTDOWN_TIMEOUT');
    });
    return this.shutdownPromise;
  }

  private safeEvent(action: () => void): void {
    try { action(); } catch { /* reporting cannot prevent cleanup or termination */ }
  }

  private removeSignals(): void {
    if (!this.signalsInstalled) return;
    try { this.adapter.removeSignalListener('SIGINT', this.signalHandlers.SIGINT); } catch { /* finish cleanup */ }
    try { this.adapter.removeSignalListener('SIGTERM', this.signalHandlers.SIGTERM); } catch { /* finish cleanup */ }
    this.signalsInstalled = false;
  }

  private async closeBounded(trigger: ShutdownTrigger): Promise<'closed' | 'failed' | 'timeout'> {
    const app = this.app;
    if (!app) throw new Error('RUNTIME_APP_NOT_CREATED');
    const events = this.events;
    if (events) this.safeEvent(() => events.gracefulShutdownStarted({ trigger }));
    let handle: unknown;
    const timeout = new Promise<CloseResult>(resolve => {
      handle = this.adapter.setTimer(() => resolve({ kind: 'timeout' }), 10000);
    });
    const closing: Promise<CloseResult> = Promise.resolve().then(() => app.close()).then(
      () => ({ kind: 'closed' }), error => ({ kind: 'failed', error }),
    );
    const outcome = await Promise.race([closing, timeout]);
    try { this.adapter.clearTimer(handle); } catch { /* termination is still mandatory */ }
    this.removeSignals();
    if (outcome.kind === 'closed') {
      if (events) this.safeEvent(() => events.gracefulShutdownCompleted({ trigger }));
    } else if (outcome.kind === 'failed') {
      if (events) this.safeEvent(() => events.gracefulShutdownFailed({ trigger, ...serializeRuntimeError(outcome.error, 'SHUTDOWN_CLOSE_FAILED') }));
      this.termination.terminateOnce(1);
    } else {
      if (events) this.safeEvent(() => events.gracefulShutdownTimedOut({ trigger, timeoutMs: 10000 }));
      this.termination.terminateOnce(1);
    }
    return outcome.kind;
  }
}
