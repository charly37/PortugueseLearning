#!/usr/bin/env python3
"""
Aggregate user word usefulness votes and update the challenges MongoDB collection.
This script runs nightly to calculate average usefulness scores.
"""

import logging
import os
import sys
import argparse
from datetime import datetime
from pymongo import MongoClient

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

def update_challenges_in_db(challenges_collection, vote_aggregates, min_votes=1):
    """Update user_usefulness on challenge documents that have enough votes."""
    updates_count = 0
    for challenge_id, vote_data in vote_aggregates.items():
        if vote_data['voteCount'] >= min_votes:
            result = challenges_collection.update_one(
                {'_id': challenge_id},
                {'$set': {'user_usefulness': vote_data['usefulness']}}
            )
            if result.matched_count:
                updates_count += 1
            else:
                log.debug("Challenge %s not found in collection", challenge_id)
    log.info("Updated %d challenge documents", updates_count)
    return updates_count

def main():
    """Main execution function"""
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='Aggregate user word usefulness votes and update the challenges MongoDB collection.',
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
    log.debug("Parameters: min_votes=%d", args.min_votes)
    
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
    
    # Update challenge documents in MongoDB
    total_updates = update_challenges_in_db(db['challenges'], vote_aggregates, min_votes=args.min_votes)
    
    log.info("Total updates: %d", total_updates)
    log.info("Usefulness Aggregation complete at %s", datetime.now())
    
    # Close connection
    client.close()

if __name__ == "__main__":
    main()

