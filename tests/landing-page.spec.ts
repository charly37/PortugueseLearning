import { test, expect } from '@playwright/test';
import { registerAndLogin, login } from './helpers/auth-helper';

test.describe('Landing Page', () => {
  let testUser: { username: string; email: string; password: string };

  test.beforeAll(async ({ browser }) => {
    // Create one user for all tests in this suite
    testUser = {
      username: `landingtest_${Date.now()}`,
      email: `landingtest_${Date.now()}@example.com`,
      password: 'testpassword123'
    };

    // Register the user once
    const page = await browser.newPage();
    await registerAndLogin(page, testUser.username, testUser.email, testUser.password);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    // Login with the existing user before each test
    await login(page, testUser.email, testUser.password);
  });

  test('should display the landing page correctly', async ({ page }) => {
    // Verify main heading with personalized greeting
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Verify subtitle
    await expect(page.locator('text=Master Portuguese')).toBeVisible();
    
    // Verify all three challenge buttons are visible
    await expect(page.getByRole('button', { name: 'Start Learning' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Practice Verbs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Learn Idioms' })).toBeVisible();
  });

  test('should have all challenge buttons clickable', async ({ page }) => {
    // Test Word Challenge button
    const wordButton = page.getByRole('button', { name: 'Start Learning' });
    await expect(wordButton).toBeEnabled();
    
    // Test Verb Challenge button
    const verbButton = page.getByRole('button', { name: 'Practice Verbs' });
    await expect(verbButton).toBeEnabled();
    
    // Test Idiom Challenge button
    const idiomButton = page.getByRole('button', { name: 'Learn Idioms' });
    await expect(idiomButton).toBeEnabled();
  });

  test('should navigate between different challenges', async ({ page }) => {
    // Navigate to Word Challenge
    await page.getByRole('button', { name: 'Start Learning' }).click();
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
    await page.getByRole('button', { name: 'Home' }).click();
    
    // Navigate to Verb Challenge
    await page.getByRole('button', { name: 'Practice Verbs' }).click();
    await expect(page.locator('h1')).toContainText('Portuguese Verbs');
    await page.getByRole('button', { name: 'Home' }).click();
    
    // Navigate to Idiom Challenge
    await page.getByRole('button', { name: 'Learn Idioms' }).click();
    await expect(page.locator('h1')).toContainText('Portuguese Idioms');
    await page.getByRole('button', { name: 'Home' }).click();
    
    // Verify we're back on landing page with personalized greeting
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
