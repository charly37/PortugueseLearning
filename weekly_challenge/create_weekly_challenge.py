#!/usr/bin/env python3
"""
Create the weekly challenge content and per-user challenge documents.

For the current week this writes:
  * one language-specific template per supported language
    (``weeklychallenge_templates``, unique on weekStart + language)
  * one personalized challenge per registered user
    (``weeklychallenges``, linked to its template)

Guests and newly registered users get a personal copy of the template from
the API on first access.

Usage:
    python create_weekly_challenge.py --user-id <mongodb_user_id>
    python create_weekly_challenge.py --username <username>
    python create_weekly_challenge.py --all-users   # create for every user

Environment variables:
    MONGODB_URI  - MongoDB connection string (required)
"""

import os
import sys
import logging
import random
import argparse
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from bson import ObjectId

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = ('fr', 'en')
DEFAULT_LANGUAGE = 'fr'
WEEKLY_COLLECTION = 'weeklychallenges'
TEMPLATES_COLLECTION = 'weeklychallenge_templates'


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
    templates_created: int = 0   # templates newly inserted
    templates_replaced: int = 0  # existing templates overwritten

    def log_summary(self) -> None:
        log.info("--- Creation Statistics ---")
        log.info("Templates created    : %d (new)", self.templates_created)
        if self.templates_replaced:
            log.info("Templates replaced   : %d (overwrote existing)", self.templates_replaced)
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

def current_week_bounds() -> tuple:
    """Return (Monday 00:00 UTC of the current week, +7 days)."""
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    return week_start, week_start + timedelta(days=7)


def ensure_template_index(db) -> None:
    """Create the unique (weekStart, language) index used by templates."""
    db[TEMPLATES_COLLECTION].create_index(
        [('weekStart', 1), ('language', 1)],
        unique=True,
        name='templates_week_language_unique',
    )


def load_word_challenges(db) -> list:
    """Load word challenges from the MongoDB challenges collection."""
    docs = list(db['challenges'].find({'type': 'word'}))
    for doc in docs:
        doc['id'] = str(doc.pop('_id'))
        doc.pop('type', None)
        doc.pop('schemaVersion', None)
    log.info("Loaded %d word challenges from MongoDB", len(docs))
    return docs


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


def build_template_doc(language: str, challenges: list, week_start, week_end) -> dict:
    """Build a language-specific weekly template (content only, no progress)."""
    return {
        'weekStart': week_start,
        'weekEnd': week_end,
        'language': language,
        'createdAt': datetime.now(timezone.utc),
        'challenges': [
            {
                'challengeId': c['id'],
                'portuguese': c.get('port', ''),
                'translation_fr': c.get('fr', {}).get('translation', ''),
                'translation_en': c.get('en', {}).get('translation', ''),
            }
            for c in challenges
        ],
        'totalChallenges': len(challenges),
    }


def upsert_template(db, language: str, challenges: list, week_start, week_end) -> tuple:
    """Insert or replace the template for (weekStart, language)."""
    doc = build_template_doc(language, challenges, week_start, week_end)
    collection = db[TEMPLATES_COLLECTION]

    result = collection.replace_one(
        {'weekStart': week_start, 'language': language},
        doc,
        upsert=True,
    )

    if result.upserted_id:
        return str(result.upserted_id), True
    existing = collection.find_one({'weekStart': week_start, 'language': language})
    return (str(existing['_id']) if existing else 'unknown'), False


def build_weekly_challenge_doc(
    user_id: str | None,
    challenges: list,
    *,
    week_start,
    week_end,
    language: str = DEFAULT_LANGUAGE,
    template_id: str | None = None,
) -> dict:
    """Build the per-user weekly challenge document."""
    return {
        'userId': user_id,
        'templateId': template_id,
        'language': language,
        'weekStart': week_start,
        'weekEnd': week_end,
        'createdAt': datetime.now(timezone.utc),
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


def upsert_weekly_challenge(
    db,
    user_id: str | None,
    challenges: list,
    *,
    week_start,
    week_end,
    language: str = DEFAULT_LANGUAGE,
    template_id: str | None = None,
) -> tuple[str, bool]:
    """
    Insert or replace the weekly challenge for this user for the current week.
    Preserves an already-generated audio block when the word list is unchanged.
    Returns (document_id, was_new_insert).
    """
    doc = build_weekly_challenge_doc(
        user_id,
        challenges,
        week_start=week_start,
        week_end=week_end,
        language=language,
        template_id=template_id,
    )
    collection = db[WEEKLY_COLLECTION]

    existing = collection.find_one({'userId': user_id, 'weekStart': week_start})
    if existing:
        old_ids = [c.get('challengeId') for c in existing.get('challenges', [])]
        new_ids = [c['challengeId'] for c in doc['challenges']]
        if old_ids == new_ids and existing.get('audio'):
            doc['audio'] = existing['audio']

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
    parser.add_argument('--template-languages', nargs='+', choices=list(SUPPORTED_LANGUAGES),
                        default=list(SUPPORTED_LANGUAGES), metavar='LANG',
                        help='Languages to create weekly templates for (default: fr en)')
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
        stream=sys.stdout,
        format="%(levelname)s %(message)s",
        force=True,
    )

    client, db = connect_db()
    all_challenges = load_word_challenges(db)
    if args.min_usefulness > 1:
        before = len(all_challenges)
        all_challenges = [c for c in all_challenges
                          if c.get('user_usefulness', 2) >= args.min_usefulness]
        log.info("Filtered by min_usefulness=%d: %d → %d challenges",
                 args.min_usefulness, before, len(all_challenges))
    if not all_challenges:
        log.error("No challenges available after filtering — aborting.")
        client.close()
        sys.exit(1)

    stats = CreationStats()

    try:
        ensure_template_index(db)
        week_start, week_end = current_week_bounds()

        # Templates are the fallback content for guests/new users, and the
        # language-specific source for the weekly audio lessons.
        template_selection, _ = pick_challenges(all_challenges, {}, n=args.count)
        template_ids: dict[str, tuple[str, str]] = {}
        for tpl_language in args.template_languages:
            tpl_id, tpl_is_new = upsert_template(
                db, tpl_language, template_selection, week_start, week_end
            )
            template_ids[tpl_language] = (tpl_id, tpl_language)
            if tpl_is_new:
                stats.templates_created += 1
            else:
                stats.templates_replaced += 1
            log.info(
                "Template %s — %s (id=%s, %d words)",
                tpl_language, "inserted" if tpl_is_new else "replaced",
                tpl_id, len(template_selection),
            )

        users = resolve_user(db, args)
        stats.users_found = len(users)
        log.info("Processing %d user(s)...", len(users))

        for user in users:
            user_id  = str(user['_id'])
            username = user.get('username', user_id)
            raw_language = str(user.get('preferredLanguage') or '').lower()
            user_language = raw_language if raw_language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
            template_id, template_language = template_ids.get(
                user_language,
                next(iter(template_ids.values())),
            )

            try:
                selected, weak_slots = pick_challenges(all_challenges, user, n=args.count)
                doc_id, is_new = upsert_weekly_challenge(
                    db,
                    user_id,
                    selected,
                    week_start=week_start,
                    week_end=week_end,
                    language=template_language,
                    template_id=template_id,
                )
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
                "%s — %s (id=%s, %d words, %d weak, %s; template=%s: %s...)",
                username, action, doc_id, len(selected), weak_slots,
                template_language, template_id, words_preview,
            )

        stats.log_summary()

    finally:
        client.close()
        log.info("Done.")


if __name__ == '__main__':
    main()
