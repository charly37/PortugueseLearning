import express, { Request, Response } from 'express';
import mongoose from 'mongoose';

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

    const doc = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
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
      status: completedCount === doc.totalChallenges ? 'completed' : doc.status,
      challenges: doc.challenges,
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

    const doc = await collection.findOne({ userId, weekStart: { $gte: weekStart } });
    if (!doc) {
      return res.status(404).json({ message: 'No active weekly challenge found' });
    }

    const wordIndex = doc.challenges.findIndex(
      (c: { challengeId: string }) => c.challengeId === challengeId
    );
    if (wordIndex === -1) {
      return res.status(400).json({ message: 'challengeId not part of this weekly challenge' });
    }

    if (doc.challenges[wordIndex].completed) {
      return res.json({ message: 'Already completed', alreadyDone: true });
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
    const allDone = completedCount === updated.totalChallenges;

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

export default router;
