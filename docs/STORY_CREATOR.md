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
  ├── list_stories(...)                ← GET /api/v1/stories?author=&limit=20&page=1
  ├── find_latest_story(...)           ← newest creationSource=api + createdViaApiKeyName=DialectHubWrite
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
| `STORYCREATOR_STORY_ID` | fetch mode | Explicit story id; overrides the automatic lookup |
| `STORYCREATOR_AUTHOR` | list mode | Default `--author` filter when none is passed |

## Local Development

```bash
cd story_writter
export STORYCREATOR_API_KEY="stc_live_..."
export STORYCREATOR_API_URL="https://bilingualstory.net"

# Generate a story and print it (no DB write)
python StoryCreatorGetter.py --create --topic "food" --level beginner

# Generate and store as the global (userId=null) fallback
python StoryCreatorGetter.py --create --topic "food" --save-to-mongo

# Read the newest story created through the DialectHubWrite API key
python StoryCreatorGetter.py

# Read a specific story
python StoryCreatorGetter.py 6ad3da2d233a762967c9e718

# List the 20 most recent stories (read-only)
python StoryCreatorGetter.py --list

# List only your own stories
python StoryCreatorGetter.py --list --author charly --limit 50

# List page 2 with 50 stories per page, as JSON
python StoryCreatorGetter.py --list --limit 50 --page 2 --format json

# Save an existing story into MongoDB
python StoryCreatorGetter.py 6ad3da2d233a762967c9e718 --save-to-mongo
```

### CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `story_id` | _newest API story_ | Existing story id to fetch. When omitted, `$STORYCREATOR_STORY_ID` is used if set, otherwise the newest story with `creationSource=api` and `createdViaApiKeyName=DialectHubWrite` |
| `--create` | `False` | Generate a new story (requires `stories:write`) |
| `--list` | `False` | List stories via `GET /api/v1/stories?limit=&page=&author=` |
| `--limit` | `20` | Stories per page for `--list` |
| `--page` | `1` | Page number for `--list` |
| `--author` | `$STORYCREATOR_AUTHOR` | Only list stories by this author |
| `--source` | `api` | `creationSource` used to pick the newest story for fetching |
| `--api-key-name` | `DialectHubWrite` | `createdViaApiKeyName` used to pick the newest story for fetching |
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

## Automatic story selection (fetch mode)

When no story id is passed, the script lists the catalogue
(`GET /api/v1/stories?limit=50&page=1`) and keeps only stories with:

```json
{"creationSource": "api", "createdViaApiKeyName": "DialectHubWrite"}
```

It then picks the most recent one (by `createdAt`) and fetches its full detail with
`GET /api/v1/stories/{id}`. Override the filters with `--source` / `--api-key-name`, or
skip the lookup entirely by passing an id (`python StoryCreatorGetter.py <id>` or
`STORYCREATOR_STORY_ID`).

### Execution log

A fetch logs every candidate story and the final choice, so the selection is auditable:

```
INFO No story id given — looking up the newest story (creationSource=api, createdViaApiKeyName=DialectHubWrite)
INFO Scanning story catalogue: page=1, limit=50, creationSource='api', createdViaApiKeyName='DialectHubWrite'
INFO Fetched 4 story/stories (page=1, limit=50)
INFO Candidate 1/4: id=web-1 | title='Web' | createdAt=2026-10-18T10:00:00Z | creationSource='website' | createdViaApiKeyName='DialectHubWrite' -> SKIPPED (creationSource 'website' != 'api')
INFO Candidate 2/4: id=old-api | title='Old' | createdAt=2026-10-01T10:00:00Z | creationSource='api' | createdViaApiKeyName='DialectHubWrite' -> MATCH (newest so far)
INFO Candidate 3/4: id=other-key | title='K' | createdAt=2026-10-17T10:00:00Z | creationSource='api' | createdViaApiKeyName='SomeoneElse' -> SKIPPED (createdViaApiKeyName 'SomeoneElse' != 'DialectHubWrite')
INFO Candidate 4/4: id=new-api | title='New / Nouveau' | createdAt=2026-10-15T10:00:00Z | creationSource='api' | createdViaApiKeyName='DialectHubWrite' -> MATCH (newest so far)
INFO Page 1: 4 story/stories returned, 2 match the filter
INFO --- Story selection summary ---
INFO Stories scanned     : 4
INFO Stories matched     : 2
INFO Selected story id   : new-api
INFO Selected story title: New / Nouveau
INFO Selected story date : 2026-10-15T10:00:00Z
INFO creationSource      : api
INFO createdViaApiKeyName: DialectHubWrite
INFO Generation state    : ready
INFO Sentences           : 24
INFO Using newest DialectHubWrite story: new-api
INFO Story detail: id=new-api | title='New / Nouveau' | state=ready | createdVia=api/DialectHubWrite | 24 sentences
INFO Not saving to MongoDB (--save-to-mongo not set)
```

With `--save-to-mongo` it instead logs `Storing story <id> in MongoDB` and then the
`weeklystories` document id, title, sentence count, and target `userId`.

## Kubernetes CronJob

The weekly story generation is scheduled via a Helm-managed CronJob
(`helm/portuguese-learning/templates/weekly-story-cronjob.yaml`).
It runs `StoryCreatorGetter.py` inside the analytics image and injects `MONGODB_URI` and
`STORYCREATOR_API_KEY` from the `portuguese-learning-secrets` Kubernetes Secret, plus
`STORYCREATOR_API_URL` from `weeklyStory.apiUrl` in `values.yaml`.

> **Required secret:** add a `storycreator-api-key` entry (write scope) to
> `portuguese-learning-secrets` before deploying.

Schedule and resource limits are configured in `values.yaml` under `weeklyStory`.
