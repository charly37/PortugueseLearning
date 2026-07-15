"""
StoryCreatorAgent.py — Generate bilingual Portuguese/French short stories for language learning.

Each story is written sentence-by-sentence in European Portuguese, with a French translation
alongside each sentence, so that French-speaking learners can read both versions side by side.

Output: stories.json  (a JSON array of story objects appended on each run)

Story object schema:
{
    "id":         <uuid>,
    "title_pt":   <Portuguese title>,
    "title_fr":   <French title>,
    "level":      "beginner" | "intermediate" | "advanced",
    "topic":      <short topic label, e.g. "daily life", "travel">,
    "user_id":    <MongoDB user _id as string, or null for global stories>,
    "sentences": [
        {"pt": <Portuguese sentence>, "fr": <French translation>},
        ...
    ],
    "created_at": "YYYY-MM-DD"
}
"""

import argparse
import json
import logging
import os
import re
import sys
import uuid
import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from agents import Agent, Runner, function_tool
from pymongo import MongoClient

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Globals (set once per story generation run, read by tool functions)
# ---------------------------------------------------------------------------
_stories_path: str = "stories.json"
_level: str = "beginner"
_topic: str = ""
_db = None          # MongoDB database connection (set before running the agent)
_user_id: str | None = None  # current user being processed

# ---------------------------------------------------------------------------
# MongoDB helpers (mirrors create_weekly_challenge.py pattern)
# ---------------------------------------------------------------------------

@dataclass
class CreationStats:
    """Counters collected during a weekly-story creation run."""
    users_found: int = 0
    users_created: int = 0    # story newly inserted
    users_replaced: int = 0   # existing story overwritten
    users_failed: int = 0     # unexpected error per user

    def log_summary(self) -> None:
        log.info("--- Creation Statistics ---")
        log.info("Users found          : %d", self.users_found)
        log.info("Stories created      : %d (new)", self.users_created)
        if self.users_replaced:
            log.info("Stories replaced     : %d (overwrote existing)", self.users_replaced)
        if self.users_failed:
            log.info("Users failed         : %d", self.users_failed)
        log.info("Total processed      : %d", self.users_created + self.users_replaced)


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
    now = datetime.utcnow()
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

    result = collection.replace_one(filter_query, doc, upsert=True)

    if result.upserted_id:
        return str(result.upserted_id), True
    existing = collection.find_one(filter_query)
    doc_id = str(existing["_id"]) if existing else "unknown"
    return doc_id, False


def resolve_users(db, args) -> list:
    """
    Return a list of user documents matching the CLI arguments.
    Supports --user-id, --username, or --all-users.
    """
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


