#!/usr/bin/env python3
"""
StoryCreatorGetter.py — read stories through the StoryCreator public API and
persist them to MongoDB for the website.

This script never writes to the StoryCreator API: story generation is handled
by a separate service/job. Here we only GET the newest existing story and
distribute it to users.

Modes:
  1. Fetch: `GET /api/v1/stories/{id}` reads an existing story.
     When no id is passed, the newest story created through the API key
     named `DialectHubWrite` (`creationSource=api`) is looked up via
     `GET /api/v1/stories` and used instead of a hardcoded id.
     Only the `stories:read` scope is needed.
  2. List: `GET /api/v1/stories?limit=20&page=1` shows the paginated story
     catalogue (ids, titles, status) without storing anything; add
     `author=<name>` (CLI: `--author`) to list only that user's stories.
     Only the `stories:read` scope is needed.
  3. Per-user batch (`--all-users` / `--user-id` / `--username`): fetches the
     newest story once (same lookup as mode 1, or an explicit id) and stores
     a copy for every selected user, plus the `userId=null` global fallback.
     Only the `stories:read` scope is needed.

Stories are converted to the website schema (`title_pt`, `title_fr`,
`sentences[].pt/.fr`) and upserted into the `weeklystories` MongoDB collection.

A story that is still generating is polled via `GET /api/v1/stories/{id}`
until it is ready; nothing is ever created from this script.

Environment:
  STORYCREATOR_API_KEY   API key with the `stories:read` scope
  STORYCREATOR_API_URL   Base URL of the StoryCreator server
                         (default: http://localhost:3000)
  STORYCREATOR_AUTHOR    Default author filter for --list (optional)
  STORYCREATOR_STORY_ID  Explicit story id; when unset, the newest story
                         created via the DialectHubWrite API key is fetched
  MONGODB_URI            MongoDB connection string (required to store stories)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx


def _configure_logging() -> None:
    """Send every log record (ours and httpx's) to stdout."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.INFO)
    root.addHandler(handler)

    # httpx/httpcore log each request at INFO; keep them on the same stdout
    # handler instead of letting logging fall back to stderr.
    for name in ("httpx", "httpcore"):
        logger = logging.getLogger(name)
        logger.handlers = [handler]
        logger.propagate = False
        logger.setLevel(logging.INFO)


_configure_logging()
log = logging.getLogger("storycreator-getter")

DEFAULT_API_URL = "http://localhost:3000"
DEFAULT_LEARNING_LANGUAGE = "pt"
DEFAULT_POLL_INTERVAL = 5.0
DEFAULT_GENERATION_TIMEOUT = 900.0
DEFAULT_LIST_LIMIT = 20
DEFAULT_LIST_PAGE = 1
# How the website's stories are identified in the StoryCreator catalogue.
DEFAULT_CREATION_SOURCE = "api"
DEFAULT_CREATED_VIA_KEY_NAME = "DialectHubWrite"
DEFAULT_SCAN_LIMIT = 50
MAX_SCAN_PAGES = 5
EXIT_API_ERROR = 1
EXIT_NOT_FOUND = 2

# Provider states that mean "keep polling".
PENDING_STATES = {"queued", "pending", "generating", "running", "in_progress"}
FAILED_STATES = {"failed", "error"}


class StoryCreatorError(RuntimeError):
    """Raised when the StoryCreator API rejects the request."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# StoryCreator API client
# ---------------------------------------------------------------------------

def _client(*, api_url: str, api_key: str, timeout: float) -> httpx.Client:
    return httpx.Client(
        base_url=api_url.rstrip("/"),
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=httpx.Timeout(timeout, connect=15.0),
    )


def _format_api_error(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        body = None

    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            return (
                f"HTTP {response.status_code} "
                f"{error.get('code', 'ERROR')}: {error.get('message', '')}"
            )
        if isinstance(body.get("message"), str):
            return f"HTTP {response.status_code}: {body['message']}"

    return f"HTTP {response.status_code}: {response.text[:300]}"


def fetch_story(
    *,
    api_url: str,
    api_key: str,
    story_id: str,
    timeout: float,
) -> dict[str, Any]:
    """Returns the `data` object of `GET /api/v1/stories/:id`."""
    try:
        with _client(api_url=api_url, api_key=api_key, timeout=timeout) as client:
            response = client.get(f"/api/v1/stories/{story_id}")
    except httpx.HTTPError as exc:
        raise StoryCreatorError(f"Could not reach {api_url}: {exc}") from exc

    if response.status_code == 404:
        raise StoryCreatorError(
            "Story not found — it may be unpublished, deleted, or invisible to this key "
            f"({_format_api_error(response)})",
            status_code=404,
        )
    if response.status_code != 200:
        raise StoryCreatorError(
            f"Could not fetch story — {_format_api_error(response)}",
            status_code=response.status_code,
        )

    data = response.json().get("data")
    if not isinstance(data, dict):
        raise StoryCreatorError(f"Unexpected story response: {response.text[:300]}")
    return data


_LIST_CONTENT_KEYS = ("stories", "items", "results", "docs")
_PAGINATION_KEYS = ("pagination", "meta", "pageInfo", "page_info")
_PAGINATION_FIELDS = (
    "page",
    "limit",
    "total",
    "totalPages",
    "total_pages",
    "hasNextPage",
    "has_next_page",
)


def _extract_story_list(body: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Extracts the stories array and pagination info from a list response.

    Tolerates the shapes the public API may use: `{"data": [...]}`,
    `{"data": {"stories": [...], "pagination": {...}}}` and
    `{"stories": [...], "meta": {...}}`.
    """
    pagination: dict[str, Any] = {}

    if isinstance(body, list):
        return [item for item in body if isinstance(item, dict)], pagination
    if not isinstance(body, dict):
        raise StoryCreatorError(
            f"Unexpected story list response: {str(body)[:300]}"
        )

    containers: list[dict[str, Any]] = [body]
    data = body.get("data")
    if isinstance(data, dict):
        containers.append(data)

    for container in containers:
        if not pagination:
            for key in _PAGINATION_KEYS:
                value = container.get(key)
                if isinstance(value, dict) and value:
                    pagination = dict(value)
                    break
        for key in _PAGINATION_FIELDS:
            if key in container and key not in pagination:
                pagination[key] = container[key]

    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)], pagination

    for container in containers:
        for key in _LIST_CONTENT_KEYS:
            value = container.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)], pagination

    raise StoryCreatorError(
        "Unexpected story list response: "
        + json.dumps(body, ensure_ascii=False, default=str)[:300]
    )


