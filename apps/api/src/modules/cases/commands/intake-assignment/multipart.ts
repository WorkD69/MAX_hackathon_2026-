import type { LogicalMultipartFile } from '../../../commands/kernel/fingerprint.js';
import { IntakeError } from './options.js';

export interface IntakeMultipart {
  readonly payload: unknown;
  readonly files: readonly LogicalMultipartFile[];
}

/** Parse the bounded CreateCase form without relying on an undeclared transport package. */
export function parseIntakeMultipart(contentType: string, body: Buffer): IntakeMultipart {
  const match = /(?:^|;)\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=?-]{1,70})"|([A-Za-z0-9'()+_,.\/:=?-]{1,70}))(?:;|$)/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || body.length > 25 * 1024 * 1024) throw new IntakeError('VALIDATION_FAILED', 400);
  const marker = Buffer.from(`--${boundary}`);
  const nextMarker = Buffer.from(`\r\n--${boundary}`);
  const headerEnd = Buffer.from('\r\n\r\n');
  if (!body.subarray(0, marker.length).equals(marker)) throw new IntakeError('VALIDATION_FAILED', 400);
  let offset = marker.length;
  let payload: unknown;
  let hasPayload = false;
  const files: LogicalMultipartFile[] = [];
  while (offset < body.length) {
    if (body.subarray(offset, offset + 2).toString('ascii') === '--') {
      if (body.subarray(offset + 2).toString('ascii') !== '\r\n' && offset + 2 !== body.length) {
        throw new IntakeError('VALIDATION_FAILED', 400);
      }
      if (!hasPayload) throw new IntakeError('VALIDATION_FAILED', 400);
      return { payload, files };
    }
    if (body.subarray(offset, offset + 2).toString('ascii') !== '\r\n') throw new IntakeError('VALIDATION_FAILED', 400);
    offset += 2;
    const headerIndex = body.indexOf(headerEnd, offset);
    if (headerIndex < 0 || headerIndex - offset > 8192) throw new IntakeError('VALIDATION_FAILED', 400);
    const headerText = body.subarray(offset, headerIndex).toString('utf8');
    const disposition = headerText.split('\r\n').find(line => /^content-disposition:/i.test(line));
    const name = /(?:^|;)\s*name="([^"]+)"/i.exec(disposition ?? '')?.[1];
    const fileName = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition ?? '')?.[1];
    const mimeType = /^content-type:\s*([^\r\n]+)/im.exec(headerText)?.[1]?.trim() ?? 'application/octet-stream';
    offset = headerIndex + headerEnd.length;
    const next = body.indexOf(nextMarker, offset);
    if (next < 0) throw new IntakeError('VALIDATION_FAILED', 400);
    const bytes = body.subarray(offset, next);
    if (name === 'payload' && fileName === undefined && !hasPayload) {
      if (bytes.length > 64 * 1024) throw new IntakeError('VALIDATION_FAILED', 400);
      try { payload = JSON.parse(bytes.toString('utf8')); }
      catch { throw new IntakeError('VALIDATION_FAILED', 400); }
      hasPayload = true;
    } else if (name === 'files[]' && fileName !== undefined && fileName.length > 0) {
      if (files.length >= 10 || bytes.length > 10 * 1024 * 1024 || fileName.length > 255 || mimeType.length > 255) {
        throw new IntakeError('VALIDATION_FAILED', 400);
      }
      files.push({ field: 'files[]', fileName, mimeType, bytes });
    } else throw new IntakeError('VALIDATION_FAILED', 400);
    offset = next + 2 + marker.length;
  }
  throw new IntakeError('VALIDATION_FAILED', 400);
}
