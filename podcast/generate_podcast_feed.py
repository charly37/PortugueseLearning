#!/usr/bin/env python3
"""
generate_podcast_feed.py - Build the podcast RSS feed for the weekly vocabulary lesson.

The weekly lesson MP3 produced by ``vocal_lesson_creator/combine_mp3.py`` is
already published to YouTube.  This script turns the same audio into a standard
RSS 2.0 + iTunes feed so Apple Podcasts, Spotify and other podcast directories
can ingest it.

Only global weekly challenges (``userId: null``) are published, matching the
YouTube uploader.  Episodes start at ``--first-week`` so the show does not
backfill lessons recorded before podcasting was enabled.

Usage:
    python generate_podcast_feed.py
    python generate_podcast_feed.py --first-week 2026-10-26 --base-url https://dialecthub.net
    python generate_podcast_feed.py --dry-run

Environment variables:
    MONGODB_URI - MongoDB connection string (not required with --dry-run when the
                  feed directory already contains everything needed)
"""

import argparse
import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

DEFAULT_AUDIO_DIR = Path("/weekly-audio")
DEFAULT_OUTPUT_DIR = Path("/podcast")
DEFAULT_BASE_URL = "https://dialecthub.net"
DEFAULT_EPISODE_TYPE = "episodic"
FEED_FILENAME = "feed.xml"
EPISODES_FILENAME = "episodes.json"
DEFAULT_COVER_FILENAME = "cover.jpg"

# Apple requires the official (English) category names regardless of the feed
# language, so these are deliberately not translated.
ITUNES_CATEGORY_TOP = "Education"
ITUNES_CATEGORY_SUB = "Language Learning"

FRENCH_MONTHS = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)

# Channel metadata per feed language.  Add an "en" entry to publish an English
# feed later (see docs/PODCAST.md).
CHANNELS = {
    "fr": {
        "language": "fr",
        "title": "DialectHub – Leçon de vocabulaire portugais européen",
        "subtitle": "Une leçon hebdomadaire de vocabulaire en portugais européen",
        "description": (
            "Chaque semaine, une leçon de vocabulaire en portugais européen pour "
            "les francophones : les mots essentiels avec la prononciation native, "
            "leur traduction et des exemples en contexte."
        ),
        "summary": (
            "Leçon hebdomadaire de vocabulaire en portugais européen pour les "
            "francophones, avec prononciation native, traductions et exemples."
        ),
        "author": "DialectHub",
        "owner_name": "DialectHub",
        "owner_email": "admin@dialecthub.net",
        "copyright": "(c) DialectHub - https://dialecthub.net",
        "episode_title": "Leçon de vocabulaire – Semaine du {date}",
        "episode_description": (
            "<p>Leçon hebdomadaire de vocabulaire en portugais européen : "
            "{count} mots avec la prononciation native, leur traduction et des "
            "exemples en contexte.</p>"
            "<p>Entraînez-vous avec la leçon interactive : "
            '<a href="{lesson_url}">{lesson_url}</a></p>'
            "<p>Retrouvez toutes les leçons sur "
            '<a href="{site_url}">{site_url}</a></p>'
        ),
        "lesson_path": "/weekly-challenge",
    },
}


@dataclass
class Episode:
    """One published podcast episode, resolved from a weeklychallenges document."""

    doc_id: str
    episode_number: int
    title: str
    description_html: str
    link: str
    pub_date: datetime
    audio_filename: str
    audio_url: str
    size_bytes: int
    duration_s: float | None
    week_start: datetime | None


# --------------------------------------------------------------------------- #
# Small helpers (unit-tested in test_generate_podcast_feed.py)
# --------------------------------------------------------------------------- #

