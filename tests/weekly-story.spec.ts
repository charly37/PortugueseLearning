import { test, expect } from '@playwright/test';

// tests/start-mongo.js seeds one weeklystory_templates document per language for
// the current week, so GET /api/weekly-story clones a personal document from the
// template matching the user's preferredLanguage.
test.describe('Weekly Story', () => {
  test('a French learner gets the French story @smoke', async ({ page }) => {
    const guest = await page.request.post('/api/auth/create-guest', {
      data: { preferredLanguage: 'fr' },
    });
    expect(guest.ok()).toBeTruthy();

    const response = await page.request.get('/api/weekly-story');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.language).toBe('fr');
    expect(body.story.title_pt).toBe('O mercado');
    expect(body.story.title_native).toBe('Le marché');
    expect(body.story.sentences[0]).toEqual({ pt: 'O pão', fr: 'Le pain', native: 'Le pain' });
  });

  test('an English learner gets the English story @smoke', async ({ page }) => {
    const guest = await page.request.post('/api/auth/create-guest', {
      data: { preferredLanguage: 'en' },
    });
    expect(guest.ok()).toBeTruthy();

    const response = await page.request.get('/api/weekly-story');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.language).toBe('en');
    expect(body.story.title_native).toBe('The market');
    expect(body.story.sentences[0].native).toBe('Bread');
  });

  test('renders the story page with the Portuguese text first', async ({ page }) => {
    await page.request.post('/api/auth/create-guest', { data: { preferredLanguage: 'en' } });

    await page.goto('/weekly-story');

    await expect(page.getByRole('heading', { level: 4, name: 'O mercado' })).toBeVisible();
    await expect(page.getByText('The market')).toBeVisible();
    await expect(page.getByText('O pão')).toBeVisible();
    await expect(page.getByText('Bread')).toBeVisible();
  });

  test('creates a private document linked to the template', async ({ page }) => {
    await page.request.post('/api/auth/create-guest', { data: { preferredLanguage: 'fr' } });
    await page.request.get('/api/weekly-story');

    // Calling the endpoint twice must reuse the same document (lazy clone).
    const first = await (await page.request.get('/api/weekly-story')).json();
    const second = await (await page.request.get('/api/weekly-story')).json();

    expect(second.weekStart).toBe(first.weekStart);
    expect(second.story.id).toBe(first.story.id);
  });
});
