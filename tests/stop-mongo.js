const fs = require('fs');
const { execSync } = require('child_process');

// Kill any process holding the MongoDB test port (27017)
try {
  execSync('fuser -k 27017/tcp', { stdio: 'ignore' });
} catch (_) {
  // fuser returns non-zero if nothing is listening — that's fine
}

// Cleanup test files
try {
  if (fs.existsSync('.env.test')) fs.unlinkSync('.env.test');
  if (fs.existsSync('.mongo-pid.json')) fs.unlinkSync('.mongo-pid.json');
  if (fs.existsSync('.seed-complete')) fs.unlinkSync('.seed-complete');
  console.log('Cleaned up test files');
} catch (err) {
  console.error('Cleanup error:', err);
}
