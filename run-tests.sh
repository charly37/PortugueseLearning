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

# Poll until start-mongo.js signals readiness (writes .seed-complete) or timeout
echo "⏳ Waiting for MongoDB Memory Server to be ready..."
MAX_WAIT=60  # seconds
ELAPSED=0
until [ -f ".seed-complete" ]; do
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ Timed out waiting for MongoDB Memory Server after ${MAX_WAIT}s. Aborting."
    kill $MONGO_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

# Guard: ensure .env.test exists and its MONGODB_URI points to localhost (not Atlas)
if [ ! -f ".env.test" ]; then
  echo "❌ .env.test was not created. Aborting to avoid hitting production database."
  kill $MONGO_PID 2>/dev/null || true
  exit 1
fi
MONGO_URI=$(grep '^MONGODB_URI=' .env.test | cut -d= -f2-)
if [[ "$MONGO_URI" != *"127.0.0.1"* && "$MONGO_URI" != *"localhost"* ]]; then
  echo "❌ MONGODB_URI in .env.test does not look like a local instance: $MONGO_URI"
  echo "   Aborting to avoid hitting production database."
  kill $MONGO_PID 2>/dev/null || true
  exit 1
fi

echo "✅ MongoDB Memory Server ready and seeded! (${ELAPSED}s)"
cat .env.test

# Run Playwright tests
npx playwright test "$@"
TEST_EXIT=$?

# Cleanup
echo "🧹 Stopping MongoDB Memory Server..."
node tests/stop-mongo.js
kill $MONGO_PID 2>/dev/null || true

exit $TEST_EXIT
