import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@max-smart-city/db';
import type { LogicalMultipartFile } from '../commands/kernel/fingerprint.js';
import { IntakeError } from '../cases/commands/intake-assignment/options.js';

const allowedMimes = new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
  'application/pdf','text/plain','application/octet-stream','application/zip',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
export function validateFiles(files: readonly LogicalMultipartFile[]) {
  if (files.length>10) throw new IntakeError('VALIDATION_FAILED',422);
  for (const file of files) {
    if (!file.fileName.trim() || file.fileName.length>255 || /[\r\n\0]/.test(file.fileName) ||
      !allowedMimes.has(file.mimeType.toLowerCase()) || file.bytes.byteLength===0 || file.bytes.byteLength>10*1024*1024)
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
