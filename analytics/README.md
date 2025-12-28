# Analytics - Weakness Analysis

Python service that analyzes user challenge attempts to identify learning weaknesses.

## Features

- Analyzes user performance over the last 30 days
- Identifies weak words (< 50% accuracy with 3+ attempts)
- Calculates category-specific accuracies (word/idiom/verb)
- Updates user documents with weakness data
- Runs as a Docker container with scheduled execution

## Architecture

The analytics service runs as a separate Docker container that:
- Runs continuously in the background
- Executes analysis daily at 2:00 AM
- Shares the MongoDB connection with the main app
- Logs output via Docker logs

## Files

- **`scheduler.py`** - Main entry point, handles scheduling with sleep loop
- **`analyze_weaknesses.py`** - Core analysis logic
- **`Dockerfile`** - Container definition
- **`requirements.txt`** - Python dependencies

## Local Development

### Manual Run
```bash
cd analytics
pip install -r requirements.txt
python analyze_weaknesses.py
```

### Test Scheduler
```bash
python scheduler.py
# Runs immediately then waits for next 2 AM
```

## Production Deployment

### Build and Push
```bash
# Build analytics container
docker build -t charly37/portuguese-learning-analytics:latest -f analytics/Dockerfile analytics/

# Push to Docker Hub
docker push charly37/portuguese-learning-analytics:latest
```

### Deploy
The analytics container is automatically deployed via [`deploy.sh`](../deploy.sh):
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
To change the run time, edit [`scheduler.py`](scheduler.py):
```python
seconds_until_next = calculate_seconds_until_next_run(target_hour=2, target_minute=0)
```

## Environment Variables

Uses the same `.env` file as the main application:
- `MONGODB_URI` - MongoDB connection string

## Output

The script adds a `weaknesses` field to each user document:

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

## Configuration

Edit `analyze_weaknesses.py` to adjust:
- `days_back=30` - Days of history to analyze
- `min_attempts=10` - Minimum attempts required
- Weak word threshold (currently 50% accuracy)
