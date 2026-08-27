import argparse
import json
import os
import sys
import uuid
import asyncio
from datetime import datetime

from agents import Agent, Runner, function_tool
from pymongo import MongoClient

# Allow importing from the repo-level scripts/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from db_utils import get_challenges_collection

# ---------------------------------------------------------------------------
# Globals (set once in main, read by tool functions)
# ---------------------------------------------------------------------------
_new_challenges: list[dict] = []
_existing_words: set[str] = set()   # lowercase dedup guard
_mongodb_uri: str = ""

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _load_existing_words() -> set[str]:
    client, collection = get_challenges_collection()
    docs = list(collection.find({"type": "word"}, {"port": 1}))
    client.close()
    return {doc["port"].lower() for doc in docs if "port" in doc}


# ---------------------------------------------------------------------------
# Agent tools
# ---------------------------------------------------------------------------

@function_tool
def get_existing_vocabulary() -> str:
    """
    Return a JSON array of all Portuguese words currently in the vocabulary
    database.  Use this to avoid proposing words that already exist.

    Returns a JSON string — a list of Portuguese word strings.
    """
    return json.dumps(sorted(_existing_words), ensure_ascii=False)


@function_tool
def log_creation(
    portuguese_word: str,
    fr_translation: str,
    en_translation: str,
) -> str:
    """
    Emit a human-readable log line before adding a new challenge entry.
    Call this once per word, just before calling add_new_challenge.

    - portuguese_word: the Portuguese word being added.
    - fr_translation: the French translation you plan to store.
    - en_translation: the English translation you plan to store.
    """
    print(f"\n➕ Creating: '{portuguese_word}'")
    print(f"   FR: {fr_translation}  |  EN: {en_translation}")
    return "logged"


@function_tool
def add_new_challenge(
    portuguese_word: str,
    fr_translation: str,
    fr_example_pt: str,
    fr_example_fr: str,
    fr_note: str,
    en_translation: str,
    en_example_pt: str,
    en_example_en: str,
    en_note: str,
) -> str:
    """
    Add a new vocabulary challenge entry to the in-memory staging list.
    A unique ID is generated automatically.  The entry will NOT be written to
    MongoDB until save_all_new_challenges is called.

    - portuguese_word: canonical European Portuguese word or short phrase.
    - fr_translation: best French translation.
    - fr_example_pt: short example sentence in Portuguese (for the FR section).
    - fr_example_fr: French translation of that example sentence.
    - fr_note: ≤ 2 sentences in French about usage/nuance; pass "" if nothing useful.
    - en_translation: best English translation.
    - en_example_pt: short example sentence in Portuguese (for the EN section).
    - en_example_en: English translation of that example sentence.
    - en_note: ≤ 2 sentences in English about usage/nuance; pass "" if nothing useful.

    Returns a status string; returns an error message if the word is a duplicate.
    """
    normalized = portuguese_word.lower().strip()
    if normalized in _existing_words:
        return f"SKIPPED (duplicate): '{portuguese_word}' already exists in the vocabulary."

    today = datetime.now().strftime("%Y-%m-%d")
    challenge_id = str(uuid.uuid4())

    challenge: dict = {
        "id": challenge_id,
        "port": portuguese_word.strip(),
        "fr": {
            "translation": fr_translation,
            "note": fr_note,
            "port_exemple": fr_example_pt,
            "use_exemple": fr_example_fr,
            "last_update": today,
        },
        "en": {
            "translation": en_translation,
            "note": en_note,
            "port_exemple": en_example_pt,
            "use_exemple": en_example_en,
            "last_update": today,
        },
        "user_usefulness": 0,
    }

    _new_challenges.append(challenge)
    _existing_words.add(normalized)
    print(f"   ✅ Staged '{portuguese_word}' (id: {challenge_id})")
    return f"Staged '{portuguese_word}' with id {challenge_id}."


@function_tool
def save_all_new_challenges() -> str:
    """
    Persist all staged challenges to MongoDB.
    Call this exactly once, after all add_new_challenge calls are complete.

    Returns a summary of how many documents were inserted.
    """
    if not _new_challenges:
        return "Nothing to save — no new challenges were staged."

    client, collection = get_challenges_collection()
    inserted = 0
    skipped = 0
    for c in _new_challenges:
        doc = {k: v for k, v in c.items() if k != "id"}
        doc["_id"] = c["id"]
        doc["type"] = "word"
        try:
            collection.insert_one(doc)
            inserted += 1
        except Exception as e:
            print(f"   ⚠️  Failed to insert '{c.get('port', '?')}': {e}")
            skipped += 1
    client.close()

    return f"Inserted {inserted} new challenge(s) into MongoDB. {skipped} failed."


# ---------------------------------------------------------------------------
# Agent definitions
# ---------------------------------------------------------------------------