def current_week_start_utc() -> datetime:
    """Return the most recent Monday at 00:00:00 UTC (mirrors the other pipelines)."""
    now = datetime.now(tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return now - timedelta(days=now.weekday())


def as_utc(value: datetime | None) -> datetime | None:
    """pymongo returns naive UTC datetimes; make them timezone-aware."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def format_french_date(value: datetime) -> str:
    """Format a date as ``26 octobre 2026`` (no ``babel`` dependency)."""
    return f"{value.day} {FRENCH_MONTHS[value.month - 1]} {value.year}"


def format_duration(seconds: float | None) -> str | None:
    """Format seconds as ``M:SS`` or ``H:MM:SS`` for ``<itunes:duration>``."""
    if seconds is None or seconds < 0:
        return None
    total = int(round(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def rfc822(value: datetime) -> str:
    """RFC 822 / RFC 2822 pubDate, e.g. ``Mon, 26 Oct 2026 04:00:00 +0000``."""
    return format_datetime(as_utc(value))


def cdata(text: str) -> str:
    """Wrap text in CDATA, splitting any literal ``]]>`` sequence safely."""
    return "<![CDATA[" + text.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def parse_publish_time(filename: str, week_start: datetime | None = None) -> datetime:
    """Derive the publish time from ``weekly_{docId}_{YYYYmmdd}_{HHmmss}.mp3``.

    The generation timestamp embeds the container clock, which is UTC.  Falls
    back to ``weekStart + 4h`` (the sound-generation cron runs at 04:00) and
    finally to "now".
    """
    parts = Path(filename).stem.split("_")
    if len(parts) >= 4 and parts[0] == "weekly":
        try:
            parsed = datetime.strptime(f"{parts[2]}_{parts[3]}", "%Y%m%d_%H%M%S")
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    week_start = as_utc(week_start)
    if week_start is not None:
        return week_start + timedelta(hours=4)
    return datetime.now(tz=timezone.utc)


def probe_duration_s(path: Path) -> float | None:
    """Return media duration in seconds via ffprobe, or None if unavailable."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return float(result.stdout.strip())
    except Exception as exc:  # noqa: BLE001 - best effort, never fatal
        log.warning("Could not probe duration of %s (%s)", path.name, exc)
        return None


