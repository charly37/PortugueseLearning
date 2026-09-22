"""
StoryCreatorAgent.py — Core story generation logic for bilingual Portuguese/French learning stories.

Each story is written sentence-by-sentence in European Portuguese, with a French translation
alongside each sentence, so that French-speaking learners can read both versions side by side.

Outputs the generated story as a Python dict (no DB interaction).
Use StoryCreatorWrapper.py to persist stories to MongoDB.

Story object schema:
{
    "id":         <uuid>,
    "title_pt":   <Portuguese title>,
    "title_fr":   <French title>,
    "level":      "beginner" | "intermediate" | "advanced",
    "topic":      <short topic label, e.g. "daily life", "travel">,
    "sentences": [
        {"pt": <Portuguese sentence>, "fr": <French translation>},
        ...
    ],
    "created_at": "YYYY-MM-DD"
}
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from agents import Agent, Runner, function_tool, set_default_openai_client
from openai import AsyncOpenAI

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Globals (set once per story generation run, read by tool functions)
# ---------------------------------------------------------------------------
_level: str = "beginner"
_topic: str = ""

# Process-wide AsyncOpenAI client. The Agents SDK / openai package otherwise
# keep an implicit client whose httpx transport is bound to the event loop
# that first used it. After that loop is closed (second asyncio.run, GC of a
# previous Runner result, job fallback story, …) the next request dies with:
#   ERROR Error getting response
#   RuntimeError: Event loop is closed
_openai_client: AsyncOpenAI | None = None
_openai_client_loop: asyncio.AbstractEventLoop | None = None


def _is_event_loop_closed_error(exc: BaseException) -> bool:
    if isinstance(exc, RuntimeError) and "event loop is closed" in str(exc).lower():
        return True
    cause = exc.__cause__ or exc.__context__
    if cause is not None and cause is not exc:
        return _is_event_loop_closed_error(cause)
    return False


def _log_run_error(phase: str, exc: BaseException) -> None:
    """Log the full exception plus any OpenAI SDK fields the default logger drops."""
    log.error(
        "Agent run failed during %s: %s: %s",
        phase,
        type(exc).__name__,
        exc,
    )
    log.error("Traceback:\n%s", "".join(traceback.format_exception(exc)))

    request_id = getattr(exc, "request_id", None)
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(exc, "status", None)
    body = getattr(exc, "body", None)
    code = getattr(exc, "code", None)
    if any(v is not None for v in (request_id, status, body, code)):
        log.error(
            "OpenAI error details | request_id=%s | status=%s | code=%s | body=%s",
            request_id,
            status,
            code,
            body,
        )


async def _close_openai_client() -> None:
    global _openai_client, _openai_client_loop
    client = _openai_client
    _openai_client = None
    _openai_client_loop = None
    if client is None:
        return
    try:
        await client.close()
    except Exception:
        log.debug("Ignoring error while closing OpenAI client", exc_info=True)


async def close_openai_client() -> None:
    """Public cleanup hook for StoryCreatorWrapper — call while the loop is still running."""
    await _close_openai_client()


async def _ensure_openai_client(*, force_new: bool = False) -> AsyncOpenAI:
    """Return an AsyncOpenAI client bound to the currently running event loop."""
    global _openai_client, _openai_client_loop

    loop = asyncio.get_running_loop()
    client_closed = bool(_openai_client is not None and getattr(_openai_client, "is_closed", False))
    loop_mismatch = _openai_client is not None and (
        _openai_client_loop is None
        or _openai_client_loop is not loop
        or _openai_client_loop.is_closed()
    )

    if force_new or _openai_client is None or client_closed or loop_mismatch:
        if _openai_client is not None:
            log.warning(
                "Recreating OpenAI client (force_new=%s closed=%s loop_mismatch=%s)",
                force_new,
                client_closed,
                loop_mismatch,
            )
            await _close_openai_client()

        client = AsyncOpenAI()
        set_default_openai_client(client)
        _openai_client = client
        _openai_client_loop = loop
        log.info("OpenAI async client ready (loop id=%s)", id(loop))

    return _openai_client


async def _run_agent(agent: Agent, message: str, phase: str, max_attempts: int = 2) -> Any:
    """Runner.run with diagnostics and a single retry on a stale event-loop client."""
    last_exc: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        await _ensure_openai_client(force_new=(attempt > 1))
        try:
            return await Runner.run(agent, message)
        except asyncio.CancelledError:
            log.error("Agent run cancelled during %s", phase)
            raise
        except Exception as exc:
            last_exc = exc
            _log_run_error(f"{phase} (attempt {attempt}/{max_attempts})", exc)
            if attempt < max_attempts and _is_event_loop_closed_error(exc):
                log.warning(
                    "Stale OpenAI HTTP client detected during %s — retrying with a fresh client",
                    phase,
                )
                continue
            raise
    assert last_exc is not None
    raise last_exc


# ---------------------------------------------------------------------------
# Agent tools
# ---------------------------------------------------------------------------

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
    log.info(
        "Story plan | title_pt=%s | title_fr=%s | topic=%s | level=%s | plot=%s",
        title_pt,
        title_fr,
        topic,
        level,
        summary,
    )
    return "plan logged"


def _parse_story(draft: str, level: str, topic: str) -> dict | None:
    """Extract and return the story dict from the writer's final output."""
    if not draft or not str(draft).strip():
        log.error("Writer returned an empty draft — cannot parse story")
        return None

    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", draft, re.DOTALL)
    if match:
        json_str = match.group(1)
    else:
        bare = re.search(r"\{.*\}", draft, re.DOTALL)
        if not bare:
            log.error(
                "Could not extract story JSON from writer output — raw draft written to draft.txt"
            )
            try:
                with open("draft.txt", "w", encoding="utf-8") as f:
                    f.write(draft)
            except OSError:
                log.exception("Failed to persist raw draft to draft.txt")
            log.error("Raw draft (truncated to 4000 chars):\n%s", draft[:4000])
            return None
        json_str = bare.group(0)

    try:
        data: dict = json.loads(json_str)
    except json.JSONDecodeError as e:
        log.error("JSON parse error: %s", e)
        log.error("JSON fragment (truncated to 2000 chars):\n%s", json_str[:2000])
        try:
            with open("draft.txt", "w", encoding="utf-8") as f:
                f.write(draft)
        except OSError:
            log.exception("Failed to persist raw draft to draft.txt")
        return None

    sentences = data.get("sentences", [])
    if not isinstance(sentences, list):
        log.error("Parsed story 'sentences' is not a list: %r", type(sentences).__name__)
        sentences = []

    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    story = {
        "id": str(uuid.uuid4()),
        "title_pt": data.get("title_pt", "Unknown"),
        "title_fr": data.get("title_fr", "Unknown"),
        "level": data.get("level", level),
        "topic": data.get("topic", topic),
        "sentences": sentences,
        "created_at": created_at,
    }
    log.info(
        "Parsed story | title_pt=%s | sentences=%d | level=%s | topic=%s",
        story["title_pt"],
        len(sentences),
        story["level"],
        story["topic"],
    )
    return story


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