def _load_stories() -> list[dict]:
    if os.path.exists(_stories_path):
        with open(_stories_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def _save_stories(stories: list[dict]) -> None:
    with open(_stories_path, "w", encoding="utf-8") as f:
        json.dump(stories, f, ensure_ascii=False, indent=4)


# ---------------------------------------------------------------------------
# Agent tools
# ---------------------------------------------------------------------------

@function_tool
def get_existing_story_titles() -> str:
    """
    Return the titles (Portuguese) of all previously generated stories so the
    agent can avoid creating a duplicate story on the same topic.

    Returns a JSON array of title strings.
    """
    titles: list[str] = []

    # Query MongoDB first (primary source when connected)
    if _db is not None:
        col = _db["weeklystories"]
        query: dict = {}
        if _user_id is not None:
            query["userId"] = _user_id
        for doc in col.find(query, {"story.title_pt": 1}):
            title = doc.get("story", {}).get("title_pt", "")
            if title and title not in titles:
                titles.append(title)

    # Also check local JSON file as a fallback / complement
    for s in _load_stories():
        title = s.get("title_pt", "")
        if title and title not in titles:
            titles.append(title)

    return json.dumps(titles, ensure_ascii=False)


@function_tool
def log_story_plan(
    title_pt: str,
    title_fr: str,
    topic: str,
    level: str,
    summary: str,
) -> str:
    """
    Emit a human-readable plan before writing the story.  Call this once before
    calling save_story so the operator can follow the agent's intent.

    - title_pt: planned Portuguese title.
    - title_fr: planned French title.
    - topic: theme of the story.
    - level: "beginner", "intermediate", or "advanced".
    - summary: 1–2 sentence description of the plot.
    """
    print(f"\n📖 Story plan")
    print(f"   Title (PT)  : {title_pt}")
    print(f"   Title (FR)  : {title_fr}")
    print(f"   Topic       : {topic}")
    print(f"   Level       : {level}")
    print(f"   Plot        : {summary}")
    return "plan logged"


def _save_story_data(
    title_pt: str,
    title_fr: str,
    level: str,
    topic: str,
    sentences: list[dict],
    user_id: str | None = None,
) -> tuple[str, bool]:
    """Persist a story to MongoDB (weeklystories collection) and return (story_id, is_new).
    Falls back to stories.json when no DB connection is available."""
    story_id = str(uuid.uuid4())
    today = datetime.utcnow().strftime("%Y-%m-%d")

    story: dict[str, Any] = {
        "id": story_id,
        "title_pt": title_pt,
        "title_fr": title_fr,
        "level": level,
        "topic": topic,
        "sentences": sentences,
        "created_at": today,
    }

    if _db is not None:
        doc_id, is_new = upsert_weekly_story(_db, user_id, story)
        action = "inserted" if is_new else "replaced"
        print(f"\n   ✅ Story {action} in MongoDB (weeklystories): '{title_pt}' "
              f"(doc_id={doc_id}, {len(sentences)} sentences)")
        return story_id, is_new

    # Fallback: persist to JSON file when running without a DB connection
    stories = _load_stories()
    stories.append({**story, "user_id": user_id})
    _save_stories(stories)
    print(f"\n   ✅ Story saved to {_stories_path}: '{title_pt}' (id={story_id}, {len(sentences)} sentences)")
    return story_id, True


def _parse_and_save(draft: str, level: str, topic: str, user_id: str | None = None) -> tuple[str, bool] | None:
    """Extract the JSON story from the writer's final output and save it."""
    # Prefer a fenced JSON code block; fall back to the first bare JSON object.
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", draft, re.DOTALL)
    if match:
        json_str = match.group(1)
    else:
        bare = re.search(r"\{.*\}", draft, re.DOTALL)
        if not bare:
            print("\n❌  Could not extract story JSON from writer output.")
            print("    Raw draft written to draft.txt for inspection.")
            with open("draft.txt", "w", encoding="utf-8") as f:
                f.write(draft)
            return None
        json_str = bare.group(0)

    try:
        data: dict = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"\n❌  JSON parse error: {e}")
        return None

    return _save_story_data(
        title_pt=data.get("title_pt", "Unknown"),
        title_fr=data.get("title_fr", "Unknown"),
        level=data.get("level", level),
        topic=data.get("topic", topic),
        sentences=data.get("sentences", []),
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

def _build_writer_agent(level: str, topic: str, model: str = "gpt-4.1-mini") -> Agent:
    topic_clause = f'The topic for this session is: "{topic}".' if topic else \
        "Choose a natural, everyday topic suitable for language learners (e.g. daily life, shopping, travel, family, weather, food)."

    instructions = f"""You are a bilingual Portuguese/French story writer for language learners.
Your goal is to create short, engaging stories written in European Portuguese, with a
French translation for every sentence, so that French-speaking learners can read both
versions side by side.

Target difficulty level for this session: **{level}**
- beginner:     short, simple sentences; present tense only; high-frequency vocabulary.
- intermediate: moderate complexity; past and future tenses allowed; varied sentence structure.
- advanced:     rich language; subjunctive and complex tenses; nuanced vocabulary.

{topic_clause}

Workflow:
1. Call get_existing_story_titles to see what has already been written — avoid repeating
   the same topic/plot.
2. Plan the story: choose a title and a simple plot.
3. Call log_story_plan with your plan details.
4. Write the story as a sequence of 40–50 sentences.  For EACH sentence:
   - Write a natural European Portuguese sentence.
   - Translate it faithfully into French, keeping the same register and tone.
   - Do NOT add word-for-word glosses inside the sentence — the side-by-side format is
     the learning aid.
5. Output the completed story as a JSON code block with this exact structure
   (no commentary after the block):
   ```json
   {{
       "title_pt": "<Portuguese title>",
       "title_fr": "<French title>",
       "level":    "{level}",
       "topic":    "<short topic label>",
       "sentences": [
           {{"pt": "<sentence>", "fr": "<translation>"}},
           ...
       ]
   }}
   ```

Writing guidelines:
- Use European Portuguese (not Brazilian): vocabulary, spelling, and grammar should
  match Portugal norms (e.g. "autocarro" not "ônibus", "casa de banho" not "banheiro").
- Keep sentences short enough to be understood with effort by a learner at the stated level.
- Each sentence must stand on its own when read in isolation.
- French translations must be natural French, not literal word-for-word renderings.
- Do not mix Portuguese and French within the same sentence field.
"""

    return Agent(
        name="StoryWriterAgent",
        instructions=instructions,
        tools=[
            get_existing_story_titles,
            log_story_plan,
        ],
        model=model,
    )


def _build_reviewer_agent(level: str, model: str = "gpt-4.1-mini") -> Agent:
    return Agent(
        name="StoryReviewerAgent",
        instructions=f"""You are a quality reviewer for bilingual Portuguese/French language-learning stories.

Evaluate the story draft against ALL of these criteria:
1. **European Portuguese**: Uses Portugal vocabulary and spelling
   (e.g. "autocarro" not "ônibus", "casa de banho" not "banheiro", "comboio" not "trem").
2. **Sentence count**: Between 10 and 20 sentences.
3. **Difficulty level — {level}**:
   - beginner:     present tense only; high-frequency vocabulary; short, simple sentences.
   - intermediate: past and future tenses allowed; varied sentence structure.
   - advanced:     subjunctive and complex tenses; nuanced vocabulary.
4. **Translation quality**: French translations are natural and idiomatic — not word-for-word.
5. **No language mixing**: Each "pt" field contains ONLY Portuguese; each "fr" field ONLY French.
6. **Valid structure**: JSON contains title_pt, title_fr, level, topic, and a sentences array.

Respond with EXACTLY one of these two formats (no preamble, no markdown):
APPROVED: <one sentence explaining why it passes all criteria>
REVISE: <numbered list of specific issues, referencing exact sentences where possible>
""",
        model=model,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def _run_with_review_loop(
    writer: Agent,
    reviewer: Agent,
    initial_message: str,
    level: str,
    topic: str,
    max_iterations: int,
    user_id: str | None = None,
) -> tuple[str, bool] | None:
    """Run the writer, then alternate reviewer → writer until approved or max iterations."""
    print("✍️  Writer creating initial draft...")
    writer_result = await Runner.run(writer, initial_message)
    draft = writer_result.final_output

    for iteration in range(max_iterations):
        print(f"\n{'=' * 60}")
        print(f"REVIEW ITERATION {iteration + 1}/{max_iterations}")
        print(f"{'=' * 60}")

        review_result = await Runner.run(
            reviewer,
            f"Review this story draft:\n\n{draft}",
        )
        verdict = review_result.final_output.strip()
        print(f"\n📋 Reviewer verdict:\n{verdict}")

        if verdict.upper().startswith("APPROVED"):
            print("\n✅ Story approved — saving.")
            break

        if iteration < max_iterations - 1:
            print(f"\n✍️  Writer revising (attempt {iteration + 2}/{max_iterations})...")
            writer_result = await Runner.run(
                writer,
                f"Revise your story based on this reviewer feedback:\n{verdict}\n\n"
                f"Your previous draft:\n{draft}",
            )
            draft = writer_result.final_output
        else:
            print(f"\n⚠️  Max iterations ({max_iterations}) reached — saving best effort.")

    return _parse_and_save(draft, level, topic, user_id=user_id)


async def _run_agent(
    level: str,
    topic: str,
    model: str,
    max_iterations: int,
    user_id: str | None = None,
    db=None,
) -> tuple[str, bool] | None:
    global _level, _topic, _db, _user_id

    _level = level
    _topic = topic
    _db = db
    _user_id = user_id

    existing = _load_stories()
    print(f"Existing stories: {len(existing)}")
    print(f"Level: {level}\n")

    writer = _build_writer_agent(level, topic, model)
    reviewer = _build_reviewer_agent(level, model)

    topic_part = f' on the topic "{topic}"' if topic else ""
    user_message = (
        f"Generate a short bilingual Portuguese/French learning story"
        f"{topic_part} at {level} level."
    )

    return await _run_with_review_loop(writer, reviewer, user_message, level, topic, max_iterations, user_id=user_id)


def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY")
    if not api_key:
        print("ERROR: OPEN_AI_KEY environment variable not set!")
        exit(1)
    os.environ["OPENAI_API_KEY"] = api_key  # openai-agents reads OPENAI_API_KEY

    # Log package versions upfront to simplify future debugging
    import importlib.metadata
    for pkg in ("openai-agents", "openai", "pydantic", "pymongo"):
        try:
            log.info("Package version: %s==%s", pkg, importlib.metadata.version(pkg))
        except importlib.metadata.PackageNotFoundError:
            log.warning("Package version: %s not found", pkg)

    parser = argparse.ArgumentParser(
        description="Generate bilingual Portuguese/French learning stories using an AI agent"
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
        help="Fallback topic file used when a user has no storyTopic set in their profile. "
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

    # User targeting (mirrors create_weekly_challenge.py)
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

    # Load fallback topic from file
    fallback_topic = ""
    topic_file = args.topic_file
    if topic_file and os.path.exists(topic_file):
        with open(topic_file, "r", encoding="utf-8") as f:
            fallback_topic = f.read().strip()
        if fallback_topic:
            print(f"Fallback topic loaded from '{topic_file}': {fallback_topic}")
        else:
            print(f"Topic file '{topic_file}' is empty — agent will pick a topic when needed.")
    else:
        print(f"Topic file '{topic_file}' not found — agent will pick a topic when needed.")

    # Determine whether to run in per-user mode or standalone mode
    use_per_user = args.all_users or args.user_id or args.username

    if use_per_user:
        client, db = connect_db()
        try:
            users = resolve_users(db, args)
            if not users:
                log.error("No users found — nothing to do.")
                sys.exit(1)

            stats = CreationStats(users_found=len(users))
            log.info("Generating stories for %d user(s)...", len(users))

            for user_doc in users:
                user_id = str(user_doc["_id"])
                username = user_doc.get("username", user_id)
                # Use the user's storyTopic if set, else fall back to file/agent choice
                topic = (user_doc.get("storyTopic") or "").strip() or fallback_topic
                if topic:
                    log.info("User '%s': topic = %s", username, topic)
                else:
                    log.info("User '%s': no topic set — agent will pick one", username)

                print(f"\n{'=' * 60}")
                print(f"Generating story for user: {username}")
                print(f"{'=' * 60}")
                try:
                    result = asyncio.run(
                        _run_agent(
                            level=args.level,
                            topic=topic,
                            model=args.model,
                            max_iterations=args.max_iterations,
                            user_id=user_id,
                            db=db,
                        )
                    )
                    if result is not None:
                        _, is_new = result
                        if is_new:
                            stats.users_created += 1
                        else:
                            stats.users_replaced += 1
                    else:
                        stats.users_failed += 1
                except Exception as exc:
                    log.error("%s — failed: %s", username, exc)
                    stats.users_failed += 1

            stats.log_summary()
            if stats.users_failed > 0:
                sys.exit(1)
        finally:
            client.close()
    else:
        # Standalone mode (no user targeting) — writes to weeklystories with userId=null
        client, db = connect_db()
        try:
            result = asyncio.run(
                _run_agent(
                    level=args.level,
                    topic=fallback_topic,
                    model=args.model,
                    max_iterations=args.max_iterations,
                    db=db,
                )
            )
            if result is None:
                log.error("Story generation failed — no story was saved.")
                sys.exit(1)
        finally:
            client.close()


if __name__ == "__main__":
    main()
