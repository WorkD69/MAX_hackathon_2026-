import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RoleOutput, SessionReadResponseOutput } from '@max-smart-city/contracts';
import { usePlatform } from '../../platform/platform-context.js';
import {
  authenticateMax, readSession, SessionHttpError, startDemoRun, switchActor,
} from './session-api.js';

type SessionState =
  | { status: 'pending'; session: null; token: null; expiresAt: null }
  | { status: 'ready'; session: SessionReadResponseOutput; token: string; expiresAt: string }
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
  const operation = useRef(false);

  const changeState = useCallback((next: SessionState) => {
    current.current = next;
    setState(next);
  }, []);

  const failSession = useCallback(() => {
    ++generation.current;
    queryClient.clear();
    changeState(error);
    setBusy(false);
  }, [changeState, queryClient]);

  const retry = useCallback(async () => {
    const attempt = ++generation.current;
    queryClient.clear();
    changeState(pending);
    setActionError(null);
    // PlatformAdapter is the only source of raw signed initData.
    try {
      const raw = platform.isMiniAppContext ? platform.getRawInitData() : null;
      if (!raw?.trim()) throw new Error('MAX context unavailable');
      const issued = await authenticateMax(raw);
      if (attempt !== generation.current) return;
      if (Date.parse(issued.expires_at) <= Date.now()) throw new Error('Expired session');
      changeState({
        status: 'ready', session: issued.session,
        token: issued.session_token, expiresAt: issued.expires_at,
      });
    } catch {
      if (attempt === generation.current) changeState(error);
    }
  }, [changeState, platform, queryClient]);

  useEffect(() => {
    void retry();
    return () => { ++generation.current; };
  }, [retry]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const remaining = Date.parse(state.expiresAt) - Date.now();
    if (remaining <= 0) {
      failSession();
      return;
    }
    const timer = window.setTimeout(failSession, Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [state, failSession]);

  const credential = useCallback(() => {
    const snapshot = current.current;
    if (snapshot.status !== 'ready') throw new Error('Session unavailable');
    if (Date.parse(snapshot.expiresAt) <= Date.now()) {
      failSession();
      throw new Error('Session expired');
    }
    return snapshot;
  }, [failSession]);

  const refreshSession = useCallback(async () => {
    let snapshot: Extract<SessionState, { status: 'ready' }>;
    try { snapshot = credential(); } catch { return; }
    try {
      const session = await readSession(snapshot.token);
      if (current.current !== snapshot) return;
      if (JSON.stringify(session) !== JSON.stringify(snapshot.session)) {
        queryClient.clear();
        setRevision((value) => value + 1);
      }
      changeState({ ...snapshot, session });
    } catch {
      if (current.current === snapshot) failSession();
    }
  }, [changeState, credential, failSession, queryClient]);

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
    if (response.status === 401) failSession();
    return response;
  }, [credential, failSession]);

  const startRun = useCallback(async () => {
    if (operation.current) return;
    let snapshot: Extract<SessionState, { status: 'ready' }>;
    try { snapshot = credential(); } catch { return; }
    if (!snapshot.session.demo_mode || !snapshot.session.real_max_identity.outbound_max_ready) return;
    operation.current = true;
    setBusy(true);
    setActionError(null);
    let runCreated = false;
    try {
      const result = await startDemoRun(snapshot.token);
      runCreated = true;
      const fresh = await readSession(snapshot.token);
      if (fresh.demo_run_id !== result.demo_run_id) throw new Error('DemoRun context mismatch');
      if (current.current !== snapshot) return;
      await queryClient.invalidateQueries({ refetchType: 'none' });
      queryClient.clear();
      changeState({ ...snapshot, session: fresh });
      setRevision((value) => value + 1);
    } catch (cause) {
      if (runCreated || !(cause instanceof SessionHttpError) || cause.status === 401) failSession();
      else {
        setActionError('Не удалось запустить демо. Повторите действие.');
        void refreshSession();
      }
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }, [changeState, credential, failSession, queryClient, refreshSession]);

  const switchRole = useCallback(async (role: RoleOutput) => {
    if (operation.current) return;
    let snapshot: Extract<SessionState, { status: 'ready' }>;
    try { snapshot = credential(); } catch { return; }
    if (!snapshot.session.demo_mode || !snapshot.session.demo_run_id) return;
    operation.current = true;
    setBusy(true);
    setActionError(null);
    let switchedOnServer = false;
    try {
      const issued = await switchActor(snapshot.token, role);
      switchedOnServer = true;
      if (Date.parse(issued.expires_at) <= Date.now()) throw new Error('Expired session');
      const fresh = await readSession(issued.session_token);
      if (current.current !== snapshot) return;
      await queryClient.invalidateQueries({ refetchType: 'none' });
      queryClient.clear();
      changeState({
        status: 'ready', session: fresh,
        token: issued.session_token, expiresAt: issued.expires_at,
      });
      setRevision((value) => value + 1);
    } catch (cause) {
      if (switchedOnServer || !(cause instanceof SessionHttpError) || cause.status === 401) failSession();
      else {
        setActionError('Не удалось переключить роль. Обновите контекст и повторите действие.');
        void refreshSession();
      }
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }, [changeState, credential, failSession, queryClient, refreshSession]);

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
