import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

interface ChallengeProgress {
  totalAttempts: number;
  correctAnswers: number;
  streak: number;
  lastAttemptDate?: Date;
  completedChallenges: string[];
}

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  createdAt: Date;
  progress: {
    word: ChallengeProgress;
    idiom: ChallengeProgress;
    verb: ChallengeProgress;
  };
  totalScore: number;
  level: number;
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
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  createdAt: {
    type: Date,
    default: Date.now
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
  }
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
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
