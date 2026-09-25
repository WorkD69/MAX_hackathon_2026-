import {
  AddCommentSuccessSchema, CreateCaseSuccessSchema, ResidentCaseSnapshotSchema,
  ResidentConfirmationSuccessSchema, ResidentRemarkSuccessSchema,
  type AddCommentSuccessOutput, type CaseStateOutput, type CreateCaseSuccessOutput,
  type DownloadCapabilityResponseOutput, type ResidentCaseSnapshotOutput,
  type ResidentConfirmationSuccessOutput, type ResidentRemarkSuccessOutput,
  type ResultRequirementOutput,
} from '@max-smart-city/contracts';
import type { CategoryOption, CreateCaseOptions, PremiseOption } from './resident-transport.js';

export const FIXTURE_DATE = '2026-09-25T00:00:00Z';

export const IDS = {
  caseId: '11111111-1111-4111-8111-111111111111',
  resultId: '22222222-2222-4222-8222-222222222222',
  iterationId: '33333333-3333-4333-8333-333333333333',
  feedbackId: '44444444-4444-4444-8444-444444444444',
  commentId: '55555555-5555-4555-8555-555555555555',
  eventResult: '66666666-6666-4666-8666-666666666666',
  eventComment: '77777777-7777-4777-8777-777777777777',
  attachmentId: '88888888-8888-4888-8888-888888888888',
  commandId: '99999999-9999-4999-8999-999999999999',
  categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  inactiveCategoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  premisesId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  inactivePremisesId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  contractorId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
} as const;

export const categoryFixture: CategoryOption = {
  categoryId: IDS.categoryId, name: 'Отопление / стояк', resultRequirement: 'PHOTO', active: true,
};
export const inactiveCategoryFixture: CategoryOption = {
  categoryId: IDS.inactiveCategoryId, name: 'Архивная категория', resultRequirement: 'NONE', active: false,
};
export const premiseFixture: PremiseOption = {
  premisesId: IDS.premisesId, label: 'Дом 1 · Кв. 2', active: true,
};
export const inactivePremiseFixture: PremiseOption = {
  premisesId: IDS.inactivePremisesId, label: 'Дом 9 · Кв. 9', active: false,
};

export const createCaseOptionsFixture: CreateCaseOptions = {
  categories: [categoryFixture],
  premises: [premiseFixture],
};

export const optionsWithInactiveFixture: CreateCaseOptions = {
  categories: [categoryFixture, inactiveCategoryFixture],
  premises: [premiseFixture, inactivePremiseFixture],
};

interface SnapshotOverrides {
  readonly state?: CaseStateOutput;
  readonly resultRequirement?: ResultRequirementOutput;
  readonly withResult?: boolean;
  readonly feedbackType?: 'CONFIRMATION' | 'REMARK' | null;
  readonly residentFeedback?: boolean;
}

export function residentSnapshot(overrides: SnapshotOverrides = {}): ResidentCaseSnapshotOutput {
  const {
    state = 'AWAITING_RESULT_CHECK', resultRequirement = 'PHOTO', withResult = true,
    feedbackType = null, residentFeedback = false,
  } = overrides;
  const result = withResult ? {
    result_id: IDS.resultId, iteration_id: IDS.iterationId,
    description: 'Стояк заменён', submitted_at: FIXTURE_DATE,
    attachments: [{ attachment_id: IDS.attachmentId, file_name: 'report.jpg', mime_type: 'image/jpeg', byte_size: 2048 }],
  } : null;
  const snapshot = {
    case: {
      case_id: IDS.caseId, display_number: 'C-1001', state, revision: 7,
      created_at: FIXTURE_DATE, updated_at: FIXTURE_DATE, description: 'Не греет стояк',
      location: { house: 'Дом 1', premises: 'Кв. 2' },
      category: { name: 'Отопление / стояк', result_requirement: resultRequirement },
      current_iteration: { iteration_id: IDS.iterationId, number: 2 },
      responsibility: { semantic_code: 'SERVER_NEXT', text: 'Ожидается решение УК' },
      initial_attachments: [],
      selection: null, assignment: null, current_executor: null,
      current_result: result,
      resident_feedback: residentFeedback && feedbackType ? {
        feedback_id: IDS.feedbackId, result_id: IDS.resultId, type: feedbackType,
        remark_text: feedbackType === 'REMARK' ? 'Протечка осталась' : null,
        created_at: FIXTURE_DATE,
      } : null,
      activity: [
        {
          activity_id: IDS.eventComment, event_id: IDS.eventComment, event_seq: 1,
          semantic_code: 'EVT_003', occurred_at: FIXTURE_DATE, iteration_no: 1,
          actor: { role: 'UK_EMPLOYEE', display_name: 'УК' }, text: 'Запрошено уточнение',
          state_transition: null,
          domain: {
            result: null, feedback: null,
            comment: { comment_id: IDS.commentId, body: 'Уточните адрес', created_at: FIXTURE_DATE },
          },
          attachments: [],
        },
        ...(result ? [{
          activity_id: IDS.eventResult, event_id: IDS.eventResult, event_seq: 2,
          semantic_code: 'EVT_009', occurred_at: FIXTURE_DATE, iteration_no: 2,
          actor: { role: 'CONTRACTOR_EMPLOYEE', display_name: 'Мастер' }, text: 'Результат отправлен',
          state_transition: null,
          domain: { result, feedback: null, comment: null },
          attachments: result.attachments,
        }] : []),
      ],
      allowed_actions: [],
    },
  };
  return ResidentCaseSnapshotSchema.parse(snapshot);
}

export function withAllowedActions(
  snapshot: ResidentCaseSnapshotOutput,
  allowedActions: ResidentCaseSnapshotOutput['case']['allowed_actions'],
): ResidentCaseSnapshotOutput {
  return ResidentCaseSnapshotSchema.parse({
    case: { ...snapshot.case, allowed_actions: allowedActions },
  });
}

const successBase = {
  command_id: IDS.commandId, case_id: IDS.caseId, event_ids: [IDS.eventResult],
} as const;

export const createCaseSuccessFixture: CreateCaseSuccessOutput = CreateCaseSuccessSchema.parse({
  ...successBase, state: 'CREATED', revision: 1, created: { iteration_id: IDS.iterationId },
});

export const confirmationSuccessFixture: ResidentConfirmationSuccessOutput = ResidentConfirmationSuccessSchema.parse({
  ...successBase, state: 'AWAITING_RESULT_CHECK', revision: 8, created: { feedback_id: IDS.feedbackId },
});

export const remarkSuccessFixture: ResidentRemarkSuccessOutput = ResidentRemarkSuccessSchema.parse({
  ...successBase, state: 'REMARKS_REVIEW', revision: 8, created: { feedback_id: IDS.feedbackId },
});

export const addCommentSuccessFixture: AddCommentSuccessOutput = AddCommentSuccessSchema.parse({
  ...successBase, state: 'EXECUTION', revision: 8, created: { comment_id: IDS.commentId },
});

export const downloadCapabilityFixture: DownloadCapabilityResponseOutput = {
  download_url: 'https://public-host.example/downloads/opaque-capability-token',
  file_name: 'report.jpg',
  expires_at: '2026-09-25T01:00:00Z',
};
