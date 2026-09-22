"""
StoryCreatorWrapper.py — Orchestrates story generation for website users.

Fetches user info from MongoDB, calls run_story() from StoryCreatorAgent,
and persists the result to the weeklystories collection.

Usage:
    python StoryCreatorWrapper.py --all-users
    python StoryCreatorWrapper.py --username alice
    python StoryCreatorWrapper.py --user-id <mongodb_id>
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient

from StoryCreatorAgent import run_story

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Stats
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


# ---------------------------------------------------------------------------
# MongoDB helpers
# ---------------------------------------------------------------------------

def connect_db():
    """Return (client, db) using MONGODB_URI from environment."""
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise ValueError("MONGODB_URI environment variable is not set")
    client = MongoClient(mongodb_uri)
    db = client.get_default_database()
    log.info("Connected to MongoDB")
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
# Orchestrator
# ---------------------------------------------------------------------------

async def generate_and_store(
    db,
    user_id: str | None,
    level: str,
    topic: str,
    model: str,
    max_iterations: int,
) -> tuple[str, bool] | None:
    """Generate a story for user_id and persist it. Returns (doc_id, is_new) or None on failure."""
    label = f"userId={user_id}" if user_id is not None else "userId=null (global fallback)"
    try:
        story = await run_story(
            level=level,
            topic=topic,
            model=model,
            max_iterations=max_iterations,
        )
    except Exception:
        log.exception("run_story raised an unexpected exception (%s)", label)
        return None

    if story is None:
        log.error("run_story returned no story (%s)", label)
        return None

    try:
        doc_id, is_new = upsert_weekly_story(db, user_id, story)
    except Exception:
        log.exception("Failed to persist story to MongoDB (%s)", label)
        return None

    action = "inserted" if is_new else "replaced"
    log.info(
        "Story %s in MongoDB (weeklystories): '%s' (doc_id=%s, %d sentences, %s)",
        action,
        story.get("title_pt", "?"),
        doc_id,
        len(story.get("sentences") or []),
        label,
    )
    return doc_id, is_new


async def _generate_for_users(
    db,
    users: list,
    args,
    fallback_topic: str,
    stats: CreationStats,
) -> None:
    """Generate one story per user, then a global fallback — all on the same event loop."""
    log.info("Generating stories for %d user(s)...", len(users))

    for user_doc in users:
        user_id = str(user_doc["_id"])
        username = user_doc.get("username", user_id)
        topic = (user_doc.get("storyTopic") or "").strip() or fallback_topic
        if topic:
            log.info("User '%s': topic = %s", username, topic)
        else:
            log.info("User '%s': no topic set — agent will pick one", username)

        log.info("\n%s\nGenerating story for user: %s\n%s", "=" * 60, username, "=" * 60)
        try:
            result = await generate_and_store(
                db=db,
                user_id=user_id,
                level=args.level,
                topic=topic,
                model=args.model,
                max_iterations=args.max_iterations,
            )
            if result is not None:
                _, is_new = result
                if is_new:
                    stats.users_created += 1
                else:
                    stats.users_replaced += 1
            else:
                stats.users_failed += 1
                log.error("%s — story generation returned no result", username)
        except Exception as exc:
            stats.users_failed += 1
            log.error("%s — failed: %s: %s", username, type(exc).__name__, exc)
            log.error("Traceback:\n%s", traceback.format_exc())

    stats.log_summary()

    # Guest / unauthenticated readers share this document (userId=null).
    # Must stay on the SAME event loop as the user stories above. A second
    # asyncio.run() closes the first loop and leaves the OpenAI httpx client
    # bound to it, which is the crash in the weekly-story logs:
    #   ERROR Error getting response
    #   RuntimeError: Event loop is closed
    log.info("Creating global fallback story (userId=null)...")
    try:
        fallback = await generate_and_store(
            db=db,
            user_id=None,
            level=args.level,
            topic=fallback_topic,
            model=args.model,
            max_iterations=args.max_iterations,
        )
        if fallback is None:
            stats.fallback_failed = True
            log.error("Global fallback story was not saved")
        else:
            stats.fallback_ok = True
    except Exception:
        stats.fallback_failed = True
        log.exception("Global fallback story failed — user stories already saved will be kept")


async def _generate_standalone(db, args, fallback_topic: str) -> bool:
    result = await generate_and_store(
        db=db,
        user_id=None,
        level=args.level,
        topic=fallback_topic,
        model=args.model,
        max_iterations=args.max_iterations,
    )
    if result is None:
        log.error("Story generation failed — no story was saved.")
        return False
    return True


async def _close_agent_client() -> None:
    """Close the process-wide AsyncOpenAI client while the loop is still running."""
    try:
        from StoryCreatorAgent import close_openai_client
    except ImportError:
        return
    try:
        await close_openai_client()
    except Exception:
        log.debug("Ignoring error while closing agent OpenAI client", exc_info=True)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        log.error("OPEN_AI_KEY / OPENAI_API_KEY environment variable not set!")
        sys.exit(1)
    os.environ["OPENAI_API_KEY"] = api_key

    import importlib.metadata
    for pkg in ("openai-agents", "openai", "pydantic", "pymongo"):
        try:
            log.info("Package version: %s==%s", pkg, importlib.metadata.version(pkg))
        except importlib.metadata.PackageNotFoundError:
            log.warning("Package version: %s not found", pkg)

    parser = argparse.ArgumentParser(
        description="Generate bilingual Portuguese/French stories for website users (DB mode)"
    )
    parser.add_argument(
        "--level",
        choices=["beginner", "intermediate", "advanced"],
        default="beginner",
        help="Difficulty level of the stories (default: beginner)",
    )
    parser.add_argument(
        "--topic-file",
        type=str,
        default="story_topic.txt",
        help="Fallback topic file when a user has no storyTopic set in their profile. "
             "Defaults to story_topic.txt in the current directory. "
             "If the file is missing or empty, the agent picks a suitable topic.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="gpt-4.1-mini",
        help="OpenAI model to use (default: gpt-4.1-mini)",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=3,
        help="Maximum number of write/review cycles before saving (default: 3)",
    )

    user_group = parser.add_mutually_exclusive_group()
    user_group.add_argument(
        "--all-users",
        action="store_true",
        help="Generate a story for every registered (non-guest) user",
    )
    user_group.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="MongoDB _id of a specific user to generate a story for",
    )
    user_group.add_argument(
        "--username",
        type=str,
        default=None,
        help="Username of a specific user to generate a story for",
    )

    args = parser.parse_args()

    fallback_topic = ""
    topic_file = args.topic_file
    if topic_file and os.path.exists(topic_file):
        with open(topic_file, "r", encoding="utf-8") as f:
            fallback_topic = f.read().strip()
        if fallback_topic:
            log.info("Fallback topic loaded from '%s': %s", topic_file, fallback_topic)
        else:
            log.info("Topic file '%s' is empty — agent will pick a topic when needed.", topic_file)
    else:
        log.info("Topic file '%s' not found — agent will pick a topic when needed.", topic_file)

    client, db = connect_db()
    exit_code = 0
    try:
        use_per_user = args.all_users or args.user_id or args.username

        if use_per_user:
            users = resolve_users(db, args)
            if not users:
                log.error("No users found — nothing to do.")
                sys.exit(1)

            stats = CreationStats(users_found=len(users))

            async def _job() -> None:
                try:
                    await _generate_for_users(db, users, args, fallback_topic, stats)
                finally:
                    await _close_agent_client()

            asyncio.run(_job())

            if stats.users_failed > 0:
                exit_code = 1
            # Fallback failure is logged but does not fail the job when user
            # stories already landed — that was wiping a successful run.
        else:
            async def _standalone() -> bool:
                try:
                    return await _generate_standalone(db, args, fallback_topic)
                finally:
                    await _close_agent_client()

            ok = asyncio.run(_standalone())
            if not ok:
                exit_code = 1
    except Exception:
        log.exception("Fatal error in StoryCreatorWrapper")
        exit_code = 1
    finally:
        client.close()

    if exit_code:
        sys.exit(exit_code)


if __name__ == "__main__":
    main()
