import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { RuntimeConfig } from '../../config/types.js';
import { MaxAdapterError } from '../../modules/max-adapter/errors.js';
import type { MaxAdapter } from '../../modules/max-adapter/types.js';

export type AsyncScheduler = (task: () => void) => void;

function secretMatches(expected: string, supplied: string | undefined): boolean {
  if (supplied === undefined) return false;
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  const suppliedDigest = createHash('sha256').update(supplied, 'utf8').digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

export function createMaxWebhookPlugin(options: {
  config: RuntimeConfig;
  adapter: MaxAdapter;
  schedule?: AsyncScheduler;
}): FastifyPluginAsync {
  const { config, adapter } = options;
  if (!config.MAX_WEBHOOK_SECRET) throw new Error('MAX_WEBHOOK_SECRET_REQUIRED');
  const expectedSecret = config.MAX_WEBHOOK_SECRET;
  const schedule = options.schedule ?? (task => { setImmediate(task); });

  return async function maxWebhookPlugin(app): Promise<void> {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
      done(null, body);
    });
    app.addHook('onRequest', async (request, reply) => {
      if (request.method !== 'POST' || request.url.split('?')[0] !== '/integrations/max/webhook') return;
      const raw = request.headers['x-max-bot-api-secret'];
      const supplied = Array.isArray(raw) ? undefined : raw;
      if (!secretMatches(expectedSecret, supplied)) {
        await reply.code(401).send({ error: 'MAX_WEBHOOK_UNAUTHORIZED' });
      }
    });

    app.post('/integrations/max/webhook', async (request, reply) => {
      const update = adapter.parseUpdate(request.body);
      await reply.code(200).send();
      if (update.kind !== 'bot_started') return;
      schedule(() => {
        void adapter.sendMessage(update.chatId, {
          text: 'Откройте мини-приложение «Умный город»',
          openAppAction: { type: 'open_app', text: 'Открыть приложение' },
        }).catch(error => {
          request.log.error({
            event: 'max_webhook_greeting_failed',
            error_code: error instanceof MaxAdapterError ? error.safeCode : 'MAX_GREETING_FAILED',
          });
        });
      });
    });
  };
}