def list_stories(
    *,
    api_url: str,
    api_key: str,
    limit: int,
    page: int,
    timeout: float,
    author: str = "",
) -> dict[str, Any]:
    """Returns one page of `GET /api/v1/stories` as {stories, pagination}.

    When `author` is set, only that user's stories are returned (the API
    filters on the story author).
    """
    params: dict[str, Any] = {"limit": limit, "page": page}
    author = (author or "").strip()
    if author:
        params["author"] = author

    try:
        with _client(api_url=api_url, api_key=api_key, timeout=timeout) as client:
            response = client.get("/api/v1/stories", params=params)
    except httpx.HTTPError as exc:
        raise StoryCreatorError(f"Could not reach {api_url}: {exc}") from exc

    if response.status_code == 401:
        raise StoryCreatorError(
            "The StoryCreator API key was rejected — check STORYCREATOR_API_KEY",
            status_code=401,
        )
    if response.status_code != 200:
        raise StoryCreatorError(
            f"Could not list stories — {_format_api_error(response)}",
            status_code=response.status_code,
        )

    log.info("Raw API reply: %s", response.text)

    try:
        body = response.json()
    except ValueError as exc:
        raise StoryCreatorError(
            f"Unexpected story list response: {response.text[:300]}"
        ) from exc

    stories, pagination = _extract_story_list(body)
    pagination.setdefault("page", page)
    pagination.setdefault("limit", limit)
    log.info(
        "Fetched %d story/stories (page=%d, limit=%d%s)",
        len(stories),
        page,
        limit,
        f", author={author}" if author else "",
    )

    result: dict[str, Any] = {"stories": stories, "pagination": pagination}
    if author:
        result["filter"] = {"author": author}
    return result


def _creation_source(story: dict[str, Any]) -> str:
    value = story.get("creationSource") or story.get("creation_source")
    return value.strip().casefold() if isinstance(value, str) else ""


def _created_via_key_name(story: dict[str, Any]) -> str:
    value = story.get("createdViaApiKeyName") or story.get("created_via_api_key_name")
    return value.strip().casefold() if isinstance(value, str) else ""


def _story_label(story: dict[str, Any]) -> str:
    """Returns 'lang1 / lang2' (or whichever title text exists)."""
    title = story.get("title") if isinstance(story.get("title"), dict) else {}
    lang1 = (title.get("lang1") or "").strip()
    lang2 = (title.get("lang2") or "").strip()
    if lang1 and lang2 and lang1 != lang2:
        return f"{lang1} / {lang2}"
    return lang1 or lang2 or "(untitled)"


def _story_timestamp(story: dict[str, Any]) -> datetime:
    """Returns the story's creation time (falls back to updatedAt)."""
    for key in ("createdAt", "updatedAt"):
        raw = story.get(key)
        if isinstance(raw, str) and raw.strip():
            try:
                parsed = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
            except ValueError:
                continue
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


