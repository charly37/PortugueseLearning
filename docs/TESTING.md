# Testing with MongoDB

This project uses **MongoDB Memory Server** for running tests, which creates an in-memory MongoDB instance automatically. This means:

✅ **No MongoDB Atlas connection needed for tests**  
✅ **No GitHub secrets required**  
✅ **Faster test execution**  
✅ **Isolated test environment**

## How It Works

When you run `npm test`, the following happens automatically:

1. `run-tests.sh` starts MongoDB Memory Server
2. Creates `.env.test` file with the connection string
3. Runs Playwright tests
4. Cleans up MongoDB Memory Server and `.env.test`

## Running Tests Locally

```bash
npm test
```

The MongoDB Memory Server will start automatically and tests will run against it.

## GitHub Actions

The CI/CD pipeline (`.github/workflows/ci-cd.yml`) runs tests using MongoDB Memory Server automatically - no setup or secrets required.

## Troubleshooting

If tests fail:
1. Ensure ports 8080, 3000, and 27017 are not in use
2. Kill any hanging processes: `pkill -f "webpack" && pkill -f "ts-node-dev"`
3. Remove stale files: `rm -f .env.test .mongo-pid.json`

## Alternative: MongoDB Atlas for Tests

If you prefer to use MongoDB Atlas instead of the in-memory database:

1. Add GitHub secrets:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `SESSION_SECRET`: A random secret key

2. Modify `.github/workflows/ci-cd.yml` to create `.env.test` before tests:
   ```yaml
   - name: Create test environment file
     run: |
       echo "MONGODB_URI=${{ secrets.MONGODB_URI }}" >> .env.test
       echo "SESSION_SECRET=${{ secrets.SESSION_SECRET }}" >> .env.test
       echo "NODE_ENV=test" >> .env.test
       echo "PORT=8080" >> .env.test
   ```

## Files

- `run-tests.sh`: Test runner that manages MongoDB Memory Server
- `tests/start-mongo.js`: Starts MongoDB Memory Server
- `tests/stop-mongo.js`: Cleanup script
- `.env.test`: Auto-generated during tests (not committed)
