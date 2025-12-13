import { test, expect } from '@playwright/test';

test.describe('Idiom Challenge', () => {
  test('should navigate to idiom challenge', async ({ page }) => {
    await page.goto('/');
    
    // Click Idiom Challenge button
    await page.getByRole('button', { name: 'Idiom Challenge' }).click();
    
    // Verify we're on the idiom challenge page
    await expect(page.locator('h1')).toContainText('Portuguese Idiom Challenge');
    await expect(page.locator('text=Translate idioms from French to Portuguese')).toBeVisible();
  });



  test('should start challenge and allow answer submission', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Idiom Challenge' }).click();
    
    // Use getByRole for more reliable button selection
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type any answer and submit
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify feedback is shown
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
  });

  test('should validate incorrect idiom answer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Idiom Challenge' }).click();
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Type an incorrect answer
    await page.fill('input', 'wrongidiom');
    await page.click('text=Check Answer');
    
    // Verify error message
    await expect(page.locator('text=Incorrect')).toBeVisible();
    await expect(page.locator('text=The correct answer is')).toBeVisible();
  });

  test('should disable input after checking answer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Idiom Challenge' }).click();
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    
    // Wait for challenge and answer it
    await expect(page.locator('text=Français')).toBeVisible();
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify input is disabled
    await expect(page.locator('input')).toBeDisabled();
  });

  test('should load next idiom challenge', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Idiom Challenge' }).click();
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    
    // Wait for challenge and answer it
    await expect(page.locator('text=Français')).toBeVisible();
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Click next challenge
    await page.click('text=Next Challenge');
    
    // Verify new challenge loaded
    await expect(page.locator('input')).toBeEnabled();
    const inputValue = await page.inputValue('input');
    expect(inputValue).toBe('');
  });

  test('should navigate back to home from idiom challenge', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Idiom Challenge' }).click();
    
    // Click back to home using button selector
    await page.getByRole('button', { name: /Back to Home/i }).click();
    
    // Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
  });
});
