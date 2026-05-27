#!/usr/bin/env python3
"""
combine_mp3.py - Combine MP3 files from the sounds folder into vocal lessons.

Usage:
    python combine_mp3.py --ids <uuid1> <uuid2> ... [options]
    python combine_mp3.py --file lesson.txt [options]
    python combine_mp3.py --files <path1.mp3> <path2.mp3> ... [options]
    python combine_mp3.py --weekly-challenge [options]

Examples:
    # Combine words by UUID, including Portuguese + French example for each
    python combine_mp3.py --ids c5f6... d3ee... --lang fr --output lesson1.mp3

    # Combine arbitrary MP3 files from a list file (one path per line)
    python combine_mp3.py --file my_lesson.txt --output lesson1.mp3

    # Combine specific MP3 files directly
    python combine_mp3.py --files ../sounds/abc.mp3 ../sounds/def.mp3 --output out.mp3

    # Create one MP3 per user based on their current weekly challenge
    python combine_mp3.py --weekly-challenge --lang fr
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

try:
    from pydub import AudioSegment, effects
except ImportError:
    log.error("pydub is required. Install it with: pip install pydub")
    sys.exit(1)

try:
    import numpy as np
    import pyloudnorm as pyln
except ImportError:
    log.error("pyloudnorm is required. Install it with: pip install pyloudnorm")
    sys.exit(1)


SOUNDS_DIR = Path(__file__).parent.parent / "sounds"
OUTPUT_DIR = Path(__file__).parent / "output"

# Milliseconds of silence inserted between clips
DEFAULT_PAUSE_MS = 2000
# Pause between word and its examples
INNER_PAUSE_MS = 1300
# Maximum age of weekly challenges to build audio for (older ones are skipped)
MAX_CHALLENGE_AGE_WEEKS = 2
# Target perceptual loudness (LUFS, ITU-R BS.1770). -16 is standard for voice content.
TARGET_LUFS = -16.0


def normalize_lufs(segment: AudioSegment, label: str = "") -> AudioSegment:
    """Normalize to TARGET_LUFS using perceptual loudness (ITU-R BS.1770).

    Falls back to RMS normalization for clips shorter than 400 ms, which is
    the minimum duration BS.1770 gating requires for a reliable measurement.
    """
    duration_ms = len(segment)
    samples = np.array(segment.get_array_of_samples(), dtype=np.float32)
    samples /= 2 ** (segment.sample_width * 8 - 1)  # scale to [-1.0, 1.0]
    if segment.channels == 2:
        samples = samples.reshape((-1, 2))
    else:
        samples = samples.reshape((-1, 1))

    loudness = float("-inf")
    if duration_ms >= 400:
        meter = pyln.Meter(segment.frame_rate)
        loudness = meter.integrated_loudness(samples)

    if loudness == float("-inf") or np.isnan(loudness):
        # Clip too short for BS.1770 — fall back to RMS dBFS
        if segment.dBFS == float("-inf"):
            log.debug("%s (%dms): silent, skipping", label, duration_ms)
            return segment
        gain_db = TARGET_LUFS - segment.dBFS
        normalized = segment.apply_gain(gain_db)
        log.debug("%s (%dms): %.1f dBFS -> RMS fallback (gain %+.1f dB)", label, duration_ms, segment.dBFS, gain_db)
        return normalized

    gain_db = TARGET_LUFS - loudness
    normalized = segment.apply_gain(gain_db)
    log.debug("%s (%dms): %.1f LUFS -> %.1f LUFS (gain %+.1f dB)", label, duration_ms, loudness, TARGET_LUFS, gain_db)
    return normalized


def load_mp3(path: Path) -> AudioSegment:
    """Load and LUFS-normalize an MP3 file, raising a clear error if it doesn't exist."""
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    segment = AudioSegment.from_mp3(str(path))
    return normalize_lufs(segment, label=path.name)


