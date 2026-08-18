#!/usr/bin/env python3
"""
One-time seed: imports the 3 challenge JSON files into the MongoDB `challenges` collection.
Safe to re-run — uses upsert so existing documents are updated, not duplicated.

Usage:
    MONGODB_URI=<uri> python data/seed-mongodb.py
    MONGODB_URI=<uri> python data/seed-mongodb.py --dry-run
"""

import json
import os
import sys
import argparse
from pathlib import Path
from pymongo import MongoClient, UpdateOne

DATA_DIR = Path(__file__).resolve().parent

FILES = [
    ("challenges.json",      "word"),
    ("verb-challenges.json", "verb"),
    ("idiom-challenges.json","idiom"),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed MongoDB challenges collection from JSON files.")
    parser.add_argument("--dry-run", action="store_true", help="Parse files and report counts without writing")
    args = parser.parse_args()

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("ERROR: MONGODB_URI environment variable not set.")

    client = MongoClient(uri)
    client.admin.command("ping")
    db = client.get_default_database()
    collection = db["challenges"]
    print(f"Connected to MongoDB: {uri[:40]}...")

    for filename, challenge_type in FILES:
        file_path = DATA_DIR / filename
        if not file_path.exists():
            print(f"WARN: {filename} not found, skipping")
            continue

        with open(file_path, "r", encoding="utf-8") as f:
            items = json.load(f)

        ops = []
        skipped = 0
        for item in items:
            cid = item.get("id")
            if not cid:
                skipped += 1
                continue
            doc = {k: v for k, v in item.items() if k != "id"}
            doc["type"] = challenge_type
            doc["schemaVersion"] = 1
            ops.append(UpdateOne({"_id": cid}, {"$set": doc}, upsert=True))

        if args.dry_run:
            print(f"[{challenge_type}] {filename}: {len(ops)} documents would be upserted, {skipped} skipped")
            continue

        if ops:
            result = collection.bulk_write(ops, ordered=False)
            print(
                f"[{challenge_type}] {filename}: "
                f"{result.upserted_count} inserted, "
                f"{result.modified_count} updated, "
                f"{skipped} skipped (no id)"
            )
        else:
            print(f"[{challenge_type}] {filename}: nothing to do")

    client.close()
    print("Done.")


if __name__ == "__main__":
    main()