def find_latest_story(
    *,
    api_url: str,
    api_key: str,
    timeout: float,
    source: str = DEFAULT_CREATION_SOURCE,
    api_key_name: str = DEFAULT_CREATED_VIA_KEY_NAME,
    author: str = "",
    limit: int = DEFAULT_SCAN_LIMIT,
    max_pages: int = MAX_SCAN_PAGES,
) -> dict[str, Any] | None:
    """Returns the most recent story matching the website's provenance.

    Keeps only stories whose `creationSource` matches `source` and whose
    `createdViaApiKeyName` matches `api_key_name`, then returns the newest of
    those (or None when nothing matches).
    """
    wanted_source = (source or "").strip().casefold()
    wanted_key = (api_key_name or "").strip().casefold()

    newest: dict[str, Any] | None = None
    newest_at = datetime.min.replace(tzinfo=timezone.utc)
    scanned = 0
    matched = 0

    for page in range(1, max_pages + 1):
        log.info(
            "Scanning story catalogue: page=%d, limit=%d, creationSource=%r, "
            "createdViaApiKeyName=%r%s",
            page,
            limit,
            source,
            api_key_name,
            f", author={author}" if author else "",
        )
        result = list_stories(
            api_url=api_url,
            api_key=api_key,
            limit=limit,
            page=page,
            timeout=timeout,
            author=author,
        )
        stories = result.get("stories") or []
        page_matches = 0
        scanned += len(stories)

        for position, story in enumerate(stories, start=1):
            story_id = story.get("id") or story.get("_id") or "?"
            story_source = story.get("creationSource") or ""
            story_key = story.get("createdViaApiKeyName") or ""
            created_raw = story.get("createdAt") or story.get("updatedAt") or "unknown"

            reason = ""
            if wanted_source and _creation_source(story) != wanted_source:
                reason = f"creationSource {story_source!r} != {source!r}"
            elif wanted_key and _created_via_key_name(story) != wanted_key:
                reason = f"createdViaApiKeyName {story_key!r} != {api_key_name!r}"

            if reason:
                log.info(
                    "Candidate %d/%d: id=%s | title=%r | createdAt=%s | "
                    "creationSource=%r | createdViaApiKeyName=%r -> SKIPPED (%s)",
                    position,
                    len(stories),
                    story_id,
                    _story_label(story),
                    created_raw,
                    story_source,
                    story_key,
                    reason,
                )
                continue

            page_matches += 1
            matched += 1
            created_at = _story_timestamp(story)
            is_newest = newest is None or created_at > newest_at
            log.info(
                "Candidate %d/%d: id=%s | title=%r | createdAt=%s | "
                "creationSource=%r | createdViaApiKeyName=%r -> MATCH (%s)",
                position,
                len(stories),
                story_id,
                _story_label(story),
                created_raw,
                story_source,
                story_key,
                "newest so far" if is_newest else "older than current selection",
            )
            if is_newest:
                newest = story
                newest_at = created_at

        log.info(
            "Page %d: %d story/stories returned, %d match the filter",
            page,
            len(stories),
            page_matches,
        )

        if newest is not None:
            # The catalogue is returned newest-first, so the first page with a
            # match contains the most recent story.
            break

        pagination = result.get("pagination") or {}
        total_pages = pagination.get("totalPages") or pagination.get("total_pages")
        if isinstance(total_pages, int) and page >= total_pages:
            break
        if len(stories) < limit:
            break

    if newest is None:
        log.warning(
            "No story matched the filter (scanned %d story/stories with "
            "creationSource=%r, createdViaApiKeyName=%r)",
            scanned,
            source,
            api_key_name,
        )
        return None

    status = newest.get("status") if isinstance(newest.get("status"), dict) else {}
    log.info("--- Story selection summary ---")
    log.info("Stories scanned     : %d", scanned)
    log.info("Stories matched     : %d", matched)
    log.info("Selected story id   : %s", newest.get("id") or newest.get("_id") or "?")
    log.info("Selected story title: %s", _story_label(newest))
    log.info(
        "Selected story date : %s",
        newest.get("createdAt") or newest.get("updatedAt") or "unknown",
    )
    log.info("creationSource      : %s", newest.get("creationSource") or "?")
    log.info("createdViaApiKeyName: %s", newest.get("createdViaApiKeyName") or "?")
    log.info("Generation state    : %s", status.get("state") or "unknown")
    log.info("Sentences           : %d", newest.get("sentenceCount", 0))
    return newest


def _story_state(story: dict[str, Any]) -> str:
    status = story.get("status")
    if isinstance(status, dict):
        return str(status.get("state") or "").lower()
    if isinstance(status, str):
        return status.lower()
    return ""


def _sentence_count(story: dict[str, Any]) -> int:
    chapters = story.get("chapters")
    if isinstance(chapters, list):
        total = 0
        for chapter in chapters:
            if isinstance(chapter, dict) and isinstance(chapter.get("sentences"), list):
                total += len(chapter["sentences"])
        if total:
            return total
    sentences = story.get("sentences")
    return len(sentences) if isinstance(sentences, list) else 0


def wait_for_story(
    *,
    api_url: str,
    api_key: str,
    story_id: str,
    timeout: float,
    generation_timeout: float,
    poll_interval: float,
) -> dict[str, Any]:
    """Polls until the story is ready and returns the complete story."""
    deadline = time.monotonic() + generation_timeout
    attempt = 0

    while True:
        attempt += 1
        story = fetch_story(
            api_url=api_url,
            api_key=api_key,
            story_id=story_id,
            timeout=timeout,
        )
        state = _story_state(story)

        if state in FAILED_STATES:
            status = story.get("status") if isinstance(story.get("status"), dict) else {}
            raise StoryCreatorError(
                f"Story {story_id} failed generation: "
                f"{status.get('generationError') or 'unknown error'}"
            )

        if state not in PENDING_STATES and _sentence_count(story) > 0:
            return story

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise StoryCreatorError(
                f"Story {story_id} was not ready after {generation_timeout:.0f}s "
                f"(state={state or 'unknown'})"
            )

        log.info(
            "Story %s is %s (%d sentences so far) — checking again in %.0fs",
            story_id,
            state or "not ready",
            _sentence_count(story),
            min(poll_interval, remaining),
        )
        time.sleep(min(poll_interval, remaining))


