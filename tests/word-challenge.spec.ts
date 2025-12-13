import { test, expect } from '@playwright/test';

test.describe('Word Challenge', () => {
  test('should load landing page and navigate to word challenge', async ({ page }) => {
    await page.goto('/');
    
    // Verify landing page loads
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
    
    // Click Word Challenge button
    await page.click('text=Word Challenge');
    
    // Verify we're on the challenge page
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary Challenge');
  });

  test('should start a word challenge and show French word', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Word Challenge');
    
    // Click Start Challenge button
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Verify input field is present
    await expect(page.getByLabel('Your Portuguese answer')).toBeVisible();
  });

  test('should validate correct answer', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Word Challenge');
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type any answer and submit
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify feedback is shown (either correct or incorrect)
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
  });

  test('should validate incorrect answer', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Word Challenge');
    await page.click('text=Start Challenge');
    
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
    await page.goto('/');
    await page.click('text=Word Challenge');
    await page.click('text=Start Challenge');
    
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
    await page.goto('/');
    await page.click('text=Word Challenge');
    
    // Click back to home
    await page.click('text=Back to Home');
    
    // Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
  });
});
