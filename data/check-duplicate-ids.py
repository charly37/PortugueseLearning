#!/usr/bin/env python3
import json
import uuid
import sys
from collections import defaultdict

def check_duplicate_ids(filepath):
    """Check for duplicate UUIDs in challenges.json."""
    
    # Load challenges
    with open(filepath, 'r', encoding='utf-8') as f:
        challenges = json.load(f)
    
    # Group by ID
    id_groups = defaultdict(list)
    for idx, challenge in enumerate(challenges):
        challenge_id = challenge.get('id')
        id_groups[challenge_id].append({
            'index': idx,
            'id': challenge_id,
            'port': challenge.get('port'),
            'en': challenge.get('en', {}).get('translation'),
            'fr': challenge.get('fr', {}).get('translation')
        })
    
    # Find duplicates
    duplicates = {cid: entries for cid, entries in id_groups.items() if len(entries) > 1}
    
    # Report results
    print(f"Total challenges: {len(challenges)}")
    print(f"Unique IDs: {len(id_groups)}")
    
    if not duplicates:
        print("\n✓ No duplicate IDs found! All UUIDs are unique.")
    else:
        print(f"\n⚠ CRITICAL: Found {len(duplicates)} duplicate IDs:")
        print("="*80)
        
        for challenge_id, entries in sorted(duplicates.items()):
            print(f"\nID: {challenge_id} ({len(entries)} occurrences)")
            print("-" * 80)
            for entry in entries:
                print(f"  Index: {entry['index']}")
                print(f"  Portuguese: {entry['port']}")
                print(f"  English: {entry['en']}")
                print(f"  French: {entry['fr']}")
                print()
        
        print("\n⚠ These duplicate IDs should be fixed immediately!")
        print("Run: python3 check-duplicate-ids.py fix")
    
    return duplicates, challenges

def fix_duplicate_ids(filepath, duplicates, challenges):
    """Fix duplicate UUIDs by regenerating them for all but the first occurrence."""
    
    if not duplicates:
        print("✓ No duplicate IDs found! Nothing to fix.")
        return False
    
    print(f"\nRegenerating IDs for duplicate entries (keeping first occurrence)...\n")
    
    fixed_count = 0
    for challenge_id, entries in duplicates.items():
        # Keep the first occurrence, regenerate for the rest
        for entry in entries[1:]:
            idx = entry['index']
            old_id = challenges[idx]['id']
            new_id = str(uuid.uuid4())
            challenges[idx]['id'] = new_id
            fixed_count += 1
            print(f"Index {idx}: '{challenges[idx]['port']}'")
            print(f"  Old ID: {old_id}")
            print(f"  New ID: {new_id}\n")
    
    # Write back to file
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(challenges, f, indent=4, ensure_ascii=False)
    
    print(f"✓ Fixed {fixed_count} duplicate IDs")
    print(f"✓ Updated {filepath}")
    
    return True

if __name__ == '__main__':
    filepath = 'challenges.json'
    
    # Check if fix mode is requested
    fix_mode = len(sys.argv) > 1 and sys.argv[1] == 'fix'
    
    # Check for duplicates
    duplicates, challenges = check_duplicate_ids(filepath)
    
    if fix_mode and duplicates:
        print("\n" + "="*80)
        print("FIX MODE")
        print("="*80)
        fix_duplicate_ids(filepath, duplicates, challenges)
        exit(0)
    
    exit(1 if duplicates else 0)