# ---------------------------------------------------------------------------
# Conversion to the website story schema
# ---------------------------------------------------------------------------

def _pair_texts(entry: dict[str, Any], learning_language: str) -> tuple[str, str]:
    """Returns (learning-language text, native-language text) for a title/sentence."""
    # Some responses may already use the website's short field names.
    if "pt" in entry or "fr" in entry:
        return (
            str(entry.get("pt") or "").strip(),
            str(entry.get("fr") or "").strip(),
        )

    lang1 = str(entry.get("lang1") or "").strip()
    lang2 = str(entry.get("lang2") or "").strip()

    if learning_language == "pt":
        return lang2, lang1
    if str(entry.get("nativeLanguage") or "").lower() == "pt":
        return lang1, lang2
    # Fallback: lang1 is the native language, lang2 the learning language.
    return lang2, lang1


def to_app_story(
    story: dict[str, Any],
    *,
    level: str = "beginner",
) -> dict[str, Any]:
    """Converts a StoryCreator API story to the `weeklystories.story` schema."""
    learning_language = str(
        story.get("learningLanguage") or DEFAULT_LEARNING_LANGUAGE
    ).lower()

    title = story.get("title") if isinstance(story.get("title"), dict) else {}
    title_pt, title_fr = _pair_texts(title, learning_language)

    sentences: list[dict[str, str]] = []
    chapters = story.get("chapters") if isinstance(story.get("chapters"), list) else []
    for chapter in chapters:
        chapter_sentences = (
            chapter.get("sentences") if isinstance(chapter, dict) else None
        )
        if not isinstance(chapter_sentences, list):
            continue
        for sentence in chapter_sentences:
            if not isinstance(sentence, dict):
                continue
            pt, fr = _pair_texts(sentence, learning_language)
            if pt or fr:
                sentences.append({"pt": pt, "fr": fr})

    # Fallback for providers that return a flat sentence list.
    if not sentences and isinstance(story.get("sentences"), list):
        for sentence in story["sentences"]:
            if not isinstance(sentence, dict):
                continue
            pt, fr = _pair_texts(sentence, learning_language)
            if pt or fr:
                sentences.append({"pt": pt, "fr": fr})

    labels = story.get("labels") if isinstance(story.get("labels"), list) else []
    resolved_topic = ", ".join(str(label) for label in labels)

    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    raw_created = story.get("createdAt")
    if isinstance(raw_created, str) and len(raw_created) >= 10:
        created_at = raw_created[:10]

    return {
        "id": str(story.get("id") or story.get("_id") or uuid.uuid4()),
        "title_pt": title_pt or "Sem título",
        "title_fr": title_fr or title_pt or "Sans titre",
        "level": str(story.get("level") or level),
        "topic": resolved_topic,
        "sentences": sentences,
        "created_at": created_at,
        # Kept for traceability/debugging; the website ignores extra fields.
        "source": "storycreator-api",
    }


# ---------------------------------------------------------------------------
# MongoDB persistence (same document shape as StoryCreatorWrapper.py)
# ---------------------------------------------------------------------------

@dataclass
class CreationStats:
    users_found: int = 0
    users_created: int = 0    # story newly inserted
    users_replaced: int = 0   # existing story overwritten
    users_failed: int = 0     # unexpected error per user
    fallback_ok: bool = False
    fallback_failed: bool = False

    def log_summary(self) -> None:
        log.info("--- Creation Statistics ---")
        log.info("Users found          : %d", self.users_found)
        log.info("Stories created      : %d (new)", self.users_created)
        if self.users_replaced:
            log.info("Stories replaced     : %d (overwrote existing)", self.users_replaced)
        if self.users_failed:
            log.info("Users failed         : %d", self.users_failed)
        log.info("Total processed      : %d", self.users_created + self.users_replaced)
        if self.fallback_ok:
            log.info("Global fallback      : saved")
        elif self.fallback_failed:
            log.info("Global fallback      : FAILED (user stories were still saved)")


def connect_db():
    """Return (client, db) using MONGODB_URI from the environment."""
    from pymongo import MongoClient

    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise StoryCreatorError("MONGODB_URI environment variable is not set")
    client = MongoClient(mongodb_uri)
    db = client.get_default_database()
    log.info("Connected to MongoDB (database=%s)", db.name)
    return client, db


def build_weekly_story_doc(user_id: str | None, story: dict) -> dict:
    """Build the document to insert into the weeklystories collection."""
    now = datetime.now(timezone.utc)
    # Week starts Monday 00:00 UTC
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    return {
        "userId": user_id,
        "weekStart": week_start,
        "weekEnd": week_end,
        "createdAt": now,
        "story": story,
        "status": "active",   # active | completed | expired
    }


