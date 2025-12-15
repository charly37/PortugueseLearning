#!/usr/bin/env node
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

async function setup() {
  console.log('🚀 Setting up test environment...');
  
  // Start MongoDB Memory Server
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017,
    },
  });

  const uri = mongod.getUri();
  console.log(`✅ MongoDB Memory Server started: ${uri}`);

  // Write .env.test file
  const envPath = path.join(__dirname, '..', '.env.test');
  const envContent = `MONGODB_URI=${uri}
SESSION_SECRET=test-secret-key-for-testing-only
NODE_ENV=test
PORT=8080
`;
  
  fs.writeFileSync(envPath, envContent);
  console.log(`📝 Created .env.test file`);

  // Save MongoDB instance reference for cleanup
  const statePath = path.join(__dirname, '..', '.test-state.json');
  fs.writeFileSync(statePath, JSON.stringify({ mongoPort: 27017 }));
  
  // Keep process running until manually stopped
  console.log('✅ Test environment ready. MongoDB will run until tests complete.');
}

setup().catch((err) => {
  console.error('Failed to set up test environment:', err);
  process.exit(1);
});
