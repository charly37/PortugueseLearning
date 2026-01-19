import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

interface ChallengeProgress {
  totalAttempts: number;
  correctAnswers: number;
  streak: number;
  lastAttemptDate?: Date;
  completedChallenges: string[];
}

interface WeakWord {
  challengeId: string;
  word: string;
  accuracy: number;
  attempts: number;
}

interface WeakCategory {
  accuracy: number;
  attempts: number;
}

interface Weaknesses {
  totalAttempts: number;
  weakWords: WeakWord[];
  weakCategories: {
    [key: string]: WeakCategory;
  };
  overallAccuracy: number;
  analyzedAt: Date;
}

export interface IUser extends Document {
  username: string;
  email?: string;  // Optional for guest users
  password?: string;  // Optional for guest users
  isGuest: boolean;
  guestExpiresAt?: Date;  // Auto-delete date for guest users
  createdAt: Date;
  preferredLanguage: 'fr' | 'en';
  mobileFriendly: boolean;
  progress: {
    word: ChallengeProgress;
    idiom: ChallengeProgress;
    verb: ChallengeProgress;
  };
  totalScore: number;
  level: number;
  weaknesses?: Weaknesses;
  weaknessesUpdatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: false,  // Optional for guest users
    unique: true,
    sparse: true,  // Allow multiple null values
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: false,  // Optional for guest users
    minlength: 6
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  guestExpiresAt: {
    type: Date,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  preferredLanguage: {
    type: String,
    enum: ['fr', 'en'],
    default: 'fr'
  },
  mobileFriendly: {
    type: Boolean,
    default: false
  },
  progress: {
    word: {
      totalAttempts: { type: Number, default: 0 },
      correctAnswers: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      lastAttemptDate: { type: Date },
      completedChallenges: { type: [String], default: [] }
    },
    idiom: {
      totalAttempts: { type: Number, default: 0 },
      correctAnswers: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      lastAttemptDate: { type: Date },
      completedChallenges: { type: [String], default: [] }
    },
    verb: {
      totalAttempts: { type: Number, default: 0 },
      correctAnswers: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      lastAttemptDate: { type: Date },
      completedChallenges: { type: [String], default: [] }
    }
  },
  totalScore: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },
  weaknesses: {
    type: Schema.Types.Mixed,
    default: null
  },
  weaknessesUpdatedAt: {
    type: Date
  }
});

// TTL index to auto-delete expired guest users
userSchema.index(
  { guestExpiresAt: 1 },
  { 
    expireAfterSeconds: 0,
    partialFilterExpression: { isGuest: true }
  }
);

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model<IUser>('User', userSchema);

export default User;
