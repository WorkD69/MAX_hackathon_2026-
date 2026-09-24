import type pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/load-config.js';
import type { RuntimeEventLogger } from '../logging/logger.js';
import type { RuntimeFastifyInstance } from './static.js';
import { RuntimeLifecycle } from './lifecycle.js';
import type { ProcessBoundaryAdapter, RuntimePhases } from './lifecycle.js';

const config = () => loadConfig({
  APP_ENV: 'test', DEMO_MODE: 'false', DATABASE_URL: 'postgresql://db/city',
  APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'fake',
  PUBLIC_APP_URL: 'http://frontend/', PUBLIC_API_BASE_URL: 'http://api/api/v1',
  BUILD_SHA: 'a'.repeat(40),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness() {
  const events = {
    productionDemoModeEnabled: vi.fn(), runtimeListening: vi.fn(), readinessProbeFailed: vi.fn(),
    runtimeStartupFailed: vi.fn(), gracefulShutdownStarted: vi.fn(), gracefulShutdownCompleted: vi.fn(),
    gracefulShutdownFailed: vi.fn(), gracefulShutdownTimedOut: vi.fn(),
  } satisfies RuntimeEventLogger;
  const stderr: string[] = [];
  const exits: number[] = [];
  const listeners = new Map<'SIGINT' | 'SIGTERM', () => void>();
  const add = vi.fn((signal: 'SIGINT' | 'SIGTERM', handler: () => void) => { listeners.set(signal, handler); });
  const remove = vi.fn((signal: 'SIGINT' | 'SIGTERM', handler: () => void) => {
    if (listeners.get(signal) === handler) listeners.delete(signal);
  });
  const timers: Array<{ handler: () => void; milliseconds: number; cleared: boolean }> = [];
  const adapter: ProcessBoundaryAdapter = {
    writeStderr: line => { stderr.push(line); },
    addSignalListener: add,
    removeSignalListener: remove,
    setTimer: (handler, milliseconds) => {
      const timer = { handler, milliseconds, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: handle => { (handle as typeof timers[number]).cleared = true; },
    hardExit: code => { exits.push(code); },
  };
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const app = { close } as unknown as RuntimeFastifyInstance;
  const phases: RuntimePhases = {
    loadConfig: vi.fn(() => config()),
    createLogger: vi.fn(() => ({ loggerInstance: {} as pino.Logger, events })),
    buildApp: vi.fn(() => app),
    listen: vi.fn(async () => undefined),
  };
  const runtime = new RuntimeLifecycle(phases, adapter, { snapshot: () => ({ databaseReachable: false, migrationsCurrent: false, applicationInitialized: false }) });
  return { runtime, phases, adapter, events, close, app, stderr, exits, listeners, add, remove, timers };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('startup phases', () => {
  it('config failure reports exact stderr, terminates once, and touches no app/timer/signal', async () => {
    const h = harness();
    h.phases.loadConfig = () => { throw new Error('CONFIG_SECRET'); };
    await expect(h.runtime.start()).rejects.toThrow('CONFIG_STARTUP_FAILED');
    expect(h.stderr).toEqual(['{"level":"fatal","event":"runtime_startup_failed","phase":"config","error_code":"CONFIG_INVALID"}\n']);
    expect(h.exits).toEqual([1]);
    expect(h.phases.createLogger).not.toHaveBeenCalled();
    expect(h.phases.buildApp).not.toHaveBeenCalled();
    expect(h.close).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
    expect(h.add).not.toHaveBeenCalled();
    expect(JSON.stringify(h.stderr)).not.toContain('CONFIG_SECRET');
  });

  it('config failure still terminates when stderr throws', async () => {
    const h = harness();
    h.phases.loadConfig = () => { throw 'CONFIG_SECRET'; };
    h.adapter.writeStderr = () => { throw new Error('STDERR_SECRET'); };
    await expect(h.runtime.start()).rejects.toThrow('CONFIG_STARTUP_FAILED');
    expect(h.exits).toEqual([1]);
    expect(h.close).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
  });

  it('logger failure reports exact stderr and never creates an app', async () => {
    const h = harness();
    h.phases.createLogger = () => { throw new Error('LOGGER_SECRET'); };
    await expect(h.runtime.start()).rejects.toThrow('LOGGER_STARTUP_FAILED');
    expect(h.stderr).toEqual(['{"level":"fatal","event":"runtime_startup_failed","phase":"logger","error_code":"LOGGER_CONSTRUCTION_FAILED"}\n']);
    expect(h.exits).toEqual([1]);
    expect(h.phases.buildApp).not.toHaveBeenCalled();
    expect(h.close).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
    expect(h.add).not.toHaveBeenCalled();
  });

  it('factory failure emits safe event, terminates, and never closes a nonexistent app', async () => {
    const h = harness();
    h.phases.buildApp = () => { throw new Error('FACTORY_SECRET'); };
    await expect(h.runtime.start()).rejects.toThrow('FACTORY_STARTUP_FAILED');
    expect(h.events.runtimeStartupFailed).toHaveBeenCalledExactlyOnceWith({ phase: 'factory', errorType: 'runtime_error', errorCode: 'FACTORY_BUILD_FAILED' });
    expect(h.stderr).toEqual([]);
    expect(h.exits).toEqual([1]);
    expect(h.close).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
    expect(h.add).not.toHaveBeenCalled();
  });

  it('factory reporting failure cannot skip termination', async () => {
    const h = harness();
    h.phases.buildApp = () => { throw 'FACTORY_SECRET'; };
    h.events.runtimeStartupFailed.mockImplementation(() => { throw new Error('LOG_SECRET'); });
    await expect(h.runtime.start()).rejects.toThrow('FACTORY_STARTUP_FAILED');
    expect(h.exits).toEqual([1]);
    expect(h.close).not.toHaveBeenCalled();
  });

  it('listen failure uses bounded close success with distinct stable code', async () => {
    const h = harness();
    h.phases.listen = async () => { throw new Error('LISTEN_SECRET'); };
    await expect(h.runtime.start()).rejects.toThrow('LISTEN_STARTUP_FAILED');
    expect(h.events.runtimeStartupFailed).toHaveBeenCalledExactlyOnceWith({ phase: 'listen', errorType: 'runtime_error', errorCode: 'LISTEN_FAILED' });
    expect(h.events.gracefulShutdownStarted).toHaveBeenCalledWith({ trigger: 'startup_failure' });
    expect(h.events.gracefulShutdownCompleted).toHaveBeenCalledWith({ trigger: 'startup_failure' });
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.timers.map(timer => timer.milliseconds)).toEqual([10000]);
    expect(h.timers[0]?.cleared).toBe(true);
    expect(h.exits).toEqual([1]);
    expect(h.add).not.toHaveBeenCalled();
  });

  it('listen close rejection reports stable code and terminates once', async () => {
    const h = harness();
    h.phases.listen = async () => { throw 'LISTEN_SECRET'; };
    h.close.mockRejectedValue(new Error('CLOSE_SECRET'));
    await expect(h.runtime.start()).rejects.toThrow('SHUTDOWN_CLOSE_FAILED');
    expect(h.events.runtimeStartupFailed).toHaveBeenCalledWith({ phase: 'listen', errorType: 'non_error', errorCode: 'LISTEN_FAILED' });
    expect(h.events.gracefulShutdownFailed).toHaveBeenCalledWith({ trigger: 'startup_failure', errorType: 'runtime_error', errorCode: 'SHUTDOWN_CLOSE_FAILED' });
    expect(h.timers[0]?.cleared).toBe(true);
    expect(h.exits).toEqual([1]);
    expect(h.add).not.toHaveBeenCalled();
  });

  it('listen timeout terminates once and ignores late close', async () => {
    const h = harness();
    const pending = deferred<void>();
    h.phases.listen = async () => { throw new Error('LISTEN_SECRET'); };
    h.close.mockReturnValue(pending.promise);
    const start = h.runtime.start();
    await flush();
    expect(h.timers).toHaveLength(1);
    h.timers[0]!.handler();
    await expect(start).rejects.toThrow('SHUTDOWN_TIMEOUT');
    expect(h.events.gracefulShutdownTimedOut).toHaveBeenCalledWith({ trigger: 'startup_failure', timeoutMs: 10000 });
    expect(h.timers[0]?.cleared).toBe(true);
    expect(h.exits).toEqual([1]);
    pending.resolve();
    await flush();
    expect(h.exits).toEqual([1]);
    expect(h.events.gracefulShutdownCompleted).not.toHaveBeenCalled();
  });
});

describe('running shutdown', () => {
  it('emits one safe critical event for valid production demo mode', async () => {
    const h = harness();
    h.phases.loadConfig = () => loadConfig({
      APP_ENV: 'production', DEMO_MODE: 'true', DATABASE_URL: 'postgresql://db/city',
      APP_SESSION_SECRET: 's'.repeat(32), MAX_ADAPTER_MODE: 'live',
      MAX_BOT_TOKEN: 'b'.repeat(8), MAX_WEBHOOK_SECRET: 'w'.repeat(32),
      PUBLIC_APP_URL: 'https://city.example/', PUBLIC_API_BASE_URL: 'https://api.city.example/api/v1',
      BUILD_SHA: 'a'.repeat(40),
    });
    await h.runtime.start();
    expect(h.events.productionDemoModeEnabled).toHaveBeenCalledTimes(1);
    expect(h.events.productionDemoModeEnabled).toHaveBeenCalledWith();
    await h.runtime.stop();
  });

  it('registers one handler per signal, listens once, shares stop promise and closes normally', async () => {
    const h = harness();
    await h.runtime.start();
    expect(h.phases.listen).toHaveBeenCalledTimes(1);
    expect(h.add).toHaveBeenCalledTimes(2);
    expect([...h.listeners.keys()].sort()).toEqual(['SIGINT', 'SIGTERM']);
    await expect(h.runtime.start()).rejects.toThrow('RUNTIME_ALREADY_STARTED');
    const first = h.runtime.stop();
    expect(h.runtime.stop()).toBe(first);
    await first;
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.timers.map(timer => timer.milliseconds)).toEqual([10000]);
    expect(h.timers[0]?.cleared).toBe(true);
    expect(h.remove).toHaveBeenCalledTimes(2);
    expect(h.listeners.size).toBe(0);
    expect(h.exits).toEqual([]);
    expect(h.events.gracefulShutdownCompleted).toHaveBeenCalledWith({ trigger: 'manual' });
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('handles %s with shared shutdown', async signal => {
    const h = harness();
    await h.runtime.start();
    h.listeners.get(signal)!();
    await h.runtime.stop();
    expect(h.events.gracefulShutdownStarted).toHaveBeenCalledWith({ trigger: signal });
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.listeners.size).toBe(0);
    expect(h.exits).toEqual([]);
  });

  it('close rejection cleans up, reports and terminates exactly once', async () => {
    const h = harness();
    h.close.mockRejectedValue('CLOSE_SECRET');
    await h.runtime.start();
    await expect(h.runtime.stop()).rejects.toThrow('SHUTDOWN_CLOSE_FAILED');
    expect(h.events.gracefulShutdownFailed).toHaveBeenCalledWith({ trigger: 'manual', errorType: 'non_error', errorCode: 'SHUTDOWN_CLOSE_FAILED' });
    expect(h.timers[0]?.cleared).toBe(true);
    expect(h.listeners.size).toBe(0);
    expect(h.exits).toEqual([1]);
    await expect(h.runtime.stop()).rejects.toThrow('SHUTDOWN_CLOSE_FAILED');
    expect(h.exits).toEqual([1]);
  });

  it('timeout cleans up and ignores late close settlement', async () => {
    const h = harness();
    const pending = deferred<void>();
    h.close.mockReturnValue(pending.promise);
    await h.runtime.start();
    const stop = h.runtime.stop();
    await flush();
    expect(h.timers).toHaveLength(1);
    h.timers[0]!.handler();
    await expect(stop).rejects.toThrow('SHUTDOWN_TIMEOUT');
    expect(h.timers[0]?.cleared).toBe(true);
    expect(h.listeners.size).toBe(0);
    expect(h.exits).toEqual([1]);
    pending.reject(new Error('LATE_SECRET'));
    await flush();
    expect(h.exits).toEqual([1]);
    expect(h.events.gracefulShutdownFailed).not.toHaveBeenCalled();
  });

  it('reporting failure still clears timer and listeners', async () => {
    const h = harness();
    h.events.gracefulShutdownCompleted.mockImplementation(() => { throw new Error('LOG_SECRET'); });
    await h.runtime.start();
    await expect(h.runtime.stop()).resolves.toBeUndefined();
    expect(h.timers[0]?.cleared).toBe(true);
    expect(h.listeners.size).toBe(0);
    expect(h.exits).toEqual([]);
  });
});
