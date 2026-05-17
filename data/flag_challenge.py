#!/usr/bin/env python3
"""
flag_challenge.py — Manually flag a challenge for quality revision.

Usage:
  # By challenge UUID
  python data/flag_challenge.py --id 48348b0d-cf1d-44f5-8252-e460884dd22c

  # By Portuguese word (partial match, case-insensitive)
  python data/flag_challenge.py --word roupa

  # Specify which user's name appears in the flag (optional)
  python data/flag_challenge.py --word roupa --username admin

  # Dry-run: show what would be flagged without writing
  python data/flag_challenge.py --word roupa --dry-run
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import dotenv_values
from pymongo import MongoClient
from bson import ObjectId

# ---------------------------------------------------------------------------
# Config / helpers
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

CHALLENGE_FILES = {
    "word":  DATA_DIR / "challenges.json",
    "verb":  DATA_DIR / "verb-challenges.json",
    "idiom": DATA_DIR / "idiom-challenges.json",
}


def load_env() -> str:
    """Return MONGODB_URI from .env or environment."""
    env_path = REPO_ROOT / ".env"
    cfg = dotenv_values(env_path) if env_path.exists() else {}
    uri = cfg.get("MONGODB_URI") or os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("ERROR: MONGODB_URI not found in .env or environment variables.")
    return uri


def load_all_challenges() -> list[dict]:
    """Load and tag all challenges from the three JSON files."""
    all_challenges: list[dict] = []
    for ctype, path in CHALLENGE_FILES.items():
        if not path.exists():
            print(f"  [warn] {path.name} not found, skipping.")
            continue
        with open(path, "r", encoding="utf-8") as f:
            items = json.load(f)
        for item in items:
            item["_type"] = ctype
        all_challenges.extend(items)
    return all_challenges


def find_challenges(challenges: list[dict], challenge_id: str | None, word: str | None) -> list[dict]:
    """Return matching challenges by exact ID or partial Portuguese-word match."""
    if challenge_id:
        matches = [c for c in challenges if c.get("id") == challenge_id]
    elif word:
        w = word.lower()
        matches = [c for c in challenges if w in c.get("port", "").lower()]
    else:
        sys.exit("ERROR: Provide --id or --word.")
    return matches


def get_system_user(db, username: str | None) -> dict:
    """
    Return a MongoDB User document to attach the flag to.
    Prefers an exact username match; falls back to the first user in the DB.
    """
    users = db["users"]
    if username:
        user = users.find_one({"username": username})
        if not user:
            sys.exit(f"ERROR: No user found with username '{username}'.")
        return user
    # Fallback: first user (typically the admin / owner)
    user = users.find_one({}, sort=[("_id", 1)])
    if not user:
        sys.exit("ERROR: No users found in the database.")
    return user


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Flag a challenge for quality revision in MongoDB."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--id",   dest="challenge_id", help="Exact challenge UUID")
    group.add_argument("--word", dest="word",         help="Portuguese word (partial, case-insensitive)")
    parser.add_argument("--username", default=None,
                        help="Username to attach the flag to (defaults to first user)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview what would be flagged without writing to DB")
    args = parser.parse_args()

    # 1. Find matching challenges in JSON files
    challenges = load_all_challenges()
    matches = find_challenges(challenges, args.challenge_id, args.word)

    if not matches:
        sys.exit("No matching challenges found.")

    print(f"\nFound {len(matches)} challenge(s):\n")
    for c in matches:
        en_info = c.get("en") or {}
        print(f"  [{c['_type']}] id={c['id']}  port='{c['port']}'  en='{en_info.get('translation', '')}'")

    if args.dry_run:
        print("\n[dry-run] No changes written.")
        return

    # 2. Connect to MongoDB
    uri = load_env()
    client = MongoClient(uri)
    db = client.get_default_database()

    # 3. Resolve the user
    user = get_system_user(db, args.username)
    print(f"\nFlagging as user: '{user.get('username')}' (id={user['_id']})\n")

    # 4. Upsert flags
    flags_col = db["challengequalityflags"]
    now = datetime.now(timezone.utc)
    created = 0
    updated = 0

    for c in matches:
        result = flags_col.update_one(
            {"userId": user["_id"], "challengeId": c["id"]},
            {"$set": {
                "userId":      user["_id"],
                "challengeId": c["id"],
                "flaggedAt":   now,
                "updatedAt":   now,
            }},
            upsert=True,
        )
        if result.upserted_id:
            created += 1
            print(f"  [created] flagged '{c['port']}' ({c['id']})")
        else:
            updated += 1
            print(f"  [updated] refreshed flag for '{c['port']}' ({c['id']})")

    print(f"\nDone. {created} created, {updated} already existed (timestamp refreshed).")
    client.close()


if __name__ == "__main__":
    main()
