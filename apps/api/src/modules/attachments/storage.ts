import { createHash, randomUUID } from 'node:crypto';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import type { DatabaseTransaction } from '@max-smart-city/db';
import type { LogicalMultipartFile } from '../commands/kernel/fingerprint.js';
import { IntakeError } from '../cases/commands/intake-assignment/options.js';

// Keep the FILE allowance narrow; PHOTO bytes must survive a real image decode.
const allowedMimes = new Set(['image/jpeg', 'image/png', 'application/pdf', 'text/plain']);
function validContent(mime: string, bytes: Buffer): boolean {
  try {
    if (mime === 'image/png') {
      if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
        bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13 ||
        !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) return false;
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if (!width || !height || width * height > 20_000_000) return false;
      const image = PNG.sync.read(bytes, { checkCRC: true });
      return image.width === width && image.height === height;
    }
    if (mime === 'image/jpeg') {
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
      const image = jpeg.decode(bytes, { tolerantDecoding: false, maxResolutionInMP: 20,
        maxMemoryUsageInMB: 160, formatAsRGBA: false });
      return image.width > 0 && image.height > 0 && image.width * image.height <= 20_000_000;
    }
    if (mime === 'application/pdf')
      return bytes.subarray(0, 5).toString('ascii') === '%PDF-' &&
        bytes.subarray(-1024).toString('latin1').includes('%%EOF');
    if (mime === 'text/plain') {
      if (bytes.subarray(0, 2).toString('ascii') === 'MZ' ||
        bytes.subarray(0, 4).equals(Buffer.from('7f454c46', 'hex'))) return false;
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content);
    }
  } catch { return false; }
  return false;
}
export function validateFiles(files: readonly LogicalMultipartFile[]) {
  if (files.length>10) throw new IntakeError('VALIDATION_FAILED',422);
  for (const file of files) {
    if (!file.fileName.trim() || file.fileName.length>255 || /[\r\n\0]/.test(file.fileName) ||
      !allowedMimes.has(file.mimeType.toLowerCase()) || file.bytes.byteLength===0 || file.bytes.byteLength>10*1024*1024 ||
      !validContent(file.mimeType.toLowerCase(), Buffer.from(file.bytes)))
      throw new IntakeError('VALIDATION_FAILED',422);
  }
}
export async function storeFiles(tx: DatabaseTransaction, caseId: string, userId: string,
  files: readonly LogicalMultipartFile[], now: Date): Promise<string[]> {
  validateFiles(files); const ids: string[]=[];
  for (const file of files) {
    const id=randomUUID(); ids.push(id);
    await tx.insertInto('attachment').values({attachment_id:id,case_id:caseId,uploaded_by_user_id:userId,
      file_name:file.fileName.split(/[\\/]/).pop()!,mime_type:file.mimeType.toLowerCase(),byte_size:file.bytes.byteLength,
      sha256:createHash('sha256').update(file.bytes).digest('hex'),content:Buffer.from(file.bytes),created_at:now}).execute();
  }
  return ids;
}
