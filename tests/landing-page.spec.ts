import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should display the landing page correctly', async ({ page }) => {
    await page.goto('/');
    
    // Verify main heading
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
    
    // Verify subtitle
    await expect(page.locator('text=Master Portuguese vocabulary')).toBeVisible();
    
    // Verify all three challenge buttons are visible
    await expect(page.getByRole('button', { name: 'Word Challenge' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verb Challenge' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Idiom Challenge' })).toBeVisible();
  });

  test('should have all challenge buttons clickable', async ({ page }) => {
    await page.goto('/');
    
    // Test Word Challenge button
    const wordButton = page.getByRole('button', { name: 'Word Challenge' });
    await expect(wordButton).toBeEnabled();
    
    // Test Verb Challenge button
    const verbButton = page.getByRole('button', { name: 'Verb Challenge' });
    await expect(verbButton).toBeEnabled();
    
    // Test Idiom Challenge button
    const idiomButton = page.getByRole('button', { name: 'Idiom Challenge' });
    await expect(idiomButton).toBeEnabled();
  });

  test('should navigate between different challenges', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to Word Challenge
    await page.getByRole('button', { name: 'Word Challenge' }).click();
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary Challenge');
    await page.getByRole('button', { name: 'Back to Home' }).click();
    
    // Navigate to Verb Challenge
    await page.getByRole('button', { name: 'Verb Challenge' }).click();
    await expect(page.locator('h1')).toContainText('Portuguese Verb Challenge');
    await page.getByRole('button', { name: 'Back to Home' }).click();
    
    // Navigate to Idiom Challenge
    await page.getByRole('button', { name: 'Idiom Challenge' }).click();
    await expect(page.locator('h1')).toContainText('Portuguese Idiom Challenge');
    await page.getByRole('button', { name: 'Back to Home' }).click();
    
    // Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
  });
});