def build_word_segment(uid: str, lang: str, include_examples: bool, pause_ms: int, sounds_dir: Path = SOUNDS_DIR) -> AudioSegment:
    """
    Build the audio segment for one challenge UUID.

    Includes:
      1. Portuguese pronunciation  ({uid}.mp3)
      2. (optional) {lang} word translation  ({uid}_{lang}_translation.mp3)
      3. (optional) {lang} translation example  ({uid}_{lang}_exemple.mp3)
      4. (optional) {lang}+Portuguese bilingual example  ({uid}_{lang}_pt_exemple.mp3)
    """
    silence = AudioSegment.silent(duration=pause_ms)
    inner_silence = AudioSegment.silent(duration=INNER_PAUSE_MS)

    base = sounds_dir / f"{uid}.mp3"
    translation_path = sounds_dir / f"{uid}_{lang}_translation.mp3"

    # Native language first so the user can try to recall before hearing the answer
    if not translation_path.exists():
        raise FileNotFoundError(f"Missing translation audio: {translation_path.name}")
    segment = load_mp3(translation_path) + inner_silence + load_mp3(base)

    if include_examples:
        ex_path = sounds_dir / f"{uid}_{lang}_exemple.mp3"
        biex_path = sounds_dir / f"{uid}_{lang}_pt_exemple.mp3"

        if ex_path.exists():
            segment = segment + inner_silence + load_mp3(ex_path)
        else:
            log.warning("Missing example audio: %s", ex_path.name)
        if biex_path.exists():
            segment = segment + inner_silence + load_mp3(biex_path)
        else:
            log.warning("Missing bilingual example audio: %s", biex_path.name)

    return segment + silence


def combine_from_ids(
    uids: list[str],
    lang: str,
    include_examples: bool,
    pause_ms: int,
    sounds_dir: Path = SOUNDS_DIR,
) -> AudioSegment:
    """Combine audio for a list of challenge UUIDs."""
    combined = AudioSegment.empty()
    for uid in uids:
        uid = uid.strip()
        if not uid:
            continue
        log.debug("Adding: %s", uid)
        try:
            combined += build_word_segment(uid, lang, include_examples, pause_ms, sounds_dir)
        except FileNotFoundError as exc:
            log.error("Skipping %s: %s", uid, exc)
    return combined


def combine_from_files(paths: list[Path], pause_ms: int) -> AudioSegment:
    """Combine arbitrary MP3 files in order."""
    silence = AudioSegment.silent(duration=pause_ms)
    combined = AudioSegment.empty()
    for p in paths:
        log.debug("Adding: %s", p)
        combined += load_mp3(p) + silence
    return combined


def current_week_start_utc() -> datetime:
    """Return the most recent Monday at 00:00:00 UTC (mirrors weeklyChallenge.ts logic)."""
    now = datetime.now(tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    day = now.weekday()  # Monday=0, Sunday=6
    return now - timedelta(days=day)


def build_weekly_lessons(lang: str, include_examples: bool, pause_ms: int, sounds_dir: Path = SOUNDS_DIR) -> None:
    """Fetch current week's challenges from MongoDB and create one MP3 per user."""
    try:
        from pymongo import MongoClient
    except ImportError:
        log.error("pymongo is required for --weekly-challenge. Install it with: pip install pymongo")
        sys.exit(1)

    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        log.error("MONGODB_URI environment variable is not set")
        sys.exit(1)

    client = MongoClient(mongodb_uri)
    db = client.get_default_database()
    collection = db["weeklychallenges"]

    week_start = current_week_start_utc()
    cutoff = datetime.now(tz=timezone.utc) - timedelta(weeks=MAX_CHALLENGE_AGE_WEEKS)
    docs = list(collection.find({"weekStart": {"$gte": cutoff}}))
    client.close()

    if not docs:
        log.warning("No weekly challenge documents found within the last %d weeks.", MAX_CHALLENGE_AGE_WEEKS)
        return

    log.info("Found %d weekly challenge document(s) since %s", len(docs), cutoff.date())
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for doc in docs:
        user_id = str(doc.get("userId", "unknown"))

        doc_week = doc.get("weekStart")
        if doc_week is not None:
            if doc_week.tzinfo is None:
                doc_week = doc_week.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(tz=timezone.utc) - doc_week).days
            if age_days > MAX_CHALLENGE_AGE_WEEKS * 7:
                log.warning(
                    "[user %s] Skipping stale challenge: weekStart %s is %d days old (limit: %d weeks)",
                    user_id, doc_week.date(), age_days, MAX_CHALLENGE_AGE_WEEKS,
                )
                continue

        challenges = doc.get("challenges", [])
        uids = [c["challengeId"] for c in challenges if c.get("challengeId")]

        if not uids:
            log.warning("[user %s] No challenge IDs found, skipping.", user_id)
            continue

        log.info("[user %s] Building lesson from %d challenge(s)...", user_id, len(uids))
        combined = combine_from_ids(uids, lang=lang, include_examples=include_examples, pause_ms=pause_ms, sounds_dir=sounds_dir)

        if len(combined) == 0:
            log.warning("[user %s] No audio generated, skipping.", user_id)
            continue

        from pydub import effects as pydub_effects
        combined = pydub_effects.normalize(combined, headroom=0.1)
        output_path = OUTPUT_DIR / f"weekly_{user_id}_{timestamp}.mp3"
        combined.export(str(output_path), format="mp3")
        log.info("[user %s] Done -> %s", user_id, output_path)


