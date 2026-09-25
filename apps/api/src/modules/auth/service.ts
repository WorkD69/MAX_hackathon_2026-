import { AuthMaxSuccessSchema, SessionReadResponseSchema } from '@max-smart-city/contracts';
import type { AuthMaxSuccessOutput, SessionReadResponseOutput } from '@max-smart-city/contracts';
import type { RuntimeConfig } from '../../config/types.js';
import type { MaxIdentityRepository, MaxIdentityRow, NormalActorRow } from '../max-identity/repository.js';
import { validateMaxInitData } from './init-data.js';
import { issueSession, SessionError, verifySession } from './session-token.js';
import type { NewSessionContext } from './session-token.js';

export class AuthContextError extends Error {
  constructor(readonly code: 'APP_USER_NOT_MAPPED' | 'AUTH_BOOTSTRAP_FAILED') { super(code); }
}

const outboundReady = (identity: MaxIdentityRow): boolean =>
  identity.link_status === 'LINKED_CONFIRMED' && identity.delivery_chat_id !== null &&
  (identity.delivery_chat_type === 'DIALOG' || identity.delivery_chat_type === 'CHAT' || identity.delivery_chat_type === 'CHANNEL');

const activeNormalActor = (rows: NormalActorRow[]): NormalActorRow | null => {
  if (rows.length !== 1) return null;
  const actor = rows[0]!;
  if (!actor.user_active || !actor.role_binding_id || !actor.role) return null;
  if ((actor.role === 'UK_EMPLOYEE' || actor.role === 'UK_ADMIN') && !actor.organization_active) return null;
  if (actor.role === 'CONTRACTOR_EMPLOYEE' && !actor.contractor_active) return null;
  return actor;
};

export class AuthService {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly repository: MaxIdentityRepository,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  async bootstrap(rawInitData: string): Promise<AuthMaxSuccessOutput> {
    if (!this.config.MAX_BOT_TOKEN) throw new AuthContextError('AUTH_BOOTSTRAP_FAILED');
    const now = this.nowSeconds();
    const launch = validateMaxInitData(rawInitData, this.config, now);
    const identity = await this.repository.upsertValidated(launch, new Date(now * 1000));
    if (!outboundReady(identity)) throw new AuthContextError('AUTH_BOOTSTRAP_FAILED');

    let context: NewSessionContext;
    let session: SessionReadResponseOutput;
    if (this.config.DEMO_MODE) {
      const run = await this.repository.currentDemoRun(identity.max_identity_id);
      context = {
        max_identity_id: identity.max_identity_id, app_user_id: null,
        role_binding_id: null, role: null, demo_mode: true,
        demo_run_id: run?.demo_run_id ?? null, real_display_name: launch.displayName,
      };
      session = {
        real_max_identity: { max_identity_id: identity.max_identity_id, display_name: launch.displayName, outbound_max_ready: true },
        demo_mode: true, demo_run_id: run?.demo_run_id ?? null, primary_case_id: run?.primary_case_id ?? null,
        effective_actor: { app_user_id: null, role: null, display_name: '' },
      };
    } else {
      if (!identity.app_user_id) throw new AuthContextError('APP_USER_NOT_MAPPED');
      const actor = activeNormalActor(await this.repository.normalActors(identity.app_user_id));
      if (!actor) throw new AuthContextError('APP_USER_NOT_MAPPED');
      context = {
        max_identity_id: identity.max_identity_id, app_user_id: actor.app_user_id,
        role_binding_id: actor.role_binding_id, role: actor.role, demo_mode: false,
        demo_run_id: null, real_display_name: launch.displayName,
      };
      session = {
        real_max_identity: { max_identity_id: identity.max_identity_id, display_name: launch.displayName, outbound_max_ready: true },
        demo_mode: false, demo_run_id: null, primary_case_id: null,
        effective_actor: { app_user_id: actor.app_user_id, role: actor.role, display_name: actor.display_name },
      };
    }
    const issued = issueSession(context, this.config, now);
    return AuthMaxSuccessSchema.parse({ session_token: issued.token, expires_at: issued.expiresAt, session });
  }

  async readSession(token: string): Promise<SessionReadResponseOutput> {
    const claims = verifySession(token, this.config, this.nowSeconds());
    if (claims.demo_mode !== this.config.DEMO_MODE) throw new SessionError('SESSION_EXPIRED');
    const identity = await this.repository.findById(claims.max_identity_id);
    if (!identity) throw new SessionError('SESSION_EXPIRED');
    const real = {
      max_identity_id: identity.max_identity_id,
      display_name: claims.real_display_name,
      outbound_max_ready: outboundReady(identity),
    };
    if (claims.demo_mode) {
      const run = await this.repository.currentDemoRun(identity.max_identity_id);
      if ((run?.demo_run_id ?? null) !== claims.demo_run_id) throw new SessionError('SESSION_EXPIRED');
      let effective = { app_user_id: null as string | null, role: null as NewSessionContext['role'], display_name: '' };
      if (claims.app_user_id !== null) {
        if (!run || !claims.role) throw new SessionError('SESSION_EXPIRED');
        const actor = await this.repository.demoActor(run.demo_run_id, claims.app_user_id);
        if (!actor?.active || actor.role !== claims.role) throw new SessionError('SESSION_EXPIRED');
        effective = { app_user_id: actor.app_user_id, role: actor.role, display_name: actor.display_name };
      }
      return SessionReadResponseSchema.parse({
        real_max_identity: real, demo_mode: true,
        demo_run_id: run?.demo_run_id ?? null, primary_case_id: run?.primary_case_id ?? null,
        effective_actor: effective,
      });
    }
    if (!identity.app_user_id || identity.app_user_id !== claims.app_user_id) throw new SessionError('SESSION_EXPIRED');
    const actor = activeNormalActor(await this.repository.normalActors(identity.app_user_id));
    if (!actor || actor.role_binding_id !== claims.role_binding_id || actor.role !== claims.role) {
      throw new SessionError('SESSION_EXPIRED');
    }
    return SessionReadResponseSchema.parse({
      real_max_identity: real, demo_mode: false, demo_run_id: null, primary_case_id: null,
      effective_actor: { app_user_id: actor.app_user_id, role: actor.role, display_name: actor.display_name },
    });
  }
}
