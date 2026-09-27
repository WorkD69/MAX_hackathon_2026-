import {
  AddCommentPayloadSchema, AddCommentSuccessSchema, CategoriesReadResponseSchema,
  CreateCasePayloadSchema, CreateCaseSuccessSchema, DownloadCapabilityResponseSchema,
  ErrorResponseSchema, SessionReadResponseSchema,
  ResidentConfirmationRequestSchema, ResidentConfirmationSuccessSchema,
  ResidentRemarkPayloadSchema, ResidentRemarkSuccessSchema,
  type AddCommentPayloadOutput, type AddCommentSuccessOutput, type CreateCasePayloadOutput,
  type CreateCaseSuccessOutput, type DownloadCapabilityResponseOutput,
  type ResidentConfirmationRequestOutput, type ResidentConfirmationSuccessOutput,
  type ResidentRemarkPayloadOutput, type ResidentRemarkSuccessOutput,
  type ResultRequirementOutput, type SessionReadResponseOutput,
} from '@max-smart-city/contracts';

export type AuthorizedFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class ResidentHttpError extends Error {
  constructor(readonly status: number, message: string, readonly code: string | null = null) {
    super(message);
    this.name = 'ResidentHttpError';
  }
}

export function isStaleResponse(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error
    && (error as { status: unknown }).status === 409;
}

export interface CategoryOption {
  readonly categoryId: string;
  readonly name: string;
  readonly resultRequirement: ResultRequirementOutput;
  readonly active: boolean;
}

export interface PremiseOption {
  readonly premisesId: string;
  readonly label: string;
  readonly active: boolean;
}

export interface CreateCaseOptions {
  readonly categories: readonly CategoryOption[];
  readonly premises: readonly PremiseOption[];
}

export interface CreateCaseRequest {
  readonly payload: CreateCasePayloadOutput;
  readonly files: readonly File[];
  readonly idempotencyKey: string;
}

export interface ResidentCommand {
  readonly idempotencyKey: string;
}

export interface ResidentConfirmRequest extends ResidentCommand {
  readonly request: ResidentConfirmationRequestOutput;
}

export interface ResidentRemarkRequest extends ResidentCommand {
  readonly request: ResidentRemarkPayloadOutput;
  readonly files: readonly File[];
}

export interface AddCommentRequest extends ResidentCommand {
  readonly payload: AddCommentPayloadOutput;
  readonly files: readonly File[];
}

export type ReadResidentPremises = () => Promise<readonly PremiseOption[]>;

export interface ResidentTransport {
  createCaseOptions(): Promise<CreateCaseOptions>;
  createCase(request: CreateCaseRequest): Promise<CreateCaseSuccessOutput>;
  addComment(caseId: string, request: AddCommentRequest): Promise<AddCommentSuccessOutput>;
  confirmResult(caseId: string, request: ResidentConfirmRequest): Promise<ResidentConfirmationSuccessOutput>;
  remarkResult(caseId: string, request: ResidentRemarkRequest): Promise<ResidentRemarkSuccessOutput>;
  downloadCapability(attachmentId: string, idempotencyKey: string): Promise<DownloadCapabilityResponseOutput>;
  readAuthoritativeSession(): Promise<SessionReadResponseOutput>;
}

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

async function failure(response: Response, action: string): Promise<ResidentHttpError> {
  const body = await response.json().catch(() => null);
  const parsed = ErrorResponseSchema.safeParse(body);
  return new ResidentHttpError(response.status, `${action} failed (${response.status})`,
    parsed.success ? parsed.data.error.code : null);
}

async function readJson(response: Response, action: string): Promise<unknown> {
  if (!response.ok) throw await failure(response, action);
  return response.json();
}

async function postJson<T>(
  authorizedFetch: AuthorizedFetch,
  path: string,
  body: unknown,
  idempotencyKey: string,
  parse: (value: unknown) => T,
  action: string,
): Promise<T> {
  const response = await authorizedFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return parse(await readJson(response, action));
}

async function postMultipart<T>(
  authorizedFetch: AuthorizedFetch,
  path: string,
  payload: unknown,
  files: readonly File[],
  idempotencyKey: string,
  parse: (value: unknown) => T,
  action: string,
): Promise<T> {
  const body = new FormData();
  body.append('payload', JSON.stringify(payload));
  for (const file of files) body.append('files[]', file, file.name);
  const response = await authorizedFetch(path, {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body,
  });
  return parse(await readJson(response, action));
}

function casePath(caseId: string, suffix: string): string {
  return `/api/v1/cases/${encodeURIComponent(caseId)}${suffix}`;
}

export function createHttpResidentTransport(
  authorizedFetch: AuthorizedFetch,
  readResidentPremises: ReadResidentPremises,
): ResidentTransport {
  return {
    async createCaseOptions() {
      const categories = CategoriesReadResponseSchema.parse(
        await readJson(await authorizedFetch('/api/v1/config/categories', { method: 'GET', cache: 'no-store' }), 'CreateCase options'),
      );
      const premises = await readResidentPremises();
      return {
        categories: categories
          .filter((category) => category.active)
          .map((category) => ({
            categoryId: category.category_id,
            name: category.name,
            resultRequirement: category.result_requirement,
            active: category.active,
          })),
        premises: premises.map((premise) => ({
          premisesId: premise.premisesId, label: premise.label, active: premise.active,
        })),
      };
    },

    async createCase({ payload, files, idempotencyKey }) {
      const parsed = CreateCasePayloadSchema.parse(payload);
      const body = new FormData();
      body.append('payload', JSON.stringify(parsed));
      for (const file of files) body.append('files[]', file, file.name);
      const response = await authorizedFetch('/api/v1/cases', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body,
      });
      return CreateCaseSuccessSchema.parse(await readJson(response, 'CreateCase'));
    },

    addComment(caseId, { payload, files = [], idempotencyKey }) {
      return postMultipart(authorizedFetch, casePath(caseId, '/comments'),
        AddCommentPayloadSchema.parse(payload), files, idempotencyKey,
        (value) => AddCommentSuccessSchema.parse(value), 'AddComment');
    },

    confirmResult(caseId, { request, idempotencyKey }) {
      return postJson(authorizedFetch, casePath(caseId, '/commands/resident-confirmation'),
        ResidentConfirmationRequestSchema.parse(request), idempotencyKey,
        (value) => ResidentConfirmationSuccessSchema.parse(value), 'ResidentConfirmation');
    },

    remarkResult(caseId, { request, files = [], idempotencyKey }) {
      return postMultipart(authorizedFetch, casePath(caseId, '/commands/resident-remark'),
        ResidentRemarkPayloadSchema.parse(request), files, idempotencyKey,
        (value) => ResidentRemarkSuccessSchema.parse(value), 'ResidentRemark');
    },

    async downloadCapability(attachmentId, idempotencyKey) {
      const path = `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download-capability`;
      const response = await authorizedFetch(path, {
        method: 'POST', cache: 'no-store', headers: { 'Idempotency-Key': idempotencyKey },
      });
      return DownloadCapabilityResponseSchema.parse(await readJson(response, 'DownloadCapability'));
    },

    async readAuthoritativeSession() {
      const response = await authorizedFetch('/api/v1/session', { method: 'GET', cache: 'no-store' });
      return SessionReadResponseSchema.parse(await readJson(response, 'Session'));
    },
  };
}
