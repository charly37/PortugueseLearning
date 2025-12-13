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
    
    // Get the French verb displayed
    const frenchVerb = await page.locator('.MuiCard-root h4').textContent();
    
    // Map of known correct verb answers
    const verbs: { [key: string]: string } = {
      'être (état définitif)': 'ser',
      'être (état temporaire)': 'estar',
      'avoir': 'ter',
      'faire': 'fazer',
      'aller': 'ir',
    };
    
    const correctAnswer = verbs[frenchVerb?.trim() || ''];
    
    if (correctAnswer) {
      // Type the correct answer
      await page.fill('input', correctAnswer);
      await page.click('text=Check Answer');
      
      // Verify success message
      await expect(page.locator('text=Correct')).toBeVisible();
      
      // Verify conjugation table is shown
      await expect(page.locator('text=Présent de l\'indicatif')).toBeVisible();
      
      // Verify at least one conjugation is visible (e.g., "eu")
      const conjugations = page.locator('li');
      await expect(conjugations.first()).toBeVisible();
    }
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
