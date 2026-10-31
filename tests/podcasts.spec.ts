import { test, expect } from '@playwright/test';
import { setLanguageToEnglish } from './helpers/language-helper';

// The fixtures seeded by tests/global-setup.ts:
//   tests/fixtures/podcast/vocabulary/fr-pt/episodes.json -> two episodes
//   one global (userId: null) weeklychallenges doc per episode -> word lists
test.describe('Podcasts Page', () => {
  test.beforeEach(async ({ page }) => {
    await setLanguageToEnglish(page);
  });

  test('is reachable without logging in @smoke', async ({ page }) => {
    await page.goto('/podcasts');

    await expect(page.getByRole('heading', { level: 1, name: 'Weekly Podcast' })).toBeVisible();
    // Public page: no redirect to /login, no guest/account call-to-action.
    await expect(page).toHaveURL(/\/podcasts$/);
    await expect(page.getByRole('button', { name: 'Start Challenge' })).toHaveCount(0);
  });

  test('lists the published episodes with a player and a download link @smoke', async ({ page }) => {
    await page.goto('/podcasts');

    await expect(page.getByText('Leçon de vocabulaire – Semaine du 26 octobre 2026')).toBeVisible();
    await expect(page.getByText('Leçon de vocabulaire – Semaine du 19 octobre 2026')).toBeVisible();
    await expect(page.getByText('Episode 2')).toBeVisible();

    const audio = page.locator('audio').first();
    await expect(audio).toHaveAttribute('src', /^\/weekly-audio\/weekly_.+\.mp3$/);

    const download = page.getByRole('link', { name: 'Download MP3' }).first();
    await expect(download).toHaveAttribute('href', /^\/weekly-audio\/weekly_.+\.mp3$/);
    await expect(download).toHaveAttribute('download', /^weekly_.+\.mp3$/);
  });

  test('shows the word list of an episode on demand', async ({ page }) => {
    await page.goto('/podcasts');

    await page.getByRole('button', { name: 'Words in this lesson' }).first().click();

    await expect(page.getByText('obrigado')).toBeVisible();
    await expect(page.getByText('merci')).toBeVisible();
  });

  test('is linked from the landing page @smoke', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Listen to Episodes' }).click();

    await expect(page).toHaveURL(/\/podcasts$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Weekly Podcast' })).toBeVisible();
  });

  test('is linked from the desktop header', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop only');

    await page.goto('/');

    await page.getByRole('button', { name: 'Podcasts' }).first().click();

    await expect(page).toHaveURL(/\/podcasts$/);
  });

  test('is linked from the mobile drawer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-7', 'mobile only');

    await page.goto('/');

    await page.getByRole('button', { name: /open menu/i }).click();
    await page.getByRole('button', { name: 'Podcasts' }).click();

    await expect(page).toHaveURL(/\/podcasts$/);
  });
});

test.describe('Podcasts API', () => {
  test('serves the feed manifest with same-origin audio URLs @smoke', async ({ request }) => {
    const response = await request.get('/api/podcasts');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toContain('max-age=300');

    const body = await response.json();
    expect(body.shows).toHaveLength(1);

    const [show] = body.shows;
    expect(show.pair).toBe('fr-pt');
    expect(show.feedUrl).toBe('/podcast/vocabulary/fr-pt/feed.xml');
    // Newest episode first, mirroring the episodic RSS feed.
    expect(show.episodes.map((episode: { episodeNumber: number }) => episode.episodeNumber)).toEqual([2, 1]);
    expect(show.episodes[0].audioUrl).toMatch(/^\/weekly-audio\/weekly_.+\.mp3$/);
  });

  test('only expands word lists of published episodes', async ({ request }) => {
    const unpublished = await request.get('/api/podcasts/fr-pt/episodes/000000000000000000000000/words');
    expect(unpublished.status()).toBe(404);

    const unknownPair = await request.get('/api/podcasts/de-pt/episodes/65f1a2b3c4d5e6f7a8b9c0d1/words');
    expect(unknownPair.status()).toBe(404);

    const published = await request.get('/api/podcasts/fr-pt/episodes/65f1a2b3c4d5e6f7a8b9c0d1/words');
    expect(published.ok()).toBeTruthy();
    const body = await published.json();
    expect(body.words[0]).toEqual({
      portuguese: 'obrigado',
      translation_fr: 'merci',
      translation_en: 'thank you',
    });
  });
});
