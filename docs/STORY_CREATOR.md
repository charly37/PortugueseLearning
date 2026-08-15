# Story Creator

## Overview

The story creator generates bilingual Portuguese/French short stories for language learners.
Each story is written sentence-by-sentence in European Portuguese, with a French translation
alongside each sentence so that French-speaking learners can read both versions side by side.

The feature is split into two files to keep the generation logic independent of the website's
database infrastructure:

| File | Purpose | DB required? |
|------|---------|--------------|
| `story_writter/StoryCreatorAgent.py` | Core generation logic. Runs the writer + reviewer agent loop and returns a story dict. | ❌ No |
| `story_writter/StoryCreatorWrapper.py` | Website orchestrator. Fetches user info and existing titles from MongoDB, calls the core, persists to the `weeklystories` collection. | ✅ Yes |

## Architecture

```
StoryCreatorWrapper.py
  ├── resolve_users(db, args)          ← finds target users in MongoDB
  ├── get_user_existing_titles(db, id) ← fetches past titles to avoid repeats
  ├── run_story(...)                   ← imported from StoryCreatorAgent.py
  └── upsert_weekly_story(db, ...)     ← persists result to weeklystories
```

The core (`StoryCreatorAgent.py`) uses a writer → reviewer loop:

1. **StoryWriterAgent** writes an initial 40–50 sentence draft in JSON.
2. **StoryReviewerAgent** checks European Portuguese usage, sentence count, level, translation quality, and structure.
3. If `REVISE`, the writer revises up to `--max-iterations` times.
4. Final story is returned as a Python dict (no I/O in the core).

## Setup

**Requirements:** Python 3.10+, `openai-agents`, `pymongo`.

```bash
pip install -r story_writter/requirements.txt
```

**Environment variables:**

| Variable | Required by | Description |
|----------|------------|-------------|
| `OPEN_AI_KEY` | both files | OpenAI API key (mapped to `OPENAI_API_KEY` internally) |
| `MONGODB_URI` | wrapper only | MongoDB Atlas connection string |

## Local Development (no DB)

Use `StoryCreatorAgent.py` directly. Results print as JSON to stdout.

```bash
cd story_writter
export OPEN_AI_KEY="sk-..."

# Print to stdout
python StoryCreatorAgent.py --level beginner --topic "food"

# Save to a file instead
python StoryCreatorAgent.py --level intermediate --topic "travel" --output story.json
```

### Core CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--level` | `beginner` | `beginner` \| `intermediate` \| `advanced` |
| `--topic` | _(agent picks)_ | Story topic; omit to let the agent choose |
| `--model` | `gpt-4.1-mini` | OpenAI model |
| `--max-iterations` | `3` | Max write/review cycles |
| `--output` | _(stdout)_ | Write JSON to this file instead of stdout |

## Production / Website (with DB)

Use `StoryCreatorWrapper.py`. Stories are upserted to the `weeklystories` MongoDB collection
(one document per user per week).

```bash
cd story_writter
export OPEN_AI_KEY="sk-..."
export MONGODB_URI="mongodb+srv://..."

# All registered (non-guest) users
python StoryCreatorWrapper.py --level beginner --all-users

# Single user by username
python StoryCreatorWrapper.py --level intermediate --username alice

# Single user by MongoDB _id
python StoryCreatorWrapper.py --user-id 64a1b2c3d4e5f60000000001

# Topic fallback file (used when user has no storyTopic set in their profile)
python StoryCreatorWrapper.py --all-users --topic-file story_topic.txt
```

### Wrapper CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--level` | `beginner` | `beginner` \| `intermediate` \| `advanced` |
| `--topic-file` | `story_topic.txt` | Fallback topic when user has no `storyTopic` in profile |
| `--model` | `gpt-4.1-mini` | OpenAI model |
| `--max-iterations` | `3` | Max write/review cycles |
| `--all-users` | — | Generate for every registered (non-guest) user |
| `--user-id` | — | MongoDB `_id` of a specific user |
| `--username` | — | Username of a specific user |

## User Profile Integration

The wrapper reads `user.storyTopic` from the `users` collection to personalise the story
topic per user. If unset, it falls back to the `--topic-file` content, then lets the agent
pick a topic.

## Story Object Schema

```json
{
    "id":         "<uuid>",
    "title_pt":   "<Portuguese title>",
    "title_fr":   "<French title>",
    "level":      "beginner | intermediate | advanced",
    "topic":      "<short topic label>",
    "sentences": [
        {"pt": "<European Portuguese sentence>", "fr": "<French translation>"},
        "..."
    ],
    "created_at": "YYYY-MM-DD"
}
```

## Kubernetes CronJob

The weekly story generation is scheduled via a Helm-managed CronJob
(`helm/portuguese-learning/templates/weekly-story-cronjob.yaml`).
It runs `StoryCreatorWrapper.py` inside the analytics image and injects
`MONGODB_URI` and `OPEN_AI_KEY` from the `portuguese-learning-secrets` Kubernetes Secret.

Schedule and resource limits are configured in `values.yaml` under `weeklyStory`.
