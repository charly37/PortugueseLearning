#!/usr/bin/env python3
"""
upload_to_youtube.py - Upload weekly MP4 lesson files to a YouTube channel.

Usage:
    python upload_to_youtube.py [--weekly-audio-dir DIR]

Environment variables:
    MONGODB_URI             - MongoDB connection string
    YOUTUBE_CLIENT_ID       - OAuth2 client ID
    YOUTUBE_CLIENT_SECRET   - OAuth2 client secret
    YOUTUBE_REFRESH_TOKEN   - OAuth2 refresh token (obtained via get_refresh_token.py)
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

WEEKLY_AUDIO_DIR = Path(__file__).parent.parent / "weekly-audio"
_YOUTUBE_TOKEN_URI = "https://oauth2.googleapis.com/token"
_YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
# 10 MB chunks for resumable uploads
_CHUNK_SIZE = 10 * 1024 * 1024


def _build_youtube_client():
    client_id = os.environ.get("YOUTUBE_CLIENT_ID")
    client_secret = os.environ.get("YOUTUBE_CLIENT_SECRET")
    refresh_token = os.environ.get("YOUTUBE_REFRESH_TOKEN")

    for name, val in [
        ("YOUTUBE_CLIENT_ID", client_id),
        ("YOUTUBE_CLIENT_SECRET", client_secret),
        ("YOUTUBE_REFRESH_TOKEN", refresh_token),
    ]:
        if not val:
            log.error("Missing required environment variable: %s", name)
            sys.exit(1)

    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        log.error("google-api-python-client is required. Install via requirements.txt")
        sys.exit(1)

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=_YOUTUBE_TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=_YOUTUBE_SCOPES,
    )
    return build("youtube", "v3", credentials=creds)


def _connect_mongodb():
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


def _extract_doc_id(mp4_path: Path) -> str | None:
    # Filename pattern: weekly_{doc_id}_{YYYYMMDD}_{HHmmss}.mp4
    parts = mp4_path.stem.split("_")
    if len(parts) >= 4 and parts[0] == "weekly":
        return parts[1]
    return None


def _build_title(doc: dict, mp4_path: Path) -> str:
    week_start = doc.get("weekStart")
    if week_start and hasattr(week_start, "strftime"):
        return f"Portuguese Lesson \u2013 Week of {week_start.strftime('%Y-%m-%d')}"
    # fall back to date embedded in filename
    parts = mp4_path.stem.split("_")
    if len(parts) >= 3:
        try:
            return f"Portuguese Lesson \u2013 Week of {datetime.strptime(parts[2], '%Y%m%d').strftime('%Y-%m-%d')}"
        except ValueError:
            pass
    return f"Portuguese Lesson \u2013 {mp4_path.stem}"


def _upload_video(youtube, mp4_path: Path, title: str) -> str:
    try:
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        log.error("googleapiclient.http not available")
        sys.exit(1)

    body = {
        "snippet": {
            "title": title,
            "description": (
                "Weekly Portuguese vocabulary lesson. "
                "Practice your vocabulary with native audio pronunciation examples."
            ),
            "tags": ["portuguese", "language learning", "vocabulary", "lesson"],
            "categoryId": "27",  # Education
        },
        "status": {"privacyStatus": "public"},
    }

    media = MediaFileUpload(str(mp4_path), mimetype="video/mp4", resumable=True, chunksize=_CHUNK_SIZE)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            log.info("  Upload progress: %d%%", int(status.progress() * 100))

    return response["id"]


def main():
    parser = argparse.ArgumentParser(description="Upload weekly MP4 lesson files to YouTube.")
    parser.add_argument(
        "--weekly-audio-dir",
        default=str(WEEKLY_AUDIO_DIR),
        metavar="DIR",
        help=f"Directory containing MP4 files (default: {WEEKLY_AUDIO_DIR})",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        metavar="LEVEL",
        help="Logging verbosity (default: INFO)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        stream=sys.stderr,
        format="%(levelname)s %(message)s",
        force=True,
    )

    audio_dir = Path(args.weekly_audio_dir)
    if not audio_dir.exists():
        log.error("Weekly audio directory not found: %s", audio_dir)
        sys.exit(1)

    mp4_files = sorted(audio_dir.glob("*.mp4"))
    if not mp4_files:
        log.info("No MP4 files found in %s", audio_dir)
        return

    log.info("Found %d MP4 file(s) in %s", len(mp4_files), audio_dir)

    mongo_client, db = _connect_mongodb()
    collection = db["weeklychallenges"]
    youtube = _build_youtube_client()

    scanned = uploaded = skipped_already = skipped_no_doc = failed = 0

    try:
        for mp4_path in mp4_files:
            scanned += 1
            doc_id = _extract_doc_id(mp4_path)
            if doc_id is None:
                log.warning("Cannot parse doc_id from filename: %s — skipping", mp4_path.name)
                failed += 1
                continue

            try:
                from bson import ObjectId
                doc = collection.find_one({"_id": ObjectId(doc_id)})
            except Exception as exc:
                log.warning("Invalid doc_id '%s' from %s (%s) — skipping", doc_id, mp4_path.name, exc)
                failed += 1
                continue

            if doc is None:
                log.warning("No MongoDB doc for %s — skipping orphan file", mp4_path.name)
                skipped_no_doc += 1
                continue

            if doc.get("youtube", {}).get("videoId"):
                log.info("%s already uploaded (videoId: %s) — skipping", mp4_path.name, doc["youtube"]["videoId"])
                skipped_already += 1
                continue

            title = _build_title(doc, mp4_path)
            log.info("Uploading %s  →  '%s'", mp4_path.name, title)

            try:
                video_id = _upload_video(youtube, mp4_path, title)
                url = f"https://www.youtube.com/watch?v={video_id}"
                collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"youtube": {
                        "videoId": video_id,
                        "url": url,
                        "uploadedAt": datetime.now(tz=timezone.utc).strftime("%Y-%m-%d"),
                    }}},
                )
                log.info("Done: %s  →  %s", mp4_path.name, url)
                uploaded += 1
            except Exception as exc:
                log.error("Failed to upload %s: %s", mp4_path.name, exc)
                failed += 1
    finally:
        mongo_client.close()

    log.info("")
    log.info("=== YouTube Upload Summary ===")
    log.info("Files scanned   : %d", scanned)
    log.info("Uploaded        : %d", uploaded)
    log.info("Already uploaded: %d", skipped_already)
    log.info("No doc found    : %d", skipped_no_doc)
    if failed:
        log.info("Errors          : %d", failed)
    log.info("")


if __name__ == "__main__":
    main()