def _build_writer_agent(level: str, topic: str, model: str = "gpt-4.1-mini") -> Agent:
    topic_clause = (
        f'The topic for this session is: "{topic}".'
        if topic
        else (
            "Choose a natural, everyday topic suitable for language learners "
            "(e.g. daily life, shopping, travel, family, weather, food)."
        )
    )

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
1. Plan the story: choose a title and a simple plot.
2. Call log_story_plan with your plan details.
3. Write the story as a sequence of 40–80 sentences (never fewer than 40).  For EACH sentence:
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
2. **Sentence count**: 40–80 sentences (accept 40 or more; reject only if under 40).
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
) -> dict | None:
    """Run the writer, then alternate reviewer → writer until approved or max iterations."""
    log.info("Writer creating initial draft...")
    try:
        writer_result = await _run_agent(writer, initial_message, phase="writer-initial")
    except Exception:
        log.error("Initial writer draft failed — aborting this story")
        return None

    draft = writer_result.final_output

    for iteration in range(max_iterations):
        log.info("Review iteration %d/%d", iteration + 1, max_iterations)

        try:
            review_result = await _run_agent(
                reviewer,
                f"Review this story draft:\n\n{draft}",
                phase=f"reviewer-{iteration + 1}",
            )
        except Exception:
            log.error(
                "Reviewer failed on iteration %d/%d — using current draft as best effort",
                iteration + 1,
                max_iterations,
            )
            break

        verdict = (review_result.final_output or "").strip()
        log.info("Reviewer verdict: %s", verdict[:1500])

        if verdict.upper().startswith("APPROVED"):
            log.info("Story approved.")
            break

        if iteration < max_iterations - 1:
            log.info("Writer revising (attempt %d/%d)...", iteration + 2, max_iterations)
            try:
                writer_result = await _run_agent(
                    writer,
                    (
                        f"Revise your story based on this reviewer feedback:\n{verdict}\n\n"
                        f"Your previous draft:\n{draft}"
                    ),
                    phase=f"writer-revise-{iteration + 2}",
                )
                draft = writer_result.final_output
            except Exception:
                log.error(
                    "Writer revision failed on attempt %d/%d — using previous draft as best effort",
                    iteration + 2,
                    max_iterations,
                )
                break
        else:
            log.warning("Max iterations (%d) reached — using best effort.", max_iterations)

    return _parse_story(draft, level, topic)


