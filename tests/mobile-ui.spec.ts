import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

// Only run mobile UI tests on pixel-7 project
test.use({ storageState: undefined }); // Ensure no auth state interference

test.describe('Mobile UI - Pixel 7', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Skip if not running on pixel-7 project
    if (testInfo.project.name !== 'pixel-7') {
      test.skip();
    }
    await setLanguageToEnglish(page);
  });

  test('header should display correctly on mobile @smoke', async ({ page }) => {
    await page.goto('/');
    
    // Verify header is visible and doesn't overflow
    const header = page.locator('header');
    await expect(header).toBeVisible();
    
    // Check that app title is visible in header (should be only one in header, not drawer)
    await expect(header.locator('text=🇵🇹')).toBeVisible();
    
    // Verify hamburger menu button is visible on mobile
    const menuButton = page.getByRole('button', { name: 'open menu' });
    await expect(menuButton).toBeVisible();
    
    // Open drawer to verify navigation items are accessible
    await menuButton.click();
    
    // Verify drawer is open and contains login/register buttons
    const drawer = page.locator('[role="presentation"]').first();
    await expect(drawer).toBeVisible();
    
    await expect(drawer.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Register' })).toBeVisible();
    
    // Verify header doesn't overflow viewport
    const viewport = page.viewportSize();
    const headerBox = await header.boundingBox();
    
    if (headerBox && viewport) {
      expect(headerBox.width).toBeLessThanOrEqual(viewport.width);
    }
    
    // Close drawer by clicking backdrop
    await page.locator('.MuiBackdrop-root').click();
  });

  test('landing page should be responsive @smoke', async ({ page }) => {
    await page.goto('/');
    
    // Wait for landing page to load (check for challenge cards)
    await expect(page.locator('text=Word Challenge')).toBeVisible();
    
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
    
    // Verify configuration screen is shown
    await expect(page.locator('text=Configure Challenge')).toBeVisible();
    
    // Start challenge with default settings (slider is present but we use defaults)
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
    
    // Go back home using drawer menu
    await page.getByRole('button', { name: 'open menu' }).click();
    await page.locator('[role="presentation"]').getByRole('button', { name: 'Home' }).click();
    await expect(page.locator('text=Word Challenge')).toBeVisible();
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
