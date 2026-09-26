import { defineConfig } from '@playwright/test';
import { readE2EProfile } from './e2e-profile.mjs';

const profile = readE2EProfile();

export default defineConfig({
  testDir: '../../tests/e2e',
  testMatch: '**/*.spec.{ts,js,mjs}',
  forbidOnly: true,
  retries: 0,
  fullyParallel: false,
  reporter: 'list',
  metadata: { profile },
  use: {
    baseURL: profile.application_base_url,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'web-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});
