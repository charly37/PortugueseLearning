import { Page } from '@playwright/test';

/**
 * Sets the preferred language to English for testing
 * This must be called before navigating to the app
 */
export async function setLanguageToEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('preferredLanguage', 'en');
  });
}

/**
 * Sets the preferred language to French for testing
 * This must be called before navigating to the app
 */
export async function setLanguageToFrench(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('preferredLanguage', 'fr');
  });
}
