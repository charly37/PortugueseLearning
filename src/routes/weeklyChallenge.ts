import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getWordChallenges } from '../challengeCache';

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

// GET /api/weekly-challenge
// Progress is read exclusively from the weeklychallenges document.
// Regular challenge attempts have NO effect on weekly progress.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ message: 'Database not available' });

    const collection = db.collection('weeklychallenges');
    const weekStart = currentWeekStart(new Date());

    let doc = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
    if (!doc) {
      doc = await collection.findOne({ userId: null, weekStart: { $gte: weekStart } });
    }
    if (!doc && getWordChallenges().length > 0) {
      console.warn('[weekly-challenge] No global fallback doc found for week %s — auto-creating from cache. Run create_weekly_challenge.py --all-users to fix this.', weekStart.toISOString());
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      const shuffled = [...getWordChallenges()].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 20);
      const globalDoc = {
        userId: null,
        weekStart,
        weekEnd,
        createdAt: new Date(),
        challenges: selected.map((c: any) => ({
          challengeId: c.id,
          portuguese: c.port ?? '',
          translation_fr: c.fr?.translation ?? '',
          translation_en: c.en?.translation ?? '',
          completed: false,
          correct: null,
          attemptedAt: null,
        })),
        totalChallenges: selected.length,
        completedCount: 0,
        correctCount: 0,
        status: 'active',
      };
      try {
        await collection.insertOne(globalDoc);
      } catch {
        // Another concurrent request may have inserted first
      }
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
    console.error('Error fetching weekly challenge:', error);
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

    const collection = db.collection('weeklychallenges');
    const weekStart = currentWeekStart(new Date());

    let doc = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
    if (!doc) {
      // Lazy clone: on first submit by a guest, copy the global doc into a personal one
      const globalDoc = await collection.findOne({ userId: null, weekStart: { $gte: weekStart } });
      if (!globalDoc) {
        return res.status(404).json({ message: 'No active weekly challenge found' });
      }
      const { _id: _ignored, ...templateFields } = globalDoc;
      const cloned = {
        ...templateFields,
        userId,
        challenges: globalDoc.challenges.map((c: any) => ({
          ...c,
          completed: false,
          correct: null,
          attemptedAt: null,
        })),
        completedCount: 0,
        correctCount: 0,
        status: 'active',
        createdAt: new Date(),
      };
      try {
        await collection.insertOne(cloned);
      } catch {
        // Another concurrent request may have already inserted — proceed to re-fetch
      }
      doc = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
      if (!doc) {
        return res.status(500).json({ message: 'Failed to initialize weekly challenge' });
      }
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
    console.error('Error submitting weekly challenge answer:', error);
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

    const collection = db.collection('weeklychallenges');
    const weekStart = currentWeekStart(new Date());

    const doc = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
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
    console.error('Error resetting weekly challenge:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
