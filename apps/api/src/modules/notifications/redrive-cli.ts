import { Pool } from 'pg';
import { loadConfig } from '../../config/load-config.js';
import { redriveNotificationIntent } from './redrive-command.js';
import { PostgresNotificationStore } from './store.js';
import type { NotificationDiagnostics } from './worker.js';

/** Team-only operational entry point: node dist/modules/notifications/redrive-cli.js <intent UUID> <operator context>. */
async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 2) throw new Error('REDRIVE_USAGE_INVALID');
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const diagnostics: NotificationDiagnostics = {
    info: (event, fields) => { process.stdout.write(`${JSON.stringify({ event, ...fields })}\n`); },
    error: (event, fields) => { process.stderr.write(`${JSON.stringify({ event, ...fields })}\n`); },
  };
  try {
    await redriveNotificationIntent({
      store: new PostgresNotificationStore(pool),
      notificationIntentId: args[0]!,
      operatorContext: args[1]!,
      diagnostics,
    });
  } finally {
    await pool.end();
  }
}

void main(process.argv.slice(2)).catch(error => {
  const safeCode = error instanceof Error && [
    'REDRIVE_USAGE_INVALID', 'INVALID_NOTIFICATION_INTENT_ID', 'INVALID_OPERATOR_CONTEXT',
    'NOTIFICATION_INTENT_NOT_REDRIVABLE',
  ].includes(error.message) ? error.message : 'REDRIVE_FAILED';
  process.stderr.write(`${JSON.stringify({ event: 'notification_redrive_failed', error_code: safeCode })}\n`);
  process.exitCode = 1;
});
