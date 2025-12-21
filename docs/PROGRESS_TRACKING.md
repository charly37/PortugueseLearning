# Progress Tracking System

## Overview

The Portuguese Learning app now includes a comprehensive progress tracking system that records user performance across all challenge types (word, idiom, and verb challenges) when users are logged in.

## Features Implemented

### 1. **User Progress Statistics**
Each user has the following tracked metrics per challenge type:
- **Total Attempts**: Number of challenges attempted
- **Correct Answers**: Number of challenges answered correctly
- **Accuracy**: Percentage of correct answers
- **Streak**: Consecutive days with correct answers
- **Completed Challenges**: List of unique challenges completed
- **Last Attempt Date**: Timestamp of last attempt

### 2. **Detailed Attempt History**
Each challenge submission is recorded with:
- Challenge ID
- Challenge type (word/idiom/verb)
- Correct/incorrect status
- User's answer
- Correct answer
- Time spent on challenge (milliseconds)
- Timestamp

### 3. **Gamification Elements**
- **Total Score**: Users earn 10 points per correct answer
- **Level System**: Every 100 points = 1 level up
- **Daily Streaks**: Tracks consecutive days of correct answers
- **Progress Visualization**: Visual display of statistics in profile

## API Endpoints

### Submit Challenge Attempt
```
POST /api/challenge/submit
```
**Body:**
```json
{
  "challengeId": "string",
  "challengeType": "word" | "idiom" | "verb",
  "correct": boolean,
  "userAnswer": "string",
  "correctAnswer": "string",
  "timeSpent": number (optional)
}
```

**Response:**
```json
{
  "message": "Challenge attempt recorded",
  "progress": {
    "totalScore": 120,
    "level": 2,
    "word": {
      "totalAttempts": 15,
      "correctAnswers": 12,
      "accuracy": 80,
      "streak": 3
    }
  }
}
```

### Get User Progress
```
GET /api/challenge/progress
```

**Response:**
```json
{
  "totalScore": 120,
  "level": 2,
  "word": {
    "totalAttempts": 15,
    "correctAnswers": 12,
    "accuracy": 80,
    "streak": 3,
    "completedChallenges": 8,
    "lastAttemptDate": "2025-12-20T10:30:00Z"
  },
  "idiom": { /* same structure */ },
  "verb": { /* same structure */ }
}
```

### Get Attempt History
```
GET /api/challenge/history?type=idiom&limit=20
```

Returns list of recent attempts with all details.

### Get Weak Areas
```
GET /api/challenge/weak-areas
```

Returns challenges where user has attempted at least 2 times with lowest success rates.

## Database Schema

### User Model Extensions
```typescript
interface IUser {
  // ... existing fields
  progress: {
    word: ChallengeProgress;
    idiom: ChallengeProgress;
    verb: ChallengeProgress;
  };
  totalScore: number;
  level: number;
}
```

### Challenge Attempt Model
```typescript
interface IChallengeAttempt {
  userId: ObjectId;
  challengeId: string;
  challengeType: 'word' | 'idiom' | 'verb';
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  timeSpent?: number;
  attemptedAt: Date;
}
```

## How It Works

1. **Challenge Submission**: When a user answers a challenge, the app:
   - Checks if user is authenticated
   - Submits the attempt to `/api/challenge/submit`
   - Updates user's progress statistics
   - Saves detailed attempt record

2. **Progress Display**: The profile page:
   - Fetches progress from `/api/challenge/progress`
   - Displays statistics with visual progress bars
   - Shows level, total score, and streaks
   - Color-codes each challenge type

3. **Automatic Tracking**: 
   - Works transparently for logged-in users
   - No changes needed for guest users
   - All challenge pages automatically submit results

## UI Components Updated

### ProfilePage.tsx
- Added progress statistics display
- Visual progress bars for each challenge type
- Level and score badges
- Streak indicators with fire icon

### Challenge Pages (All 3 types)
- Added time tracking
- Automatic submission of results
- No UI changes (seamless integration)

## Future Enhancements

Potential additions:
- **Spaced Repetition**: Review challenges based on performance
- **Leaderboards**: Compare scores with other users
- **Achievements/Badges**: "10 correct in a row", "Master of Idioms"
- **Weekly Goals**: "Complete 50 challenges this week"
- **Review Mode**: Retry failed challenges
- **Analytics Dashboard**: Detailed charts and insights
- **Challenge Recommendations**: Suggest challenges based on weak areas

## Testing

To test the progress tracking:

1. Register/login to the app
2. Complete several challenges (word, idiom, verb)
3. View your profile to see statistics
4. Check the database to see ChallengeAttempt records
5. Try getting correct and incorrect answers to see stats update

## Notes

- Progress tracking only works for authenticated users
- Guest users can still use all challenges without tracking
- Streak resets on incorrect answers
- Level calculation: `floor(totalScore / 100) + 1`
- Points per correct answer: 10
