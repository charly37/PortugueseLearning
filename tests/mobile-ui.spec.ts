import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Mobile UI - Pixel 7', () => {
  test.beforeEach(async ({ page }) => {
    await setLanguageToEnglish(page);
  });

  test('header should display correctly on mobile', async ({ page }) => {
    await page.goto('/');
    
    // Verify header is visible and doesn't overflow
    const header = page.locator('header');
    await expect(header).toBeVisible();
    
    // Check that app title is visible
    await expect(page.locator('text=🇵🇹')).toBeVisible();
    
    // Verify navigation buttons are visible
    const loginButton = page.getByRole('button', { name: 'Login' });
    const registerButton = page.getByRole('button', { name: 'Register' });
    
    await expect(loginButton).toBeVisible();
    await expect(registerButton).toBeVisible();
    
    // Verify buttons don't overflow viewport
    const viewport = page.viewportSize();
    const headerBox = await header.boundingBox();
    
    if (headerBox && viewport) {
      expect(headerBox.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test('landing page should be responsive', async ({ page }) => {
    await page.goto('/');
    
    // Wait for landing page to load
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Verify challenge cards are visible
    const wordChallengeCard = page.locator('text=Word Challenge').first();
    const verbChallengeCard = page.locator('text=Verb Challenge').first();
    const idiomChallengeCard = page.locator('text=Idiom Challenge').first();
    
    await expect(wordChallengeCard).toBeVisible();
    await expect(verbChallengeCard).toBeVisible();
    await expect(idiomChallengeCard).toBeVisible();
    
    // Verify buttons don't overflow
    const viewport = page.viewportSize();
    const buttons = await page.locator('button').all();
    
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box && viewport) {
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
    }
  });

  test('challenge page should be responsive', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to word challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).first().click();
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
    
    // Verify guest button is visible and doesn't overflow
    const guestButton = page.getByRole('button', { name: /start challenge as guest/i });
    await expect(guestButton).toBeVisible();
    
    const viewport = page.viewportSize();
    const buttonBox = await guestButton.boundingBox();
    
    if (buttonBox && viewport) {
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test('text input should be visible and usable on mobile', async ({ page }) => {
    await page.goto('/');
    
    // Start a challenge as guest
    await page.getByRole('button', { name: 'Challenge', exact: true }).first().click();
    await page.getByRole('button', { name: /start challenge as guest/i }).click();
    
    // Configure challenge
    await page.getByLabel(/number of turns/i).fill('1');
    await page.getByRole('button', { name: /start challenge/i }).click();
    
    // Wait for challenge to load
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    
    // Verify input field is visible and accessible
    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible();
    
    // Test that input is usable
    await input.fill('test');
    await expect(input).toHaveValue('test');
    
    // Verify input doesn't overflow
    const viewport = page.viewportSize();
    const inputBox = await input.boundingBox();
    
    if (inputBox && viewport) {
      expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test('cards and content should not overflow on mobile', async ({ page }) => {
    await page.goto('/');
    
    const viewport = page.viewportSize();
    
    // Check all cards on landing page
    const cards = await page.locator('[class*="MuiPaper"]').all();
    
    for (const card of cards) {
      const isVisible = await card.isVisible();
      if (isVisible) {
        const box = await card.boundingBox();
        if (box && viewport) {
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1); // +1 for rounding
        }
      }
    }
  });

  test('navigation should work on mobile', async ({ page }) => {
    await page.goto('/');
    
    // Click on word challenge
    await page.getByRole('button', { name: 'Challenge', exact: true }).first().click();
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
    
    // Go back home using header
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('vertical scrolling should work on mobile', async ({ page }) => {
    await page.goto('/');
    
    // Verify page is scrollable
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = page.viewportSize()?.height || 0;
    
    // If content is taller than viewport, test scrolling
    if (bodyHeight > viewportHeight) {
      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      
      // Wait for scroll
      await page.waitForTimeout(500);
      
      // Verify we scrolled
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);
    }
  });
});