def main():
    parser = argparse.ArgumentParser(
        description="Combine MP3 files from the sounds folder into a vocal lesson."
    )

    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--ids",
        nargs="+",
        metavar="UUID",
        help="Challenge UUIDs to include (looks up sounds/{uuid}.mp3 etc.)",
    )
    source.add_argument(
        "--file",
        metavar="PATH",
        help="Text file with one UUID or MP3 path per line",
    )
    source.add_argument(
        "--files",
        nargs="+",
        metavar="PATH",
        help="Explicit list of MP3 file paths to combine",
    )
    source.add_argument(
        "--weekly-challenge",
        action="store_true",
        help="Fetch current week's challenges from MongoDB and create one MP3 per user (requires MONGODB_URI)",
    )

    parser.add_argument(
        "--output",
        "-o",
        default="lesson.mp3",
        help="Output filename (default: lesson.mp3). Saved in vocal_lesson_creator/output/",
    )
    parser.add_argument(
        "--lang",
        choices=["en", "fr"],
        default="en",
        help="Language for examples when using --ids (default: en)",
    )
    parser.add_argument(
        "--no-examples",
        action="store_true",
        help="Only include Portuguese pronunciation, skip example sentences",
    )
    parser.add_argument(
        "--pause",
        type=int,
        default=DEFAULT_PAUSE_MS,
        metavar="MS",
        help=f"Silence in ms between clips (default: {DEFAULT_PAUSE_MS})",
    )
    parser.add_argument(
        "--sounds-dir",
        default=str(SOUNDS_DIR),
        metavar="DIR",
        help=f"Directory containing sound files (default: {SOUNDS_DIR})",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        metavar="LEVEL",
        help="Logging verbosity: DEBUG, INFO, WARNING, ERROR (default: INFO)",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        stream=sys.stderr,
        format="%(levelname)s %(message)s",
        force=True,
    )

    if args.weekly_challenge:
        build_weekly_lessons(
            lang=args.lang,
            include_examples=not args.no_examples,
            pause_ms=args.pause,
            sounds_dir=Path(args.sounds_dir),
        )
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = Path(args.output).stem
    suffix = Path(args.output).suffix or ".mp3"
    output_path = OUTPUT_DIR / f"{stem}_{timestamp}{suffix}"

    log.info("Building lesson -> %s", output_path)

    if args.ids:
        combined = combine_from_ids(
            args.ids,
            lang=args.lang,
            include_examples=not args.no_examples,
            pause_ms=args.pause,
            sounds_dir=Path(args.sounds_dir),
        )

    elif args.file:
        list_path = Path(args.file)
        if not list_path.exists():
            log.error("List file not found: %s", list_path)
            sys.exit(1)
        lines = list_path.read_text(encoding="utf-8").splitlines()
        # Each line can be a UUID or a direct MP3 path
        uids = []
        direct_paths = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            p = Path(line)
            if p.suffix.lower() == ".mp3":
                direct_paths.append(p if p.is_absolute() else Path.cwd() / p)
            else:
                uids.append(line)

        combined = AudioSegment.empty()
        if uids:
            combined += combine_from_ids(
                uids,
                lang=args.lang,
                include_examples=not args.no_examples,
                pause_ms=args.pause,
                sounds_dir=Path(args.sounds_dir),
            )
        if direct_paths:
            combined += combine_from_files(direct_paths, pause_ms=args.pause)

    else:  # --files
        paths = [Path(f) for f in args.files]
        combined = combine_from_files(paths, pause_ms=args.pause)

    if len(combined) == 0:
        log.error("No audio was generated. Check your input.")
        sys.exit(1)

    log.debug("Combined dBFS before final peak normalize: %.1f", combined.dBFS)
    combined = effects.normalize(combined, headroom=0.1)
    log.debug("Combined dBFS after  final peak normalize: %.1f", combined.dBFS)

    duration_s = len(combined) / 1000
    combined.export(str(output_path), format="mp3")
    log.info("Done! Lesson duration: %.1fs  ->  %s", duration_s, output_path)


if __name__ == "__main__":
    main()
