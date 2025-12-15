import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    
    console.log(`[DB] NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[DB] MONGODB_URI exists: ${!!MONGODB_URI}`);
    
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(MONGODB_URI);
    
    console.log(`[DB] MongoDB connected successfully to: ${MONGODB_URI.substring(0, 30)}...`);
  } catch (error) {
    console.error('[DB] MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
