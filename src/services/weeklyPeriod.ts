import User from '../models/User';

/**
 * Week / language helpers shared by the weekly challenge and weekly story
 * routes. Both collections are keyed by a Monday 00:00 UTC week start and by a
 * supported language (`fr`, `en`).
 */

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

/** Monday 00:00 UTC of the week containing `now`. */
export function currentWeekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Returns the supported language for a stored value, or null. */
export function normalizeLanguage(value: unknown): SupportedLanguage | null {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(normalized)
    ? (normalized as SupportedLanguage)
    : null;
}

/** The user's preferred language, defaulting to French. */
export async function resolveUserLanguage(userId: string): Promise<SupportedLanguage> {
  try {
    const user = await User.findById(userId)
      .select('preferredLanguage')
      .lean<{ preferredLanguage?: string }>();
    return normalizeLanguage(user?.preferredLanguage) ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
