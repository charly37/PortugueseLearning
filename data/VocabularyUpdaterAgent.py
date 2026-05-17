# TODO: Language awareness for DB flags
#   Currently, quality flags stored in MongoDB have no language field — they only record
#   the challengeId. This means that when a user flags a challenge (e.g. because the French
#   translation is wrong), running the script with --language en will still prioritize and
#   process that challenge in English, then clear the flag without fixing French.
#   Fix: store the user's active language in the flag document at flag creation time
#   (in the app), then filter prioritized flags by the current --language argument here,
#   and only clear flags matching that language.

import argparse
import json
import os
import asyncio
from datetime import datetime, timedelta
from typing import Any

from agents import Agent, Runner, function_tool
from pymongo import MongoClient

# ---------------------------------------------------------------------------
# Globals (set once in main, read by tool functions)
# ---------------------------------------------------------------------------
_challenges: list[dict] = []
_language: str = "fr"
_months: int = 6
_mongodb_uri: str = ""

# ---------------------------------------------------------------------------
# Helper utilities (not tools — pure Python helpers)
# ---------------------------------------------------------------------------

def _load_challenges() -> list[dict]:
    with open("challenges.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _save_challenges(challenges: list[dict]) -> None:
    with open("challenges.json", "w", encoding="utf-8") as f:
        json.dump(challenges, f, ensure_ascii=False, indent=4)


def _is_translation_recent(challenge: dict, language: str, months: int) -> bool:
    section = challenge.get(language)
    if not section:
        return False
    last_update = section.get("last_update")
    if not last_update:
        return False
    try:
        update_date = datetime.strptime(last_update, "%Y-%m-%d")
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        return update_date >= cutoff_date
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Agent tools
# ---------------------------------------------------------------------------

@function_tool
def get_pending_challenges(max_words: int) -> str:
    """
    Return up to max_words challenges that need translation work, ordered so
    that user-flagged challenges come first.  Each entry contains the challenge
    id, the Portuguese word, the current translation (and note) in the active
    language, and whether it was flagged by users.

    Returns a JSON string with a list of challenge summaries.
    """
    flagged_ids: set[str] = set()
    flagged_order: dict[str, int] = {}

    if _mongodb_uri:
        try:
            mongo_client = MongoClient(_mongodb_uri)
            mongo_client.admin.command("ping")
            db = mongo_client.get_database()
            pipeline = [
                {"$group": {"_id": "$challengeId", "flagCount": {"$sum": 1}}},
                {"$match": {"flagCount": {"$gte": 1}}},
                {"$sort": {"flagCount": -1}},
            ]
            results = list(db.challengequalityflags.aggregate(pipeline))
            mongo_client.close()
            for i, r in enumerate(results):
                flagged_ids.add(r["_id"])
                flagged_order[r["_id"]] = i
            print(f"Found {len(flagged_ids)} flagged challenge(s) in DB")
        except Exception as e:
            print(f"⚠️  Could not fetch flagged challenges from MongoDB: {e}")

    # Sort: flagged first (by flag count), then by natural order
    ordered = sorted(
        _challenges,
        key=lambda c: (
            0 if c.get("id") in flagged_ids else 1,
            flagged_order.get(c.get("id", ""), 999999),
        ),
    )

    pending = []
    for challenge in ordered:
        cid = challenge.get("id", "unknown")
        is_flagged = cid in flagged_ids
        if not is_flagged and _is_translation_recent(challenge, _language, _months):
            continue
        lang_section = challenge.get(_language, {})
        pending.append(
            {
                "id": cid,
                "portuguese_word": challenge.get("port", ""),
                "current_translation": lang_section.get("translation", ""),
                "current_note": lang_section.get("note", ""),
                "has_examples": bool(lang_section.get("port_exemple") and lang_section.get("use_exemple")),
                "flagged_by_users": is_flagged,
            }
        )
        if len(pending) >= max_words:
            break

    return json.dumps(pending, ensure_ascii=False)


@function_tool
def log_review(
    portuguese_word: str,
    current_translation: str,
    assessment: str,
    planned_changes: str,
    flagged_by_users: bool,
) -> str:
    """
    Emit a human-readable log line before processing a challenge.
    Call this once per challenge, just before calling update_challenge.

    - portuguese_word: the Portuguese word being reviewed.
    - current_translation: the existing translation in the target language.
    - assessment: one sentence explaining whether the translation is good or why
      it needs changing (e.g. "Translation is accurate.", "Better word exists: X").
    - planned_changes: comma-separated list of fields that will be updated
      (e.g. "translation, examples, note"), or "timestamp only" if nothing needs
      changing.
    - flagged_by_users: whether this challenge was flagged by users in the app.
    """
    flag_marker = " 🚩 [USER FLAGGED]" if flagged_by_users else ""
    print(f"\n🔍 Reviewing: '{portuguese_word}'{flag_marker}")
    print(f"   Current translation : {current_translation}")
    print(f"   Assessment          : {assessment}")
    print(f"   Planned changes     : {planned_changes}")
    return "logged"


@function_tool
def apply_portuguese_corrections(corrections_json: str) -> str:
    """
    Apply Portuguese word corrections to the in-memory challenges list.
    corrections_json must be a JSON array of objects, each with:
      - challenge_id: string ID of the challenge
      - corrected_word: the correct Portuguese word, or empty string if no change needed
      - reason: brief explanation of the correction, or "ok" if no change

    Only entries with a non-empty corrected_word are applied.
    Returns a summary of applied corrections.
    """
    try:
        corrections: list[dict] = json.loads(corrections_json)
    except Exception as e:
        return f"Error parsing corrections JSON: {e}"

    applied = 0
    skipped = 0
    for c in corrections:
        corrected = c.get("corrected_word", "").strip()
        if not corrected:
            skipped += 1
            continue
        for challenge in _challenges:
            if challenge.get("id") == c.get("challenge_id"):
                old = challenge.get("port", "")
                challenge["port"] = corrected
                print(f"   ✅ Corrected '{old}' → '{corrected}' (reason: {c.get('reason', '')})")
                applied += 1
                break

    return f"Applied {applied} correction(s), {skipped} word(s) unchanged."


@function_tool
def update_translation(
    challenge_id: str,
    new_translation: str,
    portuguese_example: str,
    target_language_example: str,
    note: str,
    translation_was_accurate: bool,
) -> str:
    """
    Persist an updated translation (and optionally examples and note) for a
    challenge identified by challenge_id.

    - new_translation: the best translation in the active target language.
    - portuguese_example: a simple example sentence in Portuguese.
    - target_language_example: translation of that example in the target language.
    - note: a short remark (max 2 sentences) about the Portuguese word; pass an
      empty string if you have nothing useful to add.
    - translation_was_accurate: True if the existing translation was already
      correct (so only examples / note / timestamp are updated).

    Returns a short status string.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    updated_fields: list[str] = []

    for challenge in _challenges:
        if challenge.get("id") != challenge_id:
            continue

        if _language not in challenge:
            challenge[_language] = {}

        section = challenge[_language]

        if not translation_was_accurate:
            section["translation"] = new_translation
            updated_fields.append("translation")

        if not section.get("port_exemple") or not section.get("use_exemple"):
            section["port_exemple"] = portuguese_example
            section["use_exemple"] = target_language_example
            updated_fields.append("examples")

        if section.get("note") == "todo" and note:
            section["note"] = note
            updated_fields.append("note")

        section["last_update"] = today
        updated_fields.append("last_update")

        msg = f"Updated challenge {challenge_id}: {', '.join(updated_fields)}"
        print(f"   ✅ {msg}")
        return msg

    return f"Challenge {challenge_id} not found."


@function_tool
def save_all_changes() -> str:
    """
    Write the in-memory challenges list back to challenges.json.
    Call this once after all individual updates are done.
    """
    _save_challenges(_challenges)
    return "challenges.json saved successfully."


@function_tool
def clear_quality_flags(challenge_ids_json: str) -> str:
    """
    Delete quality flags from MongoDB for the given challenge IDs.
    challenge_ids_json must be a JSON array of challenge ID strings.
    Call this after processing flagged challenges to avoid re-processing them.
    """
    if not _mongodb_uri:
        return "No MONGODB_URI set — skipping flag cleanup."
    try:
        ids: list[str] = json.loads(challenge_ids_json)
        if not ids:
            return "No IDs to clear."
        mongo_client = MongoClient(_mongodb_uri)
        db = mongo_client.get_database()
        result = db.challengequalityflags.delete_many({"challengeId": {"$in": ids}})
        mongo_client.close()
        return f"Cleared {result.deleted_count} flag(s) for {len(ids)} challenge(s)."
    except Exception as e:
        return f"Error clearing flags: {e}"


# ---------------------------------------------------------------------------
# Agent definitions
# ---------------------------------------------------------------------------

def _build_validator_agent(model: str = "gpt-4.1") -> Agent:
    instructions = """You are a European Portuguese language expert and data quality auditor.
Your ONLY job is to review the Portuguese words in a vocabulary dataset and correct those
that are unsuitable for a typing lesson. You are NOT responsible for translations.

Workflow:
1. Call get_pending_challenges to obtain the list of challenges, passing the max_words
   limit provided in the user message.
2. For each challenge, evaluate ONLY the portuguese_word field:
   - Is it a multi-word phrase when a single canonical Portuguese word clearly exists?
   - There should not be multiple synonyms for a word, as the user needs a clear solution to the challenge. If you see several synonyms (usually separated by "/"), you should choose the most common one and justify your choice in the reason field.
   - Does it contain a typo, extra punctuation, or is it clearly malformed?
   - Is it otherwise unsuitable as a standalone typing-lesson entry?
3. Build a single JSON array covering ALL reviewed challenges, where each object has:
   - "challenge_id": the challenge ID string
   - "corrected_word": the correct single word, or empty string "" if no change is needed
   - "reason": a brief explanation, or "ok" if no change
4. Call apply_portuguese_corrections once with that array.
5. Call save_all_changes to persist any corrections.
6. Report a concise summary: how many words were reviewed and how many were corrected.

Rules:
- Multi-word phrases (e.g. "ir embora") are acceptable when no single-word equivalent exists.
- When in doubt, leave corrected_word empty — do not over-correct.
- Do NOT assess or modify any translation fields.
"""
    return Agent(
        name="PortugueseWordValidator",
        instructions=instructions,
        tools=[get_pending_challenges, apply_portuguese_corrections, save_all_changes],
        model=model,
    )


def _build_translation_agent(language: str, model: str = "gpt-4.1-mini") -> Agent:
    lang_name = "French" if language == "fr" else "English"
    instructions = f"""You are a {lang_name} translation specialist for European Portuguese vocabulary.
Your job is to review and improve the {lang_name} translations for a set of vocabulary
challenges. The Portuguese words have already been validated and corrected by a separate agent
— do NOT change or judge the Portuguese words, focus exclusively on translation quality.

Workflow:
1. Call get_pending_challenges to obtain the list of challenges that need work,
   passing the max_words limit provided in the user message.
2. For each challenge in the returned list:
   a. Assess whether the current translation is the best possible {lang_name} equivalent.
   b. Compose a short, natural example sentence in Portuguese that uses the word.
   c. Translate that example sentence into {lang_name}.
   d. Optionally write a brief remark (≤ 2 sentences) in {lang_name} about the word's
      usage, nuances, or register — leave it empty if nothing useful to add.
   e. Call log_review with the word, current translation, your one-sentence assessment,
      and the list of fields you plan to change.
   f. Call update_translation with your results.
3. After processing all challenges, call save_all_changes exactly once.
4. Collect the IDs of all challenges where flagged_by_users=true and call
   clear_quality_flags with those IDs.
5. Report a concise summary: how many challenges were processed, how many translations
   were corrected, how many example sets were added, and how many notes were written.

Guidelines:
- Prefer common, everyday vocabulary over obscure alternatives.
- Keep {lang_name} example sentences short enough for a beginner.
- Do NOT skip a challenge because its translation looks correct — always call
  update_translation (with translation_was_accurate=True) so the timestamp is refreshed
  and examples / notes can be filled in if missing.
"""
    return Agent(
        name="TranslationUpdaterAgent",
        instructions=instructions,
        tools=[get_pending_challenges, log_review, update_translation, save_all_changes, clear_quality_flags],
        model=model,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def _run_agent(
    max_words: int,
    language: str,
    months: int,
    model: str = "gpt-4.1-mini",
    validator_model: str = "gpt-4.1",
) -> None:
    global _challenges, _language, _months, _mongodb_uri

    _language = language
    _months = months
    _mongodb_uri = os.environ.get("MONGODB_URI", "")
    if not _mongodb_uri:
        print("ERROR: MONGODB_URI environment variable not set!")
        exit(1)

    print("Loading challenges.json...")
    _challenges = _load_challenges()
    print(f"Loaded {len(_challenges)} challenges")
    print(f"Language: {language}  |  Max words: {max_words}  |  Refresh period: {months} months\n")

    # ------------------------------------------------------------------
    # Phase 1: Portuguese word validation
    # ------------------------------------------------------------------
    print("=" * 60)
    print("PHASE 1: Portuguese Word Validation")
    print(f"Model: {validator_model}")
    print("=" * 60)
    validator = _build_validator_agent(validator_model)
    validator_result = await Runner.run(
        validator,
        f"Review up to {max_words} Portuguese vocabulary words for correctness.",
    )
    print("\nValidator Report:")
    print(validator_result.final_output)

    # ------------------------------------------------------------------
    # Phase 2: Translation updates
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("PHASE 2: Translation Updates")
    print(f"Model: {model}")
    print("=" * 60)
    translator = _build_translation_agent(language, model)
    translation_result = await Runner.run(
        translator,
        f"Process up to {max_words} Portuguese vocabulary challenges "
        f"and update their {language.upper()} translations.",
    )
    print("\nTranslation Agent Report:")
    print(translation_result.final_output)
    print("=" * 60)


def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY")
    if not api_key:
        print("ERROR: OPEN_AI_KEY environment variable not set!")
        exit(1)
    os.environ["OPENAI_API_KEY"] = api_key  # openai-agents reads OPENAI_API_KEY

    parser = argparse.ArgumentParser(
        description="Update vocabulary translations in challenges.json using an AI agent"
    )
    parser.add_argument(
        "--language",
        choices=["fr", "en"],
        default="fr",
        help="Language section to update (default: fr)",
    )
    parser.add_argument(
        "--max-words",
        type=int,
        default=300,
        help="Maximum number of words to process per batch (default: 300)",
    )
    parser.add_argument(
        "--months",
        type=int,
        default=6,
        help="Months before a translation is considered stale (default: 6)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="gpt-4.1-mini",
        help="OpenAI model for the translation agent (default: gpt-4.1-mini)",
    )
    parser.add_argument(
        "--validator-model",
        type=str,
        default="gpt-4.1",
        help="OpenAI model for the Portuguese word validator agent (default: gpt-4.1)",
    )
    args = parser.parse_args()

    asyncio.run(_run_agent(
        max_words=args.max_words,
        language=args.language,
        months=args.months,
        model=args.model,
        validator_model=args.validator_model,
    ))


if __name__ == "__main__":
    main()
