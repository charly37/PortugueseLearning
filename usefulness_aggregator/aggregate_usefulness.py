#!/usr/bin/env python3
"""
Aggregate user word usefulness votes and update challenges.json
This script runs nightly to calculate average usefulness scores.
"""

import logging
import os
import json
import sys
import argparse
from datetime import datetime
from pymongo import MongoClient
from collections import defaultdict

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

def load_config():
    """Load MongoDB configuration from environment"""
    mongodb_uri = os.getenv('MONGODB_URI')
    if not mongodb_uri:
        log.error("MONGODB_URI environment variable not set")
        sys.exit(1)
    return mongodb_uri

def connect_to_mongodb(uri):
    """Connect to MongoDB"""
    try:
        client = MongoClient(uri)
        # Test connection
        client.admin.command('ping')
        log.info("Connected to MongoDB successfully at %s", datetime.now())
        return client
    except Exception as e:
        log.error("Error connecting to MongoDB: %s", e)
        sys.exit(1)

def aggregate_votes(db):
    """Aggregate votes by challengeId and calculate averages"""
    try:
        # Aggregate pipeline to calculate average usefulness per challenge
        pipeline = [
            {
                '$group': {
                    '_id': '$challengeId',
                    'averageUsefulness': {'$avg': '$usefulness'},
                    'voteCount': {'$sum': 1}
                }
            }
        ]
        
        results = db.userwordvotes.aggregate(pipeline)
        
        vote_aggregates = {}
        for result in results:
            challenge_id = result['_id']
            # Round to nearest integer (1, 2, or 3)
            avg_usefulness = round(result['averageUsefulness'])
            vote_count = result['voteCount']
            vote_aggregates[challenge_id] = {
                'usefulness': avg_usefulness,
                'voteCount': vote_count
            }
        
        log.info("Aggregated votes for %d challenges", len(vote_aggregates))
        return vote_aggregates
        
    except Exception as e:
        log.error("Error aggregating votes: %s", e)
        return {}

def update_challenge_file(file_path, vote_aggregates, min_votes=1):
    """Update a challenge JSON file with aggregated usefulness scores"""
    try:
        # Read the challenge file
        with open(file_path, 'r', encoding='utf-8') as f:
            challenges = json.load(f)
        
        updates_count = 0
        for challenge in challenges:
            challenge_id = challenge.get('id')
            if challenge_id in vote_aggregates:
                vote_data = vote_aggregates[challenge_id]
                # Only update if we have minimum votes threshold
                if vote_data['voteCount'] >= min_votes:
                    challenge['user_usefulness'] = vote_data['usefulness']
                    updates_count += 1
        
        # Write back to file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(challenges, f, ensure_ascii=False, indent=4)
        
        log.info("Updated %d challenges in %s", updates_count, file_path)
        return updates_count
        
    except Exception as e:
        log.error("Error updating challenge file %s: %s", file_path, e)
        return 0

def main():
    """Main execution function"""
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='Aggregate user word usefulness votes and update challenge JSON files.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='Example: python aggregate_usefulness.py --min-votes 3'
    )
    
    parser.add_argument(
        '--min-votes',
        type=int,
        default=1,
        help='Minimum number of votes required to update a challenge (default: 1)'
    )
    
    parser.add_argument(
        '--data-dir',
        type=str,
        default='../data',
        help='Directory containing challenge JSON files (default: ../data)'
    )

    parser.add_argument(
        '--log-level',
        default='INFO',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        metavar='LEVEL',
        help='Logging verbosity: DEBUG, INFO, WARNING, ERROR (default: INFO)',
    )
    
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        stream=sys.stderr,
        format="%(levelname)s %(message)s",
        force=True,
    )

    log.info("Starting Usefulness Aggregation at %s", datetime.now())
    log.debug("Parameters: min_votes=%d, data_dir=%s", args.min_votes, args.data_dir)
    
    # Load configuration
    mongodb_uri = load_config()
    
    # Connect to MongoDB
    client = connect_to_mongodb(mongodb_uri)
    db = client.get_database()
    
    # Aggregate votes
    vote_aggregates = aggregate_votes(db)
    
    if not vote_aggregates:
        log.warning("No votes found to aggregate")
        client.close()
        return
    
    # Update challenge files
    data_dir = os.path.join(os.path.dirname(__file__), args.data_dir)
    challenge_files = [
        os.path.join(data_dir, 'challenges.json'),
        os.path.join(data_dir, 'verb-challenges.json'),
        os.path.join(data_dir, 'idiom-challenges.json')
    ]
    
    total_updates = 0
    for file_path in challenge_files:
        if os.path.exists(file_path):
            updates = update_challenge_file(file_path, vote_aggregates, min_votes=args.min_votes)
            total_updates += updates
        else:
            log.warning("File not found: %s", file_path)
    
    log.info("Total updates across all files: %d", total_updates)
    log.info("Usefulness Aggregation complete at %s", datetime.now())
    
    # Close connection
    client.close()

if __name__ == "__main__":
    main()

