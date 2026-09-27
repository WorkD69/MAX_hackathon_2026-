import { expect, test } from 'vitest';
import { MutationIntent } from './mutation-intent.js';

const base = { operation: 'AddComment', method: 'POST', path: '/api/v1/cases/1/comments',
  context: 'actor:run:1', targets: { case_id: '1' }, payload: { body: 'Течь' } };

test('one unchanged intent retains its key after uncertain network and 5xx outcomes', async () => {
  const intent = new MutationIntent();
  const [first, concurrent] = await Promise.all([intent.resolve(base), intent.resolve(base)]);
  expect(concurrent.key).toBe(first.key);
  expect((await intent.resolve(base)).key).toBe(first.key);
  expect(intent.current?.key).toBe(first.key);
});

test('payload, exact target, and actor or run change create new keys', async () => {
  const intent = new MutationIntent();
  const first = await intent.resolve(base);
  const text = await intent.resolve({ ...base, payload: { body: 'Другая течь' } });
  const target = await intent.resolve({ ...base, targets: { case_id: '2' } });
  const context = await intent.resolve({ ...base, context: 'actor:run:2' });
  expect(new Set([first.key, text.key, target.key, context.key]).size).toBe(4);
});

test('same file bytes retain the key and changed bytes create a new intent', async () => {
  const intent = new MutationIntent();
  const first = await intent.resolve({ ...base, files: [new File(['a'], 'proof.txt')] });
  expect((await intent.resolve({ ...base, files: [new File(['a'], 'proof.txt')] })).key).toBe(first.key);
  expect((await intent.resolve({ ...base, files: [new File(['b'], 'proof.txt')] })).key).not.toBe(first.key);
});

test('confirmed success or stale refetch closes the old key', async () => {
  const intent = new MutationIntent();
  const first = await intent.resolve(base);
  intent.close();
  expect(intent.current).toBeNull();
  expect((await intent.resolve(base)).key).not.toBe(first.key);
});
