import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

test.describe('Learn Mode (Flashcards)', () => {
  test.beforeEach(async ({ page }) => {
    await setLanguageToEnglish(page);
    await page.goto('/');
  });

  test('should navigate to word learn page and display flashcard', async ({ page }) => {
    // Find and click the first Learn button (for words)
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.first().click();

    // Wait for flashcard to load
    await page.waitForSelector('text=Card 1 of', { timeout: 10000 });

    // Verify we see the click instruction
    await expect(page.locator('text=Click to reveal Portuguese')).toBeVisible();

    // Verify card counter is displayed
    const cardCounter = page.locator('text=/Card \\d+ of \\d+/');
    await expect(cardCounter).toBeVisible();
    
    // Verify there's content in the card - use Typography variant selector
    const cardText = page.locator('.MuiTypography-h3').first();
    await expect(cardText).toBeVisible();
  });

  test('should flip card to reveal Portuguese translation', async ({ page }) => {
    // Navigate to word learn page
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.first().click();

    await page.waitForSelector('text=Click to reveal Portuguese');

    // Get the source text before flipping
    const sourceText = await page.locator('.MuiTypography-h3').first().textContent();

    // Click the card to flip it
    await page.locator('.MuiCard-root').click();

    // Wait for flip animation
    await page.waitForTimeout(400);

    // Verify we now see Portuguese label
    await expect(page.locator('text=Português')).toBeVisible();

    // Verify we see "Click to flip back" instruction
    await expect(page.locator('text=Click to flip back')).toBeVisible();

    // Verify the Portuguese text is different from source
    const portugueseText = await page.locator('.MuiTypography-h3').first().textContent();
    expect(portugueseText).not.toBe(sourceText);
  });

  test('should navigate between flashcards', async ({ page }) => {
    // Navigate to word learn page
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.first().click();

    await page.waitForSelector('text=Card 1 of');

    // Verify we're on card 1
    await expect(page.locator('text=/Card 1 of/')).toBeVisible();

    // Get first card text
    const firstCardText = await page.locator('.MuiTypography-h3').first().textContent();

    // Click Next button
    await page.locator('button:has-text("Next")').click();

    // Verify we're on card 2
    await expect(page.locator('text=/Card 2 of/')).toBeVisible();

    // Get second card text
    const secondCardText = await page.locator('.MuiTypography-h3').first().textContent();
    expect(secondCardText).not.toBe(firstCardText);

    // Click Previous button
    await page.locator('button:has-text("Previous")').click();

    // Verify we're back on card 1
    await expect(page.locator('text=/Card 1 of/')).toBeVisible();

    // Verify we see the same text as before
    const backToFirstCardText = await page.locator('.MuiTypography-h3').first().textContent();
    expect(backToFirstCardText).toBe(firstCardText);
  });

  test('should disable Previous button on first card', async ({ page }) => {
    // Navigate to word learn page
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.first().click();

    await page.waitForSelector('text=Card 1 of');

    // Verify Previous button is disabled
    const previousButton = page.locator('button:has-text("Previous")');
    await expect(previousButton).toBeDisabled();
  });

  test('should shuffle flashcards', async ({ page }) => {
    // Navigate to word learn page
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.first().click();

    await page.waitForSelector('text=Card 1 of');

    // Get the first 3 card texts
    const originalCards: string[] = [];
    for (let i = 0; i < 3; i++) {
      const text = await page.locator('.MuiTypography-h3').first().textContent();
      originalCards.push(text || '');
      if (i < 2) {
        await page.locator('button:has-text("Next")').click();
        await page.waitForTimeout(200);
      }
    }

    // Click Shuffle button
    await page.locator('button:has-text("Shuffle")').click();

    // Wait for shuffle to complete
    await page.waitForTimeout(300);

    // Verify we're back on card 1
    await expect(page.locator('text=/Card 1 of/')).toBeVisible();

    // Get the new first 3 card texts
    const shuffledCards: string[] = [];
    for (let i = 0; i < 3; i++) {
      const text = await page.locator('.MuiTypography-h3').first().textContent();
      shuffledCards.push(text || '');
      if (i < 2) {
        await page.locator('button:has-text("Next")').click();
        await page.waitForTimeout(200);
      }
    }

    // Verify the order changed (at least one card should be different)
    const orderChanged = shuffledCards.some((card, index) => card !== originalCards[index]);
    expect(orderChanged).toBe(true);
  });

  test('should work for verb challenges', async ({ page }) => {
    // Navigate to verb learn page (second Learn button)
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.nth(1).click();

    await page.waitForSelector('text=Card 1 of');

    // Click card to flip
    await page.locator('.MuiCard-root').click();
    await page.waitForTimeout(400);

    // Verify Portuguese label is shown
    await expect(page.locator('text=Português')).toBeVisible();

    // Verify verb conjugation is shown
    await expect(page.locator('text=Present Tense Conjugation:')).toBeVisible();
  });

  test('should work for idiom challenges', async ({ page }) => {
    // Navigate to idiom learn page (third Learn button)
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.nth(2).click();

    await page.waitForSelector('text=Card 1 of');

    // Verify flashcard is displayed
    await expect(page.locator('text=Click to reveal Portuguese')).toBeVisible();

    // Click to flip
    await page.locator('.MuiCard-root').click();
    await page.waitForTimeout(400);

    // Verify Portuguese translation is shown
    await expect(page.locator('text=Português')).toBeVisible();
  });

  test('should return to home page when clicking Back button', async ({ page }) => {
    // Navigate to word learn page
    const learnButtons = page.getByRole('button').filter({ hasText: /^Learn$/ });
    await learnButtons.first().click();

    await page.waitForSelector('text=Card 1 of');

    // Click Back button
    await page.locator('button:has-text("Back")').first().click();

    // Verify we're back on the landing page
    await expect(page.locator('text=/Welcome/i')).toBeVisible();
  });
});
