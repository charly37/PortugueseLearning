#!/usr/bin/env python3
"""
Create a weekly challenge by selecting 20 word challenges from challenges.json
and storing it in MongoDB, linked to a specific user.

Usage:
    python create_weekly_challenge.py --user-id <mongodb_user_id>
    python create_weekly_challenge.py --username <username>
    python create_weekly_challenge.py --all-users   # create for every user

Environment variables:
    MONGODB_URI  - MongoDB connection string (required)
"""

import os
import sys
import json
import logging
import random
import argparse
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson import ObjectId

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


@dataclass
class CreationStats:
    """Counters collected during a weekly-challenge creation run."""
    users_found: int = 0
    users_created: int = 0       # challenge newly inserted
    users_replaced: int = 0      # existing challenge overwritten
    users_failed: int = 0        # unexpected error per user
    total_challenges: int = 0    # sum of challenges across all users
    users_with_weak_data: int = 0  # users whose selection was weakness-biased
    total_weak_slots_used: int = 0  # weak words actually injected

    def log_summary(self) -> None:
        log.info("--- Creation Statistics ---")
        log.info("Users found          : %d", self.users_found)
        log.info("Challenges created   : %d (new)", self.users_created)
        if self.users_replaced:
            log.info("Challenges replaced  : %d (overwrote existing)", self.users_replaced)
        if self.users_failed:
            log.info("Users failed         : %d", self.users_failed)
        log.info("Total challenges     : %d across %d user(s)",
                 self.total_challenges, self.users_created + self.users_replaced)
        if self.users_found:
            log.info("Weakness-biased      : %d/%d user(s)  (%d weak-word slots used)",
                     self.users_with_weak_data, self.users_found, self.total_weak_slots_used)


# ── helpers ────────────────────────────────────────────────────────────────────

