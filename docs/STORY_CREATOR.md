# Story Creator

## Overview

The weekly bilingual Portuguese/French story is no longer written locally by an OpenAI
agent. `StoryCreatorGetter.py` calls the external **StoryCreator public API**
(`https://bilingualstory.net`), which generates the story, then stores it in the same
`weeklystories` MongoDB collection the website already reads.

| File | Purpose | DB required? |
|------|---------|--------------|
| `story_writter/StoryCreatorGetter.py` | Creates/fetches a story through the StoryCreator API, converts it to the website schema, upserts into `weeklystories`. | ✅ for storage |
| `story_writter/StoryCreatorAgent.py` | **Legacy** local OpenAI writer/reviewer loop. No longer used. | ❌ |
| `story_writter/StoryCreatorWrapper.py` | **Legacy** orchestrator for the local agent. No longer used. | ✅ |

## Architecture

```
StoryCreatorGetter.py
  ├── resolve_users(db, args)          ← finds target users in MongoDB
  ├── create_story(...)                ← POST /api/v1/stories (AI generation)
  ├── wait_for_story(...)              ← polls GET /api/v1/stories/:id until ready
  ├── to_app_story(...)                ← converts lang1/lang2 → pt/fr schema
  └── upsert_weekly_story(db, ...)     ← persists result to weeklystories
```

The StoryCreator service performs the AI generation. `POST /api/v1/stories` returns a
draft with a `status.state` of `generating`; the script polls until the story is ready
(or `failed`), then stores it. A write-scoped key is therefore required for generation;
`stories:read` is enough to fetch an already published story.

## Setup

**Requirements:** Python 3.10+, `httpx`, `pymongo`.

```bash
pip install -r story_writter/requirements.txt
```

**Environment variables:**

| Variable | Required by | Description |
|----------|------------|-------------|
| `STORYCREATOR_API_KEY` | all runs | API key; needs `stories:write` to generate, `stories:read` to fetch |
| `STORYCREATOR_API_URL` | all runs | Base URL (default `http://localhost:3000`) |
| `MONGODB_URI` | storage | MongoDB Atlas connection string |
| `STORYCREATOR_STORY_ID` | fetch mode | Default story id when none is passed |

## Local Development

```bash
cd story_writter
export STORYCREATOR_API_KEY="stc_live_..."
export STORYCREATOR_API_URL="https://bilingualstory.net"

# Generate a story and print it (no DB write)
python StoryCreatorGetter.py --create --topic "food" --level beginner

# Generate and store as the global (userId=null) fallback
python StoryCreatorGetter.py --create --topic "food" --save-to-mongo

# Read an existing story
python StoryCreatorGetter.py 6ad3da2d233a762967c9e718

# Save an existing story into MongoDB
python StoryCreatorGetter.py 6ad3da2d233a762967c9e718 --save-to-mongo
```

### CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `story_id` | _(generate/fetch default)_ | Existing story id to fetch instead of generating |
| `--create` | `False` | Generate a new story (requires `stories:write`) |
| `--level` | `beginner` | `beginner` \| `intermediate` \| `advanced` |
| `--topic` | _(empty)_ | Topic/seed for the generated story |
| `--topic-file` | `story_topic.txt` | Fallback topic when `--topic` is empty and a user has no `storyTopic` |
| `--title` | _(empty)_ | Optional title hint; the provider translates/fills it |
| `--model` | `gpt-4o-mini` | StoryCreator AI model |
| `--native-language` | `fr` | Translation language (`lang1`) |
| `--learning-language` | `pt` | Story language (`lang2`) |
| `--chapters` | `3` | Chapters to generate |
| `--sentences-per-chapter` | `8` | Target sentences per chapter |
| `--guideline` | _(empty)_ | Extra `aiGuideline` sent to the provider |
| `--generation-timeout` | `900` | Max seconds to wait for generation |
| `--poll-interval` | `5` | Seconds between status polls |
| `--save-to-mongo` | `False` | Upsert the result into `weeklystories` |
| `--all-users` | — | Generate and store one story per registered (non-guest) user, plus a global fallback |
| `--user-id` | — | MongoDB `_id` of a specific user |
| `--username` | — | Username of a specific user |
| `--format` | `text` | `text` (parallel text) or `json` printout |
| `--output` | _(empty)_ | Write the raw API story as JSON to this file |
| `--timeout` | `60` | HTTP request timeout in seconds |

## Production / Website

Generation is upserted to the `weeklystories` MongoDB collection (one document per user
per week). `--all-users` also creates the global story (`userId: null`) used for guests.

```bash
cd story_writter
export STORYCREATOR_API_KEY="stc_live_..."
export STORYCREATOR_API_URL="https://bilingualstory.net"
export MONGODB_URI="mongodb+srv://..."

# All registered (non-guest) users + global fallback
python StoryCreatorGetter.py --level beginner --all-users

# Single user by username
python StoryCreatorGetter.py --level intermediate --username alice

# Single user by MongoDB _id
python StoryCreatorGetter.py --user-id 64a1b2c3d4e5f60000000001
```

## User Profile Integration

The script reads `user.storyTopic` from the `users` collection to personalise the story
topic per user. If unset, it falls back to `--topic` / the `--topic-file` content; if
that is also empty, the provider picks a topic.

## Story Object Schema

Stories are stored under `weeklystories.story`:

```json
{
    "id":         "<StoryCreator story id>",
    "title_pt":   "<Portuguese title>",
    "title_fr":   "<French title>",
    "level":      "beginner | intermediate | advanced",
    "topic":      "<short topic label>",
    "sentences": [
        {"pt": "<European Portuguese sentence>", "fr": "<French translation>"},
        "..."
    ],
    "created_at": "YYYY-MM-DD",
    "source":     "storycreator-api"
}
```

API fields are mapped as follows: the API's `learningLanguage` side becomes `pt`, the
`nativeLanguage` side becomes `fr`, and every chapter's sentences are flattened in order.

## Kubernetes CronJob

The weekly story generation is scheduled via a Helm-managed CronJob
(`helm/portuguese-learning/templates/weekly-story-cronjob.yaml`).
It runs `StoryCreatorGetter.py` inside the analytics image and injects `MONGODB_URI` and
`STORYCREATOR_API_KEY` from the `portuguese-learning-secrets` Kubernetes Secret, plus
`STORYCREATOR_API_URL` from `weeklyStory.apiUrl` in `values.yaml`.

> **Required secret:** add a `storycreator-api-key` entry (write scope) to
> `portuguese-learning-secrets` before deploying.

Schedule and resource limits are configured in `values.yaml` under `weeklyStory`.
