import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test-integration/**/*.test.ts', 'tests/**/*.test.ts'],
    // Real PostgreSQL setup/cleanup competes for disk I/O on local Windows hosts.
    maxWorkers: 2,
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
