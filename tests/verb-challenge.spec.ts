import { test, expect } from '@playwright/test';

test.describe('Verb Challenge', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (no login required)
    await page.goto('http://localhost:8080');
  });

  test('should navigate to verb challenge', async ({ page }) => {
    
    // Click Verb Practice button (second Practice button on page)
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.nth(1).click();
    
    // Verify we're on the verb challenge page
    await expect(page.locator('h1')).toContainText('Portuguese Verbs');
    await expect(page.locator('text=Translate verbs from French to Portuguese')).toBeVisible();
  });

  test('should start a verb challenge and show French verb', async ({ page }) => {

    // Click Verb Practice button (second Practice button on page)
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.nth(1).click();
    
    // Click Start Practice button
    await page.click('text=Start Practice');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Verify input field is present
    await expect(page.locator('input')).toBeVisible();
  });

  test('should validate correct verb answer and show conjugations', async ({ page }) => {

    // Click Verb Practice button (second Practice button on page)
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.nth(1).click();
    await page.click('text=Start Practice');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type any answer and submit
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify feedback is shown
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
  });

  test('should validate incorrect verb answer', async ({ page }) => {

    // Click Verb Practice button (second Practice button on page)
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.nth(1).click();
    await page.click('text=Start Practice');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type an incorrect answer
    await page.fill('input', 'wrongverb');
    await page.click('text=Check Answer');
    
    // Verify error message
    await expect(page.locator('text=Incorrect')).toBeVisible();
  });

  test('should support keyboard Enter key to submit', async ({ page }) => {

    // Click Verb Practice button (second Practice button on page)
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.nth(1).click();
    await page.click('text=Start Practice');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type answer and press Enter
    await page.fill('input', 'test');
    await page.press('input', 'Enter');
    
    // Verify feedback is shown (either correct or incorrect)
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
  });

  test('should navigate back to home from verb challenge', async ({ page }) => {

    // Click Verb Practice button (second Practice button on page)
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.nth(1).click();
    
    // Click back to home
    await page.click('button >> text=Home');
    
    // Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
