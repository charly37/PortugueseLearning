import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'html' : 'list',
  timeout: 20 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  // In CI, only run tests tagged with @smoke
  grep: process.env.CI ? /@smoke/ : undefined,
  
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    actionTimeout: 10 * 1000,
    navigationTimeout: 15 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        locale: 'en-US',
      },
    },
    {
      name: 'pixel-7',
      use: { 
        ...devices['Pixel 7'],
        locale: 'en-US',
      },
    },
  ],

  webServer: {
    command: 'NODE_ENV=test npm run test:server',
    url: 'http://localhost:8080',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
