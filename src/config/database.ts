import mongoose from 'mongoose';
import logger from '../logger';

const log = logger.child({ module: 'database' });

const connectDB = async (): Promise<void> => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;

    log.debug(
      { nodeEnv: process.env.NODE_ENV, mongoUriConfigured: !!MONGODB_URI },
      'MongoDB configuration check'
    );

    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(MONGODB_URI);

    log.info(
      { host: mongoose.connection.host, db: mongoose.connection.name },
      'MongoDB connected'
    );
  } catch (error) {
    log.fatal({ err: error }, 'MongoDB connection error');
    process.exit(1);
  }
};

export default connectDB;
