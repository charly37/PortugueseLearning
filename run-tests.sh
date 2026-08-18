#!/bin/bash

# Clean old processes that may be using the same ports
echo "🧹 Cleaning up old processes..."
lsof -i :3000,8080,27017
pkill -f "webpack" && pkill -f "ts-node-dev" && pkill -f "playwright"

# Clean up any existing test files first
node tests/stop-mongo.js 2>/dev/null || true

# Ensure Playwright browsers are installed
echo "🌐 Checking Playwright browsers..."
if ! npx playwright install --dry-run chromium 2>&1 | grep -q "already installed"; then
  echo "📦 Installing Playwright browsers (first-time setup)..."
  npx playwright install chromium
fi

echo "🚀 Starting MongoDB Memory Server..."

# Start MongoDB Memory Server and create .env.test file
node tests/start-mongo.js &
MONGO_PID=$!

# Wait for seeding to complete (start-mongo.js writes .seed-complete when done)
for i in {1..120}; do
  if [ -f ".seed-complete" ]; then
    echo "✅ MongoDB Memory Server ready and seeded!"
    cat .env.test
    break
  fi
  sleep 0.5
done

# Run Playwright tests
npx playwright test "$@"
TEST_EXIT=$?

# Cleanup
echo "🧹 Stopping MongoDB Memory Server..."
node tests/stop-mongo.js
kill $MONGO_PID 2>/dev/null || true

exit $TEST_EXIT
