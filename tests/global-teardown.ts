import * as fs from 'fs';
import * as path from 'path';

/**
 * Global teardown for Playwright tests
 * Stops the MongoDB Memory Server and cleans up test environment files
 */
async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...');

  // Stop MongoDB Memory Server
  const mongod = (global as any).__MONGOD__;
  if (mongod) {
    await mongod.stop();
    console.log('✅ MongoDB Memory Server stopped');
  }

  // Clean up .env.test file
  const envTestPath = path.join(__dirname, '..', '.env.test');
  if (fs.existsSync(envTestPath)) {
    fs.unlinkSync(envTestPath);
    console.log('🗑️  Removed .env.test file');
  }
}

export default globalTeardown;
