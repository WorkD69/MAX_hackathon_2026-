import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test-integration/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
