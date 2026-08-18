"""
Shared MongoDB helpers for all Python scripts that read/write challenge data.
"""

import os
import sys
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database


def get_db() -> tuple[MongoClient, Database]:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("ERROR: MONGODB_URI environment variable not set.")
    client = MongoClient(uri)
    client.admin.command("ping")  # fail fast if unreachable
    return client, client.get_default_database()


def get_challenges_collection() -> tuple[MongoClient, Collection]:
    client, db = get_db()
    return client, db["challenges"]


def challenges_as_list(collection: Collection, challenge_type: str | None = None) -> list[dict]:
    """
    Return challenges as plain dicts with 'id' mapped from '_id',
    matching the shape the original JSON files had.
    """
    query = {"type": challenge_type} if challenge_type else {}
    docs = list(collection.find(query))
    for doc in docs:
        doc["id"] = str(doc.pop("_id"))
        doc.pop("type", None)
        doc.pop("schemaVersion", None)
    return docs


def update_challenge_fields(collection: Collection, challenge_id: str, fields: dict) -> None:
    """Update specific fields on a challenge document using dot-notation $set."""
    collection.update_one({"_id": challenge_id}, {"$set": fields})
