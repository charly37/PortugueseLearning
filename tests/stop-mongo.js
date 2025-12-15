const fs = require('fs');

// Cleanup test files
try {
  if (fs.existsSync('.env.test')) fs.unlinkSync('.env.test');
  if (fs.existsSync('.mongo-pid.json')) fs.unlinkSync('.mongo-pid.json');
  console.log('Cleaned up test files');
} catch (err) {
  console.error('Cleanup error:', err);
}
