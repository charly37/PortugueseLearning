#!/bin/bash

# Wait for .env.test to exist (created by globalSetup)
echo "[start-test-server.sh] Waiting for .env.test file..."
for i in {1..60}; do
  if [ -f ".env.test" ]; then
    echo "[start-test-server.sh] ✅ .env.test file found!"
    echo "[start-test-server.sh] Content:"
    cat .env.test
    break
  fi
  echo "[start-test-server.sh] Attempt $i/60 - file not found yet..."
  if [ $i -eq 60 ]; then
    echo "[start-test-server.sh] ❌ Timeout waiting for .env.test file"
    ls -la . | grep env
    exit 1
  fi
  sleep 1
done

# Start the development server
echo "[start-test-server.sh] Starting server..."
NODE_ENV=test npm run dev
