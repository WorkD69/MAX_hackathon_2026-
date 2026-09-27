import {
  AcceptAssignmentRequestSchema, AcceptAssignmentSuccessSchema,
  RejectAssignmentRequestSchema, RejectAssignmentSuccessSchema,
  AddCommentPayloadSchema, AddCommentSuccessSchema,
  AddResultMaterialPayloadSchema, AddResultMaterialSuccessSchema,
  SubmitResultRequestSchema, SubmitResultSuccessSchema, ErrorResponseSchema,
  type AddResultMaterialSuccessOutput, type SubmitResultRequestInput,
  type SubmitResultSuccessOutput,
} from '@max-smart-city/contracts';
import { MutationIntent } from '../../app/intent/mutation-intent.js';
import { safeMutationErrorText } from '../../app/intent/safe-error.js';

export class ContractorCommandError extends Error {
  constructor(readonly status: number, readonly code: string | null,
    _message?: string, readonly requestId: string | null = null) {
    super(safeMutationErrorText(code, requestId));
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

export function createContractorCommandTransport(authorizedFetch: AuthorizedFetch, contextKey = ''): ContractorCommandTransport {
  const intents = new Map<string, MutationIntent>();
  async function post(path: string, body: string | FormData, operation: string,
    payload: unknown, targets: unknown, files: readonly File[] = []): Promise<{ raw: unknown; intent: MutationIntent }> {
    let intent = intents.get(path);
    if (!intent) { intent = new MutationIntent(); intents.set(path, intent); }
    const resolved = await intent.resolve({ operation, method: 'POST', path, context: contextKey,
      payload, targets, files });
    const headers = new Headers({ 'Idempotency-Key': resolved.key });
    if (typeof body === 'string') headers.set('Content-Type', 'application/json');
    const response = await authorizedFetch(path, { method: 'POST', headers, body });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ErrorResponseSchema.safeParse(raw);
      if (response.status === 409) intent.close();
      throw new ContractorCommandError(response.status, parsed.success ? parsed.data.error.code : null,
        undefined, parsed.success ? parsed.data.error.request_id : null);
    }
    return { raw, intent };
  }

  const path = (caseId: string, suffix: string) =>
    `/api/v1/cases/${encodeURIComponent(caseId)}/${suffix}`;
  return {
    async accept(caseId, assignmentId) {
      const payload = AcceptAssignmentRequestSchema.parse({ assignment_id: assignmentId });
      const result = await post(path(caseId, 'commands/accept-assignment'), JSON.stringify(payload),
        'AcceptAssignment', payload, { assignment_id: assignmentId });
      AcceptAssignmentSuccessSchema.parse(result.raw);
      result.intent.close();
    },
    async reject(caseId, assignmentId, reason) {
      const payload = RejectAssignmentRequestSchema.parse({ assignment_id: assignmentId, reason: reason.trim() });
      const result = await post(path(caseId, 'commands/reject-assignment'), JSON.stringify(payload),
        'RejectAssignment', payload, { assignment_id: assignmentId });
      RejectAssignmentSuccessSchema.parse(result.raw);
      result.intent.close();
    },
    async comment(caseId, body) {
      const payload = AddCommentPayloadSchema.parse({ body: body.trim(), clarification_request_id: null });
      const form = new FormData();
      form.append('payload', JSON.stringify(payload));
      const result = await post(path(caseId, 'comments'), form, 'AddComment', payload, { case_id: caseId });
      AddCommentSuccessSchema.parse(result.raw);
      result.intent.close();
    },
    async upload(caseId, assignmentId, iterationId, file) {
      const payload = AddResultMaterialPayloadSchema.parse({ assignment_id: assignmentId, iteration_id: iterationId });
      const form = new FormData();
      form.append('payload', JSON.stringify(payload));
      form.append('file', file);
      const result = await post(path(caseId, 'result-materials'), form, 'AddResultMaterial', payload,
        { assignment_id: assignmentId, iteration_id: iterationId }, [file]);
      const parsed = AddResultMaterialSuccessSchema.parse(result.raw);
      result.intent.close();
      return parsed;
    },
    async submit(caseId, request) {
      const payload = SubmitResultRequestSchema.parse(request);
      const result = await post(path(caseId, 'commands/submit-result'), JSON.stringify(payload),
        'SubmitResult', payload, { assignment_id: payload.assignment_id, iteration_id: payload.iteration_id,
          material_attachment_ids: payload.material_attachment_ids });
      const parsed = SubmitResultSuccessSchema.parse(result.raw);
      result.intent.close();
      return parsed;
    },
  };
}
