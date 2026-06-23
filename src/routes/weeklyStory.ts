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

// GET /api/weekly-story
// Returns the current week's story for the authenticated user.
// Falls back to the latest global story (userId: null) if no personalised one exists.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const db = mongoose.connection.db;
    if (!db) return res.status(503).json({ message: 'Database not available' });

    const collection = db.collection('weeklystories');
    const weekStart = currentWeekStart(new Date());

    // 1. Try the user's own story for this week
    let doc = await collection.findOne(
      { userId, weekStart: { $gte: weekStart } },
      { sort: { createdAt: -1 } }
    );

    // 2. Fall back to the latest global story
    if (!doc) {
      doc = await collection.findOne(
        { userId: null },
        { sort: { createdAt: -1 } }
      );
    }

    if (!doc) {
      return res.status(404).json({ message: 'No story available for this week' });
    }

    return res.json({
      weekStart: doc.weekStart,
      weekEnd: doc.weekEnd,
      status: doc.status,
      story: doc.story,
    });
  } catch (error) {
    console.error('Error fetching weekly story:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
