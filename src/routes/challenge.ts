import express, { Request, Response } from 'express';
import User from '../models/User';
import ChallengeAttempt from '../models/ChallengeAttempt';

const router = express.Router();

// Middleware to check if user is authenticated
const requireAuth = (req: Request, res: Response, next: express.NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
};

// Submit a challenge attempt
router.post('/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const { challengeId, challengeType, correct, userAnswer, correctAnswer, timeSpent } = req.body;
    const userId = req.session.userId;

    // Validate input
    if (!challengeId || !challengeType || typeof correct !== 'boolean' || !userAnswer || !correctAnswer) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!['word', 'idiom', 'verb'].includes(challengeType)) {
      return res.status(400).json({ message: 'Invalid challenge type' });
    }

    // Save detailed attempt
    const attempt = new ChallengeAttempt({
      userId,
      challengeId,
      challengeType,
      correct,
      userAnswer,
      correctAnswer,
      timeSpent,
      attemptedAt: new Date()
    });

    await attempt.save();

    // Update user progress statistics
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const progressKey = challengeType as 'word' | 'idiom' | 'verb';
    user.progress[progressKey].totalAttempts += 1;
    
    if (correct) {
      user.progress[progressKey].correctAnswers += 1;
      user.totalScore += 10; // 10 points per correct answer
      
      // Update streak
      const lastAttempt = user.progress[progressKey].lastAttemptDate;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (lastAttempt) {
        const lastAttemptDate = new Date(lastAttempt);
        lastAttemptDate.setHours(0, 0, 0, 0);
        const dayDiff = Math.floor((today.getTime() - lastAttemptDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (dayDiff === 1) {
          user.progress[progressKey].streak += 1;
        } else if (dayDiff > 1) {
          user.progress[progressKey].streak = 1;
        }
      } else {
        user.progress[progressKey].streak = 1;
      }
      
      // Add to completed challenges if not already there
      if (!user.progress[progressKey].completedChallenges.includes(challengeId)) {
        user.progress[progressKey].completedChallenges.push(challengeId);
      }
    } else {
      // Reset streak on incorrect answer
      user.progress[progressKey].streak = 0;
    }
    
    user.progress[progressKey].lastAttemptDate = new Date();
    
    // Calculate level based on total score (every 100 points = 1 level)
    user.level = Math.floor(user.totalScore / 100) + 1;
    
    await user.save();

    res.json({
      message: 'Challenge attempt recorded',
      progress: {
        totalScore: user.totalScore,
        level: user.level,
        [challengeType]: {
          totalAttempts: user.progress[progressKey].totalAttempts,
          correctAnswers: user.progress[progressKey].correctAnswers,
          accuracy: user.progress[progressKey].totalAttempts > 0 
            ? Math.round((user.progress[progressKey].correctAnswers / user.progress[progressKey].totalAttempts) * 100)
            : 0,
          streak: user.progress[progressKey].streak
        }
      }
    });
  } catch (error) {
    console.error('Submit challenge error:', error);
    res.status(500).json({ message: 'Server error recording challenge attempt' });
  }
});

// Get user progress
router.get('/progress', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const calculateStats = (progressData: any) => ({
      totalAttempts: progressData.totalAttempts,
      correctAnswers: progressData.correctAnswers,
      accuracy: progressData.totalAttempts > 0 
        ? Math.round((progressData.correctAnswers / progressData.totalAttempts) * 100)
        : 0,
      streak: progressData.streak,
      completedChallenges: progressData.completedChallenges.length,
      lastAttemptDate: progressData.lastAttemptDate
    });

    res.json({
      totalScore: user.totalScore,
      level: user.level,
      word: calculateStats(user.progress.word),
      idiom: calculateStats(user.progress.idiom),
      verb: calculateStats(user.progress.verb)
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ message: 'Server error retrieving progress' });
  }
});

// Get user history
router.get('/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const { type, limit = 20 } = req.query;
    
    const query: any = { userId };
    if (type && ['word', 'idiom', 'verb'].includes(type as string)) {
      query.challengeType = type;
    }

    const attempts = await ChallengeAttempt.find(query)
      .sort({ attemptedAt: -1 })
      .limit(Number(limit));

    res.json(attempts);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ message: 'Server error retrieving history' });
  }
});

// Get weak areas (challenges with low success rate)
router.get('/weak-areas', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    const attempts = await ChallengeAttempt.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: { challengeId: '$challengeId', challengeType: '$challengeType' },
          totalAttempts: { $sum: 1 },
          correctAttempts: { 
            $sum: { $cond: ['$correct', 1, 0] } 
          },
          lastAttempt: { $max: '$attemptedAt' }
        }
      },
      {
        $project: {
          challengeId: '$_id.challengeId',
          challengeType: '$_id.challengeType',
          totalAttempts: 1,
          correctAttempts: 1,
          successRate: {
            $multiply: [
              { $divide: ['$correctAttempts', '$totalAttempts'] },
              100
            ]
          },
          lastAttempt: 1
        }
      },
      { $match: { totalAttempts: { $gte: 2 } } }, // At least 2 attempts
      { $sort: { successRate: 1 } }, // Lowest success rate first
      { $limit: 10 }
    ]);

    res.json(attempts);
  } catch (error) {
    console.error('Get weak areas error:', error);
    res.status(500).json({ message: 'Server error retrieving weak areas' });
  }
});

export default router;
