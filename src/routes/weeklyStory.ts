import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import logger from '../logger';
import {
  currentWeekStart,
  normalizeLanguage,
  resolveUserLanguage,
  type SupportedLanguage,
} from '../services/weeklyPeriod';

const log = logger.child({ module: 'weekly-story' });

const STORY_COLLECTION = 'weeklystories';
const TEMPLATES_COLLECTION = 'weeklystory_templates';

const router = express.Router();

function requireAuth(req: Request, res: Response, next: express.NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}

/** Best template for the week: exact language, same week, then nearest upcoming. */
async function findWeekTemplate(
  db: mongoose.mongo.Db,
  weekStart: Date,
  language: SupportedLanguage,
) {
  const templates = db.collection(TEMPLATES_COLLECTION);

  const exact = await templates.findOne({ weekStart, language });
  if (exact) return exact;

  const sameWeek = await templates.findOne({ weekStart });
  if (sameWeek) return sameWeek;

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
 * Return the user's weekly story document for this week, creating it from the
 * language-matched template on first access. Guests get one too, which is why
 * no `userId: null` fallback document is needed anymore.
 */
async function ensurePersonalWeeklyStoryDoc(
  db: mongoose.mongo.Db,
  userId: string,
  weekStart: Date,
) {
  const collection = db.collection(STORY_COLLECTION);

  const existing = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
  if (existing) return existing;

  const language = await resolveUserLanguage(userId);
  const template = await findWeekTemplate(db, weekStart, language);
  if (!template) {
    log.warn(
      { userId, weekStart: weekStart.toISOString(), language },
      'no weekly story template found; run StoryCreatorGetter.py --generate'
    );
    return null;
  }

  const personalDoc = {
    userId,
    templateId: String(template._id),
    language: normalizeLanguage(template.language) ?? language,
    weekStart: template.weekStart ?? weekStart,
    weekEnd: template.weekEnd ?? new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    status: 'active',
  };

  try {
    await collection.updateOne(
      { userId, weekStart: personalDoc.weekStart },
      { $setOnInsert: personalDoc },
      { upsert: true },
    );
  } catch (error) {
    // A concurrent request may have created the personal doc first.
    log.debug({ err: error, userId }, 'weekly story lazy creation raced; re-reading');
  }

  return collection.findOne({ userId, weekStart: { $gte: weekStart } });
}

/**
 * Story body for a personal document.
 *
 * Template-linked documents carry only `templateId`; documents created before
 * the template migration carry their own `story` and keep working.
 */
async function loadStory(db: mongoose.mongo.Db, doc: Record<string, any>) {
  const templateId = doc.templateId;
  if (!templateId || !mongoose.Types.ObjectId.isValid(String(templateId))) {
    return doc.story ?? null;
  }

  const template = await db
    .collection(TEMPLATES_COLLECTION)
    .findOne({ _id: new mongoose.Types.ObjectId(String(templateId)) }, { projection: { story: 1 } });

  return template?.story ?? doc.story ?? null;
}

// GET /api/weekly-story
// Returns the current week's story for the authenticated user, cloning the
// language-matched template when the user has no document yet.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ message: 'Database not available' });

    const weekStart = currentWeekStart(new Date());
    const doc = await ensurePersonalWeeklyStoryDoc(db, userId, weekStart);
    if (!doc) {
      return res.status(404).json({ message: 'No story available for this week' });
    }

    const story = await loadStory(db, doc);
    if (!story) {
      log.warn(
        { userId, templateId: doc.templateId },
        'weekly story template is missing; nothing to return'
      );
      return res.status(404).json({ message: 'No story available for this week' });
    }

    return res.json({
      weekStart: doc.weekStart,
      weekEnd: doc.weekEnd,
      status: doc.status,
      language: doc.language ?? story.language ?? null,
      story,
    });
  } catch (error) {
    log.error({ err: error, userId: req.session?.userId }, 'fetch weekly story failed');
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
