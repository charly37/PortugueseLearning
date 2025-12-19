import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (no login required)
    await page.goto('http://localhost:8080');
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