def upsert_weekly_story(db, user_id: str | None, story: dict) -> tuple[str, bool]:
    """
    Insert or replace the weekly story for this user for the current week.
    Returns (document_id, was_new_insert).
    """
    doc = build_weekly_story_doc(user_id, story)
    collection = db["weeklystories"]

    filter_query: dict = {"weekStart": doc["weekStart"]}
    if user_id is not None:
        filter_query["userId"] = user_id
    else:
        # Distinguish the global guest story from per-user docs in the same week.
        filter_query["userId"] = None

    result = collection.replace_one(filter_query, doc, upsert=True)

    if result.upserted_id:
        return str(result.upserted_id), True
    existing = collection.find_one(filter_query)
    doc_id = str(existing["_id"]) if existing else "unknown"
    return doc_id, False


def resolve_users(db, args) -> list:
    """Return user documents matching the CLI arguments."""
    users_col = db["users"]

    if args.all_users:
        users = list(users_col.find({"isGuest": {"$ne": True}}))
        if not users:
            log.warning("No registered users found in the database.")
        return users

    if args.user_id:
        from bson import ObjectId

        user = users_col.find_one({"_id": ObjectId(args.user_id)})
        if not user:
            log.error("No user found with id: %s", args.user_id)
            return []
        return [user]

    if args.username:
        user = users_col.find_one({"username": args.username})
        if not user:
            log.error("No user found with username: %s", args.username)
            return []
        return [user]

    return []


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def _language_label(story: dict[str, Any]) -> str:
    native = story.get("nativeLanguage") or "?"
    learning = story.get("learningLanguage") or "?"
    return f"lang1: {native} (native) | lang2: {learning} (learning)"


def render_story_list(result: dict[str, Any]) -> str:
    """Renders one page of `GET /api/v1/stories` as a compact listing."""
    stories = result.get("stories") or []
    pagination = result.get("pagination") or {}

    lines: list[str] = []
    if not stories:
        lines.append("No stories found.")

    for index, story in enumerate(stories, start=1):
        title = story.get("title") if isinstance(story.get("title"), dict) else {}
        title_lang1 = (title.get("lang1") or "").strip()
        title_lang2 = (title.get("lang2") or "").strip()
        heading = title_lang1 or "(untitled)"
        if title_lang2 and title_lang2 != title_lang1:
            heading = f"{heading} / {title_lang2}"

        status = story.get("status") if isinstance(story.get("status"), dict) else {}
        native = story.get("nativeLanguage") or "?"
        learning = story.get("learningLanguage") or "?"
        details = [
            f"id: {story.get('id') or story.get('_id') or '?'}",
            f"level: {story.get('level') or '?'}",
            f"{native}/{learning}",
        ]
        state = status.get("state")
        if state:
            details.append(f"state: {state}")
        if status.get("published") is not None:
            details.append(f"published: {status.get('published')}")
        if story.get("sentenceCount") is not None:
            details.append(f"{story['sentenceCount']} sentences")
        author = story.get("authorName") or story.get("author")
        if isinstance(author, str) and author:
            details.append(f"author: {author}")
        creation_source = (
            story.get("creationSource")
            or story.get("creation_source")
            or story.get("source")
        )
        if isinstance(creation_source, str) and creation_source:
            details.append(f"created via: {creation_source}")
        labels = story.get("labels")
        if isinstance(labels, list) and labels:
            details.append("labels: " + ", ".join(str(label) for label in labels))
        if story.get("updatedAt"):
            details.append(f"updated {str(story['updatedAt'])[:10]}")

        lines.append(f"{index:>3}. {heading}")
        lines.append(f"     {' | '.join(details)}")

    summary: list[str] = []
    author_filter = (result.get("filter") or {}).get("author")
    if author_filter:
        summary.append(f"author: {author_filter}")
    page = pagination.get("page")
    limit = pagination.get("limit")
    total = pagination.get("total")
    total_pages = pagination.get("totalPages") or pagination.get("total_pages")
    if page is not None:
        summary.append(f"page {page}" + (f" (limit {limit})" if limit is not None else ""))
    if total is not None:
        summary.append(f"{total} stories total")
    if total_pages is not None:
        summary.append(f"{total_pages} pages")
    if summary:
        lines.append("")
        lines.append(" | ".join(summary))

    return "\n".join(lines).rstrip() + "\n"


