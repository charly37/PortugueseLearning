import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'html' : 'list',
  timeout: 5 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    actionTimeout: 5 * 1000,
    navigationTimeout: 5 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'NODE_ENV=test npm run test:server',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
