import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('http://localhost:8080');
  });

  test('should display landing page with all buttons @smoke', async ({ page }) => {
    // Check for challenge cards on landing page
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    await expect(page.locator('text=Verb Challenge')).toBeVisible();
    
    // Verify challenge buttons are visible and enabled
    const challengeButtons = page.getByRole('button', { name: 'Challenge', exact: true });
    await expect(challengeButtons.first()).toBeVisible();
    await expect(challengeButtons.first()).toBeEnabled();
  });

  test('should navigate to challenges and back home', async ({ page }) => {
    // Helper to navigate home using drawer on mobile or header button on desktop
    const navigateHome = async () => {
      const mobileMenuButton = page.getByRole('button', { name: 'open menu' });
      const isMobile = await mobileMenuButton.isVisible().catch(() => false);
      
      if (isMobile) {
        await mobileMenuButton.click();
        await page.locator('[role="presentation"]').getByRole('button', { name: 'Home' }).click();
      } else {
        await page.getByRole('button', { name: 'Home' }).click();
      }
    };
    
    // Test Word Challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).first().click();
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
    await navigateHome();
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    
    // Test Verb Challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).nth(1).click();
    await expect(page.locator('h1')).toContainText('Portuguese Verbs');
    await navigateHome();
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    
    // Test Idiom Challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).nth(2).click();
    await expect(page.locator('h1')).toContainText('Portuguese Idioms');
    await navigateHome();
    await expect(page.locator('text=Word Challenge')).toBeVisible();
  });
});
