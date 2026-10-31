#!/usr/bin/env python3
"""
StoryCreatorGetter.py — generate or read weekly stories through the StoryCreator
public API and persist them to MongoDB for the website.

Modes:
  1. Generate (`--generate`): invents a story idea with an OpenAI agent, creates
     the story through `POST /api/v1/stories` and polls until it is ready. One
     story is created per learner pair (`--languages fr en`), and each one is
     stored as a language template in `weeklystory_templates`. Needs an API key
     with the `stories:write` scope and `OPEN_AI_KEY`.
  2. Fetch: `GET /api/v1/stories/{id}` reads an existing story.
     When no id is passed, the newest story created through the API key
     named `DialectHubWrite` (`creationSource=api`) is looked up via
     `GET /api/v1/stories` and used instead of a hardcoded id.
     Only the `stories:read` scope is needed.
  3. List: `GET /api/v1/stories?limit=20&page=1` shows the paginated story
     catalogue (ids, titles, status) without storing anything; add
     `author=<name>` (CLI: `--author`) to list only that user's stories.
     Only the `stories:read` scope is needed.
  4. Per-user batch (`--all-users` / `--user-id` / `--username`): links every
     selected user to this week's template matching their `preferredLanguage`,
     in `weeklystories` (one document per `{userId, weekStart}`, holding a
     `templateId`). Guests are served by the API's lazy clone, so they never
     get a document here.

Stories are converted to the website schema (`title_pt`, `title_fr`,
`sentences[].pt/.fr`, plus the language-neutral `title_native` and
`sentences[].native`) and upserted into `weeklystory_templates`.

A story that is still generating is polled via `GET /api/v1/stories/{id}`
until it is ready, so a scheduled run never stores a half-written story.

Environment:
  STORYCREATOR_API_KEY   API key; `stories:read` for read modes,
                         `stories:write` for --generate
  STORYCREATOR_API_URL   Base URL of the StoryCreator server
                         (default: http://localhost:3000)
  STORYCREATOR_AUTHOR    Default author filter for --list (optional)
  STORYCREATOR_STORY_ID  Explicit story id; when unset, the newest story
                         created via the DialectHubWrite API key is fetched
  STORYCREATOR_IDEMPOTENCY_KEY
                         Stable retry key for --generate (a per-week key is
                         derived when unset)
  OPEN_AI_KEY            OpenAI key used by the idea agent (OPENAI_API_KEY is
                         accepted as a fallback)
  MONGODB_URI            MongoDB connection string (required to store stories)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
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

# Collections.
STORY_COLLECTION = "weeklystories"
STORY_TEMPLATES_COLLECTION = "weeklystory_templates"

# Learner pairs: the native side of the story. The learning side is always pt.
SUPPORTED_LANGUAGES = ("fr", "en")
DEFAULT_NATIVE_LANGUAGE = "fr"
SUPPORTED_LEVELS = ("beginner", "intermediate", "advanced")
# Mirrors ALLOWED_AI_MODELS in the StoryCreator server's story generation service.
ALLOWED_STORY_MODELS = ("gpt-4o-mini", "gpt-4.1-mini", "gpt-4o", "gpt-5-mini")
JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)

# Random ingredients used to vary the idea prompt on every run.
THEMES = [
    "daily routine",
    "food and cafés",
    "family and neighbours",
    "travel and holidays",
    "weather and seasons",
    "shopping at the market",
    "hobbies and free time",
    "animals and pets",
    "school and work",
    "transport in the city",
    "health and the pharmacy",
    "a walk by the river",
]

PROTAGONISTS = [
    "a curious child",
    "an elderly neighbour",
    "a young student",
    "a friendly baker",
    "a bus driver",
    "a small dog",
    "a visiting cousin",
    "a retired teacher",
]

PLOT_TWISTS = [
    "a small misunderstanding that gets resolved kindly",
    "a lost object that turns up in an unexpected place",
    "a surprise visit that changes the plans",
    "a first-time experience that feels scary but ends well",
    "a helpful stranger who speaks only Portuguese",
    "a change in the weather that forces a new plan",
    "a shared meal that brings two people together",
]

IDEA_INSTRUCTIONS = """You invent short, warm story ideas for beginners learning European Portuguese.

