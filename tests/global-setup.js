const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

/**
 * Global setup for Playwright tests
 * Starts an in-memory MongoDB instance and saves the connection URI to .env.test
 */
async function globalSetup() {
  console.log('🚀 [globalSetup] Starting MongoDB Memory Server for tests...');
  
  const envTestPath = path.join(__dirname, '..', '.env.test');
  
  // Create a MongoDB Memory Server instance
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017, // Use default MongoDB port
    },
  });

  const uri = mongod.getUri();
  console.log(`✅ [globalSetup] MongoDB Memory Server started at: ${uri}`);

  // Save the URI to a test environment file IMMEDIATELY
  const envContent = `MONGODB_URI=${uri}
SESSION_SECRET=test-secret-key-for-testing-only
NODE_ENV=test
PORT=8080
`;

  fs.writeFileSync(envTestPath, envContent, 'utf8');
  console.log('📝 [globalSetup] Created .env.test file with MongoDB URI');
  console.log(`📍 [globalSetup] File location: ${envTestPath}`);
  
  // Verify file was created and has content
  if (fs.existsSync(envTestPath)) {
    const content = fs.readFileSync(envTestPath, 'utf8');
    console.log(`✅ [globalSetup] Verified .env.test file exists with ${content.split('\n').length} lines`);
  } else {
    throw new Error('Failed to create .env.test file');
  }

  // Store the mongod instance for cleanup in global teardown
  global.__MONGOD__ = mongod;
  
  return async function() {
    // Return a function that returns the mongod instance for teardown
  };
}

module.exports = globalSetup;
