#!/usr/bin/env python3
"""
combine_mp3.py - Combine MP3 files from the sounds folder into vocal lessons.

Usage:
    python combine_mp3.py --ids <uuid1> <uuid2> ... [options]
    python combine_mp3.py --file lesson.txt [options]
    python combine_mp3.py --files <path1.mp3> <path2.mp3> ... [options]

Examples:
    # Combine words by UUID, including Portuguese + French example for each
    python combine_mp3.py --ids c5f6... d3ee... --lang fr --output lesson1.mp3

    # Combine arbitrary MP3 files from a list file (one path per line)
    python combine_mp3.py --file my_lesson.txt --output lesson1.mp3

    # Combine specific MP3 files directly
    python combine_mp3.py --files ../sounds/abc.mp3 ../sounds/def.mp3 --output out.mp3
"""

import argparse
import os
import sys
from pathlib import Path

try:
    from pydub import AudioSegment
except ImportError:
    print("Error: pydub is required. Install it with: pip install pydub")
    sys.exit(1)


SOUNDS_DIR = Path(__file__).parent.parent / "sounds"
OUTPUT_DIR = Path(__file__).parent / "output"

# Milliseconds of silence inserted between clips
DEFAULT_PAUSE_MS = 800
# Pause between word and its examples
INNER_PAUSE_MS = 400


def load_mp3(path: Path) -> AudioSegment:
    """Load an MP3 file, raising a clear error if it doesn't exist."""
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    return AudioSegment.from_mp3(str(path))


def build_word_segment(uid: str, lang: str, include_examples: bool, pause_ms: int) -> AudioSegment:
    """
    Build the audio segment for one challenge UUID.

    Includes:
      1. Portuguese pronunciation  ({uid}.mp3)
      2. (optional) {lang} translation example  ({uid}_{lang}_exemple.mp3)
      3. (optional) {lang}+Portuguese bilingual example  ({uid}_{lang}_pt_exemple.mp3)
    """
    silence = AudioSegment.silent(duration=pause_ms)
    inner_silence = AudioSegment.silent(duration=INNER_PAUSE_MS)

    base = SOUNDS_DIR / f"{uid}.mp3"
    segment = load_mp3(base)

    if include_examples:
        ex_path = SOUNDS_DIR / f"{uid}_{lang}_exemple.mp3"
        biex_path = SOUNDS_DIR / f"{uid}_{lang}_pt_exemple.mp3"

        if ex_path.exists():
            segment = segment + inner_silence + load_mp3(ex_path)
        if biex_path.exists():
            segment = segment + inner_silence + load_mp3(biex_path)

    return segment + silence


def combine_from_ids(
    uids: list[str],
    lang: str,
    include_examples: bool,
    pause_ms: int,
) -> AudioSegment:
    """Combine audio for a list of challenge UUIDs."""
    combined = AudioSegment.empty()
    for uid in uids:
        uid = uid.strip()
        if not uid:
            continue
        print(f"  Adding: {uid}")
        combined += build_word_segment(uid, lang, include_examples, pause_ms)
    return combined


def combine_from_files(paths: list[Path], pause_ms: int) -> AudioSegment:
    """Combine arbitrary MP3 files in order."""
    silence = AudioSegment.silent(duration=pause_ms)
    combined = AudioSegment.empty()
    for p in paths:
        print(f"  Adding: {p}")
        combined += load_mp3(p) + silence
    return combined


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

    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / args.output

    print(f"Building lesson -> {output_path}")

    if args.ids:
        combined = combine_from_ids(
            args.ids,
            lang=args.lang,
            include_examples=not args.no_examples,
            pause_ms=args.pause,
        )

    elif args.file:
        list_path = Path(args.file)
        if not list_path.exists():
            print(f"Error: list file not found: {list_path}")
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
            )
        if direct_paths:
            combined += combine_from_files(direct_paths, pause_ms=args.pause)

    else:  # --files
        paths = [Path(f) for f in args.files]
        combined = combine_from_files(paths, pause_ms=args.pause)

    if len(combined) == 0:
        print("Error: no audio was generated. Check your input.")
        sys.exit(1)

    duration_s = len(combined) / 1000
    combined.export(str(output_path), format="mp3")
    print(f"Done! Lesson duration: {duration_s:.1f}s  ->  {output_path}")


if __name__ == "__main__":
    main()
