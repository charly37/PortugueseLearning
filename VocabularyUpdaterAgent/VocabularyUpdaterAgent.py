# Quality flags are language-scoped: each document in `challengequalityflags` records the
# native language the user was practising when they raised it. This script only considers
# flags for the active --language and only clears flags for that same language, so a French
# report cannot be "fixed" and cleared by an English run.

import argparse
import json
import logging
import os
import sys
import asyncio
from datetime import datetime, timedelta
from typing import Any

from agents import Agent, Runner, function_tool
from pymongo import MongoClient, UpdateOne

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(levelname)s %(message)s",
)

# The Agents SDK performs its calls through httpx, which logs one INFO line per
# HTTP request ("HTTP Request: POST https://api.openai.com/... 200 OK"). Those
# are not useful; only surface warnings and errors from those libraries.
for _noisy_logger in ("httpx", "httpcore"):
    logging.getLogger(_noisy_logger).setLevel(logging.WARNING)

log = logging.getLogger(__name__)


def _one_line(text: Any, limit: int = 4000) -> str:
    """Collapse multi-line/whitespace-heavy text into a single log-safe line.

    Log collectors (e.g. VictoriaLogs) treat each newline as a separate record,
    so any embedded newline produces orphan lines without a message field.
    """
    if text is None:
        return ""
    s = str(text)
    if len(s) > limit:
        s = s[:limit] + f"... [truncated {len(s) - limit} chars]"
    return " ".join(s.split())


def _num(value: Any) -> int:
    """Token counters on the OpenAI types are optional; treat a missing value as 0."""
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _log_run_usage(label: str, result: Any) -> None:
    """Log what a Runner.run() phase actually cost.

    One line per phase, so run-to-run variance in API traffic can be explained after
    the fact: `requests` is the number of API round-trips (one per model turn, not per
    word), `tool call(s)` is how many function calls the model made in those turns, and
    `cached` shows how much of the input was a repeated prefix (OpenAI caches it).
    """
    responses = list(getattr(result, "raw_responses", None) or [])
    input_tokens = 0
    cached_tokens = 0
    output_tokens = 0
    tool_calls = 0
    for response in responses:
        usage = getattr(response, "usage", None)
        if usage is not None:
            input_tokens += _num(getattr(usage, "input_tokens", 0))
            output_tokens += _num(getattr(usage, "output_tokens", 0))
            details = getattr(usage, "input_tokens_details", None)
            cached_tokens += _num(getattr(details, "cached_tokens", 0))
        for item in (getattr(response, "output", None) or []):
            if getattr(item, "type", "") == "function_call":
                tool_calls += 1

    log.info(
        "Usage %s: %d model request(s), %d tool call(s), input=%d (cached=%d), "
        "output=%d, total=%d",
        label, len(responses), tool_calls, input_tokens, cached_tokens,
        output_tokens, input_tokens + output_tokens,
    )


def _log_run_stats() -> None:
    """Log how much work the run discovered vs. how much it finished."""
    log.info(
        "Run stats: offered=%d flagged=%d updated=%d not_found=%d",
        _run_stats["pending_offered"], _run_stats["flagged_total"],
        _run_stats["translations_applied"], _run_stats["challenges_not_found"],
    )


# Allow importing from the repo-level scripts/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from db_utils import get_challenges_collection

# ---------------------------------------------------------------------------
# Globals (set once in main, read by tool functions)
# ---------------------------------------------------------------------------
_challenges: list[dict] = []
_language: str = "fr"
_months: int = 6
_mongodb_uri: str = ""
# Ids of the documents modified during this run. Anything that mutates _challenges must
# add its id here, otherwise the change will not be persisted by save_all_changes().
_dirty_ids: set[str] = set()
_dry_run: bool = False
# Ids flagged by users for the active language, refreshed by get_pending_challenges().
# Stored here so update_translation() can log the "[USER FLAGGED]" marker itself instead
# of the model having to repeat the flag in every tool call.
_flagged_ids: set[str] = set()
# Per-run counters, reset by _run_agent(). Purely diagnostic: they let a job's log say
# how many words were offered vs. actually processed, which is what explains a run that
# costs noticeably more or less than the previous one.
_run_stats: dict[str, int] = {
    "pending_offered": 0,
    "flagged_total": 0,
    "translations_applied": 0,
    "challenges_not_found": 0,
}

