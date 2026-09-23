import { z } from 'zod';
import { NonEmptyStringSchema } from './primitives.js';

export const AuthMaxRequestSchema = z.strictObject({ init_data: NonEmptyStringSchema });
export const WebhookHeadersSchema = z.strictObject({
  'x-max-bot-api-secret': NonEmptyStringSchema,
});
export const WebhookOpaqueBodySchema = z.unknown();
export const WebhookAckSchema = z.void();
