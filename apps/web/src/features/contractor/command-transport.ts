import {
  AcceptAssignmentRequestSchema, AcceptAssignmentSuccessSchema,
  RejectAssignmentRequestSchema, RejectAssignmentSuccessSchema,
  AddCommentPayloadSchema, AddCommentSuccessSchema,
  AddResultMaterialPayloadSchema, AddResultMaterialSuccessSchema,
  SubmitResultRequestSchema, SubmitResultSuccessSchema, ErrorResponseSchema,
  type AddResultMaterialSuccessOutput, type SubmitResultRequestInput,
  type SubmitResultSuccessOutput,
} from '@max-smart-city/contracts';

export class ContractorCommandError extends Error {
  constructor(readonly status: number, readonly code: string | null, message: string) {
    super(message);
  }
}

export interface ContractorCommandTransport {
  accept(caseId: string, assignmentId: string): Promise<void>;
  reject(caseId: string, assignmentId: string, reason: string): Promise<void>;
  comment(caseId: string, body: string): Promise<void>;
  upload(caseId: string, assignmentId: string, iterationId: string, file: File): Promise<AddResultMaterialSuccessOutput>;
  submit(caseId: string, request: SubmitResultRequestInput): Promise<SubmitResultSuccessOutput>;
}

type AuthorizedFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function createContractorCommandTransport(authorizedFetch: AuthorizedFetch): ContractorCommandTransport {
  async function post(path: string, body: string | FormData): Promise<unknown> {
    const headers = new Headers({ 'Idempotency-Key': crypto.randomUUID() });
    if (typeof body === 'string') headers.set('Content-Type', 'application/json');
    const response = await authorizedFetch(path, { method: 'POST', headers, body });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ErrorResponseSchema.safeParse(raw);
      throw new ContractorCommandError(response.status,
        parsed.success ? parsed.data.error.code : null,
        parsed.success ? parsed.data.error.message : 'Не удалось выполнить действие');
    }
    return raw;
  }

  const path = (caseId: string, suffix: string) =>
    `/api/v1/cases/${encodeURIComponent(caseId)}/${suffix}`;
  return {
    async accept(caseId, assignmentId) {
      const payload = AcceptAssignmentRequestSchema.parse({ assignment_id: assignmentId });
      AcceptAssignmentSuccessSchema.parse(await post(path(caseId, 'commands/accept-assignment'), JSON.stringify(payload)));
    },
    async reject(caseId, assignmentId, reason) {
      const payload = RejectAssignmentRequestSchema.parse({ assignment_id: assignmentId, reason: reason.trim() });
      RejectAssignmentSuccessSchema.parse(await post(path(caseId, 'commands/reject-assignment'), JSON.stringify(payload)));
    },
    async comment(caseId, body) {
      const payload = AddCommentPayloadSchema.parse({ body: body.trim(), clarification_request_id: null });
      const form = new FormData();
      form.append('payload', JSON.stringify(payload));
      AddCommentSuccessSchema.parse(await post(path(caseId, 'comments'), form));
    },
    async upload(caseId, assignmentId, iterationId, file) {
      const payload = AddResultMaterialPayloadSchema.parse({ assignment_id: assignmentId, iteration_id: iterationId });
      const form = new FormData();
      form.append('payload', JSON.stringify(payload));
      form.append('file', file);
      return AddResultMaterialSuccessSchema.parse(await post(path(caseId, 'result-materials'), form));
    },
    async submit(caseId, request) {
      const payload = SubmitResultRequestSchema.parse(request);
      return SubmitResultSuccessSchema.parse(await post(path(caseId, 'commands/submit-result'), JSON.stringify(payload)));
    },
  };
}
