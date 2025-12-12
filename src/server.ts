import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

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

// Serve the React app for all other routes
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
