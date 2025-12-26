import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (no login required)
    await page.goto('http://localhost:8080');
  });

  test('should display the landing page correctly', async ({ page }) => {
    // Verify main heading with personalized greeting
    await expect(page.locator('h1')).toContainText('Welcome');
    
    // Verify subtitle
    await expect(page.locator('text=Master Portuguese')).toBeVisible();
    
    // Verify all challenge buttons are visible (Practice and Challenge for each type)
    await expect(page.getByRole('button', { name: 'Practice', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Challenge \(20 turns\)/ }).first()).toBeVisible();
  });

  test('should have all challenge buttons clickable', async ({ page }) => {
    // Test Word Practice button
    const wordButton = page.getByRole('button', { name: 'Practice', exact: true }).first();
    await expect(wordButton).toBeEnabled();
    
    // Test all challenge buttons
    const challengeButtons = page.getByRole('button', { name: /Challenge \(20 turns\)/ });
    await expect(challengeButtons.first()).toBeEnabled();
  });

  test('should navigate between different challenges', async ({ page }) => {
    // Navigate to Word Practice
    await page.getByRole('button', { name: 'Practice', exact: true }).first().click();
    await expect(page.locator('h1')).toContainText('Portuguese Vocabulary');
    await page.getByRole('button', { name: 'Home' }).click();
    
    // Navigate to Verb Practice (second Practice button)
    await page.getByRole('button', { name: 'Practice', exact: true }).nth(1).click();
    await expect(page.locator('h1')).toContainText('Portuguese Verbs');
    await page.getByRole('button', { name: 'Home' }).click();
    
    // Navigate to Idiom Practice (third Practice button)
    await page.getByRole('button', { name: 'Practice', exact: true }).nth(2).click();
    await expect(page.locator('h1')).toContainText('Portuguese Idioms');
    await page.getByRole('button', { name: 'Home' }).click();
    
    // Verify we're back on landing page with personalized greeting
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