You will receive a theme, a main character and a plot element. Invent a story that:
- Is set in everyday Portugal (a home, a café, a market, a neighbourhood, a bus...).
- Has a simple, concrete plot that a beginner can follow.
- Uses European Portuguese (pt-PT), not Brazilian Portuguese.
- Teaches useful A1-A2 vocabulary through repetition in context.
- Is suitable for a learner with a small vocabulary.

Return ONLY a JSON object (no markdown fences, no extra prose) with exactly these keys:
{
  "title_native": "title in the learner's native language",
  "title_learning": "title in the language being learned (European Portuguese unless stated otherwise)",
  "theme": "2-4 word theme label",
  "vocabulary": ["8 to 12 beginner Portuguese words or short phrases used in the story"],
  "characters": [
    {"name": "...", "role": "...", "description": "...", "appearance": "..."}
  ],
  "seed": "2-4 sentence premise written as instructions for a bilingual story writer: name the setting, the characters, the simple conflict and the resolution. Explicitly ask for simple European Portuguese, short sentences in the present tense, and natural reuse of the vocabulary list."
}

Rules:
- 1 to 3 characters maximum.
- Vocabulary must be everyday nouns, verbs, adjectives or set phrases that actually appear in the story.
- Keep the premise concrete; no fantasy worlds, no complex timelines.
"""

# Display fallbacks per native language (title_pt keeps the Portuguese one).
TITLE_FALLBACK = {"pt": "Sem título", "fr": "Sans titre", "en": "Untitled"}


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
# Story generation (POST /api/v1/stories)
# ---------------------------------------------------------------------------

def _load_agents() -> tuple[Any, Any]:
    """Import the OpenAI Agents SDK lazily so read-only modes work without it."""
    try:
        from agents import Agent, Runner
    except ImportError as exc:
        raise StoryCreatorError(
            "The OpenAI Agents SDK is required for --generate. "
            "Install it with: pip install -r story_writter/requirements.txt"
        ) from exc
    return Agent, Runner


def _ensure_openai_key() -> None:
    """Expose OPEN_AI_KEY to the Agents SDK, which reads OPENAI_API_KEY."""
    key = os.environ.get("OPEN_AI_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        raise StoryCreatorError(
            "OPEN_AI_KEY (or OPENAI_API_KEY) must be set to generate a story idea"
        )
    if not os.environ.get("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = key


def _build_idea_agent(model: str) -> Any:
    Agent, _ = _load_agents()
    return Agent(
        name="PortugueseStoryIdeaAgent",
        instructions=IDEA_INSTRUCTIONS,
        model=model,
    )


def _extract_json(text: str) -> dict[str, Any]:
    """Parses the first JSON object from an agent response, tolerating fences."""
    match = JSON_FENCE.search(text)
    candidate = match.group(1) if match else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise StoryCreatorError(f"The idea agent did not return JSON: {text[:400]}")

    try:
        data = json.loads(candidate[start:end + 1])
    except json.JSONDecodeError as exc:
        raise StoryCreatorError(f"Could not parse the idea agent response: {exc}") from exc

    if not isinstance(data, dict):
        raise StoryCreatorError("The idea agent response was not a JSON object")
    return data


def _normalize_idea(raw: dict[str, Any]) -> dict[str, Any]:
    """Validates and trims the idea agent output."""
    def as_text(value: Any) -> str:
        return value.strip() if isinstance(value, str) else ""

    title_native = as_text(raw.get("title_native"))
    title_learning = as_text(raw.get("title_learning"))
    seed = as_text(raw.get("seed"))
    if not title_native:
        raise StoryCreatorError("The idea agent did not provide 'title_native'")
    if not seed:
        raise StoryCreatorError("The idea agent did not provide 'seed'")

    raw_vocabulary = raw.get("vocabulary")
    if not isinstance(raw_vocabulary, list):
        raw_vocabulary = []
    vocabulary = [as_text(word) for word in raw_vocabulary if as_text(word)][:12]

    characters: list[dict[str, str]] = []
    if isinstance(raw.get("characters"), list):
        for entry in raw["characters"][:3]:
            if not isinstance(entry, dict):
                continue
            character = {
                "name": as_text(entry.get("name")),
                "role": as_text(entry.get("role")),
                "description": as_text(entry.get("description")),
                "appearance": as_text(entry.get("appearance")),
            }
            if character["name"]:
                characters.append(character)

    return {
        "title_native": title_native,
        "title_learning": title_learning,
        "theme": as_text(raw.get("theme")),
        "vocabulary": vocabulary,
        "characters": characters,
        "seed": seed,
    }


def generate_story_idea(
    *,
    model: str,
    level: str,
    chapters: int,
    sentences_per_chapter: int,
    theme: str,
    native_language: str,
    learning_language: str,
    learning_language_name: str,
) -> dict[str, Any]:
    """Invent a story idea for one learner pair with the OpenAI agent."""
    _, Runner = _load_agents()
    chosen_theme = theme.strip() or random.choice(THEMES)
    protagonist = random.choice(PROTAGONISTS)
    twist = random.choice(PLOT_TWISTS)

    prompt = f"""Invent a story idea for a learner whose native language is {native_language}
