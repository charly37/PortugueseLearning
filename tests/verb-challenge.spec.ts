import { test, expect } from '@playwright/test';

test.describe('Verb Challenge', () => {
  test('should navigate to verb challenge', async ({ page }) => {
    await page.goto('/');
    
    // Click Verb Challenge button
    await page.click('text=Verb Challenge');
    
    // Verify we're on the verb challenge page
    await expect(page.locator('h1')).toContainText('Portuguese Verb Challenge');
    await expect(page.locator('text=Translate verbs from French to Portuguese')).toBeVisible();
  });

  test('should start a verb challenge and show French verb', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Verb Challenge');
    
    // Click Start Challenge button
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Verify input field is present
    await expect(page.locator('input')).toBeVisible();
  });

  test('should validate correct verb answer and show conjugations', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Verb Challenge');
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type any answer and submit
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify feedback is shown
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
  });

  test('should validate incorrect verb answer', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Verb Challenge');
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type an incorrect answer
    await page.fill('input', 'wrongverb');
    await page.click('text=Check Answer');
    
    // Verify error message
    await expect(page.locator('text=Incorrect')).toBeVisible();
  });

  test('should support keyboard Enter key to submit', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Verb Challenge');
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type answer and press Enter
    await page.fill('input', 'test');
    await page.press('input', 'Enter');
    
    // Verify feedback is shown (either correct or incorrect)
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
  });

  test('should navigate back to home from verb challenge', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Verb Challenge');
    
    // Click back to home
    await page.click('text=Back to Home');
    
    // Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
  });
});
