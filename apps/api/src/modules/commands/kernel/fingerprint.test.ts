import { describe, expect, it } from 'vitest';
import { canonicalizeCommandPayload, createCommandFingerprint } from './fingerprint.js';

const base = {
  method: 'post',
  path: '/api/v1/cases/case-1/comments',
  commandType: 'ADD_COMMENT',
  normalizedPayload: { body: 'text', clarification_request_id: null },
};

describe('TG-012 canonical command fingerprint', () => {
  it('normalizes object key order while preserving semantic array order', () => {
    expect(canonicalizeCommandPayload({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(canonicalizeCommandPayload({ a: { c: 3, d: 4 }, b: 2 }));
    expect(canonicalizeCommandPayload({ items: ['a', 'b'] }))
      .not.toBe(canonicalizeCommandPayload({ items: ['b', 'a'] }));
  });

  it('hashes file bytes and ignores transport-only multipart variation', () => {
    const logical = [{ field: 'files', fileName: 'proof.jpg', mimeType: 'image/jpeg', bytes: Buffer.from('same') }];
    const first = createCommandFingerprint({ ...base, files: logical });
    const otherBoundaryAndHeaders = createCommandFingerprint({ ...base, files: logical });
    const changedBytes = createCommandFingerprint({ ...base, files: [{ ...logical[0]!, bytes: Buffer.from('diff') }] });
    expect(first).toBe(otherBoundaryAndHeaders);
    expect(changedBytes).not.toBe(first);
  });

  it('binds method, canonical path, command type and normalized payload', () => {
    const fingerprint = createCommandFingerprint(base);
    expect(createCommandFingerprint({ ...base, normalizedPayload: { ...base.normalizedPayload, body: 'changed' } })).not.toBe(fingerprint);
    expect(createCommandFingerprint({ ...base, path: '/api/v1/cases/case-2/comments' })).not.toBe(fingerprint);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
