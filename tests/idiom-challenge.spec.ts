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

  test('should start an idiom challenge and show French idiom', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Idiom Challenge');
    
    // Click Start Challenge button
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Verify input field is present
    await expect(page.locator('input')).toBeVisible();
  });

  test('should validate correct idiom answer', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Idiom Challenge');
    await page.click('text=Start Challenge');
    
    // Wait for challenge to load
    await expect(page.locator('text=Français')).toBeVisible();
    
    // Get the French idiom displayed
    const frenchIdiom = await page.locator('text=Français').locator('..').locator('h5').textContent();
    
    // Map of known correct idiom answers
    const idioms: { [key: string]: string } = {
      'j\'en rêve - si seulement...': 'quem me dera',
      'laisser tomber - aller de l\'avant': 'seguir em frente',
      'trouver une solution - s\'arranger': 'dar um jeito',
      'prendre l\'habitude de - maîtriser': 'pegando o jeito',
      'dehors - en plein air': 'ar livre',
    };
    
    const correctAnswer = idioms[frenchIdiom?.trim() || ''];
    
    if (correctAnswer) {
      // Type the correct answer
      await page.fill('input', correctAnswer);
      await page.click('text=Check Answer');
      
      // Verify success message
      await expect(page.locator('text=Correct')).toBeVisible();
      await expect(page.locator('text=Well done')).toBeVisible();
    }
  });

  test('should validate incorrect idiom answer', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Idiom Challenge');
    await page.click('text=Start Challenge');
    
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
    await page.click('text=Idiom Challenge');
    await page.click('text=Start Challenge');
    
    // Wait for challenge and answer it
    await expect(page.locator('text=Français')).toBeVisible();
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify input is disabled
    await expect(page.locator('input')).toBeDisabled();
  });

  test('should load next idiom challenge', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Idiom Challenge');
    await page.click('text=Start Challenge');
    
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
    await page.click('text=Idiom Challenge');
    
    // Click back to home
    await page.click('text=Back to Home');
    
    // Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('Welcome to Portuguese Learning');
  });
});
