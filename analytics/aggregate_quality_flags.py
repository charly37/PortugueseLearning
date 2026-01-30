#!/usr/bin/env python3
"""
Aggregate user quality flags and identify challenges needing review.
This script runs nightly to find challenges flagged by multiple users.
"""

import os
import json
import sys
import argparse
from datetime import datetime
from pymongo import MongoClient
from collections import defaultdict

def load_config():
    """Load MongoDB configuration from environment"""
    mongodb_uri = os.getenv('MONGODB_URI')
    if not mongodb_uri:
        print("Error: MONGODB_URI environment variable not set", file=sys.stderr)
        sys.exit(1)
    return mongodb_uri

def connect_to_mongodb(uri):
    """Connect to MongoDB"""
    try:
        client = MongoClient(uri)
        # Test connection
        client.admin.command('ping')
        print(f"Connected to MongoDB successfully at {datetime.now()}")
        return client
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}", file=sys.stderr)
        sys.exit(1)

def aggregate_quality_flags(db):
    """Aggregate quality flags by challengeId and count occurrences"""
    try:
        # Aggregate pipeline to count flags per challenge
        pipeline = [
            {
                '$group': {
                    '_id': '$challengeId',
                    'flagCount': {'$sum': 1},
                    'userIds': {'$push': '$userId'}
                }
            },
            {
                '$sort': {'flagCount': -1}
            }
        ]
        
        results = db.challengequalityflags.aggregate(pipeline)
        
        flag_aggregates = []
        for result in results:
            challenge_id = result['_id']
            flag_count = result['flagCount']
            flag_aggregates.append({
                'challengeId': challenge_id,
                'flagCount': flag_count,
                'userCount': len(result['userIds'])
            })
        
        print(f"Aggregated quality flags for {len(flag_aggregates)} challenges")
        return flag_aggregates
        
    except Exception as e:
        print(f"Error aggregating quality flags: {e}", file=sys.stderr)
        return []

def load_all_challenges():
    """Load all challenge data from JSON files"""
    base_path = '/app/data'
    challenges_map = {}
    
    # Load word challenges
    try:
        with open(f'{base_path}/challenges.json', 'r', encoding='utf-8') as f:
            word_challenges = json.load(f)
            for challenge in word_challenges:
                challenges_map[challenge['id']] = {
                    'type': 'word',
                    'port': challenge['port'],
                    'fr': challenge['fr']['translation'],
                    'en': challenge['en']['translation']
                }
    except Exception as e:
        print(f"Error loading word challenges: {e}", file=sys.stderr)
    
    # Load verb challenges
    try:
        with open(f'{base_path}/verb-challenges.json', 'r', encoding='utf-8') as f:
            verb_challenges = json.load(f)
            for challenge in verb_challenges:
                challenges_map[challenge['id']] = {
                    'type': 'verb',
                    'port': challenge['port'],
                    'fr': challenge['fr']['translation'],
                    'en': challenge['en']['translation']
                }
    except Exception as e:
        print(f"Error loading verb challenges: {e}", file=sys.stderr)
    
    # Load idiom challenges
    try:
        with open(f'{base_path}/idiom-challenges.json', 'r', encoding='utf-8') as f:
            idiom_challenges = json.load(f)
            for challenge in idiom_challenges:
                challenges_map[challenge['id']] = {
                    'type': 'idiom',
                    'port': challenge['port'],
                    'fr': challenge['fr']['translation'],
                    'en': challenge['en']['translation']
                }
    except Exception as e:
        print(f"Error loading idiom challenges: {e}", file=sys.stderr)
    
    return challenges_map

def report_flagged_challenges(flag_aggregates, challenges_map, min_flags=2):
    """Generate report of challenges with quality issues"""
    print("\n" + "="*80)
    print("QUALITY FLAG REPORT")
    print(f"Generated at: {datetime.now()}")
    print(f"Minimum flags threshold: {min_flags}")
    print("="*80 + "\n")
    
    flagged_count = 0
    for flag_data in flag_aggregates:
        if flag_data['flagCount'] >= min_flags:
            flagged_count += 1
            challenge_id = flag_data['challengeId']
            flag_count = flag_data['flagCount']
            
            # Get challenge details
            challenge_info = challenges_map.get(challenge_id, {})
            challenge_type = challenge_info.get('type', 'unknown')
            port = challenge_info.get('port', 'N/A')
            fr_translation = challenge_info.get('fr', 'N/A')
            en_translation = challenge_info.get('en', 'N/A')
            
            print(f"Challenge ID: {challenge_id}")
            print(f"Type: {challenge_type}")
            print(f"Portuguese: {port}")
            print(f"French: {fr_translation}")
            print(f"English: {en_translation}")
            print(f"Flags: {flag_count} user(s) reported this challenge")
            print("-" * 80)
    
    if flagged_count == 0:
        print("No challenges flagged for review (below threshold).")
    else:
        print(f"\nTotal challenges needing review: {flagged_count}")
    
    print("\n" + "="*80 + "\n")

def reset_quality_flags(db):
    """Reset (remove) all quality flags from the database"""
    print("\n" + "="*80)
    print("RESETTING ALL QUALITY FLAGS")
    print(f"Time: {datetime.now()}")
    print("="*80 + "\n")
    
    try:
        # Delete all quality flags
        result = db.challengequalityflags.delete_many({})
        deleted_count = result.deleted_count
        
        if deleted_count > 0:
            print(f"✓ Successfully removed {deleted_count} quality flag(s)")
        else:
            print(f"⚠ No quality flags found in database")
        
    except Exception as e:
        print(f"✗ Error resetting quality flags: {e}", file=sys.stderr)
    
    print("\n" + "="*80 + "\n")

def main():
    """Main execution"""
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description='Aggregate quality flags and identify challenges needing review',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Generate quality flag report
  python3 aggregate_quality_flags.py
  
  # Reset all quality flags after fixing challenges
  python3 aggregate_quality_flags.py --reset
  
  # Reset all flags and generate report
  python3 aggregate_quality_flags.py --reset --report
        '''
    )
    
    parser.add_argument(
        '--reset',
        action='store_true',
        help='Reset (remove) all quality flags from the database'
    )
    
    parser.add_argument(
        '--report',
        action='store_true',
        help='Generate quality flag report (default if no --reset provided)'
    )
    
    args = parser.parse_args()
    
    # Determine what actions to take
    should_reset = args.reset
    should_report = args.report or not should_reset  # Default to report if no reset
    
    print("Starting quality flag management...")
    
    # Load configuration
    mongodb_uri = load_config()
    
    # Connect to MongoDB
    client = connect_to_mongodb(mongodb_uri)
    db = client.get_database()  # Uses default database from URI
    
    # Reset flags if requested
    if should_reset:
        reset_quality_flags(db)
    
    # Generate report if requested
    if should_report:
        # Aggregate quality flags
        flag_aggregates = aggregate_quality_flags(db)
        
        # Load all challenges data
        challenges_map = load_all_challenges()
        
        # Generate report
        report_flagged_challenges(flag_aggregates, challenges_map, min_flags=1)
    
    # Close connection
    client.close()
    print("Quality flag management complete")

if __name__ == '__main__':
    main()
