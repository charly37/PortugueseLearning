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

### Quality Flag Monitoring
- Aggregates user-reported quality issues
- Identifies challenges flagged by multiple users (2+ threshold)
- Generates detailed reports with challenge content for manual review
- Reset option to clear all flags after fixing issues

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
- **`aggregate_quality_flags.py`** - Generates reports of flagged challenges
- **`Dockerfile`** - Container definition
- **`requirements.txt`** - Python dependencies

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

#### Quality Flag Management
```bash
python aggregate_quality_flags.py -h  # Show help

# Generate quality flag report
python aggregate_quality_flags.py --report

# Reset all quality flags after fixing challenges
python aggregate_quality_flags.py --reset

# Reset and verify with new report
python aggregate_quality_flags.py --reset --report
```

**Available Options:**
- `--reset` - Reset (remove) all quality flags from the database
- `--report` - Generate quality flag report (default if no --reset provided)

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

### Quality Flag Report
Outputs to Docker logs:

```
================================================================================
QUALITY FLAG REPORT
Generated at: 2026-01-26 02:00:00.123456
Minimum flags threshold: 2
================================================================================

Challenge ID: abc-123
Type: word
Portuguese: palavra
French: mot
English: word
Flags: 3 user(s) reported this challenge
--------------------------------------------------------------------------------

Total challenges needing review: 1
================================================================================
```

### Quality Flag Reset
When using the `--reset` option:

```
================================================================================
RESETTING ALL QUALITY FLAGS
Time: 2026-01-30 10:30:00.123456
================================================================================

✓ Successfully removed 15 quality flag(s)

================================================================================
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
Edit `analytics/aggregate_quality_flags.py` to adjust:
- `min_flags=2` - Minimum flags before appearing in report
- Report sorting (currently by flag count descending)
