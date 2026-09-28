import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RoleOutput, SessionReadResponseOutput } from '@max-smart-city/contracts';
import { usePlatform } from '../../platform/platform-context.js';
import {
  authenticateMax, readSession, SessionHttpError, startDemoRun, switchActor,
} from './session-api.js';

type SessionState =
  | { status: 'pending'; session: null; token: null; expiresAt: null }
  | { status: 'ready'; session: SessionReadResponseOutput; token: string; expiresAt: string; generation: number }
  | { status: 'error'; session: null; token: null; expiresAt: null };

interface SessionValue {
  readonly status: SessionState['status'];
  readonly session: SessionReadResponseOutput | null;
  readonly busy: boolean;
  readonly actionError: string | null;
  readonly revision: number;
  readonly retry: () => Promise<void>;
  readonly refreshSession: () => Promise<void>;
  readonly startRun: () => Promise<void>;
  readonly switchRole: (role: RoleOutput) => Promise<void>;
  readonly authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const SessionContext = createContext<SessionValue | null>(null);
const pending: SessionState = { status: 'pending', session: null, token: null, expiresAt: null };
const error: SessionState = { status: 'error', session: null, token: null, expiresAt: null };

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>(pending);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const current = useRef<SessionState>(pending);
  const generation = useRef(0);
  const transitionEpoch = useRef(0);
  const operation = useRef(false);

  const changeState = useCallback((next: SessionState) => {
    current.current = next;
    setState(next);
  }, []);

  const failSession = useCallback(() => {
    ++transitionEpoch.current;
    ++generation.current;
    queryClient.clear();
    changeState(error);
    setBusy(false);
  }, [changeState, queryClient]);

  const isCurrent = useCallback((snapshot: Extract<SessionState, { status: 'ready' }>) => {
    const active = current.current;
    return active.status === 'ready' && active.token === snapshot.token &&
      active.generation === snapshot.generation;
  }, []);

  const failIfCurrent = useCallback((snapshot: Extract<SessionState, { status: 'ready' }>) => {
    if (isCurrent(snapshot)) failSession();
  }, [failSession, isCurrent]);

  const install = useCallback((session: SessionReadResponseOutput, token: string, expiresAt: string) => {
    changeState({ status: 'ready', session, token, expiresAt, generation: ++generation.current });
  }, [changeState]);

  const retry = useCallback(async () => {
    const attempt = ++transitionEpoch.current;
    ++generation.current;
    operation.current = false;
    queryClient.clear();
    changeState(pending);
    setActionError(null);
    // PlatformAdapter is the only source of raw signed initData.
    try {
      const raw = platform.isMiniAppContext ? platform.getRawInitData() : null;
      if (!raw?.trim()) throw new Error('MAX context unavailable');
      const issued = await authenticateMax(raw);
      if (attempt !== transitionEpoch.current) return;
      if (Date.parse(issued.expires_at) <= Date.now()) throw new Error('Expired session');
      install(issued.session, issued.session_token, issued.expires_at);
    } catch {
      if (attempt === transitionEpoch.current) changeState(error);
    }
  }, [changeState, install, platform, queryClient]);

