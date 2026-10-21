// Must stay first: loads .env/.env.test before any module reads process.env.
import './config/env';

import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import type { ServerResponse } from 'http';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import logger from './logger';
import connectDB from './config/database';
import { initCache, startCacheRefresh, getWordChallenges, getVerbChallenges, getIdiomChallenges } from './challengeCache';
import authRoutes from './routes/auth';
import challengeRoutes from './routes/challenge';
import weeklyChallengeRoutes from './routes/weeklyChallenge';
import weeklyStoryRoutes from './routes/weeklyStory';
import { metricsHandler } from './routes/metrics';

const log = logger.child({ module: 'server' });

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Connect to MongoDB, warm the challenge cache, then start listening
connectDB().then(async () => {
  await initCache();
  startCacheRefresh();

  app.listen(PORT, '0.0.0.0', () => {
    log.info({ port: PORT }, 'server listening');
  });
}).catch(err => {
  log.fatal({ err }, 'failed to initialise');
  process.exit(1);
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
log.info({ path: soundsPath }, 'serving basic audio files');
app.use('/sounds', express.static(soundsPath));

// Serve weekly lesson MP3 files - let s make it configurable via environment variable and helm values
const audioPath = process.env.AUDIO_PATH || path.join(__dirname, '../weekly-audio');
log.info({ path: audioPath }, 'serving weekly audio files');
app.use('/weekly-audio', express.static(audioPath));

// Serve the podcast RSS feed (feed.xml). The feed itself is produced by the podcast-feed
// CronJob into a hostPath volume, so it is not part of the Docker image; the cover art is
// (see the startup check below).
const podcastPath = process.env.PODCAST_PATH || path.join(__dirname, '../podcast');
log.info({ path: podcastPath }, 'serving podcast feed files');
app.use('/podcast', express.static(podcastPath, {
  // Podcast directories poll the feed; keep it fresh but honour conditional requests.
  maxAge: '5m',
  setHeaders: (res: ServerResponse, filePath: string) => {
    if (filePath.endsWith('.xml')) {
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    }
  }
}));

// The podcast cover ships with the client bundle (webpack copies src/images/podcast-cover.jpg
// to public/podcast/cover.jpg). Apple/Spotify reject the feed without it, so make the
// omission visible in the app logs instead of failing silently at submission time.
const podcastCoverPath = path.join(__dirname, '../public/podcast/cover.jpg');
if (!fs.existsSync(podcastCoverPath)) {
  log.warn(
    { path: podcastCoverPath },
    'podcast cover art missing - add src/images/podcast-cover.jpg and rebuild the client'
  );
}



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

// Central error handler - must be registered after all routes.
// Logs the error once as structured JSON and never leaks internals to the client.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  log.error(
    {
      err,
      method: req.method,
      url: req.originalUrl,
      userId: req.session?.userId,
    },
    'unhandled route error'
  );

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({ message: 'Internal server error' });
});
