#!/usr/bin/env python3
"""
Back up all MongoDB collections (except sessions) to BSON using mongodump.

Usage:
    MONGODB_URI=<uri> python scripts/backup_mongodb.py
    MONGODB_URI=<uri> python scripts/backup_mongodb.py --output-dir /path/to/backups
    MONGODB_URI=<uri> python scripts/backup_mongodb.py --dry-run

Requires the MongoDB Database Tools (mongodump):
    https://www.mongodb.com/docs/database-tools/installation/
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient


EXCLUDED_COLLECTIONS = {"sessions"}


def get_uri() -> str:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit(
            "ERROR: MONGODB_URI environment variable not set.\n"
            "  Export it or prefix the command:\n"
            "  MONGODB_URI=<uri> python scripts/backup_mongodb.py"
        )
    return uri


def redact_uri(uri: str) -> str:
    """Replace password in URI with *** so it is safe to log."""
    return re.sub(r"(?<=://)[^:]+:[^@]+@", "***:***@", uri)


def check_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(
            f"ERROR: '{name}' not found on PATH.\n"
            f"  Install MongoDB Database Tools:\n"
            f"  https://www.mongodb.com/docs/database-tools/installation/"
        )
    return path


def get_doc_counts(uri: str) -> dict[str, int]:
    client = MongoClient(uri)
    try:
        db = client.get_default_database()
        counts = {}
        for name in sorted(db.list_collection_names()):
            if name not in EXCLUDED_COLLECTIONS:
                counts[name] = db[name].estimated_document_count()
        return counts
    finally:
        client.close()


def get_mongodump_version(mongodump_path: str) -> str:
    try:
        result = subprocess.run(
            [mongodump_path, "--version"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip().splitlines()[0] if result.stdout else "unknown"
    except Exception:
        return "unknown"


def run_backup(uri: str, output_dir: Path, dry_run: bool) -> None:
    mongodump = check_tool("mongodump")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    backup_dir = output_dir / timestamp

    print("[backup] Connecting to MongoDB to count documents...")
    counts = get_doc_counts(uri)
    collections = sorted(counts.keys())

    print(f"[backup] Collections to back up ({len(collections)}):")
    for col in collections:
        print(f"         {col}: {counts[col]:,} documents")

    if dry_run:
        print(f"\n[dry-run] Would create:  {backup_dir}/")
        print(f"[dry-run] Would run:     mongodump --uri=*** --excludeCollection=sessions --out={backup_dir}")
        print("[dry-run] No files written.")
        return

    backup_dir.mkdir(parents=True)
    print(f"\n[backup] Output directory: {backup_dir}")

    cmd = [
        mongodump,
        f"--uri={uri}",
        "--excludeCollection=sessions",
        f"--out={backup_dir}",
    ]

    print("[backup] Running mongodump...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(f"ERROR: mongodump failed with exit code {result.returncode}")

    metadata = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uri_host": redact_uri(uri),
        "mongodump_version": get_mongodump_version(mongodump),
        "excluded_collections": sorted(EXCLUDED_COLLECTIONS),
        "collections": counts,
    }
    metadata_path = backup_dir / "backup_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2))
    print(f"[backup] Metadata written: {metadata_path}")

    # Relative symlink so the backups folder stays portable
    latest_link = output_dir / "latest"
    if latest_link.is_symlink() or latest_link.exists():
        latest_link.unlink()
    latest_link.symlink_to(timestamp)
    print(f"[backup] Symlink updated:  {latest_link} -> {timestamp}")

    total_docs = sum(counts.values())
    print(f"\n[backup] Done. {len(collections)} collections, {total_docs:,} documents total.")
    print(f"[backup] Backup location: {backup_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Back up MongoDB collections to BSON using mongodump."
    )
    parser.add_argument(
        "--output-dir",
        default="backups",
        help="Directory to store backup subdirectories (default: backups/)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without writing any files.",
    )
    args = parser.parse_args()

    uri = get_uri()
    run_backup(uri, Path(args.output_dir), args.dry_run)


if __name__ == "__main__":
    main()
