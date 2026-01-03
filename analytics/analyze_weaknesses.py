#!/usr/bin/env python3
"""
Analyze user challenge attempts to identify weaknesses and update user profiles.
Runs as a scheduled batch job.
"""

import os
import sys
import json
import re
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Any, Set
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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
        
        # Load valid challenge UUIDs from JSON files
        self.valid_challenge_ids = self._load_valid_challenge_ids()
        print(f"[{datetime.now()}] Connected to MongoDB")
        print(f"[{datetime.now()}] Loaded {len(self.valid_challenge_ids)} valid challenge UUIDs")
    
    def _load_valid_challenge_ids(self) -> Set[str]:
        """Load all valid challenge IDs from JSON files."""
        valid_ids = set()
        data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        
        challenge_files = [
            'challenges.json',
            'idiom-challenges.json',
            'verb-challenges.json'
        ]
        
        for filename in challenge_files:
            filepath = os.path.join(data_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    challenges = json.load(f)
                    for challenge in challenges:
                        if 'id' in challenge and UUID_PATTERN.match(challenge['id']):
                            valid_ids.add(challenge['id'])
                    print(f"  Loaded {len([c for c in challenges if 'id' in c])} IDs from {filename}")
            except FileNotFoundError:
                print(f"  Warning: {filename} not found", file=sys.stderr)
            except json.JSONDecodeError as e:
                print(f"  Error parsing {filename}: {e}", file=sys.stderr)
        
        return valid_ids
    
    def _is_valid_uuid(self, challenge_id: str) -> bool:
        """Check if a challenge ID is a valid UUID."""
        return UUID_PATTERN.match(challenge_id) is not None
    
    def analyze_user_weaknesses(self, user_id: str, days_back: int = 30) -> Dict[str, Any]:
        """
        Analyze a user's challenge attempts to identify weaknesses.
        
        Args:
            user_id: MongoDB ObjectId as string
            days_back: Number of days to look back for analysis
            
        Returns:
            Dictionary containing weakness analysis
        """
        cutoff_date = datetime.now() - timedelta(days=days_back)
        print(f"  Analyzing user {user_id} from {cutoff_date.strftime('%Y-%m-%d')} onwards")
        print(f"  User ID type: {type(user_id)}")
        
        # Fetch user's attempts
        attempts = list(self.attempts_collection.find({
            'userId': user_id,
            'attemptedAt': {'$gte': cutoff_date}
        }))
        print(f"  Found {len(attempts)} attempts for user {user_id}")
        
        if not attempts:
            return {
                'totalAttempts': 0,
                'weakWords': [],
                'weakCategories': {},
                'overallAccuracy': 0.0
            }
        
        # Filter valid attempts (must have valid UUID challenge ID)
        valid_attempts = []
        invalid_count = 0
        for attempt in attempts:
            challenge_id = attempt.get('challengeId', '')
            if self._is_valid_uuid(challenge_id) and challenge_id in self.valid_challenge_ids:
                valid_attempts.append(attempt)
            else:
                invalid_count += 1
        
        if invalid_count > 0:
            print(f"  Warning: Skipped {invalid_count} attempts with invalid/orphaned challenge IDs")
        
        if not valid_attempts:
            return {
                'totalAttempts': 0,
                'weakWords': [],
                'weakCategories': {},
                'overallAccuracy': 0.0
            }
        
        print(f"  Analyzing {len(valid_attempts)} valid attempts")
        
        # Track statistics per word/phrase
        word_stats = defaultdict(lambda: {'correct': 0, 'total': 0, 'word': ''})
        category_stats = defaultdict(lambda: {'correct': 0, 'total': 0})
        
        for attempt in valid_attempts:
            challenge_id = attempt.get('challengeId', '')
            challenge_type = attempt.get('challengeType', 'word')
            correct = attempt.get('correct', False)
            correct_answer = attempt.get('correctAnswer', '')
            
            # Track per word
            word_stats[challenge_id]['total'] += 1
            word_stats[challenge_id]['word'] = correct_answer
            if correct:
                word_stats[challenge_id]['correct'] += 1
            
            # Track per category
            category_stats[challenge_type]['total'] += 1
            if correct:
                category_stats[challenge_type]['correct'] += 1
        
        # Calculate weak words (accuracy < 50% and attempted at least 3 times)
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
        
        # Sort by lowest accuracy
        weak_words.sort(key=lambda x: x['accuracy'])
        
        # Calculate category accuracies
        weak_categories = {}
        for category, stats in category_stats.items():
            accuracy = stats['correct'] / stats['total'] if stats['total'] > 0 else 0
            weak_categories[category] = {
                'accuracy': round(accuracy * 100, 2),
                'attempts': stats['total']
            }
        
        # Overall accuracy
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
        """
        Update user document with weakness analysis.
        
        Args:
            user_id: MongoDB ObjectId as string
            weaknesses: Dictionary containing weakness data
            
        Returns:
            True if update successful
        """
        try:
            result = self.users_collection.update_one(
                {'_id': user_id},
                {
                    '$set': {
                        'weaknesses': weaknesses,
                        'weaknessesUpdatedAt': datetime.now()
                    }
                }
            )
            return result.modified_count > 0 or result.matched_count > 0
        except Exception as e:
            print(f"Error updating user {user_id}: {e}")
            return False
    
    def analyze_all_users(self, days_back: int = 30, min_attempts: int = 10):
        """
        Analyze weaknesses for all active users.
        
        Args:
            days_back: Number of days to look back for analysis
            min_attempts: Minimum attempts required to run analysis
        """
        cutoff_date = datetime.now() - timedelta(days=days_back)
        print(f"[{datetime.now()}] Analyzing from {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')} to now")
        print(f"[{datetime.now()}] Minimum attempts required: {min_attempts}")
        
        # Check total attempts in database
        total_attempts = self.attempts_collection.count_documents({})
        recent_attempts = self.attempts_collection.count_documents({'attemptedAt': {'$gte': cutoff_date}})
        print(f"[{datetime.now()}] Total attempts in database: {total_attempts}")
        print(f"[{datetime.now()}] Recent attempts (last {days_back} days): {recent_attempts}")
        
        # Find users with recent activity
        active_user_ids = self.attempts_collection.distinct(
            'userId',
            {'attemptedAt': {'$gte': cutoff_date}}
        )
        
        print(f"[{datetime.now()}] Found {len(active_user_ids)} active users")
        print(f"[{datetime.now()}] Active user IDs: {active_user_ids}")
        
        updated_count = 0
        skipped_count = 0
        
        for user_id in active_user_ids:
            # Check if user has minimum attempts
            attempt_count = self.attempts_collection.count_documents({
                'userId': user_id,
                'attemptedAt': {'$gte': cutoff_date}
            })
            
            if attempt_count < min_attempts:
                print(f"  Skipping user {user_id}: only {attempt_count} attempts (need {min_attempts})")
                skipped_count += 1
                continue
            
            # Analyze weaknesses
            weaknesses = self.analyze_user_weaknesses(user_id, days_back)
            
            # Update user document
            if self.update_user_weaknesses(user_id, weaknesses):
                updated_count += 1
                print(f"  Updated user {user_id}: {weaknesses['totalAttempts']} attempts, "
                      f"{len(weaknesses['weakWords'])} weak words")
        
        print(f"[{datetime.now()}] Analysis complete:")
        print(f"  - Updated: {updated_count} users")
        print(f"  - Skipped: {skipped_count} users (insufficient attempts)")
    
    def close(self):
        """Close MongoDB connection."""
        self.client.close()
        print(f"[{datetime.now()}] MongoDB connection closed")


def main():
    """Main entry point for the script."""
    print(f"[{datetime.now()}] Starting weakness analysis job")
    
    try:
        analyzer = WeaknessAnalyzer()
        
        # Run analysis for last 30 days, minimum 10 attempts
        analyzer.analyze_all_users(days_back=30, min_attempts=10)
        
        analyzer.close()
        print(f"[{datetime.now()}] Job completed successfully")
        sys.exit(0)
        
    except Exception as e:
        print(f"[{datetime.now()}] ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
