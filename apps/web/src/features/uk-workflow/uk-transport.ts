import {
  AcceptCaseRequestSchema, AddCommentPayloadSchema, CompleteCaseRequestSchema,
  CompleteWithExplanationRequestSchema, RecordNoResidentFeedbackRequestSchema,
  RequestClarificationRequestSchema, ReturnToReworkRequestSchema,
  SelectContractorRequestSchema, SendAssignmentRequestSchema, ErrorResponseSchema,
  AcceptCaseSuccessSchema, SelectContractorSuccessSchema, SendAssignmentSuccessSchema,
  RequestClarificationSuccessSchema, ReturnToReworkSuccessSchema,
  RecordNoResidentFeedbackSuccessSchema, CompleteCaseSuccessSchema,
  CompleteWithExplanationSuccessSchema, AddCommentSuccessSchema,
  type SemanticErrorCodeInput,
  type AllowedActionOutput,
} from '@max-smart-city/contracts';
import type { ActionPayload } from '../cases/read/case-read.js';
import { MutationIntent } from '../../app/intent/mutation-intent.js';

export interface UkActionContext {
  caseId: string;
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>;
  contextKey?: string;
}

export class UkCommandError extends Error {
  constructor(readonly status: number, readonly code?: SemanticErrorCodeInput) {
    super(`UK command failed (${status}${code ? `: ${code}` : ''})`);
  }
}

type Submission = ActionPayload & { files?: readonly File[] };

function transportFiles(payload: ActionPayload): readonly File[] | undefined {
  return (payload as Submission).files;
}

function jsonPayload(payload: ActionPayload): ActionPayload {
  const { files: _files, ...body } = payload as Submission;
  return body as ActionPayload;
}

function command(action: AllowedActionOutput, payload: ActionPayload): {
  path: string; body: Record<string, unknown>; files?: readonly File[] | undefined;
} {
  switch (action.code) {
    case 'ACCEPT_CASE': return { path: 'commands/accept', body: AcceptCaseRequestSchema.parse(payload) };
    case 'SELECT_CONTRACTOR': return {
      path: 'commands/select-contractor', body: SelectContractorRequestSchema.parse(payload),
    };
    case 'SEND_ASSIGNMENT': return {
      path: 'commands/send-assignment', body: SendAssignmentRequestSchema.parse(payload),
    };
    case 'REQUEST_CLARIFICATION': return {
      path: 'commands/request-clarification', body: RequestClarificationRequestSchema.parse(jsonPayload(payload)),
      ...(transportFiles(payload) ? { files: transportFiles(payload) } : {}),
    };
    case 'RETURN_TO_REWORK': return {
      path: 'commands/return-to-rework', body: ReturnToReworkRequestSchema.parse(payload),
    };
    case 'RECORD_NO_RESIDENT_FEEDBACK': return {
      path: 'commands/record-no-resident-feedback', body: RecordNoResidentFeedbackRequestSchema.parse(payload),
    };
    case 'COMPLETE_CASE': return { path: 'commands/complete', body: CompleteCaseRequestSchema.parse(payload) };
    case 'COMPLETE_WITH_EXPLANATION': return {
      path: 'commands/complete-with-explanation', body: CompleteWithExplanationRequestSchema.parse(payload),
    };
    case 'ADD_COMMENT': return {
      path: 'comments', body: AddCommentPayloadSchema.parse(jsonPayload(payload)),
      ...(transportFiles(payload) ? { files: transportFiles(payload) } : {}),
    };
    default: throw new Error(`Unsupported UK action: ${action.code}`);
  }
}

export function createUkActionExecutor() {
  const intents = new Map<string, MutationIntent>();
  return async (action: AllowedActionOutput, payload: ActionPayload, context: UkActionContext): Promise<void> => {
    for (const [key, value] of Object.entries(action.target)) {
      if ((payload as Record<string, unknown>)[key] !== value) throw new UkCommandError(409);
    }
    const request = command(action, payload);
    const path = `/api/v1/cases/${encodeURIComponent(context.caseId)}/${request.path}`;
    const slot = `${context.contextKey ?? ''}:${path}:${action.code}`;
    let intent = intents.get(slot);
    if (!intent) { intent = new MutationIntent(); intents.set(slot, intent); }
    const resolved = await intent.resolve({ operation: action.code, method: 'POST', path,
      context: context.contextKey ?? '', targets: action.target, payload: request.body,
      ...(request.files ? { files: request.files } : {}) });
    const headers = new Headers({ 'Idempotency-Key': resolved.key });
    let body: BodyInit;
    if (action.code === 'ADD_COMMENT' || request.files?.length) {
      const form = new FormData();
      form.append('payload', JSON.stringify(request.body));
      for (const file of request.files ?? []) form.append('files[]', file);
      body = form;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(request.body);
    }
    const response = await context.authorizedFetch(path, { method: 'POST', headers, body });
    if (!response.ok) {
      const raw: unknown = await response.clone().json().catch(() => null);
      const parsed = ErrorResponseSchema.safeParse(raw);
      if (response.status === 409) intent.close();
      throw new UkCommandError(response.status, parsed.success ? parsed.data.error.code : undefined);
    }
    const raw: unknown = await response.json();
    switch (action.code) {
      case 'ACCEPT_CASE': AcceptCaseSuccessSchema.parse(raw); break;
      case 'SELECT_CONTRACTOR': SelectContractorSuccessSchema.parse(raw); break;
      case 'SEND_ASSIGNMENT': SendAssignmentSuccessSchema.parse(raw); break;
      case 'REQUEST_CLARIFICATION': RequestClarificationSuccessSchema.parse(raw); break;
      case 'RETURN_TO_REWORK': ReturnToReworkSuccessSchema.parse(raw); break;
      case 'RECORD_NO_RESIDENT_FEEDBACK': RecordNoResidentFeedbackSuccessSchema.parse(raw); break;
      case 'COMPLETE_CASE': CompleteCaseSuccessSchema.parse(raw); break;
      case 'COMPLETE_WITH_EXPLANATION': CompleteWithExplanationSuccessSchema.parse(raw); break;
      case 'ADD_COMMENT': AddCommentSuccessSchema.parse(raw); break;
      default: throw new Error(`Unsupported UK action: ${action.code}`);
    }
    intent.close();
  };
}
