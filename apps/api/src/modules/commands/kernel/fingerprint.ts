import { createHash } from 'node:crypto';

export interface LogicalMultipartFile {
  readonly field: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly metadata?: unknown;
}

export interface CommandFingerprintInput {
  readonly method: string;
  readonly path: string;
  readonly commandType: string;
  readonly normalizedPayload: unknown;
  readonly files?: readonly LogicalMultipartFile[];
}

const canonicalJson = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('FINGERPRINT_NON_FINITE_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  throw new TypeError('FINGERPRINT_UNSUPPORTED_VALUE');
};

export const canonicalizeCommandPayload = (payload: unknown): string => canonicalJson(payload);

/** Transport multipart boundaries and header order never enter this logical representation. */
export function createCommandFingerprint(input: CommandFingerprintInput): string {
  const files = (input.files ?? []).map((file, logicalIndex) => ({
    logicalIndex,
    field: file.field,
    fileName: file.fileName,
    mimeType: file.mimeType,
    metadata: file.metadata ?? null,
    byteLength: file.bytes.byteLength,
    sha256: createHash('sha256').update(file.bytes).digest('hex'),
  }));
  const canonical = canonicalJson({
    method: input.method.toUpperCase(),
    path: input.path,
    commandType: input.commandType,
    payload: input.normalizedPayload,
    files,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