async def run_story(
    level: str,
    topic: str,
    model: str,
    max_iterations: int,
) -> dict | None:
    """Generate a story and return it as a dict. No DB interaction."""
    global _level, _topic

    _level = level
    _topic = topic

    log.info("Level: %s | topic: %s | model: %s | max_iterations: %s",
             level, topic or "(agent chooses)", model, max_iterations)

    try:
        await _ensure_openai_client()
    except Exception:
        log.exception("Failed to initialise OpenAI client")
        return None

    writer = _build_writer_agent(level, topic, model)
    reviewer = _build_reviewer_agent(level, model)

    topic_part = f' on the topic "{topic}"' if topic else ""
    user_message = (
        f"Generate a short bilingual Portuguese/French learning story"
        f"{topic_part} at {level} level."
    )

    try:
        return await _run_with_review_loop(
            writer, reviewer, user_message, level, topic, max_iterations
        )
    except Exception:
        log.exception("Unhandled error while generating story (level=%s topic=%s)", level, topic)
        return None


def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        log.error("OPEN_AI_KEY / OPENAI_API_KEY environment variable not set!")
        sys.exit(1)
    os.environ["OPENAI_API_KEY"] = api_key

    import importlib.metadata
    for pkg in ("openai-agents", "openai", "pydantic"):
        try:
            log.info("Package version: %s==%s", pkg, importlib.metadata.version(pkg))
        except importlib.metadata.PackageNotFoundError:
            log.warning("Package version: %s not found", pkg)

    parser = argparse.ArgumentParser(
        description="Generate a bilingual Portuguese/French story (local dev — no DB)"
    )
    parser.add_argument(
        "--level",
        choices=["beginner", "intermediate", "advanced"],
        default="beginner",
        help="Difficulty level (default: beginner)",
    )
    parser.add_argument(
        "--topic",
        type=str,
        default="",
        help="Story topic; if omitted the agent picks one",
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
        help="Max write/review cycles (default: 3)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Write story JSON to this file instead of stdout",
    )

    args = parser.parse_args()

    try:
        story = asyncio.run(
            run_story(
                level=args.level,
                topic=args.topic,
                model=args.model,
                max_iterations=args.max_iterations,
            )
        )
    except Exception:
        log.exception("Fatal error in story generation")
        sys.exit(1)
    finally:
        # Best-effort cleanup. The loop from asyncio.run is already closed
        # here, so we only drop the reference and avoid a hanging client.
        global _openai_client, _openai_client_loop
        _openai_client = None
        _openai_client_loop = None

    if story is None:
        log.error("Story generation failed.")
        sys.exit(1)

    output = json.dumps(story, ensure_ascii=False, indent=4)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        log.info("Story written to %s", args.output)
    else:
        log.info("Story JSON:\n%s", output)


if __name__ == "__main__":
    main()
