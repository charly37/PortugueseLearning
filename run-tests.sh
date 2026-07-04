#!/bin/bash

# Clean old processes that may be using the same ports
echo "🧹 Cleaning up old processes..."
lsof -i :3000,8080,27017
pkill -f "webpack" && pkill -f "ts-node-dev"

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

# Wait for .env.test to exist
for i in {1..30}; do
  if [ -f ".env.test" ]; then
    echo "✅ MongoDB Memory Server ready!"
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
