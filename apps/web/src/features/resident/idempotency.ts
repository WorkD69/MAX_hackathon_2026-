import type { CreateCasePayloadOutput } from '@max-smart-city/contracts';

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export async function fingerprintPayload(payload: CreateCasePayloadOutput): Promise<string> {
  return sha256Hex(encoder.encode(canonicalJson(payload)));
}

export interface FingerprintedFile {
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** Stable logical order keeps the fingerprint independent from multipart boundary ordering. */
function logicalOrder(files: readonly FingerprintedFile[]): readonly FingerprintedFile[] {
  return [...files].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

export async function fingerprintCreateCase(
  payload: CreateCasePayloadOutput,
  files: readonly FingerprintedFile[],
): Promise<string> {
  const parts: string[] = [await fingerprintPayload(payload)];
  for (const file of logicalOrder(files)) {
    const digest = await sha256Hex(file.bytes);
    parts.push(`${file.name}:${file.bytes.byteLength}:${digest}`);
  }
  return sha256Hex(encoder.encode(parts.join('|')));
}

export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Interface Contracts §5: same principal + same key + same fingerprint replays as canonical
 * stored success, so a retry of one unchanged intent must reuse its key, while a different
 * fingerprint has to get a fresh key instead of silently reusing the previous one.
 */
export class CreateCaseIdempotency {
  private key: string | null = null;
  private fingerprint: string | null = null;

  resolve(fingerprint: string): string {
    if (this.fingerprint === fingerprint && this.key !== null) return this.key;
    this.fingerprint = fingerprint;
    this.key = newIdempotencyKey();
    return this.key;
  }

  get currentFingerprint(): string | null {
    return this.fingerprint;
  }
}
