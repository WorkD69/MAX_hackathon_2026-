import { z } from 'zod';
import { canonicalInteger, IdentityJsonError, parseIdentityObject } from '../auth/lossless-json.js';
import type { ParsedMaxUpdate } from './types.js';

const knownTypes = new Set([
  'bot_added', 'bot_started', 'bot_stopped', 'bot_removed', 'chat_title_changed',
  'dialog_cleared', 'dialog_muted', 'dialog_unmuted', 'dialog_removed',
  'message_callback', 'message_created', 'message_edited', 'message_removed',
  'user_added', 'user_removed',
]);

const baseUpdate = z.object({
  update_type: z.string(),
  timestamp: z.number().int(),
}).passthrough();

const botStarted = baseUpdate.extend({
  update_type: z.literal('bot_started'),
  chat_id: z.union([z.number().int(), z.string().regex(/^-?(?:0|[1-9][0-9]*)$/)]),
  user: z.object({ user_id: z.union([z.number().int(), z.string()]) }).passthrough(),
}).passthrough();

export function parseMaxUpdate(value: unknown): ParsedMaxUpdate {
  if (typeof value === 'string') {
    try {
      const object = parseIdentityObject(value);
      const updateType = object.get('update_type');
      canonicalInteger(object.get('timestamp'));
      if (typeof updateType !== 'string' || !knownTypes.has(updateType)) return { kind: 'unknown' };
      if (updateType !== 'bot_started') return { kind: 'known_unhandled', updateType };
      const user = object.get('user');
      if (!(user instanceof Map)) return { kind: 'unknown' };
      canonicalInteger(user.get('user_id'));
      return { kind: 'bot_started', chatId: canonicalInteger(object.get('chat_id')) };
    } catch (error) {
      if (error instanceof IdentityJsonError) return { kind: 'unknown' };
      throw error;
    }
  }
  const base = baseUpdate.safeParse(value);
  if (!base.success) return { kind: 'unknown' };
  if (!knownTypes.has(base.data.update_type)) return { kind: 'unknown' };
  if (base.data.update_type !== 'bot_started') {
    return { kind: 'known_unhandled', updateType: base.data.update_type };
  }
  const started = botStarted.safeParse(value);
  if (!started.success) return { kind: 'unknown' };
  return { kind: 'bot_started', chatId: String(started.data.chat_id) };
}
