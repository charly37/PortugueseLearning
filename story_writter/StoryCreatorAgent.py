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

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Globals (set once per story generation run, read by tool functions)
# ---------------------------------------------------------------------------
_level: str = "beginner"
_topic: str = ""


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
    print(f"\n📖 Story plan")
    print(f"   Title (PT)  : {title_pt}")
    print(f"   Title (FR)  : {title_fr}")
    print(f"   Topic       : {topic}")
    print(f"   Level       : {level}")
    print(f"   Plot        : {summary}")
    return "plan logged"


def _parse_story(draft: str, level: str, topic: str) -> dict | None:
    """Extract and return the story dict from the writer's final output."""
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

    return {
        "id": str(uuid.uuid4()),
        "title_pt": data.get("title_pt", "Unknown"),
        "title_fr": data.get("title_fr", "Unknown"),
        "level": data.get("level", level),
        "topic": data.get("topic", topic),
        "sentences": data.get("sentences", []),
        "created_at": datetime.utcnow().strftime("%Y-%m-%d"),
    }


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
1. Plan the story: choose a title and a simple plot.
2. Call log_story_plan with your plan details.
3. Write the story as a sequence around 200 sentences.  For EACH sentence:
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
) -> dict | None:
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
            print("\n✅ Story approved.")
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
            print(f"\n⚠️  Max iterations ({max_iterations}) reached — using best effort.")

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

    print(f"Level: {level}\n")

    writer = _build_writer_agent(level, topic, model)
    reviewer = _build_reviewer_agent(level, model)

    topic_part = f' on the topic "{topic}"' if topic else ""
    user_message = (
        f"Generate a short bilingual Portuguese/French learning story"
        f"{topic_part} at {level} level."
    )

    return await _run_with_review_loop(writer, reviewer, user_message, level, topic, max_iterations)


def main() -> None:
    api_key = os.environ.get("OPEN_AI_KEY")
    if not api_key:
        print("ERROR: OPEN_AI_KEY environment variable not set!", file=sys.stderr)
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

    story = asyncio.run(
        run_story(
            level=args.level,
            topic=args.topic,
            model=args.model,
            max_iterations=args.max_iterations,
        )
    )

    if story is None:
        log.error("Story generation failed.")
        sys.exit(1)

    output = json.dumps(story, ensure_ascii=False, indent=4)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"\n✅ Story written to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