def _build_planner_agent(model: str = "gpt-4.1") -> Agent:
    instructions = """You are a European Portuguese vocabulary curriculum designer.
Your job is to propose a list of new Portuguese words to add to a vocabulary learning
application aimed at beginner-to-intermediate learners.

Workflow:
1. Call get_existing_vocabulary to receive the full list of words already in the
   database.
2. Based on the count and optional theme in the user message, select that many new
   Portuguese words that:
   - Are NOT already in the existing vocabulary list (check carefully — case-insensitive).
   - Are genuinely useful for learners at a beginner-to-intermediate level.
   - If a theme is provided: are clearly related to that theme.
   - If no theme is provided: cover common everyday vocabulary gaps.
3. Output a JSON array as your final response (no extra prose), where each object has:
   - "port": the Portuguese word or short phrase (European Portuguese)
   - "reason": one sentence explaining why this word is a useful addition

Rules:
- Single words are strongly preferred over multi-word phrases unless the phrase
  is idiomatic and has no single-word equivalent.
- Do NOT include words that are already in the existing vocabulary (even with
  different capitalisation or accents).
- Aim for variety: mix nouns, verbs, adjectives, adverbs.
"""
    return Agent(
        name="WordPlannerAgent",
        instructions=instructions,
        tools=[get_existing_vocabulary],
        model=model,
    )


def _build_creator_agent(model: str = "gpt-4.1-mini") -> Agent:
    instructions = """You are a bilingual Portuguese/French/English content creator for a
vocabulary learning application.  You will receive a JSON array of Portuguese words to add.
For each word you must create a complete, high-quality vocabulary entry.

Workflow:
For each word in the input list:
  a. Call log_creation with the word and the translations you plan to use.
  b. Call add_new_challenge with all required fields filled in.
After ALL words have been processed, call save_all_new_challenges exactly once.
Finally, report a concise summary: how many entries were created and how many were skipped.

Content guidelines:
- Translations: use the most common, natural equivalent for a beginner learner.
  For French and English, prefer a single clear word over a slash-separated list;
  if two words are genuinely equivalent, pick the more common one.
- Example sentences: keep them short (≤ 12 words), natural, and beginner-friendly.
  Use the same Portuguese sentence for both the FR and EN sections if it works well,
  or write a slightly different sentence for each if it reads more naturally.
- Notes: add a note only when there is a genuine nuance worth mentioning
  (register, false friend, common mistake, regional usage).  Pass "" otherwise.
- Do NOT skip any word from the input list unless add_new_challenge reports it as
  a duplicate.
"""
    return Agent(
        name="ContentCreatorAgent",
        instructions=instructions,
        tools=[log_creation, add_new_challenge, save_all_new_challenges],
        model=model,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def _run_agent(
    count: int,
    theme: str,
    model: str = "gpt-4.1-mini",
    planner_model: str = "gpt-4.1",
) -> None:
    global _new_challenges, _existing_words, _mongodb_uri

    _mongodb_uri = os.environ.get("MONGODB_URI", "")
    if not _mongodb_uri:
        print("ERROR: MONGODB_URI environment variable not set!")
        exit(1)

    print("Loading existing vocabulary from MongoDB...")
    _existing_words = _load_existing_words()
    print(f"Found {len(_existing_words)} existing word(s) in the database")

    theme_display = f"'{theme}'" if theme else "general vocabulary"
    print(f"Target: {count} new word(s)  |  Theme: {theme_display}\n")

    # ------------------------------------------------------------------
    # Phase 1: Word planning
    # ------------------------------------------------------------------
    print("=" * 60)
    print("PHASE 1: Word Planning")
    print(f"Model: {planner_model}")
    print("=" * 60)

    planner_prompt = f"Propose {count} new Portuguese vocabulary word(s)"
    if theme:
        planner_prompt += f" on the theme: {theme}."
    else:
        planner_prompt += " covering common everyday vocabulary gaps."

    planner = _build_planner_agent(planner_model)
    planner_result = await Runner.run(
        planner,
        planner_prompt,
        max_turns=10,
    )
    print("\nPlanned words:")
    print(planner_result.final_output)

    # ------------------------------------------------------------------
    # Phase 2: Content creation
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("PHASE 2: Content Creation")
    print(f"Model: {model}")
    print("=" * 60)

    creator = _build_creator_agent(model)
    creator_result = await Runner.run(
        creator,
        f"Create vocabulary entries for the following Portuguese words:\n\n{planner_result.final_output}",
        max_turns=count * 5 + 20,
    )
    print("\nCreator Report:")
    print(creator_result.final_output)
    print("=" * 60)


def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY")
    if not api_key:
        print("ERROR: OPEN_AI_KEY environment variable not set!")
        exit(1)
    os.environ["OPENAI_API_KEY"] = api_key  # openai-agents reads OPENAI_API_KEY

    parser = argparse.ArgumentParser(
        description="Generate and insert new vocabulary challenges into MongoDB using an AI agent"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=20,
        help="Number of new words to add (default: 20)",
    )
    parser.add_argument(
        "--theme",
        type=str,
        default="",
        help="Optional theme/topic to focus new words on (e.g. 'travel', 'food', 'emotions')",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="gpt-4.1-mini",
        help="OpenAI model for the content creator agent (default: gpt-4.1-mini)",
    )
    parser.add_argument(
        "--planner-model",
        type=str,
        default="gpt-4.1",
        help="OpenAI model for the word planner agent (default: gpt-4.1)",
    )
    args = parser.parse_args()

    asyncio.run(_run_agent(
        count=args.count,
        theme=args.theme,
        model=args.model,
        planner_model=args.planner_model,
    ))


if __name__ == "__main__":
    main()
