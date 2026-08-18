const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
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

async function startMongo() {
  console.log('Starting MongoDB Memory Server...');
  
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017 },
  });

  const uri = mongod.getUri();

  console.log(`MongoDB started: ${uri}`);

  // Write .env.test immediately so the server can connect to MongoDB
  const envContent = `MONGODB_URI=${uri}
SESSION_SECRET=test-secret-key
NODE_ENV=test
PORT=8080
`;
  fs.writeFileSync('.env.test', envContent);
  fs.writeFileSync('.mongo-pid.json', JSON.stringify({ port: 27017 }));
  console.log('Created .env.test file');

  console.log('Seeding challenge data...');
  await seedChallenges(uri);
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