# ---------------------------------------------------------------------------
# Helper utilities (not tools — pure Python helpers)
# ---------------------------------------------------------------------------

def _load_challenges() -> list[dict]:
    client, collection = get_challenges_collection()
    docs = list(collection.find({"type": "word"}))
    client.close()
    for doc in docs:
        doc["id"] = str(doc.pop("_id"))
        doc.pop("type", None)
        doc.pop("schemaVersion", None)
    return docs


def _save_challenges(challenge_ids: set[str]) -> str:
    """Persist only the given documents (whole-document $set, as before).

    Keeps the historic behaviour of writing every field except `id`, but scoped to the
    documents modified in this run instead of the whole collection.
    """
    ids = sorted(challenge_ids)
    if not ids:
        return "Nothing to save (no changes)."

    for cid in ids:
        log.debug("Dirty document: %s", cid)

    if _dry_run:
        log.info("DRY RUN: would update %d document(s)", len(ids))
        return f"DRY RUN: would update {len(ids)} document(s)."

    by_id = {c.get("id"): c for c in _challenges if c.get("id") in challenge_ids}
    operations = [
        UpdateOne({"_id": cid}, {"$set": {k: v for k, v in by_id[cid].items() if k != "id"}})
        for cid in ids
        if cid in by_id
    ]
    if not operations:
        challenge_ids.clear()
        return "Nothing to save (no changes)."

    client, collection = get_challenges_collection()
    try:
        result = collection.bulk_write(operations, ordered=False)
    finally:
        client.close()

    challenge_ids.clear()
    log.info("Saved %d document(s) (%d modified)", len(operations), result.modified_count)
    return f"Updated {len(operations)} document(s)."


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
                {"$match": {"language": _language}},
                {"$group": {"_id": "$challengeId", "flagCount": {"$sum": 1}}},
                {"$match": {"flagCount": {"$gte": 1}}},
                {"$sort": {"flagCount": -1}},
            ]
            results = list(db.challengequalityflags.aggregate(pipeline))
            mongo_client.close()
            for i, r in enumerate(results):
                flagged_ids.add(r["_id"])
                flagged_order[r["_id"]] = i
            log.info("Found %d flagged challenge(s) in DB", len(flagged_ids))
        except Exception as e:
            log.warning("Could not fetch flagged challenges from MongoDB: %s", e)

    # Cache for update_translation()'s review log line (mutation, no `global` needed).
    _flagged_ids.clear()
    _flagged_ids.update(flagged_ids)
    _run_stats["flagged_total"] = len(flagged_ids)

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

    _run_stats["pending_offered"] = len(pending)
    return json.dumps(pending, ensure_ascii=False)


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
            if challenge.get("id") != c.get("challenge_id"):
                continue
            old = challenge.get("port", "")
            if corrected == old:
                skipped += 1
                break
            challenge["port"] = corrected
            _dirty_ids.add(challenge["id"])
            log.info("Corrected '%s' -> '%s' (reason: %s)", old, corrected, _one_line(c.get('reason', '')))
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
    assessment: str = "",
) -> str:
    """
    Persist an updated translation (and optionally examples and note) for a
    challenge identified by challenge_id, and log the review decision.
    This is the only tool called per challenge.

    - new_translation: the best translation in the active target language.
    - portuguese_example: a simple example sentence in Portuguese.
    - target_language_example: translation of that example in the target language.
    - note: a short remark (max 2 sentences) about the Portuguese word; pass an
      empty string if you have nothing useful to add.
    - translation_was_accurate: True if the existing translation was already
      correct (so only examples / note / timestamp are updated).
    - assessment: one sentence explaining whether the existing translation was
      good or why it needed changing (e.g. "Accurate.", "Better word: X").

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
        # Captured for the review log line below, before anything is overwritten.
        portuguese_word = challenge.get("port", "")
        current_translation = section.get("translation", "")

        if not translation_was_accurate:
            section["translation"] = new_translation
            updated_fields.append("translation")

        if not section.get("port_exemple") or not section.get("use_exemple"):
            section["port_exemple"] = portuguese_example
            section["use_exemple"] = target_language_example
            updated_fields.append("examples")

        # Note semantics: "todo" = never written, "" = reviewed with nothing to add,
        # any other text = the note. Fill either empty state (never overwrite a real
        # note) so words created by VocabularyCreatorAgent — which writes "" when it
        # has nothing — can still gain a note on a later review.
        current_note = section.get("note")
        if note and (not current_note or current_note == "todo"):
            section["note"] = note
            updated_fields.append("note")

        section["last_update"] = today
        updated_fields.append("last_update")
        _dirty_ids.add(challenge_id)

        # The line the removed log_review tool used to emit, folded in here so the model
        # does not spend a separate turn (one API round-trip) on it. `changes` is derived
        # from what actually changed instead of being guessed beforehand, and the flag
        # marker comes from _flagged_ids instead of a model-supplied argument.
        filled = [f for f in updated_fields if f != "last_update"]
        flag_marker = " [USER FLAGGED]" if challenge_id in _flagged_ids else ""
        log.info("Reviewing: '%s'%s | translation=%s | assessment=%s | changes=%s",
                 _one_line(portuguese_word), flag_marker, _one_line(current_translation),
                 _one_line(assessment), _one_line(", ".join(filled) or "timestamp only"))

        msg = f"Updated challenge {challenge_id}: {', '.join(updated_fields)}"
        log.info("%s", msg)
        _run_stats["translations_applied"] += 1
        return msg

    _run_stats["challenges_not_found"] += 1
    log.warning("Challenge %s not found", challenge_id)
    return f"Challenge {challenge_id} not found."


@function_tool
def save_all_changes() -> str:
    """
    Persist the challenges modified during this run.  Only documents that were actually
    changed are written (not the whole collection).
    Call this once after all individual updates are done.
    """
    return _save_challenges(_dirty_ids)


@function_tool
def clear_quality_flags(challenge_ids_json: str) -> str:
    """
    Delete quality flags for the given challenge IDs, restricted to the active language.
    challenge_ids_json must be a JSON array of challenge ID strings.
    Call this after processing flagged challenges to avoid re-processing them.
    """
    if not _mongodb_uri:
        return "No MONGODB_URI set — skipping flag cleanup."
    try:
        ids: list[str] = json.loads(challenge_ids_json)
        if not ids:
            return "No IDs to clear."
        if _dry_run:
            log.info("DRY RUN: would clear %d %s flag(s)", len(ids), _language)
            return f"DRY RUN: would clear {len(ids)} {_language} flag(s)."
        mongo_client = MongoClient(_mongodb_uri)
        db = mongo_client.get_database()
        result = db.challengequalityflags.delete_many(
            {"challengeId": {"$in": ids}, "language": _language}
        )
        mongo_client.close()
        return (
            f"Cleared {result.deleted_count} {_language} flag(s) for {len(ids)} challenge(s)."
        )
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
   The summary MUST be a single line of plain text — no line breaks, no bullet points,
   no numbered lists, no markdown headings (e.g. "Reviewed 50 words, corrected 2: 'bem vindo' -> 'bem-vindo', 'ver, assistir' -> 'ver'.").

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
   e. Call update_translation once with your results, plus a one-sentence assessment of
      the existing translation. Exactly one update_translation call per challenge —
      never call a second tool for the same challenge.
3. After processing all challenges, call save_all_changes exactly once.
4. Collect the IDs of all challenges where flagged_by_users=true and call
   clear_quality_flags with those IDs.
5. Report a concise summary: how many challenges were processed, how many translations
   were corrected, how many example sets were added, and how many notes were written.
   The summary MUST be a single line of plain text — no line breaks, no bullet points,
   no numbered lists, no markdown headings.

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
        tools=[get_pending_challenges, update_translation, save_all_changes, clear_quality_flags],
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
    skip_validator: bool = False,
    dry_run: bool = False,
) -> None:
    global _challenges, _language, _months, _mongodb_uri, _dry_run

    _language = language
    _months = months
    _mongodb_uri = os.environ.get("MONGODB_URI", "")
    _dry_run = dry_run
    _dirty_ids.clear()
    for _key in _run_stats:
        _run_stats[_key] = 0
    if not _mongodb_uri:
        log.error("MONGODB_URI environment variable not set!")
        sys.exit(1)

    log.info("Loading challenges from MongoDB...")
    _challenges = _load_challenges()
    log.info("Loaded %d challenges", len(_challenges))
    log.info("Language: %s  |  Max words: %d  |  Refresh period: %d months",
             language, max_words, months)
    if dry_run:
        log.info("DRY RUN: no MongoDB writes and no flag deletion will happen.")

    # ------------------------------------------------------------------
    # Phase 1: Portuguese word validation
    # ------------------------------------------------------------------
    if skip_validator:
        log.info("Skipping PHASE 1 (--skip-validator): Portuguese word validation is "
                 "language-independent and already ran for another language.")
    else:
        log.info("%s", "=" * 60)
        log.info("PHASE 1: Portuguese Word Validation")
        log.info("Model: %s", validator_model)
        log.info("%s", "=" * 60)
        validator = _build_validator_agent(validator_model)
        validator_result = await Runner.run(
            validator,
            f"Review up to {max_words} Portuguese vocabulary words for correctness.",
            max_turns=max_words * 3 + 20,
        )
        _log_run_usage("phase1-validator", validator_result)
        log.info("Validator Report: %s", _one_line(validator_result.final_output))

    # ------------------------------------------------------------------
    # Phase 2: Translation updates
    # ------------------------------------------------------------------
    log.info("%s", "=" * 60)
    log.info("PHASE 2: Translation Updates")
    log.info("Model: %s", model)
    log.info("%s", "=" * 60)
    translator = _build_translation_agent(language, model)
    translation_result = await Runner.run(
        translator,
        f"Process up to {max_words} Portuguese vocabulary challenges "
        f"and update their {language.upper()} translations.",
        max_turns=max_words * 5 + 20,
    )
    _log_run_usage("phase2-translator", translation_result)
    _log_run_stats()
    log.info("Translation Agent Report: %s", _one_line(translation_result.final_output))
    log.info("%s", "=" * 60)


def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY")
    if not api_key:
        log.error("OPEN_AI_KEY environment variable not set!")
        sys.exit(1)
    os.environ["OPENAI_API_KEY"] = api_key  # openai-agents reads OPENAI_API_KEY

    parser = argparse.ArgumentParser(
        description="Update vocabulary translations in the MongoDB challenges collection using an AI agent"
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
    parser.add_argument(
        "--skip-validator",
        action="store_true",
        help=(
            "Skip the Portuguese word validation phase. Phase 1 is language-independent, "
            "so schedule it once per week (e.g. on the fr run) instead of once per language."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Run the agents but skip every MongoDB write and flag deletion, logging what "
            "would have changed. Useful to verify the pipeline without touching data."
        ),
    )
    args = parser.parse_args()

    asyncio.run(_run_agent(
        max_words=args.max_words,
        language=args.language,
        months=args.months,
        model=args.model,
        validator_model=args.validator_model,
        skip_validator=args.skip_validator,
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    main()
