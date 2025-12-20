import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeAttempt extends Document {
  userId: mongoose.Types.ObjectId;
  challengeId: string;
  challengeType: 'word' | 'idiom' | 'verb';
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  timeSpent?: number;
  attemptedAt: Date;
}

const challengeAttemptSchema = new Schema<IChallengeAttempt>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  challengeId: {
    type: String,
    required: true
  },
  challengeType: {
    type: String,
    enum: ['word', 'idiom', 'verb'],
    required: true
  },
  correct: {
    type: Boolean,
    required: true
  },
  userAnswer: {
    type: String,
    required: true
  },
  correctAnswer: {
    type: String,
    required: true
  },
  timeSpent: {
    type: Number
  },
  attemptedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound index for efficient queries
challengeAttemptSchema.index({ userId: 1, attemptedAt: -1 });
challengeAttemptSchema.index({ userId: 1, challengeType: 1 });

const ChallengeAttempt = mongoose.model<IChallengeAttempt>('ChallengeAttempt', challengeAttemptSchema);

export default ChallengeAttempt;
