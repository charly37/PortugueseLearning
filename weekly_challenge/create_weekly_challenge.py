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
import random
import argparse
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson import ObjectId


# ── helpers ────────────────────────────────────────────────────────────────────

def load_word_challenges() -> list:
    """Load word challenges from the JSON file relative to this script."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(script_dir, '..', 'data', 'challenges.json')
    data_path = os.path.normpath(data_path)

    if not os.path.exists(data_path):
        raise FileNotFoundError(f"challenges.json not found at {data_path}")

    with open(data_path, 'r', encoding='utf-8') as f:
        challenges = json.load(f)

    print(f"[{datetime.now()}] Loaded {len(challenges)} word challenges from {data_path}")
    return challenges


def connect_db():
    """Return (client, db) using MONGODB_URI from environment."""
    mongodb_uri = os.getenv('MONGODB_URI')
    if not mongodb_uri:
        raise ValueError("MONGODB_URI environment variable is not set")

    client = MongoClient(mongodb_uri)
    db = client.get_default_database()
    print(f"[{datetime.now()}] Connected to MongoDB")
    return client, db


def pick_challenges(all_challenges: list, user_doc: dict, n: int = 20) -> list:
    """
    Select *n* challenges, biasing towards the user's weak words when available.
    Falls back to pure random selection when weakness data is absent.
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
    return selected[:n]


def build_weekly_challenge_doc(user_id: str, challenges: list) -> dict:
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


def upsert_weekly_challenge(db, user_id: str, challenges: list) -> str:
    """
    Insert or replace the weekly challenge for this user for the current week.
    Returns the document _id as a string.
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
        return str(result.upserted_id)
    # For replaced documents pymongo doesn't return the id directly; query it
    existing = collection.find_one({'userId': user_id, 'weekStart': doc['weekStart']})
    return str(existing['_id']) if existing else 'unknown'


def resolve_user(db, args) -> list:
    """
    Return a list of user documents matching the CLI arguments.
    Supports --user-id, --username, or --all-users.
    """
    users_col = db['users']

    if args.all_users:
        users = list(users_col.find({}))
        if not users:
            print("No users found in the database.", file=sys.stderr)
        return users

    if args.user_id:
        try:
            oid = ObjectId(args.user_id)
        except Exception:
            print(f"Invalid ObjectId: {args.user_id}", file=sys.stderr)
            sys.exit(1)
        user = users_col.find_one({'_id': oid})
        if not user:
            print(f"User with id '{args.user_id}' not found.", file=sys.stderr)
            sys.exit(1)
        return [user]

    if args.username:
        user = users_col.find_one({'username': args.username})
        if not user:
            print(f"User '{args.username}' not found.", file=sys.stderr)
            sys.exit(1)
        return [user]

    # Should not reach here due to argparse mutual exclusion
    print("Provide --user-id, --username, or --all-users.", file=sys.stderr)
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
    return parser.parse_args()


def main():
    args = parse_args()

    all_challenges = load_word_challenges()
    client, db     = connect_db()

    try:
        users = resolve_user(db, args)
        print(f"[{datetime.now()}] Processing {len(users)} user(s)…")

        for user in users:
            user_id  = str(user['_id'])
            username = user.get('username', user_id)

            selected = pick_challenges(all_challenges, user, n=args.count)
            doc_id   = upsert_weekly_challenge(db, user_id, selected)

            words_preview = ', '.join(c.get('port', '') for c in selected[:5])
            print(
                f"  ✓ {username} — weekly challenge created "
                f"(id={doc_id}, {len(selected)} words: {words_preview}…)"
            )

    finally:
        client.close()
        print(f"[{datetime.now()}] Done.")


if __name__ == '__main__':
    main()