def render_story(story: dict[str, Any]) -> str:
    """Renders a fetched story as readable parallel text."""
    title = story.get("title") if isinstance(story.get("title"), dict) else {}
    title_lang1 = (title.get("lang1") or "").strip()
    title_lang2 = (title.get("lang2") or "").strip()
    chapters = story.get("chapters") if isinstance(story.get("chapters"), list) else []
    status = story.get("status") if isinstance(story.get("status"), dict) else {}

    lines: list[str] = []
    lines.append(title_lang1 or "(untitled)")
    if title_lang2 and title_lang2 != title_lang1:
        lines.append(title_lang2)
    lines.append("")

    meta = [
        f"id: {story.get('id', '?')}",
        _language_label(story),
        f"level: {story.get('level', '?')}",
        f"topic: {story.get('topic') or '(none)'}",
        f"author: {story.get('authorName') or '(unknown)'}",
    ]
    creation_source = (
        story.get("creationSource")
        or story.get("creation_source")
        or story.get("source")
    )
    if isinstance(creation_source, str) and creation_source:
        meta.append(f"created via: {creation_source}")
    lines.append(" | ".join(meta))

    counts = [
        f"{story.get('sentenceCount', 0)} sentences",
        f"{len(chapters)} chapters",
    ]
    if story.get("isAIGenerated") is True:
        counts.append("AI-generated")
    if story.get("updatedAt"):
        counts.append(f"updated {story['updatedAt']}")
    lines.append(" | ".join(counts))

    if status:
        state = status.get("state", "unknown")
        detail = f"status: {state} | published: {status.get('published')}"
        if status.get("generationError"):
            detail += f" | error: {status['generationError']}"
        lines.append(detail)

    for index, chapter in enumerate(chapters, start=1):
        if not isinstance(chapter, dict):
            continue
        chapter_title = chapter.get("title") if isinstance(chapter.get("title"), dict) else {}
        chapter_lang1 = (chapter_title.get("lang1") or "").strip()
        chapter_lang2 = (chapter_title.get("lang2") or "").strip()
        if chapter_lang1 and chapter_lang2 and chapter_lang2 != chapter_lang1:
            heading = f"Chapter {index} — {chapter_lang1} / {chapter_lang2}"
        elif chapter_lang1 or chapter_lang2:
            heading = f"Chapter {index} — {chapter_lang1 or chapter_lang2}"
        else:
            heading = f"Chapter {index}"

        lines.append("")
        lines.append(heading)
        lines.append("-" * len(heading))

        sentences = chapter.get("sentences") if isinstance(chapter.get("sentences"), list) else []
        if not sentences:
            lines.append("  (no sentences yet)")
            continue

        for number, sentence in enumerate(sentences, start=1):
            if not isinstance(sentence, dict):
                continue
            lang1 = (sentence.get("lang1") or "").strip()
            lang2 = (sentence.get("lang2") or "").strip()
            lines.append(f"{number:>3}. {lang1 or '(missing)'}")
            if lang2 and lang2 != lang1:
                lines.append(f"     {lang2}")

    return "\n".join(lines).rstrip() + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "List (GET /api/v1/stories) or read (GET /api/v1/stories/:id) "
            "StoryCreator stories and optionally upsert one into the website's "
            "weeklystories MongoDB collection. Stories are never created here."
        )
    )
    parser.add_argument(
        "story_id",
        nargs="?",
        default=None,
        help=(
            "Existing story id to fetch. When omitted, $STORYCREATOR_STORY_ID is "
            "used if set, otherwise the newest story created via the "
            f"{DEFAULT_CREATED_VIA_KEY_NAME} API key (creationSource=api)"
        ),
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help=(
            "List stories via GET /api/v1/stories (uses --limit/--page/--author); "
            "only the stories:read scope is needed"
        ),
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIST_LIMIT,
        help=f"Stories per page for --list (default: {DEFAULT_LIST_LIMIT})",
    )
    parser.add_argument(
        "--page",
        type=int,
        default=DEFAULT_LIST_PAGE,
        help=f"Page number for --list (default: {DEFAULT_LIST_PAGE})",
    )
    parser.add_argument(
        "--author",
        default=os.environ.get("STORYCREATOR_AUTHOR", ""),
        help=(
            "Only list stories by this author for --list "
            "(default: $STORYCREATOR_AUTHOR, otherwise all authors)"
        ),
    )
    parser.add_argument(
        "--source",
        default=DEFAULT_CREATION_SOURCE,
        help=(
            "creationSource used to pick the newest story when no story id is "
            f"given (default: {DEFAULT_CREATION_SOURCE})"
        ),
    )
    parser.add_argument(
        "--api-key-name",
        default=DEFAULT_CREATED_VIA_KEY_NAME,
        help=(
            "createdViaApiKeyName used to pick the newest story when no story id "
            f"is given (default: {DEFAULT_CREATED_VIA_KEY_NAME})"
        ),
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("STORYCREATOR_API_URL", DEFAULT_API_URL),
        help=f"StoryCreator base URL (default: {DEFAULT_API_URL})",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("STORYCREATOR_API_KEY", ""),
        help=(
            "API key with the stories:read scope "
            "(default: $STORYCREATOR_API_KEY)"
        ),
    )
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="HTTP request timeout in seconds (default: 60)",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Optional path to write the full API story as JSON",
    )

    # Story metadata + waiting options -------------------------------------------
    parser.add_argument(
        "--level",
        choices=["beginner", "intermediate", "advanced"],
        default="beginner",
        help=(
            "Level stored with the story when the API story has none "
            "(default: beginner)"
        ),
    )
    parser.add_argument(
        "--generation-timeout",
        type=float,
        default=DEFAULT_GENERATION_TIMEOUT,
        help=(
            "Max seconds to wait for a story that is still generating "
            f"(default: {DEFAULT_GENERATION_TIMEOUT:.0f})"
        ),
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=DEFAULT_POLL_INTERVAL,
        help=f"Seconds between status polls (default: {DEFAULT_POLL_INTERVAL:.0f})",
    )

    # Persistence / target users ----------------------------------------------
    parser.add_argument(
        "--save-to-mongo",
        action="store_true",
        help=(
            "Upsert the story into the weeklystories collection. Without "
            "--all-users/--user-id/--username the document is the global "
            "fallback (userId=null)."
        ),
    )

    user_group = parser.add_mutually_exclusive_group()
    user_group.add_argument(
        "--all-users",
        action="store_true",
        help=(
            "Fetch the most recent existing story and store it for every "
            "registered (non-guest) user"
        ),
    )
    user_group.add_argument(
        "--user-id",
        default=None,
        help="MongoDB _id of a specific user to store the most recent story for",
    )
    user_group.add_argument(
        "--username",
        default=None,
        help="Username of a specific user to store the most recent story for",
    )

    return parser


