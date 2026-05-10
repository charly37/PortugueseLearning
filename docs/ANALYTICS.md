# Analytics - Weakness Analysis & Quality Monitoring

Python service that analyzes user challenge attempts to identify learning weaknesses and aggregates quality feedback.

## Features

### Weakness Analysis
- Analyzes user performance over the last 30 days
- Identifies weak words (< 50% accuracy with 3+ attempts)
- Calculates category-specific accuracies (word/idiom/verb)
- Updates user documents with weakness data

### Usefulness Aggregation
- Aggregates user votes on challenge usefulness (1-3 scale)
- Calculates average usefulness per challenge
- Updates challenge JSON files with aggregated scores

### Scheduling
- Runs as a Docker container with scheduled execution
- All jobs execute daily at 2:00 AM

## Architecture

The analytics service runs as a separate Docker container that:
- Runs continuously in the background
- Executes analysis daily at 2:00 AM
- Shares the MongoDB connection with the main app
- Logs output via Docker logs

## Files

- **`scheduler.py`** - Main entry point, handles scheduling with sleep loop
- **`analyze_weaknesses.py`** - Core weakness analysis logic
- **`aggregate_usefulness.py`** - Aggregates user usefulness votes
- **`Dockerfile`** - Container definition
- **`requirements.txt`** - Python dependencies

> **Note:** Quality flag monitoring is no longer handled by a standalone analytics script.
> `data/VocabularyUpdater.py` now reads user-flagged challenges directly from MongoDB
> at startup and prioritizes them for AI review (highest flag count first), then
> automatically clears those flags from the database after processing.

## Local Development

### Manual Run with Options

All analytics scripts now support command-line arguments with automatic `-h` help generation:

#### Weakness Analysis
```bash
cd analytics
python analyze_weaknesses.py -h  # Show help

# Run with custom parameters
python analyze_weaknesses.py --days-back 30 --min-attempts 10
```

**Available Options:**
- `--days-back` - Number of days to look back for analysis (default: 30)
- `--min-attempts` - Minimum attempts required for user analysis (default: 10)

#### Usefulness Aggregation
```bash
python aggregate_usefulness.py -h  # Show help

# Run with custom parameters
python aggregate_usefulness.py --min-votes 3 --data-dir ../data
```

**Available Options:**
- `--min-votes` - Minimum votes required to update a challenge (default: 1)
- `--data-dir` - Directory containing challenge JSON files (default: ../data)

### Test Scheduler
```bash
python scheduler.py
# Runs immediately then waits for next 2 AM
```

## Production Deployment

### Build and Push
```bash
# Build analytics container
docker build -t charly37/portuguese-learning-analytics:latest -f analytics/Dockerfile .

# Push to Docker Hub
docker push charly37/portuguese-learning-analytics:latest
```

### Deploy
The analytics container is automatically deployed via `deploy.sh`:
```bash
./deploy.sh
```

### View Logs
```bash
# View analytics logs
docker compose logs -f analytics

# Check if running
docker compose ps analytics
```

### Adjust Schedule
To change the run time, edit `analytics/scheduler.py`:
```python
seconds_until_next = calculate_seconds_until_next_run(target_hour=2, target_minute=0)
```

## Environment Variables

Uses the same `.env` file as the main application:
- `MONGODB_URI` - MongoDB connection string

## Output

### Weakness Analysis
Adds a `weaknesses` field to each user document:

```javascript
{
  "weaknesses": {
    "totalAttempts": 45,
    "overallAccuracy": 73.33,
    "weakWords": [
      {
        "challengeId": "word_123",
        "word": "comprida",
        "accuracy": 33.33,
        "attempts": 6
      }
    ],
    "weakCategories": {
      "word": { "accuracy": 75.5, "attempts": 30 },
      "idiom": { "accuracy": 66.7, "attempts": 15 }
    },
    "analyzedAt": "2025-12-28T02:00:00.000Z"
  },
  "weaknessesUpdatedAt": "2025-12-28T02:00:00.000Z"
}
```

### Usefulness Aggregation
Updates `user_usefulness` field in challenge JSON files:

```json
{
  "id": "challenge-uuid",
  "port": "palavra",
  "user_usefulness": 2
}
```

## Configuration

### Weakness Analysis
Edit `analytics/analyze_weaknesses.py` to adjust:
- `days_back=30` - Days of history to analyze
- `min_attempts=10` - Minimum attempts required
- Weak word threshold (currently 50% accuracy)

### Usefulness Aggregation
Edit `analytics/aggregate_usefulness.py` to adjust:
- `min_votes=1` - Minimum votes before updating challenges
- Rounding behavior (currently rounds to nearest integer 1-3)

### Quality Flag Monitoring
Quality flag prioritization is handled by `data/VocabularyUpdater.py`.
Use the `--min-flags` argument to control the minimum number of user flags required
to prioritize a challenge (default: 1). Flags are automatically cleared from MongoDB
after the flagged challenge is processed.
