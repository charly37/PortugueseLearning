import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Word Challenge', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies and storage to ensure fresh state
    await context.clearCookies();
    await context.clearPermissions();
    
    await setLanguageToEnglish(page);
    await page.goto('http://localhost:8080');
    // Navigate to word challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).first().click();
    
    // Wait for page to load - either guest dialog or config screen
    await page.waitForTimeout(1000);
    
    // Handle guest dialog if shown - click "Continue as Guest"
    const guestButton = page.getByRole('button', { name: /start.*guest/i });
    const isGuestDialogVisible = await guestButton.isVisible().catch(() => false);
    
    if (isGuestDialogVisible) {
      await guestButton.click();
      // Wait for guest creation and component re-render
      await page.waitForTimeout(2000);
    }
    
    // At this point we should be on the configuration screen
    // Click "Start Challenge" button to begin the challenge
    await page.getByRole('button', { name: /start challenge/i }).click({ timeout: 10000 });
    
    // Wait for challenge to load
    await page.locator('h6').filter({ hasText: 'English' }).waitFor({ timeout: 10000 });
  });

  test('should display word challenge page with input field @smoke', async ({ page }) => {
    // Verify challenge UI
    await expect(page.locator('h6:has-text("English")')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible();
  });

  test('should validate incorrect answer and show correct answer', async ({ page }) => {
    await expect(page.locator('h6:has-text("English")')).toBeVisible();
    
    // Type an incorrect answer
    await page.fill('input', 'wronganswer');
    await page.click('text=Check Answer');
    
    // Verify error message
    await expect(page.locator('text=Incorrect')).toBeVisible();
    await expect(page.locator('text=The correct answer is')).toBeVisible();
  });

  test('should navigate to next challenge', async ({ page }) => {
    await expect(page.locator('h6:has-text("English")')).toBeVisible();
    
    // Answer and move to next
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    await page.click('text=Next Challenge');
    
    // Verify new challenge loaded
    const inputValue = await page.inputValue('input');
    expect(inputValue).toBe('');
  });
});