  useEffect(() => {
    void retry();
    return () => { ++transitionEpoch.current; ++generation.current; };
  }, [retry]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const snapshot = state;
    const remaining = Date.parse(snapshot.expiresAt) - Date.now();
    if (remaining <= 0) {
      failIfCurrent(snapshot);
      return;
    }
    const timer = window.setTimeout(() => failIfCurrent(snapshot), Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [state, failIfCurrent]);

  const credential = useCallback(() => {
    const snapshot = current.current;
    if (snapshot.status !== 'ready') throw new Error('Session unavailable');
    if (Date.parse(snapshot.expiresAt) <= Date.now()) {
      failIfCurrent(snapshot);
      throw new Error('Session expired');
    }
    return snapshot;
  }, [failIfCurrent]);

  const refreshSession = useCallback(async () => {
    let snapshot: Extract<SessionState, { status: 'ready' }>;
    try { snapshot = credential(); } catch { return; }
    const epoch = transitionEpoch.current;
    try {
      const session = await readSession(snapshot.token);
      if (epoch !== transitionEpoch.current || !isCurrent(snapshot)) return;
      if (JSON.stringify(session) !== JSON.stringify(snapshot.session)) {
        queryClient.clear();
        setRevision((value) => value + 1);
      }
      install(session, snapshot.token, snapshot.expiresAt);
    } catch {
      if (epoch === transitionEpoch.current) failIfCurrent(snapshot);
    }
  }, [credential, failIfCurrent, install, isCurrent, queryClient]);

  useEffect(() => {
    return platform.subscribeForeground(() => {
      if (current.current.status === 'ready' && !operation.current) void refreshSession();
    });
  }, [platform, refreshSession]);

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const snapshot = credential();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${snapshot.token}`);
    const response = await fetch(path, { ...init, headers, credentials: 'omit' });
    if (response.status === 401) failIfCurrent(snapshot);
    return response;
  }, [credential, failIfCurrent]);

  const startRun = useCallback(async () => {
    if (operation.current) return;
    let snapshot: Extract<SessionState, { status: 'ready' }>;
    try { snapshot = credential(); } catch { return; }
    if (!snapshot.session.demo_mode || !snapshot.session.real_max_identity.outbound_max_ready) return;
    operation.current = true;
    const epoch = ++transitionEpoch.current;
    setBusy(true);
    setActionError(null);
    let runCreated = false;
    try {
      const result = await startDemoRun(snapshot.token);
      runCreated = true;
      if (Date.parse(result.expires_at) <= Date.now() ||
        result.session.demo_run_id !== result.demo_run_id ||
        result.session.real_max_identity.max_identity_id !== snapshot.session.real_max_identity.max_identity_id ||
        result.session.effective_actor.app_user_id !== null || result.session.effective_actor.role !== null ||
        result.session.primary_case_id !== null) throw new Error('Invalid Start session');
      if (epoch !== transitionEpoch.current || !isCurrent(snapshot)) return;
      await queryClient.invalidateQueries({ refetchType: 'none' });
      if (epoch !== transitionEpoch.current || !isCurrent(snapshot)) return;
      queryClient.clear();
      install(result.session, result.session_token, result.expires_at);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (epoch !== transitionEpoch.current || !isCurrent(snapshot)) return;
      if (runCreated || !(cause instanceof SessionHttpError) || cause.status === 401) failIfCurrent(snapshot);
      else {
        setActionError('Не удалось запустить демо. Повторите действие.');
        void refreshSession();
      }
    } finally {
      if (epoch === transitionEpoch.current) { operation.current = false; setBusy(false); }
    }
  }, [credential, failIfCurrent, install, isCurrent, queryClient, refreshSession]);

  const switchRole = useCallback(async (role: RoleOutput) => {
    if (operation.current) return;
    let snapshot: Extract<SessionState, { status: 'ready' }>;
    try { snapshot = credential(); } catch { return; }
    if (!snapshot.session.demo_mode || !snapshot.session.demo_run_id) return;
    operation.current = true;
    const epoch = ++transitionEpoch.current;
    setBusy(true);
    setActionError(null);
    let switchedOnServer = false;
    try {
      const issued = await switchActor(snapshot.token, role);
      switchedOnServer = true;
      if (Date.parse(issued.expires_at) <= Date.now()) throw new Error('Expired session');
      const fresh = await readSession(issued.session_token);
      if (epoch !== transitionEpoch.current || !isCurrent(snapshot)) return;
      await queryClient.invalidateQueries({ refetchType: 'none' });
      if (epoch !== transitionEpoch.current || !isCurrent(snapshot)) return;
      queryClient.clear();
      install(fresh, issued.session_token, issued.expires_at);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (epoch !== transitionEpoch.current || !isCurrent(snapshot)) return;
      if (switchedOnServer || !(cause instanceof SessionHttpError) || cause.status === 401) failIfCurrent(snapshot);
      else {
        setActionError('Не удалось переключить роль. Обновите контекст и повторите действие.');
        void refreshSession();
      }
    } finally {
      if (epoch === transitionEpoch.current) { operation.current = false; setBusy(false); }
    }
  }, [credential, failIfCurrent, install, isCurrent, queryClient, refreshSession]);

  return <SessionContext.Provider value={{
    status: state.status, session: state.session, busy, actionError, revision,
    retry, refreshSession, startRun, switchRole, authorizedFetch,
  }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider missing');
  return context;
}