def probe_image_size(path: Path) -> tuple[int, int] | None:
    """Return (width, height) of the first video/image stream via ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        width, height = (int(part) for part in result.stdout.strip().split(",")[:2])
        return width, height
    except Exception as exc:  # noqa: BLE001 - validation only
        log.warning("Could not read cover art dimensions (%s)", exc)
        return None


# --------------------------------------------------------------------------- #
# MongoDB
# --------------------------------------------------------------------------- #

def connect_mongodb():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        log.error("MONGODB_URI environment variable is not set")
        sys.exit(1)
    try:
        from pymongo import MongoClient
    except ImportError:
        log.error("pymongo is required. Install via requirements.txt")
        sys.exit(1)
    client = MongoClient(uri)
    return client, client.get_default_database()


def fetch_episodes(collection, first_week: datetime) -> list[dict]:
    """Global weekly lessons that already have an MP3, oldest first."""
    query = {
        "userId": None,  # global lesson only (per-user lessons stay private)
        "weekStart": {"$gte": first_week},
        "audio.filename": {"$exists": True, "$ne": None},
    }
    docs = list(collection.find(query).sort("weekStart", 1))
    log.info(
        "Found %d candidate episode(s) with weekStart >= %s",
        len(docs), first_week.date(),
    )
    return docs


def assign_episode_numbers(collection, docs: list[dict], persist: bool) -> dict[str, int]:
    """Give every document a stable, monotonically increasing episode number.

    Numbers are stored in ``podcast.episodeNumber`` so a later change to
    ``--first-week`` or a skipped week never renumbers already-published episodes.
    """
    latest = collection.find(
        {"podcast.episodeNumber": {"$exists": True}},
        {"podcast.episodeNumber": 1},
    )
    highest = max(
        ((doc.get("podcast") or {}).get("episodeNumber") or 0 for doc in latest),
        default=0,
    )

    numbers: dict[str, int] = {}
    for doc in docs:
        number = (doc.get("podcast") or {}).get("episodeNumber")
        if number is None:
            highest += 1
            number = highest
            if persist:
                collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {
                        "podcast.episodeNumber": number,
                        "podcast.firstPublishedAt": datetime.now(tz=timezone.utc),
                    }},
                )
            log.info("[%s] Assigned episode number %d", doc["_id"], number)
        numbers[str(doc["_id"])] = number
    return numbers


def resolve_audio(collection, doc: dict, audio_dir: Path, persist: bool):
    """Return (path, size_bytes, duration_s) or None if the MP3 is missing.

    Falls back to ``stat``/``ffprobe`` when the values are absent from MongoDB
    (e.g. lessons generated before duration tracking was added) and backfills
    them so the next run is cheap.
    """
    meta = doc.get("audio") or {}
    filename = meta.get("filename")
    if not filename:
        log.warning("[%s] No audio filename recorded, skipping", doc["_id"])
        return None

    path = audio_dir / filename
    if not path.is_file() or path.stat().st_size == 0:
        log.warning("[%s] MP3 missing or empty: %s, skipping", doc["_id"], path)
        return None

    size_bytes = meta.get("size_bytes") or path.stat().st_size
    duration_s = meta.get("duration_s") or probe_duration_s(path)
    if duration_s is not None:
        duration_s = round(float(duration_s), 1)

    updates = {}
    if meta.get("size_bytes") != size_bytes:
        updates["audio.size_bytes"] = int(size_bytes)
    if duration_s is not None and meta.get("duration_s") != duration_s:
        updates["audio.duration_s"] = duration_s
    if updates and persist:
        collection.update_one({"_id": doc["_id"]}, {"$set": updates})
        log.debug("[%s] Backfilled audio metadata: %s", doc["_id"], updates)

    return path, int(size_bytes), duration_s


# --------------------------------------------------------------------------- #
# RSS rendering
# --------------------------------------------------------------------------- #

def build_episode(
    doc: dict,
    episode_number: int,
    channel: dict,
    base_url: str,
    audio_base_url: str,
    size_bytes: int,
    duration_s: float | None,
    filename: str,
) -> Episode:
    week_start = as_utc(doc.get("weekStart"))
    pub_date = parse_publish_time(filename, week_start)
    display_date = week_start or pub_date

    count = doc.get("totalChallenges") or len(doc.get("challenges") or [])
    lesson_url = base_url.rstrip("/") + channel["lesson_path"]

    return Episode(
        doc_id=str(doc["_id"]),
        episode_number=episode_number,
        title=channel["episode_title"].format(date=format_french_date(display_date)),
        description_html=channel["episode_description"].format(
            count=count,
            lesson_url=lesson_url,
            site_url=base_url.rstrip("/"),
        ),
        link=lesson_url,
        pub_date=pub_date,
        audio_filename=filename,
        audio_url=f"{audio_base_url.rstrip('/')}/weekly-audio/{filename}",
        size_bytes=size_bytes,
        duration_s=duration_s,
        week_start=week_start,
    )


def render_item(episode: Episode, channel: dict, description: str, cover_url: str) -> str:
    lines = [
        "    <item>",
        f"      <title>{escape(episode.title)}</title>",
        f"      <link>{escape(episode.link)}</link>",
        f'      <guid isPermaLink="false">{escape(episode.doc_id)}</guid>',
        f"      <pubDate>{rfc822(episode.pub_date)}</pubDate>",
        f"      <description>{cdata(description)}</description>",
        f"      <content:encoded>{cdata(description)}</content:encoded>",
        (
            "      <enclosure "
            f'url="{escape(episode.audio_url)}" '
            f'length="{episode.size_bytes}" '
            'type="audio/mpeg"/>'
        ),
        f"      <itunes:title>{escape(episode.title)}</itunes:title>",
        f"      <itunes:author>{escape(channel['author'])}</itunes:author>",
        f"      <itunes:summary>{cdata(description)}</itunes:summary>",
        f'      <itunes:image href="{escape(cover_url)}"/>',
    ]

    duration = format_duration(episode.duration_s)
    if duration:
        lines.append(f"      <itunes:duration>{duration}</itunes:duration>")

    lines.extend([
        f"      <itunes:episode>{episode.episode_number}</itunes:episode>",
        "      <itunes:season>1</itunes:season>",
        "      <itunes:episodeType>full</itunes:episodeType>",
        "      <itunes:explicit>false</itunes:explicit>",
        "    </item>",
    ])
    return "\n".join(lines)


def render_feed(
    channel: dict,
    episodes: list[Episode],
    feed_url: str,
    base_url: str,
    cover_url: str,
    episode_type: str,
    build_time: datetime,
) -> str:
    """Newest episode first, as podcast directories expect."""
    items = "\n".join(
        render_item(ep, channel, ep.description_html, cover_url)
        for ep in sorted(episodes, key=lambda e: (e.pub_date, e.episode_number), reverse=True)
    )

    header = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"\n'
        '     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"\n'
        '     xmlns:atom="http://www.w3.org/2005/Atom"\n'
        '     xmlns:content="http://purl.org/rss/1.0/modules/content/">\n'
        "  <channel>"
    )
    channel_block = "\n".join([
        f"    <title>{escape(channel['title'])}</title>",
        f"    <link>{escape(base_url.rstrip('/'))}</link>",
        f'    <atom:link href="{escape(feed_url)}" rel="self" type="application/rss+xml"/>',
        f"    <description>{escape(channel['description'])}</description>",
        f"    <language>{escape(channel['language'])}</language>",
        f"    <copyright>{escape(channel['copyright'])}</copyright>",
        f"    <lastBuildDate>{rfc822(build_time)}</lastBuildDate>",
        "    <generator>DialectHub podcast feed generator</generator>",
        f"    <itunes:author>{escape(channel['author'])}</itunes:author>",
        f"    <itunes:subtitle>{escape(channel['subtitle'])}</itunes:subtitle>",
        f"    <itunes:summary>{escape(channel['summary'])}</itunes:summary>",
        "    <itunes:owner>",
        f"      <itunes:name>{escape(channel['owner_name'])}</itunes:name>",
        f"      <itunes:email>{escape(channel['owner_email'])}</itunes:email>",
        "    </itunes:owner>",
        f'    <itunes:image href="{escape(cover_url)}"/>',
        f'    <itunes:category text="{ITUNES_CATEGORY_TOP}">',
        f'      <itunes:category text="{ITUNES_CATEGORY_SUB}"/>',
        "    </itunes:category>",
        "    <itunes:explicit>false</itunes:explicit>",
        f"    <itunes:type>{escape(episode_type)}</itunes:type>",
        "    <image>",
        f"      <url>{escape(cover_url)}</url>",
        f"      <title>{escape(channel['title'])}</title>",
        f"      <link>{escape(base_url.rstrip('/'))}</link>",
        "    </image>",
    ])

    footer = "  </channel>\n</rss>\n"
    body = channel_block + ("\n" + items if items else "")
    return f"{header}\n{body}\n{footer}"


def write_atomic(path: Path, content: str) -> None:
    """Write via a temp file so a directory watcher never serves a partial feed."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def validate_cover(path: Path) -> None:
    """Warn (never fail) when the cover art will be rejected by directories."""
    if not path.is_file():
        log.warning(
            "Cover art not found at %s - Apple Podcasts will reject the feed "
            "until a 1400x1400-3000x3000 square JPEG/PNG is added.", path,
        )
        return

    size_kb = path.stat().st_size / 1024
    if size_kb > 512:
        log.warning("Cover art is %.0f KB; Apple requires under 512 KB", size_kb)

    dimensions = probe_image_size(path)
    if dimensions is None:
        return
    width, height = dimensions
    if width != height:
        log.warning("Cover art is %dx%d but must be square", width, height)
    if min(width, height) < 1400 or max(width, height) > 3000:
        log.warning(
            "Cover art is %dx%d; Apple requires between 1400x1400 and 3000x3000",
            width, height,
        )
    log.info("Cover art: %dx%d, %.0f KB", width, height, size_kb)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate the podcast RSS feed for the weekly vocabulary lesson.",
    )
    parser.add_argument(
        "--audio-dir", default=str(DEFAULT_AUDIO_DIR),
        help="Directory holding the weekly lesson MP3 files (default: /weekly-audio)",
    )
    parser.add_argument(
        "--output-dir", default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where feed.xml is written, served at /podcast (default: /podcast)",
    )
    parser.add_argument(
        "--first-week", default=None,
        help=(
            "Only publish lessons whose weekStart is on/after this date (YYYY-MM-DD). "
            "Defaults to the current week's Monday, so older lessons are not backfilled."
        ),
    )
    parser.add_argument(
        "--base-url", default=DEFAULT_BASE_URL,
        help=f"Public site URL used in links (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--audio-base-url", default=None,
        help="Public base URL for MP3 enclosures (default: same as --base-url)",
    )
    parser.add_argument(
        "--cover", default=None,
        help="Cover art path (default: <output-dir>/cover.jpg)",
    )
    parser.add_argument(
        "--lang", default="fr", choices=sorted(CHANNELS),
        help="Feed language / channel metadata (default: fr)",
    )
    parser.add_argument(
        "--episode-type", default=DEFAULT_EPISODE_TYPE,
        choices=["episodic", "serial"], help="iTunes episode ordering hint",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print the summary without writing files or updating MongoDB",
    )
    parser.add_argument(
        "--log-level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser.parse_args(argv)


def parse_first_week(value: str | None) -> datetime:
    if not value:
        return current_week_start_utc()
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        log.error("--first-week must be YYYY-MM-DD, got %r", value)
        sys.exit(1)
    return parsed.replace(tzinfo=timezone.utc)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.getLogger().setLevel(args.log_level)

    channel = CHANNELS[args.lang]
    audio_dir = Path(args.audio_dir)
    output_dir = Path(args.output_dir)
    cover_path = Path(args.cover) if args.cover else output_dir / DEFAULT_COVER_FILENAME
    base_url = args.base_url.rstrip("/")
    audio_base_url = (args.audio_base_url or args.base_url).rstrip("/")
    feed_url = f"{base_url}/podcast/{FEED_FILENAME}"
    cover_url = f"{base_url}/podcast/{cover_path.name}"

    first_week = parse_first_week(args.first_week)
    log.info("Publishing lessons with weekStart >= %s", first_week.date())
    log.info("Feed URL: %s", feed_url)

    client, db = connect_mongodb()
    collection = db["weeklychallenges"]
    try:
        docs = fetch_episodes(collection, first_week)
        numbers = assign_episode_numbers(collection, docs, persist=not args.dry_run)

        episodes: list[Episode] = []
        for doc in docs:
            resolved = resolve_audio(collection, doc, audio_dir, persist=not args.dry_run)
            if resolved is None:
                continue
            path, size_bytes, duration_s = resolved
            doc_id = str(doc["_id"])
            episodes.append(build_episode(
                doc=doc,
                episode_number=numbers.get(doc_id, 0),
                channel=channel,
                base_url=base_url,
                audio_base_url=audio_base_url,
                size_bytes=size_bytes,
                duration_s=duration_s,
                filename=path.name,
            ))
    finally:
        client.close()

    xml = render_feed(
        channel=channel,
        episodes=episodes,
        feed_url=feed_url,
        base_url=base_url,
        cover_url=cover_url,
        episode_type=args.episode_type,
        build_time=datetime.now(tz=timezone.utc),
    )

    if not args.dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_atomic(output_dir / FEED_FILENAME, xml)
        write_atomic(output_dir / EPISODES_FILENAME, _episodes_json(episodes))
        validate_cover(cover_path)
        log.info("Wrote %s (%d episode(s))", output_dir / FEED_FILENAME, len(episodes))
    else:
        log.info("Dry run: %d episode(s) would be written to %s", len(episodes), output_dir)
        print(xml)

    if not episodes:
        log.warning(
            "Feed contains no episodes. Directories usually require at least one; "
            "the next lesson generated after %s will appear here.",
            first_week.date(),
        )

    for ep in sorted(episodes, key=lambda e: e.episode_number):
        log.info(
            "  ep %2d  %s  %s  %s",
            ep.episode_number,
            ep.pub_date.strftime("%Y-%m-%d"),
            format_duration(ep.duration_s) or "?:??",
            ep.title,
        )
    return 0


def _episodes_json(episodes: list[Episode]) -> str:
    import json

    payload = [
        {
            "episodeNumber": ep.episode_number,
            "docId": ep.doc_id,
            "title": ep.title,
            "pubDate": ep.pub_date.isoformat(),
            "filename": ep.audio_filename,
            "audioUrl": ep.audio_url,
            "sizeBytes": ep.size_bytes,
            "durationSeconds": ep.duration_s,
        }
        for ep in sorted(episodes, key=lambda e: e.episode_number)
    ]
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    sys.exit(main())