def validate_args(args: argparse.Namespace) -> str | None:
    if not args.api_key:
        return (
            "STORYCREATOR_API_KEY is not set (or pass --api-key). "
            "Listing and fetching need the stories:read scope."
        )
    if args.timeout <= 0:
        return "--timeout must be greater than 0"
    if args.generation_timeout <= 0:
        return "--generation-timeout must be greater than 0"
    if args.poll_interval <= 0:
        return "--poll-interval must be greater than 0"

    per_user = args.all_users or args.user_id or args.username
    if args.list:
        if args.story_id:
            return "--list cannot be combined with a story id"
        if per_user or args.save_to_mongo:
            return "--list only reads stories; do not combine it with --all-users/--user-id/--username/--save-to-mongo"
        if args.limit < 1:
            return "--limit must be at least 1"
        if args.page < 1:
            return "--page must be at least 1"
    return None


def _emit_story(story: dict[str, Any], args: argparse.Namespace) -> None:
    status = story.get("status") if isinstance(story.get("status"), dict) else {}
    state = str(status.get("state") or "").lower()
    if state in PENDING_STATES:
        log.warning("Story %s is still generating; chapters may be incomplete", story.get("id"))
    elif state in FAILED_STATES:
        log.warning(
            "Story %s failed generation: %s",
            story.get("id"),
            status.get("generationError") or "unknown error",
        )

    if args.format == "json":
        print(json.dumps(story, ensure_ascii=False, indent=2))
    else:
        print(render_story(story), end="")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    "story": story,
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
        log.info("Wrote %s", args.output)


def _emit_story_list(result: dict[str, Any], args: argparse.Namespace) -> None:
    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(render_story_list(result), end="")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    **result,
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
        log.info("Wrote %s", args.output)


