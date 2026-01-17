#!/usr/bin/env python3
import json
from collections import defaultdict

# IDs to exclude from duplicate reporting (legitimate duplicates with different meanings)
EXCLUDED_IDS = [
    '37645200-0320-47e8-9afa-b8f19c2c4935',  # a - to/at
    '643403d9-35e2-49a5-9b41-d9645ad0d40e',  # a - the (fem.)
    '5e38ace0-0a52-4e3a-a0ea-0743b1ca11b8', #como - how
    '866fc6e0-f903-4940-a4dc-d174f485283d' #como - like
]

def find_duplicate_challenges(filepath):
    """Find duplicate challenges based on Portuguese word."""
    
    # Load challenges
    with open(filepath, 'r', encoding='utf-8') as f:
        challenges = json.load(f)
    
    # Group by Portuguese word
    word_groups = defaultdict(list)
    for idx, challenge in enumerate(challenges):
        port_word = challenge.get('port', '').strip().lower()
        word_groups[port_word].append({
            'index': idx,
            'id': challenge.get('id'),
            'port': challenge.get('port'),
            'en': challenge.get('en', {}).get('translation'),
            'fr': challenge.get('fr', {}).get('translation')
        })
    
    # Find duplicates and filter out exceptions
    duplicates = {}
    for word, entries in word_groups.items():
        if len(entries) > 1:
            # Filter out entries with excluded IDs
            filtered_entries = [e for e in entries if e['id'] not in EXCLUDED_IDS]
            # Only report as duplicate if there are still 2+ entries after filtering
            if len(filtered_entries) > 1:
                duplicates[word] = filtered_entries
    
    # Report results
    if not duplicates:
        print("✓ No duplicates found!")
        print(f"Total challenges: {len(challenges)}")
        print(f"Unique Portuguese words: {len(word_groups)}")
    else:
        print(f"⚠ Found {len(duplicates)} duplicate Portuguese words:")
        print(f"Total challenges: {len(challenges)}")
        print(f"Unique Portuguese words: {len(word_groups)}")
        print("\n" + "="*80)
        
        for word, entries in sorted(duplicates.items()):
            print(f"\nPortuguese word: '{word}' ({len(entries)} occurrences)")
            print("-" * 80)
            for entry in entries:
                print(f"  Index: {entry['index']}")
                print(f"  ID: {entry['id']}")
                print(f"  Portuguese: {entry['port']}")
                print(f"  English: {entry['en']}")
                print(f"  French: {entry['fr']}")
                print()
    
    return duplicates

if __name__ == '__main__':
    duplicates = find_duplicate_challenges('challenges.json')
