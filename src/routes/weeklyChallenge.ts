import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getWordChallenges } from '../challengeCache';
import User from '../models/User';
import logger from '../logger';

const log = logger.child({ module: 'weekly-challenge' });

const WEEKLY_COLLECTION = 'weeklychallenges';
const TEMPLATES_COLLECTION = 'weeklychallenge_templates';
const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

const router = express.Router();

function requireAuth(req: Request, res: Response, next: express.NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}

function currentWeekStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function normalizeLanguage(value: unknown): SupportedLanguage | null {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(normalized)
    ? (normalized as SupportedLanguage)
    : null;
}

async function resolveUserLanguage(userId: string): Promise<SupportedLanguage> {
  try {
    const user = await User.findById(userId)
      .select('preferredLanguage')
      .lean<{ preferredLanguage?: string }>();
    return normalizeLanguage(user?.preferredLanguage) ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

async function findWeekTemplate(
  db: mongoose.mongo.Db,
  weekStart: Date,
  language: SupportedLanguage,
) {
  const templates = db.collection(TEMPLATES_COLLECTION);

  // Exact week + preferred language first.
  const exact = await templates.findOne({ weekStart, language });
  if (exact) return exact;

  // Same week, any language (content is bilingual; only the audio differs).
  const sameWeek = await templates.findOne({ weekStart });
  if (sameWeek) return sameWeek;

  // Transition/clock-skew: earliest upcoming template for this language.
  const languageDoc = await templates
    .find({ weekStart: { $gte: weekStart }, language })
    .sort({ weekStart: 1 })
    .limit(1)
    .next();
  if (languageDoc) return languageDoc;

  return templates
    .find({ weekStart: { $gte: weekStart } })
    .sort({ weekStart: 1 })
    .limit(1)
    .next();
}

/**
 * Return the user's weekly challenge for this week, creating a private copy
 * from the language-matched template on first access.
 */
async function ensurePersonalWeeklyDoc(
  db: mongoose.mongo.Db,
  userId: string,
  weekStart: Date,
) {
  const collection = db.collection(WEEKLY_COLLECTION);

  const existing = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
  if (existing) return existing;

  const language = await resolveUserLanguage(userId);
  const template = await findWeekTemplate(db, weekStart, language);
  // Transition safety: until the first template run, clone the legacy shared doc.
  const legacy = template
    ? null
    : await collection.findOne({ userId: null, weekStart: { $gte: weekStart } });
  const source = template ?? legacy;
  if (!source) {
    log.warn(
      { userId, weekStart: weekStart.toISOString(), language },
      'no weekly template or legacy fallback found; run create_weekly_challenge.py --all-users'
    );
    return null;
  }

  const sourceChallenges = Array.isArray(source.challenges) ? source.challenges : [];
  const personalDoc = {
    userId,
    templateId: template ? template._id : null,
    language: normalizeLanguage(template?.language) ?? language,
    weekStart: source.weekStart ?? weekStart,
    weekEnd: source.weekEnd ?? new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    challenges: sourceChallenges.map((c: any) => ({
      challengeId: c.challengeId,
      portuguese: c.portuguese ?? '',
      translation_fr: c.translation_fr ?? '',
      translation_en: c.translation_en ?? '',
      completed: false,
      correct: null,
      attemptedAt: null,
    })),
    totalChallenges: source.totalChallenges ?? sourceChallenges.length,
    completedCount: 0,
    correctCount: 0,
    status: 'active',
    // Give the new user a language-correct lesson immediately (templates only).
    ...(template?.audio ? { audio: template.audio } : {}),
  };

  try {
    await collection.updateOne(
      { userId, weekStart: personalDoc.weekStart },
      { $setOnInsert: personalDoc },
      { upsert: true },
    );
  } catch (error) {
    // A concurrent request may have created the personal doc first.
    log.debug({ err: error, userId }, 'weekly challenge lazy creation raced; re-reading');
  }

  return collection.findOne({ userId, weekStart: { $gte: weekStart } });
}

// GET /api/weekly-challenge
// Progress is read exclusively from the weeklychallenges document.
// Regular challenge attempts have NO effect on weekly progress.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ message: 'Database not available' });

    const collection = db.collection(WEEKLY_COLLECTION);
    const weekStart = currentWeekStart(new Date());

    let doc = await ensurePersonalWeeklyDoc(db, userId, weekStart);
    if (!doc) {
      // Temporary transition fallback: the legacy shared document (userId = null).
      doc = await collection.findOne({ userId: null, weekStart: { $gte: weekStart } });
    }
    if (!doc) {
      return res.status(404).json({ message: 'No weekly challenge found for this week' });
    }

    const completedCount = doc.challenges.filter((c: { completed: boolean }) => c.completed).length;
    const correctCount   = doc.challenges.filter((c: { correct: boolean | null }) => c.correct === true).length;

    return res.json({
      _id: doc._id,
      weekStart: doc.weekStart,
      weekEnd: doc.weekEnd,
      language: doc.language ?? null,
      templateId: doc.templateId ?? null,
      totalChallenges: doc.totalChallenges,
      completedCount,
      correctCount,
      // Challenge is only complete when every word has been correctly answered
      status: correctCount === doc.totalChallenges ? 'completed' : doc.status,
      challenges: doc.challenges.map((c: any) => {
      const enriched = getWordChallenges().find((w: any) => w.id === c.challengeId);
        return {
          ...c,
          fr_note: enriched?.fr?.note ?? null,
          fr_use_exemple: enriched?.fr?.use_exemple ?? null,
          fr_port_exemple: enriched?.fr?.port_exemple ?? null,
          en_note: enriched?.en?.note ?? null,
          en_use_exemple: enriched?.en?.use_exemple ?? null,
          en_port_exemple: enriched?.en?.port_exemple ?? null,
        };
      }),
      audio: doc.audio ?? null,
    });
  } catch (error) {
    log.error({ err: error, userId: req.session?.userId }, 'fetch weekly challenge failed');
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/weekly-challenge/submit
// Records the result of one word attempt directly into the weekly doc.
// Completely isolated - does NOT read or write ChallengeAttempt.
router.post('/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const { challengeId, correct } = req.body;

    if (!challengeId || typeof correct !== 'boolean') {
      return res.status(400).json({ message: 'challengeId and correct (boolean) are required' });
    }

    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ message: 'Database not available' });

    const collection = db.collection(WEEKLY_COLLECTION);
    const weekStart = currentWeekStart(new Date());

    const doc = await ensurePersonalWeeklyDoc(db, userId, weekStart);
    if (!doc) {
      return res.status(404).json({ message: 'No active weekly challenge found' });
    }

    const wordIndex = doc.challenges.findIndex(
      (c: { challengeId: string }) => c.challengeId === challengeId
    );
    if (wordIndex === -1) {
      return res.status(400).json({ message: 'challengeId not part of this weekly challenge' });
    }

    // Don't overwrite a word the user has already mastered
    if (doc.challenges[wordIndex].correct === true) {
      return res.json({ message: 'Already mastered', alreadyDone: true });
    }

    const now = new Date();
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          [`challenges.${wordIndex}.completed`]: true,
          [`challenges.${wordIndex}.correct`]: correct,
          [`challenges.${wordIndex}.attemptedAt`]: now,
        },
      }
    );

    const updated = await collection.findOne({ _id: doc._id });
    if (!updated) return res.status(500).json({ message: 'Failed to reload document' });

    const completedCount = updated.challenges.filter((c: { completed: boolean }) => c.completed).length;
    const correctCount   = updated.challenges.filter((c: { correct: boolean | null }) => c.correct === true).length;
    // Challenge is only fully complete when every word has been answered correctly
    const allDone = correctCount === updated.totalChallenges;

    if (allDone && updated.status !== 'completed') {
      await collection.updateOne({ _id: doc._id }, { $set: { status: 'completed' } });
    }

    return res.json({
      completedCount,
      correctCount,
      totalChallenges: updated.totalChallenges,
      status: allDone ? 'completed' : updated.status,
    });
  } catch (error) {
    log.error({ err: error, userId: req.session?.userId }, 'submit weekly challenge answer failed');
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/weekly-challenge/reset
// Resets all per-word progress for the current week so the user can retry from scratch.
router.post('/reset', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ message: 'Database not available' });

    const collection = db.collection(WEEKLY_COLLECTION);
    const weekStart = currentWeekStart(new Date());

    const doc = await ensurePersonalWeeklyDoc(db, userId, weekStart);
    if (!doc) {
      return res.status(404).json({ message: 'No active weekly challenge found' });
    }

    // Reset every word back to its initial state
    const resetChallenges = doc.challenges.map((c: any) => ({
      ...c,
      completed: false,
      correct: null,
      attemptedAt: null,
    }));

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          challenges: resetChallenges,
          completedCount: 0,
          correctCount: 0,
          status: 'active',
        },
      }
    );

    return res.json({ message: 'Progress reset successfully' });
  } catch (error) {
    log.error({ err: error, userId: req.session?.userId }, 'reset weekly challenge failed');
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