def load_word_challenges() -> list:
    """Load word challenges from the JSON file relative to this script."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Try sibling 'data/' directory first (cluster layout), then '../data/' (local dev layout)
    for candidate in (
        os.path.join(script_dir, 'data', 'challenges.json'),
        os.path.join(script_dir, '..', 'data', 'challenges.json'),
    ):
        data_path = os.path.normpath(candidate)
        if os.path.exists(data_path):
            break
    else:
        raise FileNotFoundError(
            f"challenges.json not found (tried {os.path.normpath(os.path.join(script_dir, 'data', 'challenges.json'))}"
            f" and {os.path.normpath(os.path.join(script_dir, '..', 'data', 'challenges.json'))})"
        )

    with open(data_path, 'r', encoding='utf-8') as f:
        challenges = json.load(f)

    log.info("Loaded %d word challenges from %s", len(challenges), data_path)
    return challenges


def connect_db():
    """Return (client, db) using MONGODB_URI from environment."""
    mongodb_uri = os.getenv('MONGODB_URI')
    if not mongodb_uri:
        raise ValueError("MONGODB_URI environment variable is not set")

    client = MongoClient(mongodb_uri)
    db = client.get_default_database()
    log.info("Connected to MongoDB")
    return client, db


def pick_challenges(all_challenges: list, user_doc: dict, n: int = 20) -> tuple[list, int]:
    """
    Select *n* challenges, biasing towards the user's weak words when available.
    Falls back to pure random selection when weakness data is absent.

    Returns (selected_challenges, weak_slots_used).
    """
    if not all_challenges:
        raise ValueError("challenges list is empty")

    n = min(n, len(all_challenges))

    # Build a set of weak challenge IDs for this user
    weak_ids: set = set()
    weaknesses = user_doc.get('weaknesses') or {}
    for w in weaknesses.get('weakWords', []):
        cid = w.get('challengeId')
        if cid:
            weak_ids.add(cid)

    weak_pool  = [c for c in all_challenges if c.get('id') in weak_ids]
    other_pool = [c for c in all_challenges if c.get('id') not in weak_ids]

    # Use up to half the slots for weak words, fill the rest randomly
    weak_slots  = min(len(weak_pool), n // 2)
    other_slots = n - weak_slots

    selected  = random.sample(weak_pool, weak_slots) if weak_slots else []
    selected += random.sample(other_pool, min(other_slots, len(other_pool)))

    # Shuffle final list so weak words aren't always first
    random.shuffle(selected)
    return selected[:n], weak_slots


def build_weekly_challenge_doc(user_id: str | None, challenges: list) -> dict:
    """Build the document to insert into the weeklychallenges collection."""
    now = datetime.utcnow()
    # Week starts on Monday of the current week
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end   = week_start + timedelta(days=7)

    return {
        'userId': user_id,
        'weekStart': week_start,
        'weekEnd': week_end,
        'createdAt': now,
        'challenges': [
            {
                'challengeId': c['id'],
                'portuguese': c.get('port', ''),
                'translation_fr': c.get('fr', {}).get('translation', ''),
                'translation_en': c.get('en', {}).get('translation', ''),
                'completed': False,
                'correct': None,
                'attemptedAt': None,
            }
            for c in challenges
        ],
        'totalChallenges': len(challenges),
        'completedCount': 0,
        'correctCount': 0,
        'status': 'active',   # active | completed | expired
    }


def upsert_weekly_challenge(db, user_id: str | None, challenges: list) -> tuple[str, bool]:
    """
    Insert or replace the weekly challenge for this user for the current week.
    Returns (document_id, was_new_insert).
    """
    doc = build_weekly_challenge_doc(user_id, challenges)
    collection = db['weeklychallenges']

    result = collection.replace_one(
        {
            'userId': user_id,
            'weekStart': doc['weekStart'],
        },
        doc,
        upsert=True,
    )

    if result.upserted_id:
        return str(result.upserted_id), True
    # For replaced documents pymongo doesn't return the id directly; query it
    existing = collection.find_one({'userId': user_id, 'weekStart': doc['weekStart']})
    doc_id = str(existing['_id']) if existing else 'unknown'
    return doc_id, False


def resolve_user(db, args) -> list:
    """
    Return a list of user documents matching the CLI arguments.
    Supports --user-id, --username, or --all-users.
    """
    users_col = db['users']

    if args.all_users:
        users = list(users_col.find({'isGuest': {'$ne': True}}))
        if not users:
            log.warning("No registered users found in the database.")
        return users

    if args.user_id:
        try:
            oid = ObjectId(args.user_id)
        except Exception:
            log.error("Invalid ObjectId: %s", args.user_id)
            sys.exit(1)
        user = users_col.find_one({'_id': oid})
        if not user:
            log.error("User with id '%s' not found.", args.user_id)
            sys.exit(1)
        if user.get('isGuest'):
            log.error("User '%s' is a guest account. Weekly challenges are only created for registered users.", args.user_id)
            sys.exit(1)
        return [user]

    if args.username:
        user = users_col.find_one({'username': args.username})
        if not user:
            log.error("User '%s' not found.", args.username)
            sys.exit(1)
        if user.get('isGuest'):
            log.error("User '%s' is a guest account. Weekly challenges are only created for registered users.", args.username)
            sys.exit(1)
        return [user]

    # Should not reach here due to argparse mutual exclusion
    log.error("Provide --user-id, --username, or --all-users.")
    sys.exit(1)


# ── main ───────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description='Create a weekly word challenge for one or all users.'
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--user-id',    help='MongoDB ObjectId of the target user')
    group.add_argument('--username',   help='Username of the target user')
    group.add_argument('--all-users',  action='store_true',
                       help='Create weekly challenges for every user in the DB')
    parser.add_argument('--count', type=int, default=20,
                        help='Number of challenges to include (default: 20)')
    parser.add_argument('--min-usefulness', type=int, default=2,
                        help='Minimum usefulness value for a challenge to be included (default: 2)')
    parser.add_argument(
        '--log-level',
        default='INFO',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        metavar='LEVEL',
        help='Logging verbosity: DEBUG, INFO, WARNING, ERROR (default: INFO)',
    )
    return parser.parse_args()


def main():
    args = parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        stream=sys.stderr,
        format="%(levelname)s %(message)s",
        force=True,
    )

    all_challenges = load_word_challenges()
    if args.min_usefulness > 1:
        before = len(all_challenges)
        all_challenges = [c for c in all_challenges if c.get('usefulness', 2) >= args.min_usefulness]
        log.info("Filtered by min_usefulness=%d: %d → %d challenges",
                 args.min_usefulness, before, len(all_challenges))
    client, db     = connect_db()

    try:
        users = resolve_user(db, args)
        stats = CreationStats(users_found=len(users))
        log.info("Processing %d user(s)...", len(users))

        for user in users:
            user_id  = str(user['_id'])
            username = user.get('username', user_id)

            try:
                selected, weak_slots = pick_challenges(all_challenges, user, n=args.count)
                doc_id, is_new = upsert_weekly_challenge(db, user_id, selected)
            except Exception as exc:
                log.error("%s — failed: %s", username, exc)
                stats.users_failed += 1
                continue

            if is_new:
                stats.users_created += 1
            else:
                stats.users_replaced += 1
            stats.total_challenges += len(selected)
            if weak_slots:
                stats.users_with_weak_data += 1
                stats.total_weak_slots_used += weak_slots

            words_preview = ', '.join(c.get('port', '') for c in selected[:5])
            action = "inserted" if is_new else "replaced"
            log.info(
                "%s — %s (id=%s, %d words, %d weak: %s...)",
                username, action, doc_id, len(selected), weak_slots, words_preview,
            )

        stats.log_summary()

        # Upsert a global fallback challenge (userId=None) for guest users
        global_selected, _ = pick_challenges(all_challenges, {}, n=args.count)
        upsert_weekly_challenge(db, None, global_selected)
        log.info("Global fallback challenge (userId=null) upserted with %d words.", len(global_selected))

    finally:
        client.close()
        log.info("Done.")


if __name__ == '__main__':
    main()
