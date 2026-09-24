import { z } from 'zod';
import { UuidSchema, UtcTimestampSchema, NonNegativeIntegerSchema, NonEmptyStringSchema } from './primitives.js';

export const AttachmentPathSchema = z.strictObject({ attachmentId: UuidSchema });
// Transport part count only; binary contents are handled by the multipart owner.
export const AddResultMaterialFilePartsSchema = z.tuple([
  z.unknown().refine((part) => part !== null && part !== undefined),
]);
export const AttachmentMetadataSchema = z.strictObject({
  attachment_id: UuidSchema,
  file_name: z.string(),
  mime_type: z.string(),
  byte_size: NonNegativeIntegerSchema,
});
export const DownloadCapabilityResponseSchema = z.strictObject({
  download_url: z.url({ protocol: /^https$/ }),
  file_name: NonEmptyStringSchema,
  expires_at: UtcTimestampSchema,
});