def _store_story(
    args: argparse.Namespace,
    db,
    user_id: str | None,
    provider_story: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    """Convert to the website schema and upsert into weeklystories.

    Returns (story, was_new_insert).
    """
    app_story = to_app_story(provider_story, level=args.level)
    if not app_story["sentences"]:
        raise StoryCreatorError(
            f"Story {app_story['id']} contains no sentences — refusing to store it"
        )

    log.info(
        "Saving to MongoDB (weeklystories): story %s '%s' — %d sentences, "
        "userId=%s",
        app_story["id"],
        _story_label(provider_story),
        len(app_story["sentences"]),
        user_id if user_id is not None else "null (global fallback)",
    )

    doc_id, is_new = upsert_weekly_story(db, user_id, app_story)
    action = "inserted" if is_new else "replaced"
    log.info(
        "Story %s in MongoDB (weeklystories): '%s' (doc_id=%s, %d sentences, userId=%s)",
        action,
        app_story.get("title_pt", "?"),
        doc_id,
        len(app_story["sentences"]),
        user_id if user_id is not None else "null (global fallback)",
    )
    return app_story, is_new


def _fetch_latest_story(args: argparse.Namespace) -> dict[str, Any]:
    """Fetches the most recent story (explicit id, env var, or newest match)."""
    story_id = _resolve_story_id(args)
    story = fetch_story(
        api_url=args.api_url,
        api_key=args.api_key,
        story_id=story_id,
        timeout=args.timeout,
    )

    state = _story_state(story)
    if state in FAILED_STATES:
        status = story.get("status") if isinstance(story.get("status"), dict) else {}
        raise StoryCreatorError(
            f"Story {story_id} failed generation: "
            f"{status.get('generationError') or 'unknown error'}"
        )
    if state in PENDING_STATES:
        log.info(
            "Story %s is still %s — waiting for generation to finish",
            story_id,
            state,
        )
        story = wait_for_story(
            api_url=args.api_url,
            api_key=args.api_key,
            story_id=story_id,
            timeout=args.timeout,
            generation_timeout=args.generation_timeout,
            poll_interval=args.poll_interval,
        )
    return story


def run_per_users(args: argparse.Namespace) -> int:
    """Store the most recent existing story for each selected user.

    Nothing is generated: the newest story is fetched once and copied into
    every user's `weeklystories` document, plus the userId=null fallback.
    """
    client, db = connect_db()
    stats = CreationStats()

    try:
        users = resolve_users(db, args)
        stats.users_found = len(users)
        if not users:
            log.error("No users found — nothing to do.")
            return EXIT_API_ERROR

        try:
            provider_story = _fetch_latest_story(args)
        except StoryCreatorError as exc:
            log.error("Could not fetch the most recent story: %s", exc)
            return EXIT_NOT_FOUND if exc.status_code == 404 else EXIT_API_ERROR

        log.info(
            "Using most recent story %s ('%s') for %d user(s)",
            provider_story.get("id") or "?",
            _story_label(provider_story),
            len(users),
        )

        for user_doc in users:
            user_id = str(user_doc["_id"])
            username = user_doc.get("username", user_id)

            log.info("\n%s\nStoring story for user: %s\n%s", "=" * 60, username, "=" * 60)
            try:
                _, is_new = _store_story(args, db, user_id, provider_story)
                if is_new:
                    stats.users_created += 1
                else:
                    stats.users_replaced += 1
            except Exception as exc:
                stats.users_failed += 1
                log.error("%s — failed: %s: %s", username, type(exc).__name__, exc)

        log.info("Storing global fallback story (userId=null)...")
        try:
            _store_story(args, db, None, provider_story)
            stats.fallback_ok = True
        except Exception:
            stats.fallback_failed = True
            log.exception(
                "Global fallback story failed — user stories already saved will be kept"
            )

        stats.log_summary()
    finally:
        client.close()

    return EXIT_API_ERROR if stats.users_failed else 0


def run_list(args: argparse.Namespace) -> int:
    try:
        result = list_stories(
            api_url=args.api_url,
            api_key=args.api_key,
            limit=args.limit,
            page=args.page,
            timeout=args.timeout,
            author=args.author,
        )
    except StoryCreatorError as exc:
        log.error("%s", exc)
        return EXIT_NOT_FOUND if exc.status_code == 404 else EXIT_API_ERROR

    _emit_story_list(result, args)
    return 0


def _resolve_story_id(args: argparse.Namespace) -> str:
    """Returns the story id to fetch: explicit id, env var, or newest API story."""
    explicit = (
        args.story_id or os.environ.get("STORYCREATOR_STORY_ID") or ""
    ).strip()
    if explicit:
        log.info("Using explicit story id: %s", explicit)
        return explicit

    log.info(
        "No story id given — looking up the newest story "
        "(creationSource=%s, createdViaApiKeyName=%s)",
        args.source,
        args.api_key_name,
    )
    story = find_latest_story(
        api_url=args.api_url,
        api_key=args.api_key,
        timeout=args.timeout,
        source=args.source,
        api_key_name=args.api_key_name,
        author=args.author,
    )
    if story is None:
        raise StoryCreatorError(
            "No story id was given and no story matching "
            f"creationSource={args.source!r} / "
            f"createdViaApiKeyName={args.api_key_name!r} was found"
        )

    story_id = str(story.get("id") or story.get("_id") or "").strip()
    if not story_id:
        raise StoryCreatorError(
            "The newest matching story has no id in the list response"
        )
    log.info("Using newest %s story: %s", args.api_key_name, story_id)
    return story_id


def run_fetch(args: argparse.Namespace) -> int:
    try:
        story = _fetch_latest_story(args)
    except StoryCreatorError as exc:
        log.error("%s", exc)
        return EXIT_NOT_FOUND if exc.status_code == 404 else EXIT_API_ERROR

    story_id = story.get("id") or "?"
    status = story.get("status") if isinstance(story.get("status"), dict) else {}
    log.info(
        "Story detail: id=%s | title=%r | state=%s | createdVia=%s/%s | "
        "%d sentences",
        story_id,
        _story_label(story),
        status.get("state") or "unknown",
        story.get("creationSource") or "?",
        story.get("createdViaApiKeyName") or "?",
        _sentence_count(story),
    )

    if args.save_to_mongo:
        log.info("Storing story %s in MongoDB (--save-to-mongo)", story_id)
        client, db = connect_db()
        try:
            _store_story(args, db, None, story)
        finally:
            client.close()
    else:
        log.info("Not saving to MongoDB (--save-to-mongo not set)")

    _emit_story(story, args)
    return 0


def main() -> int:
    args = build_parser().parse_args()

    error = validate_args(args)
    if error:
        log.error("%s", error)
        return EXIT_API_ERROR

    try:
        if args.list:
            return run_list(args)

        # Per-user mode copies the newest existing story to every selected user.
        if args.all_users or args.user_id or args.username:
            return run_per_users(args)
        return run_fetch(args)

    except StoryCreatorError as exc:
        log.error("%s", exc)
        return EXIT_NOT_FOUND if exc.status_code == 404 else EXIT_API_ERROR
    except KeyboardInterrupt:
        log.error("Interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
