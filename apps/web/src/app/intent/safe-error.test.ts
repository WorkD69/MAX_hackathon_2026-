import { expect, test } from 'vitest';
import { safeMutationErrorText } from './safe-error.js';

test('known canonical code uses fixed copy and unknown code shows only request ID', () => {
  expect(safeMutationErrorText('RESULT_MATERIAL_INVALID')).toBe('Выбранный материал не подходит для результата.');
  const text = safeMutationErrorText('UNKNOWN', '11111111-1111-4111-8111-111111111111');
  expect(text).toContain('11111111-1111-4111-8111-111111111111');
  expect(text).not.toContain('UNKNOWN');
});
