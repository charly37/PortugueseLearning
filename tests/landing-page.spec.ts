import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('http://localhost:8080');
  });

  test('should display landing page with all buttons', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Welcome');
    await expect(page.locator('text=Master Portuguese')).toBeVisible();
    
    // Verify challenge buttons are visible and enabled
    const challengeButtons = page.getByRole('button', { name: 'Challenge', exact: true });
    await expect(challengeButtons.first()).toBeVisible();
    await expect(challengeButtons.first()).toBeEnabled();
  });

  test('should navigate to challenges and back home', async ({ page }) => {
    // Test Word Challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).first().click();
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Test Verb Challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).nth(1).click();
    await expect(page.locator('h1')).toContainText('Portuguese Verbs');
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Test Idiom Challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).nth(2).click();
    await expect(page.locator('h1')).toContainText('Portuguese Idioms');
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
