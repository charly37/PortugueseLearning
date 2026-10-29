import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeQualityFlag extends Document {
  userId: mongoose.Types.ObjectId;
  challengeId: string;
  // Native language the user was practising when they flagged the card.
  // The same challenge can be wrong in French but fine in English.
  language: string;
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
  language: {
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

// One flag per user, per challenge, per language. Keeping the language in the key
// lets a user flag the French wording and the English wording independently.
ChallengeQualityFlagSchema.index({ userId: 1, challengeId: 1, language: 1 }, { unique: true });

// Update the updatedAt timestamp before saving
ChallengeQualityFlagSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model<IChallengeQualityFlag>('ChallengeQualityFlag', ChallengeQualityFlagSchema);
