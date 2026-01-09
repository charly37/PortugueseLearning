import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers/auth-helper';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Challenge Generation', () => {
  test('should show authentication requirement for unauthenticated users', async ({ page, context }) => {
    await setLanguageToEnglish(page);
    // Clear all cookies and storage to ensure we're not authenticated
    await context.clearCookies();
    
    // Navigate to landing page without authentication
    await page.goto('http://localhost:8080');
    
    // Wait for landing page to load
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Click on first word challenge button
    const challengeButtons = page.locator('button:has-text("Challenge")');
    await challengeButtons.first().click();
    
    // Wait for navigation to word challenge page
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
    
    // Wait for and verify guest dialog is shown
    await expect(page.getByRole('heading', { name: /start challenge/i })).toBeVisible({ timeout: 10000 });
    
    // Verify guest explanation text is present
    await expect(page.locator('text=Try challenges without creating an account')).toBeVisible();
    await expect(page.locator('text=Your progress will be saved for 7 days')).toBeVisible();
    
    // Verify Start as Guest, Register, Login, and Back buttons are present in the guest card
    // Use the card container to avoid selecting header buttons
    const guestCard = page.locator('.MuiCard-root').filter({ hasText: 'Start Challenge' });
    await expect(guestCard.getByRole('button', { name: /start challenge as guest/i })).toBeVisible();
    await expect(guestCard.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
    await expect(guestCard.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await expect(guestCard.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    
    // Test that clicking guest button leads to configuration screen
    await page.getByRole('button', { name: /start challenge as guest/i }).click();
    await page.waitForTimeout(1000); // Wait for guest account creation
    
    // Now should see configuration screen
    await expect(page.locator('text=Configure Challenge')).toBeVisible({ timeout: 5000 });
  });

  test.beforeEach(async ({ page }) => {
    await setLanguageToEnglish(page);
    // Register and login is required for challenge generation API
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    await registerAndLogin(
      page,
      `testuser${timestamp}`,
      `testuser${timestamp}@test.com`,
      'TestPassword123'
    );
  });

  test('should configure and start a word challenge with pre-generated set @smoke', async ({ page }) => {
    // Navigate to word challenge
    const challengeButtons = page.locator('button:has-text("Challenge")');
    await challengeButtons.first().click();
    
    // Verify configuration screen is shown
    await expect(page.locator('text=Configure Challenge')).toBeVisible();
    
    // Set number of turns to 5
    await page.fill('input[type="number"]', '5');
    
    // Verify difficulty slider is present
    await expect(page.locator('input[type="range"]')).toBeVisible();
    
    // Set difficulty to 7 (70% weak areas)
    await page.locator('input[type="range"]').fill('7');
    
    // Verify difficulty label updates
    await expect(page.locator('text=Difficulty: 7/10')).toBeVisible();
    await expect(page.locator('text=70% weak areas')).toBeVisible();
    
    // Start the challenge
    await page.click('button:has-text("Start Challenge")');
    
    // Wait for first challenge to load - should show 'English' as source language
    await expect(page.locator('h6:has-text("English")')).toBeVisible({ timeout: 10000 });
    
    // Verify turn counter shows 0/5
    await expect(page.locator('text=Turn 0/5')).toBeVisible();
    
    // Answer the first challenge
    await page.locator('input[type="text"]').fill('test');
    await page.click('text=Check Answer');
    
    // Verify feedback is shown
    await expect(page.locator('.MuiAlert-root')).toBeVisible();
    
    // Go to next challenge
    await page.click('text=Next Challenge');
    
    // Verify turn counter incremented to 1/5
    await expect(page.locator('text=Turn 1/5')).toBeVisible();
  });

  test('should complete a full 3-turn challenge and show recap', async ({ page }) => {
    // Navigate to idiom challenge
    const challengeButtons = page.locator('button:has-text("Challenge")');
    await challengeButtons.nth(1).click();
    
    // Configure for 3 turns
    await page.fill('input[type="number"]', '3');
    await page.locator('input[type="range"]').fill('0'); // All random
    
    // Start challenge
    await page.click('button:has-text("Start Challenge")');
    
    // Complete 3 turns
    for (let i = 0; i < 3; i++) {
      await expect(page.locator('h6:has-text("English")')).toBeVisible({ timeout: 10000 });
      await page.locator('input[type="text"]').fill('test');
      await page.click('text=Check Answer');
      await expect(page.locator('.MuiAlert-root')).toBeVisible();
      
      if (i < 2) {
        await page.click('text=Next Challenge');
      }
    }
    
    // Verify challenge completion
    await expect(page.locator('text=Challenge completed!')).toBeVisible();
    await expect(page.locator('text=Challenge Recap')).toBeVisible();
    
    // Verify recap shows correct/incorrect counts
    await expect(page.locator('text=Correct').first()).toBeVisible();
    await expect(page.locator('text=Incorrect').first()).toBeVisible();
    await expect(page.locator('text=Success Rate')).toBeVisible();
  });

  test('should allow difficulty adjustment from 0 to 10', async ({ page }) => {
    // Navigate to verb challenge
    const challengeButtons = page.locator('button:has-text("Challenge")');
    await challengeButtons.nth(2).click({ force: true });
    
    // Test difficulty 0 (all random)
    await page.locator('input[type="range"]').fill('0');
    await expect(page.locator('text=Difficulty: 0/10')).toBeVisible();
    await expect(page.locator('text=All random')).toBeVisible();
    
    // Test difficulty 5 (balanced)
    await page.locator('input[type="range"]').fill('5');
    await expect(page.locator('text=Difficulty: 5/10')).toBeVisible();
    await expect(page.locator('text=50% weak areas')).toBeVisible();
    
    // Test difficulty 10 (all weak)
    await page.locator('input[type="range"]').fill('10');
    await expect(page.locator('text=Difficulty: 10/10')).toBeVisible();
    await expect(page.locator('text=All weak areas')).toBeVisible();
  });

  test('should cancel challenge configuration and return home', async ({ page }) => {
    // Navigate to word challenge
    const challengeButtons = page.locator('button:has-text("Challenge")');
    await challengeButtons.first().click();
    
    // Verify on configuration screen
    await expect(page.locator('text=Configure Challenge')).toBeVisible();
    
    // Click back button to cancel
    await page.click('button:has-text("Back")');
    
    // Verify back on home page
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
