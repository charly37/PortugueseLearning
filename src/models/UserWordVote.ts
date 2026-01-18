import mongoose, { Schema, Document } from 'mongoose';

export interface IUserWordVote extends Document {
    userId: mongoose.Types.ObjectId;
    challengeId: string;
    usefulness: number;
    votedAt: Date;
    updatedAt: Date;
}

const UserWordVoteSchema: Schema = new Schema({
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
    usefulness: {
        type: Number,
        required: true,
        min: 1,
        max: 3
    },
    votedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure one vote per user per challenge
UserWordVoteSchema.index({ userId: 1, challengeId: 1 }, { unique: true });

// Update the updatedAt timestamp on save
UserWordVoteSchema.pre('save', function() {
    this.updatedAt = new Date();
});

export default mongoose.model<IUserWordVote>('UserWordVote', UserWordVoteSchema);
