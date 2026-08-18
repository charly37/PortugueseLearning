import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import Challenge from '../src/models/Challenge';

/**
 * Global setup for Playwright tests
 * Starts an in-memory MongoDB instance, seeds challenge data, and saves the
 * connection URI to .env.test
 */
async function globalSetup() {
  console.log('🚀 Starting MongoDB Memory Server for tests...');
  
  const envTestPath = path.join(__dirname, '..', '.env.test');
  
  // Create a MongoDB Memory Server instance
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017, // Use default MongoDB port
    },
  });

  const uri = mongod.getUri();
  console.log(`✅ MongoDB Memory Server started at: ${uri}`);

  // Save the URI to a test environment file IMMEDIATELY
  const envContent = `MONGODB_URI=${uri}
SESSION_SECRET=test-secret-key-for-testing-only
NODE_ENV=test
PORT=8080
`;

  fs.writeFileSync(envTestPath, envContent, 'utf8');
  console.log('📝 Created .env.test file with MongoDB URI');
  console.log(`📍 File location: ${envTestPath}`);
  
  // Verify file was created and has content
  if (fs.existsSync(envTestPath)) {
    const content = fs.readFileSync(envTestPath, 'utf8');
    console.log(`✅ Verified .env.test file exists with ${content.split('\n').length} lines`);
  } else {
    throw new Error('Failed to create .env.test file');
  }

  // Seed challenge data so the cache has something to serve during tests
  await seedChallenges(uri);

  // Store the mongod instance for cleanup in global teardown
  (global as any).__MONGOD__ = mongod;
}

async function seedChallenges(uri: string): Promise<void> {
  console.log('🌱 Seeding challenge data into test MongoDB...');
  const dataDir = path.join(__dirname, '..', 'data');
  const files: Array<{ file: string; type: 'word' | 'verb' | 'idiom' }> = [
    { file: 'challenges.json',      type: 'word'  },
    { file: 'verb-challenges.json', type: 'verb'  },
    { file: 'idiom-challenges.json', type: 'idiom' },
  ];

  await mongoose.connect(uri);
  for (const { file, type } of files) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) { console.warn(`WARN: ${file} not found`); continue; }

    const raw: any[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const docs = raw
      .filter(item => item.id)
      .map(({ id, ...fields }) => ({ _id: id, type, schemaVersion: 1, ...fields }));

    if (docs.length > 0) {
      await Challenge.insertMany(docs, { ordered: false });
      console.log(`  [${type}] inserted ${docs.length} challenges`);
    }
  }
  await mongoose.disconnect();
  console.log('✅ Challenge seed complete');
}

export default globalSetup;
