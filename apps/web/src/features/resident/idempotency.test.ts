import { expect, test } from 'vitest';
import {
  CreateCaseIdempotency, fingerprintCreateCase, fingerprintPayload, newIdempotencyKey, sha256Hex,
} from './idempotency.js';

const encoder = new TextEncoder();
const payload = { premises_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', category_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', description: 'Не греет стояк' };
const file = (name: string, text: string) => ({ name, bytes: encoder.encode(text) });

test('fingerprint is stable for the same payload regardless of key order', async () => {
  const first = await fingerprintPayload({ premises_id: payload.premises_id, category_id: payload.category_id, description: payload.description });
  const second = await fingerprintPayload({ description: payload.description, category_id: payload.category_id, premises_id: payload.premises_id });
  expect(first).toBe(second);
});

test('fingerprint changes when the payload changes', async () => {
  const base = await fingerprintPayload(payload);
  const changed = await fingerprintPayload({ ...payload, description: 'Другое описание' });
  expect(base).not.toBe(changed);
});

test('multipart fingerprint includes SHA-256 of every file in stable logical order', async () => {
  const a = file('a.jpg', 'alpha');
  const b = file('b.jpg', 'beta');
  const forward = await fingerprintCreateCase(payload, [a, b]);
  const reversed = await fingerprintCreateCase(payload, [b, a]);
  expect(forward).toBe(reversed);

  const differentBytes = await fingerprintCreateCase(payload, [a, file('b.jpg', 'beta-changed')]);
  expect(forward).not.toBe(differentBytes);

  const extraFile = await fingerprintCreateCase(payload, [a, b, file('c.jpg', 'gamma')]);
  expect(forward).not.toBe(extraFile);
});

test('sha256Hex matches the known digest of an empty input', async () => {
  expect(await sha256Hex(new Uint8Array([]))).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('same key replays for the same fingerprint and rotates for a different fingerprint', () => {
  const ring = new CreateCaseIdempotency();
  const first = ring.resolve('fingerprint-a');
  expect(ring.resolve('fingerprint-a')).toBe(first);
  expect(ring.resolve('fingerprint-b')).not.toBe(first);
  expect(ring.currentFingerprint).toBe('fingerprint-b');
});

test('generated keys are distinct uuid values', () => {
  const keys = new Set(Array.from({ length: 25 }, () => newIdempotencyKey()));
  expect(keys.size).toBe(25);
  for (const key of keys) {
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }
});