and who is learning {learning_language_name} ({learning_language}) at {level} level.

Theme: {chosen_theme}
Main character: {protagonist}
Plot element: {twist}
Length: {chapters} chapter(s) of about {sentences_per_chapter} sentences each.

The story will be generated by another AI writer from the seed you provide, so make the
seed self-contained: setting, characters, what happens, and how it ends.
"""
    log.info(
        "Generating %s idea | theme=%r | protagonist=%r | twist=%r",
        native_language,
        chosen_theme,
        protagonist,
        twist,
    )

    result = Runner.run_sync(_build_idea_agent(model), prompt, max_turns=3)
    idea = _normalize_idea(_extract_json(result.final_output or ""))
    if not idea["theme"]:
        idea["theme"] = chosen_theme
    return idea


def build_story_payload(
    idea: dict[str, Any],
    args: argparse.Namespace,
    native_language: str,
) -> dict[str, Any]:
    """Builds the `POST /api/v1/stories` body from the generated idea."""
    seed_parts = [idea["seed"]]
    if idea["vocabulary"]:
        seed_parts.append(
            "Naturally reuse these words and phrases: " + ", ".join(idea["vocabulary"]) + "."
        )
    seed_parts.append(
        f"Write in simple {args.learning_language_name} at {args.level} level, "
        "using short sentences and the present tense."
    )

    payload: dict[str, Any] = {
        "title": {
            "lang1": idea["title_native"],
            "lang2": idea["title_learning"],
        },
        "nativeLanguage": native_language,
        "learningLanguage": args.learning_language,
        "level": args.level,
        "topic": (idea["theme"] or args.theme)[:200],
        "seed": " ".join(part.strip() for part in seed_parts if part.strip()),
        "targetChapters": args.chapters,
        "chapters": [
            {"seed": "", "targetSentences": args.sentences_per_chapter}
            for _ in range(args.chapters)
        ],
        "published": args.publish,
    }

    if idea["characters"]:
        payload["characters"] = idea["characters"]
    if args.ai_model:
        payload["aiModel"] = args.ai_model

    return payload


def _idempotency_key(args: argparse.Namespace, language: str) -> str:
    """Stable key per week + language so a CronJob retry never pays twice."""
    explicit = (
        args.idempotency_key.strip()
        or os.environ.get("STORYCREATOR_IDEMPOTENCY_KEY", "").strip()
    )
    if explicit:
        return f"{explicit}-{language}"
    week_start, _ = current_week_bounds()
    return (
        f"dialecthub-{week_start.strftime('%Y%m%d')}-{language}-"
        f"{args.level}-{args.chapters}x{args.sentences_per_chapter}"
    )


def create_story(
    *,
    api_url: str,
    api_key: str,
    payload: dict[str, Any],
    idempotency_key: str,
    timeout: float,
) -> dict[str, Any]:
    """Creates a story through `POST /api/v1/stories` (needs stories:write)."""
    try:
        with _client(api_url=api_url, api_key=api_key, timeout=timeout) as client:
            response = client.post(
                "/api/v1/stories",
                json=payload,
                headers={"Idempotency-Key": idempotency_key},
            )
    except httpx.HTTPError as exc:
        raise StoryCreatorError(f"Could not reach {api_url}: {exc}") from exc

    if response.status_code in (401, 403):
        raise StoryCreatorError(
            "Story creation was rejected — the API key needs the stories:write scope "
            f"({_format_api_error(response)})",
            status_code=response.status_code,
        )
    if response.status_code not in (200, 202):
        raise StoryCreatorError(
            f"Story creation failed — {_format_api_error(response)}",
            status_code=response.status_code,
        )

    data = response.json().get("data")
    if not isinstance(data, dict) or not data.get("id"):
        raise StoryCreatorError(f"Unexpected create response: {response.text[:300]}")
    return data


@dataclass
class StoryRun:
    """A story obtained for one learner pair, plus what produced it."""

    story: dict[str, Any]
    language: str
    idea: dict[str, Any] | None = None
    request: dict[str, Any] | None = None
    idempotency_key: str | None = None


def _generate_story(args: argparse.Namespace, language: str) -> StoryRun:
    """Generate one story (idea + POST + poll) for a learner pair."""
    idea = generate_story_idea(
        model=args.idea_model,
        level=args.level,
        chapters=args.chapters,
        sentences_per_chapter=args.sentences_per_chapter,
        theme=args.theme,
        native_language=language,
        learning_language=args.learning_language,
        learning_language_name=args.learning_language_name,
    )
    payload = build_story_payload(idea, args, language)

    log.info("Idea [%s]: %s / %s", language, idea["title_native"], idea["title_learning"] or "(none)")
    log.info("Theme [%s]: %s", language, payload["topic"])
    log.info("Vocabulary [%s]: %s", language, ", ".join(idea["vocabulary"]) or "(none)")
    log.info("Seed [%s]: %s", language, payload["seed"])

    idempotency_key = _idempotency_key(args, language)
    log.info(
        "Creating story via %s [%s] (idempotency key: %s)",
        args.api_url,
        language,
        idempotency_key,
    )
    created = create_story(
        api_url=args.api_url,
        api_key=args.api_key,
        payload=payload,
        idempotency_key=idempotency_key,
        timeout=args.timeout,
    )
    story_id = str(created["id"])
    log.info("Story queued [%s]: id=%s state=%s", language, story_id, created.get("status"))

    story = wait_for_story(
        api_url=args.api_url,
        api_key=args.api_key,
        story_id=story_id,
        timeout=args.timeout,
        generation_timeout=args.generation_timeout,
        poll_interval=args.poll_interval,
    )
    log.info(
        "Story ready [%s]: id=%s | %d sentences",
        language,
        story.get("id", story_id),
        _sentence_count(story),
    )
    return StoryRun(
        story=story,
        language=language,
        idea=idea,
        request=payload,
        idempotency_key=idempotency_key,
    )


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
    native_language: str | None = None,
) -> dict[str, Any]:
    """Converts a StoryCreator API story to the `weeklystories.story` schema.

    The learning side is always Portuguese (`pt`). The native side is French or
    English depending on the pair that was generated; it is written both to the
    legacy `fr` keys (so existing documents/clients keep working) and to the
    language-neutral `native` keys.
    """
    learning_language = str(
        story.get("learningLanguage") or DEFAULT_LEARNING_LANGUAGE
    ).lower()
    resolved_native = str(
        native_language or story.get("nativeLanguage") or DEFAULT_NATIVE_LANGUAGE
    ).lower()
    native_fallback = TITLE_FALLBACK.get(resolved_native, TITLE_FALLBACK["en"])

    title = story.get("title") if isinstance(story.get("title"), dict) else {}
    title_pt, title_native = _pair_texts(title, learning_language)

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
            pt, native = _pair_texts(sentence, learning_language)
            if pt or native:
                sentences.append({"pt": pt, "fr": native, "native": native})

    # Fallback for providers that return a flat sentence list.
    if not sentences and isinstance(story.get("sentences"), list):
        for sentence in story["sentences"]:
            if not isinstance(sentence, dict):
                continue
            pt, native = _pair_texts(sentence, learning_language)
            if pt or native:
                sentences.append({"pt": pt, "fr": native, "native": native})

    labels = story.get("labels") if isinstance(story.get("labels"), list) else []
    resolved_topic = ", ".join(str(label) for label in labels)

    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    raw_created = story.get("createdAt")
    if isinstance(raw_created, str) and len(raw_created) >= 10:
        created_at = raw_created[:10]

    level = story.get("level")
    if level:
        level = str(level)
    else:
        log.error(
            "Story %s has no level — hardcoding 'beginner'",
            story.get("id") or story.get("_id") or "?",
        )
        level = "beginner"

    return {
        "id": str(story.get("id") or story.get("_id") or uuid.uuid4()),
        "language": resolved_native,
        "title_pt": title_pt or TITLE_FALLBACK["pt"],
        "title_native": title_native or title_pt or native_fallback,
        "title_fr": title_native or title_pt or native_fallback,
        "level": level,
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
    templates_created: int = 0    # template newly inserted
    templates_replaced: int = 0   # template overwritten
    templates_skipped: int = 0    # language skipped (already has a template)
    users_found: int = 0
    users_linked: int = 0         # user documents upserted
    users_skipped_no_template: int = 0
    users_failed: int = 0

    def log_summary(self) -> None:
        log.info("--- Creation Statistics ---")
        if self.templates_created or self.templates_replaced or self.templates_skipped:
            log.info("Templates created    : %d", self.templates_created)
            if self.templates_replaced:
                log.info("Templates replaced   : %d", self.templates_replaced)
            if self.templates_skipped:
                log.info("Templates skipped    : %d (already present)", self.templates_skipped)
        if self.users_found:
            log.info("Users found          : %d", self.users_found)
            log.info("Users linked         : %d", self.users_linked)
            if self.users_skipped_no_template:
                log.info("Users w/o template   : %d", self.users_skipped_no_template)
            if self.users_failed:
                log.info("Users failed         : %d", self.users_failed)


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


def current_week_bounds() -> tuple[datetime, datetime]:
    """Return (Monday 00:00 UTC of the current week, +7 days)."""
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return week_start, week_start + timedelta(days=7)


def ensure_story_indexes(db) -> None:
    """Create the unique indexes used by templates and per-user documents."""
    db[STORY_TEMPLATES_COLLECTION].create_index(
        [("weekStart", 1), ("language", 1)],
        unique=True,
        name="story_templates_week_language_unique",
    )
    try:
        db[STORY_COLLECTION].create_index(
            [("userId", 1), ("weekStart", 1)],
            unique=True,
            name="weeklystories_user_week_unique",
        )
    except Exception as exc:  # noqa: BLE001 - legacy duplicates must not block a run
        log.warning(
            "Could not create the weeklystories unique index (%s). "
            "Remove duplicate (userId, weekStart) documents and re-run.",
            exc,
        )


def build_story_template_doc(
    language: str,
    app_story: dict[str, Any],
    week_start: datetime,
    week_end: datetime,
) -> dict[str, Any]:
    """Build a language-specific story template (content only, no user state)."""
    return {
        "language": language,
        "weekStart": week_start,
        "weekEnd": week_end,
        "createdAt": datetime.now(timezone.utc),
        "story": app_story,
        "totalSentences": len(app_story.get("sentences") or []),
    }


def upsert_story_template(
    db,
    language: str,
    app_story: dict[str, Any],
    week_start: datetime,
    week_end: datetime,
) -> tuple[str, bool]:
    """Insert or replace the story template for (weekStart, language)."""
    doc = build_story_template_doc(language, app_story, week_start, week_end)
    collection = db[STORY_TEMPLATES_COLLECTION]
    existing = collection.find_one(
        {"weekStart": week_start, "language": language}, {"_id": 1, "createdAt": 1}
    )
    if existing and existing.get("createdAt"):
        doc["createdAt"] = existing["createdAt"]

    result = collection.replace_one(
        {"weekStart": week_start, "language": language},
        doc,
        upsert=True,
    )
    if result.upserted_id:
        return str(result.upserted_id), True

    stored = collection.find_one(
        {"weekStart": week_start, "language": language}, {"_id": 1}
    )
    return (str(stored["_id"]) if stored else "unknown"), False


def story_template_exists(db, week_start: datetime, language: str) -> bool:
    """True when this week already has a template for the language."""
    return db[STORY_TEMPLATES_COLLECTION].find_one(
        {"weekStart": week_start, "language": language}, {"_id": 1}
    ) is not None


def find_week_story_template(db, week_start: datetime, language: str):
    """Return the best template for the week, mirroring the weekly-challenge API.

    Preference order: exact week + language, same week any language, the nearest
    upcoming template for the language, then the nearest upcoming template.
    """
    templates = db[STORY_TEMPLATES_COLLECTION]

    exact = templates.find_one({"weekStart": week_start, "language": language})
    if exact:
        return exact

    same_week = templates.find_one({"weekStart": week_start})
    if same_week:
        return same_week

    language_doc = templates.find_one(
        {"weekStart": {"$gte": week_start}, "language": language},
        sort=[("weekStart", 1)],
    )
    if language_doc:
        return language_doc

    return templates.find_one(
        {"weekStart": {"$gte": week_start}}, sort=[("weekStart", 1)]
    )


def user_language(user_doc: dict[str, Any]) -> str:
    """Resolve a user's story language from `preferredLanguage`."""
    raw = str(user_doc.get("preferredLanguage") or "").lower()
    return raw if raw in SUPPORTED_LANGUAGES else DEFAULT_NATIVE_LANGUAGE


