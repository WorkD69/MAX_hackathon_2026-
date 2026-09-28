import { createHash, randomUUID } from 'node:crypto';
import { CreateCasePayloadSchema, CreateCaseSuccessSchema, IdempotencyKeyHeaderSchema, UuidSchema } from '@max-smart-city/contracts';
import type { CreateCasePayloadOutput } from '@max-smart-city/contracts';
import { CommandKernelError, CommandTransactionKernel } from '@max-smart-city/db';
import type { CommandPlan, DatabaseConnection, DatabaseTransaction } from '@max-smart-city/db';
import { evaluateDomain } from '@max-smart-city/domain';
import type { DomainPlan } from '@max-smart-city/domain';
import type { Selectable } from 'kysely';
import type { Database } from '@max-smart-city/db';
import type { RuntimeConfig } from '../../../../config/types.js';
import { SessionError, verifySession } from '../../../auth/session-token.js';
import { AuthorizationError } from '../../../authorization/policy.js';
import { createCommandAuthorization } from '../../../commands/kernel/authorization.js';
import type { CommandAuthorizationContext } from '../../../commands/kernel/authorization.js';
import { createCommandFingerprint } from '../../../commands/kernel/fingerprint.js';
import type { LogicalMultipartFile } from '../../../commands/kernel/fingerprint.js';
import { bindPrimaryCase, lockDemoIdentity } from '../../../demo/repository.js';
import { IntakeError } from './options.js';

type Config = {
  organization: Selectable<Database['organization']>;
  house: Selectable<Database['house']>;
  premises: Selectable<Database['premises']>;
  category: Selectable<Database['category']>;
};
type Effect = { caseId: string; iterationId: string; eventId: string };

const hidden = (): never => { throw new AuthorizationError('NOT_FOUND'); };
const noop = async () => {};

/** The requested Case does not exist yet; topology is re-read under canonical locks below. */
async function lockCreateConfig(tx: DatabaseTransaction, payload: CreateCasePayloadOutput,
  actorId: string, bindingId: string, maxIdentityId: string, demo: boolean): Promise<Config> {
  const topology = await tx.selectFrom('premises as p').innerJoin('house as h', 'h.house_id', 'p.house_id')
    .select(['p.house_id', 'h.organization_id']).where('p.premises_id', '=', payload.premises_id)
    .executeTakeFirst();
  if (!topology) return hidden();
  const organization = await tx.selectFrom('organization').selectAll()
    .where('organization_id', '=', topology.organization_id).forShare().executeTakeFirst();
  const house = await tx.selectFrom('house').selectAll()
    .where('house_id', '=', topology.house_id).forShare().executeTakeFirst();
  const premises = await tx.selectFrom('premises').selectAll()
    .where('premises_id', '=', payload.premises_id).forShare().executeTakeFirst();
  if (!organization?.active || !house?.active || !premises?.active ||
    house.organization_id !== organization.organization_id || premises.house_id !== house.house_id) return hidden();
  const category = await tx.selectFrom('category').selectAll()
    .where('category_id', '=', payload.category_id).forShare().executeTakeFirst();
  if (!category || category.organization_id !== organization.organization_id) return hidden();
  if (!category.active) throw new IntakeError('CATEGORY_INACTIVE', 422);
  if (category.default_contractor_id) {
    const contractor = await tx.selectFrom('contractor').selectAll()
      .where('contractor_id', '=', category.default_contractor_id).forShare().executeTakeFirst();
    const mapping = await tx.selectFrom('organization_contractor').selectAll()
      .where('organization_id', '=', organization.organization_id)
      .where('contractor_id', '=', category.default_contractor_id).forShare().executeTakeFirst();
    if (!contractor?.active || !mapping?.active) throw new IntakeError('CONTRACTOR_NOT_AVAILABLE', 422);
  }
  const actor = await tx.selectFrom('app_user').selectAll().where('app_user_id', '=', actorId)
    .forShare().executeTakeFirst();
  const binding = await tx.selectFrom('user_role_binding').selectAll()
    .where('role_binding_id', '=', bindingId).forShare().executeTakeFirst();
  const access = await tx.selectFrom('resident_premises_access').selectAll()
    .where('app_user_id', '=', actorId).where('premises_id', '=', payload.premises_id)
    .forShare().executeTakeFirst();
  if (!actor?.active || !binding?.active || binding.app_user_id !== actorId ||
    binding.role !== 'RESIDENT' || binding.organization_id !== null || binding.contractor_id !== null ||
    !access?.active) return hidden();
  if (!demo) {
    const identity = await tx.selectFrom('max_identity').selectAll()
      .where('app_user_id', '=', actorId).forShare().executeTakeFirst();
    if (!identity || identity.max_identity_id !== maxIdentityId ||
      identity.link_status !== 'LINKED_CONFIRMED' || !identity.delivery_chat_id || !identity.delivery_chat_type) {
      throw new IntakeError('MAX_DELIVERY_TARGET_NOT_READY', 409);
    }
  }
  return { organization, house, premises, category };
}

