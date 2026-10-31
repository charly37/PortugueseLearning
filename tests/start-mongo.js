const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHALLENGE_FILES = [
  { file: 'challenges.json',      type: 'word'  },
  { file: 'verb-challenges.json', type: 'verb'  },
  { file: 'idiom-challenges.json', type: 'idiom' },
];

async function seedChallenges(uri) {
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db().collection('challenges');

  for (const { file, type } of CHALLENGE_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) { console.warn(`WARN: ${file} not found`); continue; }

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const docs = raw
      .filter(item => item.id)
      .map(({ id, ...fields }) => ({ _id: id, type, schemaVersion: 1, ...fields }));

    if (docs.length > 0) {
      try {
        await col.insertMany(docs, { ordered: false });
      } catch (err) {
        // BulkWriteError thrown even with ordered:false when duplicates exist;
        // partial insertedCount in err.result means the rest were seeded fine.
        if (err.code !== 11000 && err.code !== 65) throw err;
      }
      console.log(`  [${type}] seeded challenges`);
    }
  }
  await client.close();
}

/**
 * Seeds one global (`userId: null`) weekly lesson per episode listed in the podcast
 * manifest fixtures, so /api/podcasts/:pair/episodes/:docId/words has data.
 */
async function seedPodcastLessons(uri) {
  // One template document per (weekStart, language) is what the feed publishes,
  // so the fixtures are seeded into weeklychallenge_templates with the manifest
  // docId as _id (that id is the episode guid).
  const podcasts = [
    { pair: 'fr-pt', language: 'fr' },
    { pair: 'en-pt', language: 'en' },
  ];

  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db().collection('weeklychallenge_templates');

  let seeded = 0;
  for (const { pair, language } of podcasts) {
    const manifestPath = path.join(__dirname, 'fixtures', 'podcast', 'vocabulary', pair, 'episodes.json');
    if (!fs.existsSync(manifestPath)) {
      console.warn(`WARN: podcast manifest fixture not found for ${pair}, skipping`);
      continue;
    }

    const episodes = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const episode of episodes) {
      await col.replaceOne(
        { _id: new ObjectId(episode.docId) },
        {
          weekStart: new Date(episode.pubDate),
          weekEnd: new Date(new Date(episode.pubDate).getTime() + 7 * 24 * 3600 * 1000),
          language,
          totalChallenges: 2,
          challenges: [
            { challengeId: 'seed-podcast-1', portuguese: 'obrigado', translation_fr: 'merci', translation_en: 'thank you' },
            { challengeId: 'seed-podcast-2', portuguese: 'bom dia', translation_fr: 'bonjour', translation_en: 'good morning' },
          ],
          audio: {
            filename: episode.filename,
            last_update: '2026-10-26',
            duration_s: episode.durationSeconds,
            size_bytes: episode.sizeBytes,
            language,
          },
        },
        { upsert: true }
      );
      seeded += 1;
    }
  }

  await client.close();
  console.log(`  [podcasts] seeded ${seeded} episode lesson(s)`);
}

async function startMongo() {
  console.log('Starting MongoDB Memory Server...');
  
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017 },
  });

  const uri = mongod.getUri();

  console.log(`MongoDB started: ${uri}`);

  // Write .env.test so the server reads the podcast manifest fixtures
  const podcastFixtures = path.join(__dirname, 'fixtures', 'podcast');
  // Audio fixtures are optional: *.mp3 is gitignored, so a fresh clone has no MP3s
  // and simply 404s on playback. Keep the variable only when they are present.
  const audioFixtures = path.join(__dirname, 'fixtures', 'weekly-audio');
  const audioEnv = fs.existsSync(audioFixtures) ? `AUDIO_PATH=${audioFixtures}\n` : '';

  // Write .env.test immediately so the server can connect to MongoDB
  const envContent = `MONGODB_URI=${uri}
SESSION_SECRET=test-secret-key
NODE_ENV=test
PORT=8080
# Public podcast page reads the manifest fixtures instead of the production hostPath
PODCAST_PAIRS=fr-pt,en-pt
PODCAST_SHOW=vocabulary
PODCAST_PATH=${podcastFixtures}
${audioEnv}`;
  fs.writeFileSync('.env.test', envContent);
  fs.writeFileSync('.mongo-pid.json', JSON.stringify({ port: 27017 }));
  console.log('Created .env.test file');

  console.log('Seeding challenge data...');
  await seedChallenges(uri);
  await seedPodcastLessons(uri);
  console.log('Challenge seed complete');

  // Signal to run-tests.sh that seeding is done and tests can safely start
  fs.writeFileSync('.seed-complete', 'done');
  
  // Keep process alive
  process.on('SIGTERM', async () => {
    await mongod.stop();
    process.exit(0);
  });
}

startMongo().catch(console.error);