def link_user_story(
    db,
    user_id: str,
    language: str,
    template: dict[str, Any],
    week_start: datetime,
    week_end: datetime,
) -> tuple[str, bool]:
    """Point a user's weekly document at a template (no story body copy)."""
    collection = db[STORY_COLLECTION]
    template_week_start = template.get("weekStart", week_start)
    filter_query = {"userId": user_id, "weekStart": template_week_start}

    existing = collection.find_one(filter_query, {"_id": 1, "createdAt": 1, "status": 1})
    doc = {
        "userId": user_id,
        "weekStart": template_week_start,
        "weekEnd": template.get("weekEnd", week_end),
        "language": language,
        "templateId": str(template["_id"]),
        "createdAt": existing.get("createdAt") if existing else datetime.now(timezone.utc),
        "status": existing.get("status", "active") if existing else "active",
    }

    result = collection.replace_one(filter_query, doc, upsert=True)
    if result.upserted_id:
        return str(result.upserted_id), True

    stored = collection.find_one(filter_query, {"_id": 1})
    return (str(stored["_id"]) if stored else "unknown"), False


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

def _bounded_int(minimum: int, maximum: int):
    """argparse type that rejects values outside [minimum, maximum]."""
    def parse(value: str) -> int:
        try:
            number = int(value)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"'{value}' is not an integer") from exc
        if not minimum <= number <= maximum:
            raise argparse.ArgumentTypeError(f"must be between {minimum} and {maximum}")
        return number

    return parse


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate stories through POST /api/v1/stories (one per learner pair), "
            "or list/read existing StoryCreator stories, and store them in the "
            "website's weeklystory_templates / weeklystories MongoDB collections."
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
            "API key with the stories:read scope (stories:write for --generate) "
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
        help=(
            "Optional path to write the story as JSON (with --generate: the idea, "
            "request and resulting story; one file per language)"
        ),
    )

    # Waiting options ---------------------------------------------------------
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

    # Generation ---------------------------------------------------------------
    parser.add_argument(
        "--generate",
        action="store_true",
        help=(
            "Create a new story per learner pair through POST /api/v1/stories "
            "(needs the stories:write scope and OPEN_AI_KEY)"
        ),
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        choices=list(SUPPORTED_LANGUAGES),
        default=list(SUPPORTED_LANGUAGES),
        metavar="LANG",
        help=(
            "Native languages to generate for (default: fr en). "
            "The learning language is always --learning-language."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate even when this week already has a template for the language",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only generate and print the ideas/requests; never call the API",
    )
    parser.add_argument(
        "--level",
        choices=SUPPORTED_LEVELS,
        default="beginner",
        help="Story level (default: beginner)",
    )
    parser.add_argument(
        "--learning-language",
        default=DEFAULT_LEARNING_LANGUAGE,
        help=f"Language being learned (default: {DEFAULT_LEARNING_LANGUAGE})",
    )
    parser.add_argument(
        "--learning-language-name",
        default="European Portuguese",
        help="Human-readable learning language used in the seed prompt",
    )
    parser.add_argument(
        "--theme",
        default="",
        help="Optional theme; a random theme is chosen per language when omitted",
    )
    parser.add_argument(
        "--chapters",
        type=_bounded_int(1, 10),
        default=3,
        help="Number of chapters (1-10, default: 3)",
    )
    parser.add_argument(
        "--sentences-per-chapter",
        type=_bounded_int(1, 100),
        default=8,
        help="Target sentences per chapter (1-100, default: 8)",
    )
    parser.add_argument(
        "--idea-model",
        default="gpt-4.1-mini",
        help="OpenAI model used to invent the idea (default: gpt-4.1-mini)",
    )
    parser.add_argument(
        "--ai-model",
        choices=list(ALLOWED_STORY_MODELS),
        default=None,
        help="Optional model used by the server to write the story",
    )
    parser.add_argument(
        "--no-publish",
        dest="publish",
        action="store_false",
        help="Create a draft instead of publishing after generation",
    )
    parser.set_defaults(publish=True)
    parser.add_argument(
        "--idempotency-key",
        default="",
        help=(
            "Base Idempotency-Key for --generate; the language is appended. "
            "Defaults to $STORYCREATOR_IDEMPOTENCY_KEY or a per-week key"
        ),
    )

    # Persistence / target users ----------------------------------------------
    parser.add_argument(
        "--save-to-mongo",
        action="store_true",
        help=(
            "Upsert the fetched story into weeklystory_templates (for the story's "
            "native language) instead of only printing it"
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
    if not args.api_key and not args.dry_run:
        return (
            "STORYCREATOR_API_KEY is not set (or pass --api-key). "
            "Read modes need the stories:read scope, --generate needs stories:write."
        )
    if args.timeout <= 0:
        return "--timeout must be greater than 0"
    if args.generation_timeout <= 0:
        return "--generation-timeout must be greater than 0"
    if args.poll_interval <= 0:
        return "--poll-interval must be greater than 0"

    if args.dry_run and not args.generate:
        return "--dry-run only applies to --generate"
    if not args.languages:
        return "--languages must list at least one language"
    if args.learning_language in args.languages:
        return "--learning-language must differ from every --languages entry"

    per_user = args.all_users or args.user_id or args.username
    if args.list:
        if args.story_id:
            return "--list cannot be combined with a story id"
        if args.generate:
            return "--list cannot be combined with --generate"
        if per_user or args.save_to_mongo:
            return "--list only reads stories; do not combine it with --all-users/--user-id/--username/--save-to-mongo"
        if args.limit < 1:
            return "--limit must be at least 1"
        if args.page < 1:
            return "--page must be at least 1"

    if args.generate:
        if args.story_id:
            return "--generate creates a new story; do not pass an existing story id"
        if args.save_to_mongo:
            return "--generate already stores templates; drop --save-to-mongo"
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


def _store_story_template(
    db,
    provider_story: dict[str, Any],
    *,
    language: str | None = None,
) -> tuple[dict[str, Any], str, bool]:
    """Convert to the website schema and upsert into weeklystory_templates.

    Returns (app_story, template_document_id, was_new_insert).
    """
    app_story = to_app_story(provider_story, native_language=language)
    if not app_story["sentences"]:
        raise StoryCreatorError(
            f"Story {app_story['id']} contains no sentences — refusing to store it"
        )

    resolved_language = str(app_story.get("language") or DEFAULT_NATIVE_LANGUAGE)
    week_start, week_end = current_week_bounds()
    doc_id, is_new = upsert_story_template(
        db, resolved_language, app_story, week_start, week_end
    )
    action = "inserted" if is_new else "replaced"
    log.info(
        "Story template [%s] %s: '%s' (doc_id=%s, %d sentences)",
        resolved_language,
        action,
        app_story.get("title_pt", "?"),
        doc_id,
        len(app_story["sentences"]),
    )
    return app_story, doc_id, is_new


def _write_generation_output(
    args: argparse.Namespace,
    run_story: StoryRun,
    app_story: dict[str, Any],
    template_id: str,
) -> None:
    """Write the idea, request and resulting story to --output."""
    if not args.output:
        return

    path = args.output
    if len(args.languages) > 1:
        stem, ext = os.path.splitext(args.output)
        path = f"{stem}.{run_story.language}{ext}" if ext else f"{args.output}.{run_story.language}"

    with open(path, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "language": run_story.language,
                "idempotency_key": run_story.idempotency_key,
                "idea": run_story.idea,
                "request": run_story.request,
                "story": run_story.story,
                "app_story": app_story,
                "template_id": template_id,
            },
            handle,
            ensure_ascii=False,
            indent=2,
        )
    log.info("Wrote %s", path)


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


def run_dry_run(args: argparse.Namespace) -> int:
    """Generate the ideas and print the requests without calling the API."""
    _ensure_openai_key()

    previews: list[dict[str, Any]] = []
    for language in args.languages:
        idea = generate_story_idea(
            model=args.idea_model,
            level=args.level,
            chapters=args.chapters,
            sentences_per_chapter=args.sentences_per_chapter,
            theme=args.theme,
            native_language=language,
            learning_language=args.learning_language,
            learning_language_name=args.learning_language_name,
        )
        previews.append(
            {
                "language": language,
                "idea": idea,
                "request": build_story_payload(idea, args, language),
            }
        )

    print(json.dumps(previews, ensure_ascii=False, indent=2))
    return 0


def run_generate(args: argparse.Namespace) -> int:
    """Generate one story per learner pair and store them as weekly templates."""
    _ensure_openai_key()
    client, db = connect_db()
    stats = CreationStats()

    try:
        ensure_story_indexes(db)
        week_start, week_end = current_week_bounds()
        log.info("Generating stories for the week of %s", week_start.date())

        for language in args.languages:
            if not args.force and story_template_exists(db, week_start, language):
                log.info(
                    "Template [%s] already exists for this week — skipping "
                    "(use --force to regenerate)",
                    language,
                )
                stats.templates_skipped += 1
                continue

            run_story = _generate_story(args, language)
            app_story, template_id, is_new = _store_story_template(
                db, run_story.story, language=language
            )
            if is_new:
                stats.templates_created += 1
            else:
                stats.templates_replaced += 1
            _write_generation_output(args, run_story, app_story, template_id)

        if args.all_users or args.user_id or args.username:
            _distribute_users(args, db, stats, week_start, week_end)

        stats.log_summary()
    finally:
        client.close()

    return EXIT_API_ERROR if stats.users_failed else 0


def _distribute_users(
    args: argparse.Namespace,
    db,
    stats: CreationStats,
    week_start: datetime,
    week_end: datetime,
) -> None:
    """Link each selected user to the template for their preferred language."""
    users = resolve_users(db, args)
    stats.users_found = len(users)
    if not users:
        log.error("No users found — nothing to distribute.")
        return

    for user_doc in users:
        user_id = str(user_doc["_id"])
        username = user_doc.get("username", user_id)
        language = user_language(user_doc)

        template = find_week_story_template(db, week_start, language)
        if template is None:
            log.warning("%s — no %s story template this week, skipping", username, language)
            stats.users_skipped_no_template += 1
            continue

        try:
            doc_id, is_new = link_user_story(
                db, user_id, language, template, week_start, week_end
            )
            stats.users_linked += 1
            log.info(
                "%s — %s (doc_id=%s, language=%s, template=%s)",
                username,
                "linked" if is_new else "updated",
                doc_id,
                language,
                template["_id"],
            )
        except Exception as exc:  # noqa: BLE001 - one user must not break the run
            stats.users_failed += 1
            log.error("%s — failed: %s: %s", username, type(exc).__name__, exc)


def run_per_users(args: argparse.Namespace) -> int:
    """Link every selected user to this week's language-matched story template.

    Nothing is generated here: templates must already exist (created by
    `--generate`, normally the weekly CronJob).
    """
    client, db = connect_db()
    stats = CreationStats()

    try:
        ensure_story_indexes(db)
        week_start, week_end = current_week_bounds()
        _distribute_users(args, db, stats, week_start, week_end)

        if (
            stats.users_found
            and stats.users_linked == 0
            and stats.users_skipped_no_template == stats.users_found
        ):
            log.error(
                "No story template found for this week — run the script with "
                "--generate first."
            )
            return EXIT_NOT_FOUND

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
        log.info("Storing story %s in MongoDB (weeklystory_templates)", story_id)
        client, db = connect_db()
        try:
            ensure_story_indexes(db)
            _store_story_template(db, story)
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

        if args.generate and args.dry_run:
            return run_dry_run(args)

        # Generation creates this week's templates, one per learner pair.
        if args.generate:
            return run_generate(args)

        # Distribution links users to the templates generated this week.
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
