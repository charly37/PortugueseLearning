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

### 4. **Challenge Statistics Dashboard**
A dedicated statistics page for each challenge type (word/verb/idiom) that displays:

#### Overview Statistics
- Total attempts, correct answers, and accuracy percentage
- Current streak with fire icon indicator
- Visual progress bars for performance metrics
- Number of unique challenges completed
- Last attempt timestamp

#### Recent Attempts History
- Last 20 attempts with full details
- Color-coded correct/incorrect indicators (green checkmark, red X)
- User's answer vs. correct answer comparison
- Time spent on each challenge
- Portuguese word/idiom/verb shown for reference

#### Weak Areas Analysis
- Identifies challenges with low success rates
- Shows challenges attempted at least twice
- Sorted by success rate (lowest first)
- Displays attempts and success percentage
- Quick link to practice button for focused improvement

#### UI Components
- Clean Material-UI design matching application style
- Color-coded by challenge type (blue for word, purple for verb, orange for idiom)
- Responsive layout with grid-based statistics cards
- Loading states and error handling
- Back button to return to landing page

## API Endpoints

### Generate Challenge Set
```
POST /api/challenge/generate
```
**Purpose**: Generate a personalized set of challenges for quiz/test mode based on user preferences and weakness data.

**Body:**
```json
{
  "challengeType": "word" | "idiom" | "verb",
  "totalTurns": number,           // 1-50, default: 10
  "weaknessWeight": number,       // 0-1, default: 0.5 (50% weak areas)
  "mobileFriendly": boolean,      // default: false
  "minUsefulness": number         // 1-3, optional (filter by usefulness level)
}
```

**Response:**
```json
{
  "challengeType": "word",
  "challenges": [
    {
      "id": "uuid",
      "port": "palavra",
      "fr": { "translation": "mot", "note": "..." },
      "en": { "translation": "word", "note": "..." },
      "user_usefulness": 2,
      "source": "weakness" | "random",
      "options": ["palavra", "..."],  // if mobileFriendly=true
      "distractors": ["..."]          // if mobileFriendly=true
    }
  ],
  "metadata": {
    "totalChallenges": 10,
    "weaknessChallenges": 5,
    "randomChallenges": 5,
    "weaknessWeight": 0.5,
    "availableWeak": 15,
    "availableTotal": 3000,
    "mobileFriendly": false,
    "usefulnessFiltered": true,
    "minUsefulness": 2,
    "availableAfterUsefulnessFilter": 2850
  }
}
```

**Usefulness Filter Behavior:**
- `minUsefulness: 1` - All words (includes usefulness 1, 2, 3)
- `minUsefulness: 2` - Useful+ (includes usefulness 2, 3 only)
- `minUsefulness: 3` - Very Useful Only (includes usefulness 3 only)
- `undefined` or omitted - Defaults to 1 (all words)

**Filter Order:** Usefulness filtering is applied BEFORE weakness splitting, ensuring the two-pool system (weak/random) works correctly with the filtered set.

### Generate Learn Set (Flashcards)
```
POST /api/challenge/generate-learn
```
**Purpose**: Generate a personalized set of flashcards for learning mode.

**Body:**
```json
{
  "challengeType": "word" | "idiom" | "verb",
  "totalCards": number,           // 1-100, default: 50
  "weaknessWeight": number,       // 0-1, default: 0.5
  "minUsefulness": number         // 1-3, optional (filter by usefulness level)
}
```

**Response:** Same structure as `/generate`, but challenges are ordered (weak first, then random) instead of shuffled.

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

### ChallengeStatsPage.tsx (NEW)
- Comprehensive statistics dashboard per challenge type
- Three main sections: Overview, Recent Attempts, Weak Areas
- Color-coded indicators and progress bars
- Responsive Material-UI layout
- Accessible from landing page via "My Stats" buttons

### Challenge Pages (All 3 types)
- Added time tracking
- Automatic submission of results
- No UI changes (seamless integration)

### LandingPage.tsx
- Added "My Stats" buttons for each challenge type (for logged-in users)
- Links to dedicated statistics pages
- Shows after challenge and practice buttons

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
