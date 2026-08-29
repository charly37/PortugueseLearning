#!/usr/bin/env python3
"""
Restore MongoDB collections from a BSON backup created by backup_mongodb.py.

WARNING: This performs a DROP-and-replace restore. All existing data in the
         target collections will be permanently overwritten.

Usage:
    MONGODB_URI=<uri> python scripts/restore_mongodb.py
    MONGODB_URI=<uri> python scripts/restore_mongodb.py backups/2026-08-29_14-30-00
    MONGODB_URI=<uri> python scripts/restore_mongodb.py --yes

Requires the MongoDB Database Tools (mongorestore):
    https://www.mongodb.com/docs/database-tools/installation/
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


def get_uri() -> str:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit(
            "ERROR: MONGODB_URI environment variable not set.\n"
            "  Export it or prefix the command:\n"
            "  MONGODB_URI=<uri> python scripts/restore_mongodb.py"
        )
    return uri


def check_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(
            f"ERROR: '{name}' not found on PATH.\n"
            f"  Install MongoDB Database Tools:\n"
            f"  https://www.mongodb.com/docs/database-tools/installation/"
        )
    return path


def resolve_backup_dir(path_arg: str) -> Path:
    p = Path(path_arg)
    resolved = p.resolve()
    if not resolved.exists():
        sys.exit(f"ERROR: Backup directory not found: {path_arg}")
    return resolved


def load_metadata(backup_dir: Path) -> dict | None:
    meta_path = backup_dir / "backup_metadata.json"
    if not meta_path.exists():
        return None
    with meta_path.open() as f:
        return json.load(f)


def get_db_name(uri: str) -> str:
    """Extract the database name from the URI path component."""
    match = re.search(r"/([^/?]+)(?:\?|$)", uri.split("@")[-1])
    return match.group(1) if match else "unknown"


def confirm(prompt: str) -> bool:
    try:
        answer = input(prompt).strip().lower()
        return answer in ("y", "yes")
    except (KeyboardInterrupt, EOFError):
        print()
        return False


def run_restore(uri: str, backup_dir: Path, yes: bool) -> None:
    mongorestore = check_tool("mongorestore")
    db_name = get_db_name(uri)

    print(f"[restore] Backup directory: {backup_dir}")

    metadata = load_metadata(backup_dir)
    collections: dict[str, int] = {}

    if metadata:
        print(f"[restore] Backup taken:     {metadata.get('timestamp', 'unknown')}")
        print(f"[restore] Source:           {metadata.get('uri_host', 'unknown')}")
        collections = metadata.get("collections", {})
        print(f"[restore] Collections ({len(collections)}):")
        for col, count in sorted(collections.items()):
            print(f"           {col}: {count:,} documents")
    else:
        print("[restore] WARNING: No backup_metadata.json found — proceeding without summary.")

    n = len(collections) if collections else "all"
    print()
    print(f"  !! This will DROP and replace {n} collection(s) in database '{db_name}'.")
    print( "  !! Existing data will be permanently overwritten.")
    print()

    if not yes:
        if not confirm("Continue? [y/N] "):
            print("[restore] Aborted.")
            sys.exit(0)

    cmd = [
        mongorestore,
        f"--uri={uri}",
        "--drop",
        f"--dir={backup_dir}",
    ]

    print("[restore] Running mongorestore...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        # mongorestore writes progress to stderr; only treat non-zero exit as error
        print(result.stderr)

    if result.returncode != 0:
        sys.exit(f"ERROR: mongorestore failed with exit code {result.returncode}")

    print(f"\n[restore] Done. Database '{db_name}' restored from {backup_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Restore MongoDB collections from a BSON backup (DROP-and-replace).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  MONGODB_URI=<uri> python scripts/restore_mongodb.py\n"
            "  MONGODB_URI=<uri> python scripts/restore_mongodb.py backups/2026-08-29_14-30-00\n"
            "  MONGODB_URI=<uri> python scripts/restore_mongodb.py --yes\n"
        ),
    )
    parser.add_argument(
        "backup_dir",
        nargs="?",
        default="backups/latest",
        help="Path to backup directory (default: backups/latest)",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Skip the confirmation prompt.",
    )
    args = parser.parse_args()

    uri = get_uri()
    backup_dir = resolve_backup_dir(args.backup_dir)
    run_restore(uri, backup_dir, args.yes)


if __name__ == "__main__":
    main()