export class CreateCaseService {
  private readonly kernel: CommandTransactionKernel;
  constructor(private readonly database: DatabaseConnection, private readonly config: RuntimeConfig,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000)) {
    this.kernel = new CommandTransactionKernel(database, () => new Date(this.nowSeconds() * 1000));
  }

  async create(token: string, key: string | undefined, body: unknown, files: readonly LogicalMultipartFile[]) {
    const claims = verifySession(token, this.config, this.nowSeconds());
    if (claims.demo_mode !== this.config.DEMO_MODE) throw new SessionError('SESSION_EXPIRED');
    const authorization = createCommandAuthorization(token, this.config, this.nowSeconds());
    let locked: Config | undefined;
    let domain: DomainPlan | undefined;
    const path = '/api/v1/cases';
    const plan: CommandPlan<CreateCasePayloadOutput, CommandAuthorizationContext, Effect,
      ReturnType<typeof CreateCaseSuccessSchema.parse>> = {
      requestedTarget: payload => ({ kind: 'CREATE_CASE', caseId: null,
        authorizationKey: `create:${payload.premises_id}`,
        authorizationContext: { kind: 'CREATE_CASE', premisesId: payload.premises_id } }),
      storedTarget: execution => {
        const rawCaseId = execution.response_body && typeof execution.response_body === 'object'
          && 'case_id' in execution.response_body ? execution.response_body.case_id : null;
        const saved = UuidSchema.safeParse(rawCaseId);
        if (!saved.success) throw new IntakeError('INTERNAL_ERROR', 500);
        return { kind: 'EXISTING_CASE', caseId: saved.data, authorizationKey: `case:${saved.data}`,
          authorizationContext: { kind: 'CASE_VISIBILITY' } };
      },
      lockAuthorizationResources: async input => {
        if (claims.demo_mode) {
          await lockDemoIdentity(input.transaction, claims.max_identity_id);
          const run = await input.transaction.selectFrom('demo_run').select(['status', 'created_by_max_identity_id'])
            .where('demo_run_id', '=', claims.demo_run_id).executeTakeFirst();
          if (!run || run.status !== 'ACTIVE' || run.created_by_max_identity_id !== claims.max_identity_id) {
            throw new AuthorizationError('NOT_FOUND');
          }
        }
      },
      authorize: authorization.authorize,
      terminalGuard: noop, validateExactTargets: noop, validateStateContext: noop,
      lockConfiguration: async input => {
        if (!claims.app_user_id || !claims.role_binding_id) throw new AuthorizationError('FORBIDDEN');
        locked = await lockCreateConfig(input.transaction, input.payload, claims.app_user_id,
          claims.role_binding_id, claims.max_identity_id, claims.demo_mode);
      },
      validateDomain: async input => {
        if (!locked || !claims.app_user_id) throw new IntakeError('INTERNAL_ERROR', 500);
        const validation = evaluateDomain(null, { role: 'RESIDENT', userId: claims.app_user_id }, {
          kind: 'CREATE_CASE', organizationId: locked.organization.organization_id,
          premisesId: input.payload.premises_id, categoryId: input.payload.category_id,
          description: input.payload.description, resultRequirement: locked.category.result_requirement,
          premisesAvailable: true, categoryActive: true,
        });
        if (!validation.ok) throw new IntakeError('VALIDATION_FAILED', 422);
        domain = validation.plan;
      },
      writeDomain: async input => {
        if (!locked || !domain || !claims.app_user_id) throw new IntakeError('INTERNAL_ERROR', 500);
        const caseId = randomUUID(), iterationId = randomUUID(), eventId = randomUUID();
        const now = new Date(this.nowSeconds() * 1000);
        await input.transaction.insertInto('case_table').values({
          case_id: caseId, display_number: `C-${caseId}`, organization_id: locked.organization.organization_id,
          house_id: locked.house.house_id, premises_id: locked.premises.premises_id,
          resident_user_id: claims.app_user_id, category_id: locked.category.category_id,
          description: input.payload.description, created_at: now, updated_at: now,
          created_by_user_id: claims.app_user_id, demo_run_id: claims.demo_mode ? claims.demo_run_id : null,
          category_name_snapshot: locked.category.name,
          requires_access_snapshot: locked.category.requires_premises_access,
          result_requirement_snapshot: locked.category.result_requirement,
          default_contractor_snapshot_id: locked.category.default_contractor_id,
          house_address_snapshot: locked.house.address,
          premises_label_snapshot: locked.premises.number_or_label,
          current_state: domain.nextState, current_iteration_id: iterationId,
          current_selection_id: null, current_assignment_id: null,
          current_executor_contractor_id: null, current_result_id: null,
          closed_at: null, closed_by_user_id: null, closure_kind: null, closure_explanation: null,
          revision: 1, last_event_seq: 0,
        }).execute();
        await input.transaction.insertInto('case_iteration').values({ iteration_id: iterationId,
          case_id: caseId, iteration_no: 1, start_reason: 'INITIAL', started_at: now,
          started_by_user_id: claims.app_user_id, source_result_id: null,
          source_feedback_id: null, started_by_event_id: null }).execute();
        for (const file of files) {
          const attachmentId = randomUUID();
          await input.transaction.insertInto('attachment').values({ attachment_id: attachmentId,
            case_id: caseId, uploaded_by_user_id: claims.app_user_id, file_name: file.fileName,
            mime_type: file.mimeType, byte_size: file.bytes.byteLength,
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
            content: Buffer.from(file.bytes), created_at: now }).execute();
          await input.transaction.insertInto('case_initial_attachment').values({
            case_id: caseId, attachment_id: attachmentId }).execute();
        }
        if (claims.demo_mode) {
          if (!claims.demo_run_id) throw new AuthorizationError('NOT_FOUND');
          await bindPrimaryCase(input.transaction, claims.max_identity_id, claims.demo_run_id, caseId);
        }
        return { caseId, iterationId, eventId };
      },
      updateProjection: noop,
      appendEvents: async input => {
        if (!claims.app_user_id || !domain || !locked) throw new IntakeError('INTERNAL_ERROR', 500);
        await input.transaction.insertInto('case_event').values({ event_id: input.effect.eventId,
          case_id: input.effect.caseId, event_seq: 1, event_type: 'EVT_001',
          occurred_at: new Date(this.nowSeconds() * 1000), actor_user_id: claims.app_user_id,
          actor_role_snapshot: 'RESIDENT', actor_organization_id: locked.organization.organization_id,
          actor_contractor_id: null, from_state: null, to_state: domain.nextState,
          iteration_id: input.effect.iterationId, selection_id: null, assignment_id: null,
          result_id: null, feedback_id: null, comment_id: null, attachment_id: null,
          description: 'Создано обращение', presentation_data: {}, command_id: input.commandId,
          caused_by_event_id: null, derived: false }).execute();
        await input.transaction.updateTable('case_table').set({ last_event_seq: 1 })
          .where('case_id', '=', input.effect.caseId).execute();
      },
      createNotificationIntents: noop,
      createdCaseId: effect => effect.caseId,
      canonicalResponse: input => ({ status: 201, body: CreateCaseSuccessSchema.parse({
        command_id: input.commandId, case_id: input.effect.caseId,
        state: 'CREATED', revision: input.revision,
        created: { iteration_id: input.effect.iterationId }, event_ids: [input.effect.eventId],
      }) }),
    };
    return this.kernel.run({ authenticate: authorization.authenticate, idempotencyKey: key,
      commandType: 'CREATE_CASE', prepare: () => {
        if (!IdempotencyKeyHeaderSchema.safeParse(key).success) throw new CommandKernelError('IDEMPOTENCY_KEY_REQUIRED', 400);
        const parsed = CreateCasePayloadSchema.safeParse(body);
        if (!parsed.success) throw new IntakeError('VALIDATION_FAILED', 400);
        return { payload: parsed.data, requestHash: createCommandFingerprint({ method: 'POST', path,
          commandType: 'CREATE_CASE', normalizedPayload: parsed.data, files }) };
      }, plan });
  }
}
