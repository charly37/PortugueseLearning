#!/bin/bash

# Clean up any existing test files first
node tests/stop-mongo.js 2>/dev/null || true

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
