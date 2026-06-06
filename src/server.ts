import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import connectDB from './config/database';
import authRoutes from './routes/auth';
import challengeRoutes from './routes/challenge';
import weeklyChallengeRoutes from './routes/weeklyChallenge';

// Load environment variables
// In test mode, use .env.test; otherwise use .env
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Connect to MongoDB
connectDB();

// Trust proxy - important for nginx reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      touchAfter: 24 * 3600 // lazy session update
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      httpOnly: true,
      secure: false, // Keep false for HTTP
      sameSite: 'lax'
    }
  })
);

// Authentication routes
app.use('/api/auth', authRoutes);

// Challenge routes
app.use('/api/challenge', challengeRoutes);

// Weekly challenge routes
app.use('/api/weekly-challenge', weeklyChallengeRoutes);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve audio files from the data directory
app.use('/data', express.static(path.join(__dirname, '../data')));

// Serve weekly lesson MP3 files
app.use('/weekly-audio', express.static(path.join(__dirname, '../vocal_lesson_creator/output')));

// Load challenges from JSON files
const challengesPath = path.join(__dirname, '../data/challenges.json');
const challenges = JSON.parse(fs.readFileSync(challengesPath, 'utf-8'));

const verbChallengesPath = path.join(__dirname, '../data/verb-challenges.json');
const verbChallenges = JSON.parse(fs.readFileSync(verbChallengesPath, 'utf-8'));

const idiomChallengesPath = path.join(__dirname, '../data/idiom-challenges.json');
const idiomChallenges = JSON.parse(fs.readFileSync(idiomChallengesPath, 'utf-8'));

// API routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.get('/api/challenges/word', (req: Request, res: Response) => {
  const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
  res.json(randomChallenge);
});

app.get('/api/challenges/verb', (req: Request, res: Response) => {
  const randomChallenge = verbChallenges[Math.floor(Math.random() * verbChallenges.length)];
  res.json(randomChallenge);
});

app.get('/api/challenges/idiom', (req: Request, res: Response) => {
  const randomChallenge = idiomChallenges[Math.floor(Math.random() * idiomChallenges.length)];
  res.json(randomChallenge);
});

// Legacy routes for backward compatibility
app.get('/api/challenge', (req: Request, res: Response) => {
  const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
  res.json(randomChallenge);
});

app.get('/api/verb-challenge', (req: Request, res: Response) => {
  const randomChallenge = verbChallenges[Math.floor(Math.random() * verbChallenges.length)];
  res.json(randomChallenge);
});

app.get('/api/idiom-challenge', (req: Request, res: Response) => {
  const randomChallenge = idiomChallenges[Math.floor(Math.random() * idiomChallenges.length)];
  res.json(randomChallenge);
});

// Get all challenges for learn/flashcard mode
app.get('/api/word-challenges-all', (req: Request, res: Response) => {
  res.json(challenges);
});

app.get('/api/verb-challenges-all', (req: Request, res: Response) => {
  res.json(verbChallenges);
});

app.get('/api/idiom-challenges-all', (req: Request, res: Response) => {
  res.json(idiomChallenges);
});

// Serve the React app for all other routes
app.get('/{*path}', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
