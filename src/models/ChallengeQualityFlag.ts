import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeQualityFlag extends Document {
  userId: mongoose.Types.ObjectId;
  challengeId: string;
  flaggedAt: Date;
  updatedAt: Date;
}

const ChallengeQualityFlagSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  challengeId: {
    type: String,
    required: true,
    index: true
  },
  flaggedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure one flag per user per challenge
ChallengeQualityFlagSchema.index({ userId: 1, challengeId: 1 }, { unique: true });

// Update the updatedAt timestamp before saving
ChallengeQualityFlagSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model<IChallengeQualityFlag>('ChallengeQualityFlag', ChallengeQualityFlagSchema);
