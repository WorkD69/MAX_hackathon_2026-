import { createHash } from 'node:crypto';
import type { NotificationDiagnostics } from './worker.js';
import type { NotificationStore, RedriveResult } from './store.js';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function redriveNotificationIntent(options: {
  store: NotificationStore;
  notificationIntentId: string;
  operatorContext: string;
  diagnostics: NotificationDiagnostics;
  now?: Date;
}): Promise<RedriveResult> {
  if (!uuid.test(options.notificationIntentId)) throw new Error('INVALID_NOTIFICATION_INTENT_ID');
  const operatorContext = options.operatorContext.trim();
  if (operatorContext.length < 3 || operatorContext.length > 256) throw new Error('INVALID_OPERATOR_CONTEXT');
  const result = await options.store.redrive(options.notificationIntentId, options.now ?? new Date());
  if (!result) throw new Error('NOTIFICATION_INTENT_NOT_REDRIVABLE');
  options.diagnostics.info('notification_intent_redriven', {
    notification_intent_id: result.intent.notification_intent_id,
    operator_context_sha256: createHash('sha256').update(operatorContext, 'utf8').digest('hex'),
    previous_attempt_count: result.previousAttemptCount,
    operational_redrive_count: result.intent.operational_redrive_count,
  });
  return result;
}
