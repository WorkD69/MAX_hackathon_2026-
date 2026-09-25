import {
  AddCommentPayloadSchema, AddCommentSuccessSchema, CategoriesReadResponseSchema,
  CreateCasePayloadSchema, CreateCaseSuccessSchema, DownloadCapabilityResponseSchema,
  ResidentConfirmationRequestSchema, ResidentConfirmationSuccessSchema,
  ResidentRemarkPayloadSchema, ResidentRemarkSuccessSchema,
  type AddCommentPayloadOutput, type AddCommentSuccessOutput, type CreateCasePayloadOutput,
  type CreateCaseSuccessOutput, type DownloadCapabilityResponseOutput,
  type ResidentConfirmationRequestOutput, type ResidentConfirmationSuccessOutput,
  type ResidentRemarkPayloadOutput, type ResidentRemarkSuccessOutput,
  type ResultRequirementOutput,
} from '@max-smart-city/contracts';

export type AuthorizedFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class ResidentHttpError extends Error {
  constructor(readonly status: number, message: string) {
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
}

export interface AddCommentRequest extends ResidentCommand {
  readonly payload: AddCommentPayloadOutput;
}

export type ReadResidentPremises = () => Promise<readonly PremiseOption[]>;

export interface ResidentTransport {
  createCaseOptions(): Promise<CreateCaseOptions>;
  createCase(request: CreateCaseRequest): Promise<CreateCaseSuccessOutput>;
  addComment(caseId: string, request: AddCommentRequest): Promise<AddCommentSuccessOutput>;
  confirmResult(caseId: string, request: ResidentConfirmRequest): Promise<ResidentConfirmationSuccessOutput>;
  remarkResult(caseId: string, request: ResidentRemarkRequest): Promise<ResidentRemarkSuccessOutput>;
  downloadCapability(attachmentId: string): Promise<DownloadCapabilityResponseOutput>;
}

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

function failure(response: Response, action: string): ResidentHttpError {
  if (response.status === 409) {
    return new ResidentHttpError(409, `${action}: stale authoritative state`);
  }
  return new ResidentHttpError(response.status, `${action} failed (${response.status})`);
}

async function readJson(response: Response, action: string): Promise<unknown> {
  if (!response.ok) throw failure(response, action);
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

    addComment(caseId, { payload, idempotencyKey }) {
      return postJson(authorizedFetch, casePath(caseId, '/comments'),
        AddCommentPayloadSchema.parse(payload), idempotencyKey,
        (value) => AddCommentSuccessSchema.parse(value), 'AddComment');
    },

    confirmResult(caseId, { request, idempotencyKey }) {
      return postJson(authorizedFetch, casePath(caseId, '/commands/resident-confirmation'),
        ResidentConfirmationRequestSchema.parse(request), idempotencyKey,
        (value) => ResidentConfirmationSuccessSchema.parse(value), 'ResidentConfirmation');
    },

    remarkResult(caseId, { request, idempotencyKey }) {
      return postJson(authorizedFetch, casePath(caseId, '/commands/resident-remark'),
        ResidentRemarkPayloadSchema.parse(request), idempotencyKey,
        (value) => ResidentRemarkSuccessSchema.parse(value), 'ResidentRemark');
    },

    async downloadCapability(attachmentId) {
      const path = `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download-capability`;
      const response = await authorizedFetch(path, { method: 'POST', cache: 'no-store' });
      return DownloadCapabilityResponseSchema.parse(await readJson(response, 'DownloadCapability'));
    },
  };
}
