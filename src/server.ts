import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import connectDB from './config/database';
import { initCache, startCacheRefresh, getWordChallenges, getVerbChallenges, getIdiomChallenges } from './challengeCache';
import authRoutes from './routes/auth';
import challengeRoutes from './routes/challenge';
import weeklyChallengeRoutes from './routes/weeklyChallenge';
import weeklyStoryRoutes from './routes/weeklyStory';
import { metricsHandler } from './routes/metrics';

// Load environment variables
// In test mode, use .env.test; otherwise use .env
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Connect to MongoDB then warm the challenge cache
connectDB().then(async () => {
  await initCache();
  startCacheRefresh();
}).catch(err => {
  console.error('[server] Failed to initialise challenge cache:', err);
});

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

// Weekly story routes
app.use('/api/weekly-story', weeklyStoryRoutes);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve audio files from the data directory
//app.use('/data', express.static(path.join(__dirname, '../data')));

// Serve audio files from the sounds directory
const soundsPath = path.join(__dirname, '../sounds');
console.log(`Serving basic audio files from: ${soundsPath}`);
app.use('/sounds', express.static(soundsPath));

// Serve weekly lesson MP3 files - let s make it configurable via environment variable and helm values
const audioPath = process.env.AUDIO_PATH || path.join(__dirname, '../weekly-audio');
//print a log message on startup to confirm the audio path being used
console.log(`Serving weekly audio files from: ${audioPath}`);
app.use('/weekly-audio', express.static(audioPath));



// API routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.get('/api/challenges/word', (req: Request, res: Response) => {
  const c = getWordChallenges();
  res.json(c[Math.floor(Math.random() * c.length)]);
});

app.get('/api/challenges/verb', (req: Request, res: Response) => {
  const c = getVerbChallenges();
  res.json(c[Math.floor(Math.random() * c.length)]);
});

app.get('/api/challenges/idiom', (req: Request, res: Response) => {
  const c = getIdiomChallenges();
  res.json(c[Math.floor(Math.random() * c.length)]);
});

// Legacy routes for backward compatibility
app.get('/api/challenge', (req: Request, res: Response) => {
  const c = getWordChallenges();
  res.json(c[Math.floor(Math.random() * c.length)]);
});

app.get('/api/verb-challenge', (req: Request, res: Response) => {
  const c = getVerbChallenges();
  res.json(c[Math.floor(Math.random() * c.length)]);
});

app.get('/api/idiom-challenge', (req: Request, res: Response) => {
  const c = getIdiomChallenges();
  res.json(c[Math.floor(Math.random() * c.length)]);
});

// Get all challenges for learn/flashcard mode
app.get('/api/word-challenges-all',  (req: Request, res: Response) => res.json(getWordChallenges()));
app.get('/api/verb-challenges-all',  (req: Request, res: Response) => res.json(getVerbChallenges()));
app.get('/api/idiom-challenges-all', (req: Request, res: Response) => res.json(getIdiomChallenges()));

// XML Sitemap
app.get('/sitemap.xml', (req: Request, res: Response) => {
  const baseUrl = process.env.BASE_URL || 'https://dialecthub.net';
  const pages = [
    { path: '/',                 changefreq: 'weekly',  priority: '1.0' },
    { path: '/about',            changefreq: 'monthly', priority: '0.7' },
    { path: '/word-challenge',   changefreq: 'weekly',  priority: '0.9' },
    { path: '/word-learn',       changefreq: 'weekly',  priority: '0.8' },
    { path: '/verb-challenge',   changefreq: 'weekly',  priority: '0.9' },
    { path: '/verb-learn',       changefreq: 'weekly',  priority: '0.8' },
    { path: '/idiom-challenge',  changefreq: 'weekly',  priority: '0.9' },
    { path: '/idiom-learn',      changefreq: 'weekly',  priority: '0.8' },
    { path: '/weekly-challenge', changefreq: 'weekly',  priority: '0.8' },
    { path: '/weekly-story',     changefreq: 'weekly',  priority: '0.8' },
  ];
  const urls = pages
    .map(p => `  <url>\n    <loc>${baseUrl}${p.path}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`)
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(sitemap);
});

// Prometheus metrics endpoint
app.get('/metrics', metricsHandler);

// Serve the React app for all other routes
app.get('/{*path}', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
