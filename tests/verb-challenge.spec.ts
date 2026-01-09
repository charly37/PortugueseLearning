import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Verb Challenge', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies and storage to ensure fresh state
    await context.clearCookies();
    await context.clearPermissions();
    
    await setLanguageToEnglish(page);
    await page.goto('http://localhost:8080');
    // Navigate to verb challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).nth(1).click();
    
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

  test('should display verb challenge page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Portuguese Verbs');
  });

  test('should start verb challenge and validate answer @smoke', async ({ page }) => {
    await expect(page.locator('h6:has-text("English")')).toBeVisible();
    await expect(page.locator('input')).toBeVisible();
    
    // Type and submit answer
    await page.fill('input', 'test');
    await page.click('text=Check Answer');
    
    // Verify feedback is shown (filter to get only the error/success feedback, not guest mode info)
    await expect(page.locator('.MuiAlert-colorError, .MuiAlert-colorSuccess').last()).toBeVisible();
  });

  test('should support keyboard Enter key to submit', async ({ page }) => {
    await expect(page.locator('h6:has-text("English")')).toBeVisible();
    
    // Type answer and press Enter
    await page.fill('input', 'test');
    await page.press('input', 'Enter');
    
    // Verify feedback is shown (filter to get only the error/success feedback, not guest mode info)
    await expect(page.locator('.MuiAlert-colorError, .MuiAlert-colorSuccess').last()).toBeVisible();
  });
});
