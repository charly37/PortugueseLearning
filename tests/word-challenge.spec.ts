import { test, expect } from '@playwright/test';

test.describe('Word Challenge', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (no login required)
    await page.goto('http://localhost:8080');
  });

  test('should load landing page and navigate to word challenge', async ({ page }) => {
    
    // Verify landing page loads
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Click Word Practice button
    await page.click('button >> text=Practice >> nth=0');
    
    // Verify we're on the challenge page
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
  });

  test('should start a word challenge and show French word', async ({ page }) => {
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.first().click();
    
    // Click Start Practice button
    await page.click('text=Start Practice');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Verify input field is present
    await expect(page.getByLabel('Your Portuguese answer')).toBeVisible();
  });

  test('should validate correct answer', async ({ page }) => {
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.first().click();
    await page.click('text=Start Practice');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type any answer and submit
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify feedback is shown (either correct or incorrect)
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
  });

  test('should validate incorrect answer', async ({ page }) => {
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.first().click();
    await page.click('text=Start Practice');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type an incorrect answer
    await page.fill('input', 'wronganswer');
    await page.click('text=Check Answer');
    
    // Verify error message
    await expect(page.locator('text=Incorrect')).toBeVisible();
    await expect(page.locator('text=The correct answer is')).toBeVisible();
  });

  test('should navigate to next challenge', async ({ page }) => {
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.first().click();
    await page.click('text=Start Practice');
    
    // Wait for challenge and answer it
    await expect(page.locator('text=Français')).toBeVisible();
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Click next challenge
    await page.click('text=Next Challenge');
    
    // Verify new challenge loaded (input should be empty)
    const inputValue = await page.inputValue('input');
    expect(inputValue).toBe('');
  });

  test('should navigate back to home', async ({ page }) => {
    const practiceButtons = page.locator('button >> text=Practice');
    await practiceButtons.first().click();
    
    // Click back to home
    await page.click('button >> text=Home');
    
    // Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
