import express, { Request, Response } from 'express';
import User from '../models/User';
import ChallengeAttempt from '../models/ChallengeAttempt';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Load challenge data
const wordChallenges = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/challenges.json'), 'utf-8'));
const idiomChallenges = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/idiom-challenges.json'), 'utf-8'));
const verbChallenges = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/verb-challenges.json'), 'utf-8'));

// Middleware to check if user is authenticated
const requireAuth = (req: Request, res: Response, next: express.NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
};

// Helper function to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate a personalized challenge set
router.post('/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { challengeType, totalTurns = 10, weaknessWeight = 0.5 } = req.body;
    const userId = req.session.userId;

    // Validate input
    if (!challengeType || !['word', 'idiom', 'verb'].includes(challengeType)) {
      return res.status(400).json({ message: 'Invalid or missing challenge type' });
    }

    if (totalTurns < 1 || totalTurns > 50) {
      return res.status(400).json({ message: 'Total turns must be between 1 and 50' });
    }

    if (weaknessWeight < 0 || weaknessWeight > 1) {
      return res.status(400).json({ message: 'Weakness weight must be between 0 and 1' });
    }

    // Get all challenges for the type
    let allChallenges: any[];
    switch (challengeType) {
      case 'word':
        allChallenges = wordChallenges;
        break;
      case 'idiom':
        allChallenges = idiomChallenges;
        break;
      case 'verb':
        allChallenges = verbChallenges;
        break;
      default:
        return res.status(400).json({ message: 'Invalid challenge type' });
    }

    // Ensure we don't request more challenges than available
    const actualTurns = Math.min(totalTurns, allChallenges.length);

    // Get user's weak areas
    const weakAreas = await ChallengeAttempt.aggregate([
      { $match: { userId: userId, challengeType: challengeType } },
      {
        $group: {
          _id: '$challengeId',
          totalAttempts: { $sum: 1 },
          correctAttempts: { 
            $sum: { $cond: ['$correct', 1, 0] } 
          },
          lastAttempt: { $max: '$attemptedAt' }
        }
      },
      {
        $project: {
          challengeId: '$_id',
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
      { $match: { totalAttempts: { $gte: 1 } } },
      { $sort: { successRate: 1 } } // Lowest success rate first
    ]);

    // Create a set of weak challenge IDs for quick lookup
    const weakChallengeIds = new Set(weakAreas.map(w => w.challengeId));

    // Separate challenges into weak and non-weak
    const weakChallengesList: any[] = [];
    const otherChallengesList: any[] = [];

    allChallenges.forEach((challenge) => {
      if (weakChallengeIds.has(challenge.id)) {
        weakChallengesList.push(challenge);
      } else {
        otherChallengesList.push(challenge);
      }
    });

    // Calculate how many from each category
    const weakCount = Math.min(
      Math.floor(actualTurns * weaknessWeight),
      weakChallengesList.length
    );
    const otherCount = actualTurns - weakCount;

    // Select challenges
    const selectedWeak = shuffleArray(weakChallengesList).slice(0, weakCount).map(c => ({ ...c, source: 'weakness' }));
    const selectedOther = shuffleArray(otherChallengesList).slice(0, otherCount).map(c => ({ ...c, source: 'random' }));

    // Combine and shuffle
    const finalChallenges = shuffleArray([...selectedWeak, ...selectedOther]);

    res.json({
      challengeType,
      challenges: finalChallenges,
      metadata: {
        totalChallenges: finalChallenges.length,
        weaknessChallenges: selectedWeak.length,
        randomChallenges: selectedOther.length,
        weaknessWeight: weaknessWeight,
        availableWeak: weakChallengesList.length,
        availableTotal: allChallenges.length
      }
    });
  } catch (error) {
    console.error('Generate challenge set error:', error);
    res.status(500).json({ message: 'Server error generating challenge set' });
  }
});

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

    // Initialize progress fields for existing users who don't have them
    if (!user.progress) {
      user.progress = {
        word: { totalAttempts: 0, correctAnswers: 0, streak: 0, completedChallenges: [] },
        idiom: { totalAttempts: 0, correctAnswers: 0, streak: 0, completedChallenges: [] },
        verb: { totalAttempts: 0, correctAnswers: 0, streak: 0, completedChallenges: [] }
      };
    }
    if (user.totalScore === undefined) user.totalScore = 0;
    if (user.level === undefined) user.level = 1;

    const progressKey = challengeType as 'word' | 'idiom' | 'verb';
    user.progress[progressKey].totalAttempts += 1;
    
    if (correct) {
      user.progress[progressKey].correctAnswers += 1;
      user.totalScore += 10; // 10 points per correct answer
      
      // Add to completed challenges if not already there
      if (!user.progress[progressKey].completedChallenges.includes(challengeId)) {
        user.progress[progressKey].completedChallenges.push(challengeId);
      }
    }
    
    // Update streak based on consecutive days of activity (regardless of correct/incorrect)
    const lastAttempt = user.progress[progressKey].lastAttemptDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (lastAttempt) {
      const lastAttemptDate = new Date(lastAttempt);
      lastAttemptDate.setHours(0, 0, 0, 0);
      const dayDiff = Math.floor((today.getTime() - lastAttemptDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (dayDiff === 0) {
        // Same day - maintain current streak (but ensure it's at least 1)
        if (user.progress[progressKey].streak === 0) {
          user.progress[progressKey].streak = 1;
        }
      } else if (dayDiff === 1) {
        // Consecutive day - increment streak
        user.progress[progressKey].streak += 1;
      } else if (dayDiff > 1) {
        // Missed days - reset streak to 1
        user.progress[progressKey].streak = 1;
      }
    } else {
      // First attempt ever - start streak at 1
      user.progress[progressKey].streak = 1;
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

// Helper to enrich weak words with translations and notes from challenge data
function enrichWeakWords(weakWords: any[], allChallenges: any[]) {
  const challengeMap = new Map(allChallenges.map(c => [c.id, c]));
  
  return weakWords.map(weak => {
    const challenge = challengeMap.get(weak.challengeId);
    if (challenge) {
      return {
        ...weak,
        frTranslation: challenge.fr?.translation || '',
        enTranslation: challenge.en?.translation || '',
        // Only include notes if they're not "todo"
        frNote: challenge.fr?.note !== 'todo' ? challenge.fr?.note : undefined,
        enNote: challenge.en?.note !== 'todo' ? challenge.en?.note : undefined
      };
    }
    return weak;
  });
}

// Get user progress
router.get('/progress', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize progress fields for existing users who don't have them
    if (!user.progress) {
      user.progress = {
        word: { totalAttempts: 0, correctAnswers: 0, streak: 0, completedChallenges: [] },
        idiom: { totalAttempts: 0, correctAnswers: 0, streak: 0, completedChallenges: [] },
        verb: { totalAttempts: 0, correctAnswers: 0, streak: 0, completedChallenges: [] }
      };
    }
    if (user.totalScore === undefined) user.totalScore = 0;
    if (user.level === undefined) user.level = 1;
    
    // Save the updated user with initialized fields
    await user.save();

    const calculateStats = (progressData: any) => ({
      totalAttempts: progressData?.totalAttempts || 0,
      correctAnswers: progressData?.correctAnswers || 0,
      accuracy: progressData?.totalAttempts > 0 
        ? Math.round((progressData.correctAnswers / progressData.totalAttempts) * 100)
        : 0,
      streak: progressData?.streak || 0,
      completedChallenges: progressData?.completedChallenges?.length || 0,
      lastAttemptDate: progressData?.lastAttemptDate
    });

    // Enrich weaknesses with translations if they exist
    let enrichedWeaknesses = user.weaknesses;
    if (enrichedWeaknesses?.weakWords && enrichedWeaknesses.weakWords.length > 0) {
      const allChallenges = [...wordChallenges, ...idiomChallenges, ...verbChallenges];
      enrichedWeaknesses = {
        ...enrichedWeaknesses,
        weakWords: enrichWeakWords(enrichedWeaknesses.weakWords, allChallenges)
      };
    }

    res.json({
      totalScore: user.totalScore || 0,
      level: user.level || 1,
      word: calculateStats(user.progress?.word),
      idiom: calculateStats(user.progress?.idiom),
      verb: calculateStats(user.progress?.verb),
      weaknesses: enrichedWeaknesses || null,
      weaknessesUpdatedAt: user.weaknessesUpdatedAt || null
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
