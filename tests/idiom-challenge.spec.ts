import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Idiom Challenge', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies and storage to ensure fresh state
    await context.clearCookies();
    await context.clearPermissions();
    
    await setLanguageToEnglish(page);
    await page.goto('http://localhost:8080');
    // Navigate to idiom challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).nth(2).click();
    
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

  test('should display idiom challenge page @smoke', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Portuguese Idioms');
  });

  test('should validate incorrect idiom answer', async ({ page }) => {
    await expect(page.locator('h6:has-text("English")')).toBeVisible();
    
    // Type an incorrect answer
    await page.fill('input', 'wrongidiom');
    await page.click('text=Check Answer');
    
    // Verify error message
    await expect(page.locator('text=Incorrect')).toBeVisible();
    await expect(page.locator('text=The correct answer is')).toBeVisible();
  });

  test('should disable input after checking answer', async ({ page }) => {
    await expect(page.locator('h6:has-text("English")')).toBeVisible();
    
    // Answer the challenge
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify input is disabled
    await expect(page.locator('input')).toBeDisabled();
  });
});
