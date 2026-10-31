// Public podcast endpoints. No session middleware, no auth: the page they back is
// reachable by logged-out visitors because these episodes are the same free
// content we publish on the RSS feed.

import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import logger from '../logger';
import {
  configuredPairs,
  findPublishedEpisode,
  readShows,
  showName,
} from '../services/podcastManifest';

const router = express.Router();
const log = logger.child({ module: 'podcasts' });

const WEEKLY_COLLECTION = 'weeklychallenges';
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const CACHE_HEADER = 'public, max-age=300';

interface WeeklyChallengeWord {
  portuguese?: string;
  translation_fr?: string;
  translation_en?: string;
}

interface WeeklyChallengeDoc {
  weekStart?: Date;
  language?: string;
  totalChallenges?: number;
  challenges?: WeeklyChallengeWord[];
}

/**
 * GET /api/podcasts
 *
 * One entry per configured language pair, episodes newest first. The data comes
 * from the manifest the podcast-feed CronJob writes next to feed.xml, so this
 * endpoint and the RSS feed always describe the same episodes.
 */
router.get('/', (_req: Request, res: Response) => {
  const shows = readShows();
  res.setHeader('Cache-Control', CACHE_HEADER);
  res.json({ shows });
});

/**
 * GET /api/podcasts/:pair/episodes/:docId/words
 *
 * Vocabulary of one published episode, for the expandable word list.
 *
 * The docId must appear in that pair's published manifest and the document must
 * be a global lesson (`userId: null`). Both checks matter: per-user weekly
 * challenges are private and must never be readable through a public route.
 */
router.get('/:pair/episodes/:docId/words', async (req: Request, res: Response) => {
  // Express 5 types params as string | string[]; a repeated segment is not a
  // valid pair or ObjectId, so treat anything but a plain string as missing.
  const pair = typeof req.params.pair === 'string' ? req.params.pair : '';
  const docId = typeof req.params.docId === 'string' ? req.params.docId : '';

  if (!configuredPairs().includes(pair) || !OBJECT_ID_PATTERN.test(docId)) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  const episode = findPublishedEpisode(pair, docId);
  if (!episode) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  const db = mongoose.connection.db;
  if (!db) {
    log.error({ pair, docId }, 'MongoDB is not connected - cannot serve episode words');
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }

  let doc: WeeklyChallengeDoc | null;
  try {
    doc = await db.collection<WeeklyChallengeDoc>(WEEKLY_COLLECTION).findOne(
      // `userId: null` matches both an explicit null and a missing field, which
      // covers legacy global lessons written before the templates refactor.
      { _id: new mongoose.Types.ObjectId(docId), userId: null },
      { projection: { weekStart: 1, language: 1, totalChallenges: 1, challenges: 1 } }
    );
  } catch (err) {
    log.error({ err, pair, docId }, 'failed to load weekly challenge words');
    res.status(500).json({ error: 'Failed to load episode' });
    return;
  }

  if (!doc) {
    // Published in the feed but no longer in the database (or not a global
    // lesson): treat as gone rather than leaking anything.
    log.warn({ pair, docId }, 'published episode has no global weekly lesson document');
    res.status(404).json({ error: 'Episode not found' });
    return;
  }

  const words = (doc.challenges || [])
    .filter(word => word && typeof word.portuguese === 'string')
    .map(word => ({
      portuguese: word.portuguese as string,
      translation_fr: word.translation_fr || '',
      translation_en: word.translation_en || '',
    }));

  res.setHeader('Cache-Control', CACHE_HEADER);
  res.json({
    pair,
    show: showName(),
    docId,
    weekStart: doc.weekStart ? new Date(doc.weekStart).toISOString() : null,
    language: doc.language || null,
    totalChallenges: doc.totalChallenges ?? words.length,
    words,
  });
});

export default router;
