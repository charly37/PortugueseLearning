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
from datetime import datetime
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

# ---------------------------------------------------------------------------
# MongoDB helpers (mirrors create_weekly_challenge.py pattern)
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
    stories = _load_stories()
    titles = [s.get("title_pt", "") for s in stories]
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
) -> str:
    """Persist a story to stories.json and return its ID."""
    story_id = str(uuid.uuid4())
    today = datetime.now().strftime("%Y-%m-%d")

    story: dict[str, Any] = {
        "id": story_id,
        "title_pt": title_pt,
        "title_fr": title_fr,
        "level": level,
        "topic": topic,
        "user_id": user_id,
        "sentences": sentences,
        "created_at": today,
    }

    stories = _load_stories()
    stories.append(story)
    _save_stories(stories)

    print(f"\n   ✅ Story saved: '{title_pt}' (id={story_id}, {len(sentences)} sentences)")
    return story_id


def _parse_and_save(draft: str, level: str, topic: str, user_id: str | None = None) -> None:
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
            return
        json_str = bare.group(0)

    try:
        data: dict = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"\n❌  JSON parse error: {e}")
        return

    _save_story_data(
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
) -> None:
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

    _parse_and_save(draft, level, topic, user_id=user_id)


async def _run_agent(
    level: str,
    topic: str,
    model: str,
    max_iterations: int,
    user_id: str | None = None,
) -> None:
    global _level, _topic

    _level = level
    _topic = topic

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

    await _run_with_review_loop(writer, reviewer, user_message, level, topic, max_iterations, user_id=user_id)


def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY")
    if not api_key:
        print("ERROR: OPEN_AI_KEY environment variable not set!")
        exit(1)
    os.environ["OPENAI_API_KEY"] = api_key  # openai-agents reads OPENAI_API_KEY

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
                asyncio.run(
                    _run_agent(
                        level=args.level,
                        topic=topic,
                        model=args.model,
                        max_iterations=args.max_iterations,
                        user_id=user_id,
                    )
                )
        finally:
            client.close()
    else:
        # Standalone mode (no user targeting) — original behaviour
        asyncio.run(
            _run_agent(
                level=args.level,
                topic=fallback_topic,
                model=args.model,
                max_iterations=args.max_iterations,
            )
        )


if __name__ == "__main__":
    main()
