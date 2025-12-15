const fs = require('fs');
const path = require('path');

/**
 * Global teardown for Playwright tests
 * Stops the MongoDB Memory Server and cleans up test files
 */
async function globalTeardown() {
  console.log('🧹 [globalTeardown] Cleaning up test environment...');
  
  // Stop MongoDB Memory Server
  const mongod = global.__MONGOD__;
  if (mongod) {
    await mongod.stop();
    console.log('✅ [globalTeardown] MongoDB Memory Server stopped');
  }

  // Clean up .env.test file
  const envTestPath = path.join(__dirname, '..', '.env.test');
  if (fs.existsSync(envTestPath)) {
    fs.unlinkSync(envTestPath);
    console.log('🗑️  [globalTeardown] Removed .env.test file');
  }
}

module.exports = globalTeardown;
