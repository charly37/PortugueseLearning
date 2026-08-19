#!/usr/bin/env python3
"""
Analyze user challenge attempts to identify weaknesses and update user profiles.
Also runs usefulness aggregation. Invoked directly by the Kubernetes CronJob.
"""

import logging
import os
import sys
import re
import argparse
import subprocess
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, Any, Set
from pymongo import MongoClient

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# UUID regex pattern
UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)

class WeaknessAnalyzer:
    def __init__(self):
        """Initialize MongoDB connection and load valid challenge IDs."""
        mongodb_uri = os.getenv('MONGODB_URI')
        if not mongodb_uri:
            raise ValueError('MONGODB_URI not found in environment variables')

        self.client = MongoClient(mongodb_uri)
        self.db = self.client.get_default_database()
        self.users_collection = self.db['users']
        self.attempts_collection = self.db['challengeattempts']

        # Load valid challenge UUIDs from MongoDB instead of JSON files
        self.valid_challenge_ids = self._load_valid_challenge_ids()
        log.info("Connected to MongoDB")
        log.info("Loaded %d valid challenge UUIDs", len(self.valid_challenge_ids))

    def _load_valid_challenge_ids(self) -> Set[str]:
        """Load all valid challenge IDs from the challenges collection."""
        valid_ids = set()
        try:
            docs = self.db['challenges'].find({}, {'_id': 1})
            for doc in docs:
                cid = str(doc['_id'])
                if UUID_PATTERN.match(cid):
                    valid_ids.add(cid)
            log.debug("Loaded %d IDs from challenges collection", len(valid_ids))
        except Exception as e:
            log.error("Error loading challenge IDs from MongoDB: %s", e)
        return valid_ids

    def _is_valid_uuid(self, challenge_id: str) -> bool:
        """Check if a challenge ID is a valid UUID."""
        return UUID_PATTERN.match(challenge_id) is not None

    def analyze_user_weaknesses(self, user_id: str, days_back: int = 30) -> Dict[str, Any]:
        """Analyze a user's challenge attempts to identify weaknesses."""
        cutoff_date = datetime.now() - timedelta(days=days_back)
        log.debug("Analyzing user %s from %s onwards", user_id, cutoff_date.strftime('%Y-%m-%d'))

        attempts = list(self.attempts_collection.find({
            'userId': user_id,
            'attemptedAt': {'$gte': cutoff_date}
        }))
        log.debug("Found %d attempts for user %s", len(attempts), user_id)

        if not attempts:
            return {'totalAttempts': 0, 'weakWords': [], 'weakCategories': {}, 'overallAccuracy': 0.0}

        valid_attempts = []
        invalid_count = 0
        for attempt in attempts:
            challenge_id = attempt.get('challengeId', '')
            if self._is_valid_uuid(challenge_id) and challenge_id in self.valid_challenge_ids:
                valid_attempts.append(attempt)
            else:
                invalid_count += 1

        if invalid_count > 0:
            log.warning("User %s: skipped %d attempts with invalid/orphaned challenge IDs", user_id, invalid_count)

        if not valid_attempts:
            return {'totalAttempts': 0, 'weakWords': [], 'weakCategories': {}, 'overallAccuracy': 0.0}

        log.debug("Analyzing %d valid attempts for user %s", len(valid_attempts), user_id)

        word_stats = defaultdict(lambda: {'correct': 0, 'total': 0, 'word': ''})
        category_stats = defaultdict(lambda: {'correct': 0, 'total': 0})

        for attempt in valid_attempts:
            challenge_id = attempt.get('challengeId', '')
            challenge_type = attempt.get('challengeType', 'word')
            correct = attempt.get('correct', False)
            correct_answer = attempt.get('correctAnswer', '')

            word_stats[challenge_id]['total'] += 1
            word_stats[challenge_id]['word'] = correct_answer
            if correct:
                word_stats[challenge_id]['correct'] += 1

            category_stats[challenge_type]['total'] += 1
            if correct:
                category_stats[challenge_type]['correct'] += 1

        weak_words = []
        for word_id, stats in word_stats.items():
            if stats['total'] >= 3:
                accuracy = stats['correct'] / stats['total']
                if accuracy < 0.5:
                    weak_words.append({
                        'challengeId': word_id,
                        'word': stats['word'],
                        'accuracy': round(accuracy * 100, 2),
                        'attempts': stats['total']
                    })

        weak_words.sort(key=lambda x: x['accuracy'])

        weak_categories = {}
        for category, stats in category_stats.items():
            accuracy = stats['correct'] / stats['total'] if stats['total'] > 0 else 0
            weak_categories[category] = {
                'accuracy': round(accuracy * 100, 2),
                'attempts': stats['total']
            }

        total_attempts = len(valid_attempts)
        total_correct = sum(1 for a in valid_attempts if a.get('correct', False))
        overall_accuracy = (total_correct / total_attempts * 100) if total_attempts > 0 else 0

        return {
            'totalAttempts': total_attempts,
            'weakWords': weak_words[:10],  # Top 10 weakest words
            'weakCategories': weak_categories,
            'overallAccuracy': round(overall_accuracy, 2),
            'analyzedAt': datetime.now()
        }

    def update_user_weaknesses(self, user_id: str, weaknesses: Dict[str, Any]) -> bool:
        """Update user document with weakness analysis."""
        try:
            result = self.users_collection.update_one(
                {'_id': user_id},
                {'$set': {'weaknesses': weaknesses, 'weaknessesUpdatedAt': datetime.now()}}
            )
            return result.modified_count > 0 or result.matched_count > 0
        except Exception as e:
            log.error("Error updating user %s: %s", user_id, e)
            return False

    def analyze_all_users(self, days_back: int = 30, min_attempts: int = 10):
        """Analyze weaknesses for all active users."""
        cutoff_date = datetime.now() - timedelta(days=days_back)
        log.info("Analyzing from %s to now", cutoff_date.strftime('%Y-%m-%d %H:%M:%S'))
        log.info("Minimum attempts required: %d", min_attempts)

        total_attempts = self.attempts_collection.count_documents({})
        recent_attempts = self.attempts_collection.count_documents({'attemptedAt': {'$gte': cutoff_date}})
        log.info("Total attempts in database: %d", total_attempts)
        log.info("Recent attempts (last %d days): %d", days_back, recent_attempts)

        active_user_ids = self.attempts_collection.distinct(
            'userId', {'attemptedAt': {'$gte': cutoff_date}}
        )
        log.info("Found %d active users", len(active_user_ids))

        updated_count = 0
        skipped_count = 0

        for user_id in active_user_ids:
            attempt_count = self.attempts_collection.count_documents({
                'userId': user_id,
                'attemptedAt': {'$gte': cutoff_date}
            })

            if attempt_count < min_attempts:
                log.debug("Skipping user %s: only %d attempts (need %d)", user_id, attempt_count, min_attempts)
                skipped_count += 1
                continue

            weaknesses = self.analyze_user_weaknesses(user_id, days_back)

            if self.update_user_weaknesses(user_id, weaknesses):
                updated_count += 1
                log.info("Updated user %s: %d attempts, %d weak words",
                         user_id, weaknesses['totalAttempts'], len(weaknesses['weakWords']))

        log.info("Analysis complete: updated=%d, skipped=%d (insufficient attempts)",
                 updated_count, skipped_count)

    def close(self):
        """Close MongoDB connection."""
        self.client.close()
        log.debug("MongoDB connection closed")


def main():
    parser = argparse.ArgumentParser(
        description='Analyze user weaknesses and aggregate usefulness votes.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='Example: python analyze_weaknesses.py --days-back 30 --min-attempts 10'
    )
    parser.add_argument('--days-back', type=int, default=30,
                        help='Number of days to look back for analysis (default: 30)')
    parser.add_argument('--min-attempts', type=int, default=10,
                        help='Minimum number of attempts required for user analysis (default: 10)')
    parser.add_argument('--log-level', default='INFO',
                        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
                        metavar='LEVEL',
                        help='Logging verbosity: DEBUG, INFO, WARNING, ERROR (default: INFO)')
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        stream=sys.stderr,
        format="%(levelname)s %(message)s",
        force=True,
    )

    log.info("Analytics jobs started")
    try:
        analyzer = WeaknessAnalyzer()
        analyzer.analyze_all_users(days_back=args.days_back, min_attempts=args.min_attempts)
        analyzer.close()
        log.info("Weakness analysis completed successfully")
    except Exception as e:
        log.error("Weakness analysis failed: %s", e)
    log.info("Analytics jobs completed")


if __name__ == '__main__':
    main()
