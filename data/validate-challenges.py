#!/usr/bin/env python3
"""
Validate data quality for challenges.json

Checks:
1. Each challenge has all required fields (id, port, fr, en, user_usefulness)
2. Each challenge has a valid UUID format for id
3. No duplicate IDs (each UUID must be unique)
4. French translation exists and is not empty
5. English translation exists and is not empty
6. Translation objects have 'translation' and 'note' fields
7. Portuguese word (port) is not empty
8. user_usefulness field exists and is a number
9. Translations are not placeholder value "todo"
10. Optional: Check for duplicate Portuguese words with different translations
"""

import json
import uuid
import sys
import os
from collections import defaultdict

# IDs to exclude from duplicate reporting (legitimate duplicates with different meanings)
EXCLUDED_IDS = [
    '37645200-0320-47e8-9afa-b8f19c2c4935',  # a - to/at
    '643403d9-35e2-49a5-9b41-d9645ad0d40e',  # a - the (fem.)
    '5e38ace0-0a52-4e3a-a0ea-0743b1ca11b8', #como - how
    '866fc6e0-f903-4940-a4dc-d174f485283d', #como - like
    '63d6e4f7-15bd-437b-be6e-5b3193edbe32', #entrada - entrance
    '2e10b04a-30ea-4d26-862f-0c9b9be0d60e',  #wntrada - entree food
    '66fcfa35-190c-419f-b7a3-08a6150e482f', #próximo - prochain
    '0e6811a7-a40f-42ea-abea-213febc6c4af',  #próximo - proche
    'e26e0569-0d2c-4ec3-83a1-a1e5887813d7', #esperar - attendre
    'f17c26dc-7b8f-4b3f-a19e-e2812d08a596',  #esperar - esperer
    '84fe6924-015d-4e27-b566-d7169dc0b90d', #partida - match
    'fbf717ab-0985-4039-b545-ad7dc299e33e',  #partida - depart
    '64629bb7-89dc-41e2-b38a-c5bc43b30cfb', #saber - savoir
    '442e210d-0c1a-4b77-9c5a-28186456f2a9'  #saber - avoir un gout
]


def is_valid_uuid(uuid_string):
    """Check if a string is a valid UUID."""
    try:
        uuid.UUID(uuid_string)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def validate_challenges(filepath):
    """Validate challenges.json data quality."""
    
    print(f"Validating: {filepath}")
    print("=" * 80)
    
    # Load challenges
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            challenges = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ ERROR: Invalid JSON format: {e}")
        return False
    except FileNotFoundError:
        print(f"❌ ERROR: File not found: {filepath}")
        return False
    
    if not isinstance(challenges, list):
        print(f"❌ ERROR: Expected a list of challenges, got {type(challenges)}")
        return False
    
    print(f"Total challenges: {len(challenges)}\n")
    
    # Track issues
    issues = []
    warnings = []
    port_word_map = defaultdict(list)  # Track Portuguese words with different translations
    id_map = defaultdict(list)  # Track duplicate IDs
    
    # Validate each challenge
    for idx, challenge in enumerate(challenges):
        challenge_location = f"Challenge at index {idx}"
        
        # Check if challenge is a dictionary
        if not isinstance(challenge, dict):
            issues.append(f"{challenge_location}: Not a dictionary object")
            continue
        
        # Check required fields
        if 'id' not in challenge:
            issues.append(f"{challenge_location}: Missing 'id' field")
        elif not challenge['id']:
            issues.append(f"{challenge_location}: 'id' field is empty")
        elif not is_valid_uuid(challenge['id']):
            issues.append(f"{challenge_location}: 'id' is not a valid UUID: {challenge['id']}")
        
        if 'port' not in challenge:
            issues.append(f"{challenge_location}: Missing 'port' field")
        elif not challenge['port'] or not str(challenge['port']).strip():
            issues.append(f"{challenge_location}: 'port' field is empty")
        
        if 'user_usefulness' not in challenge:
            issues.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): Missing 'user_usefulness' field")
        elif not isinstance(challenge['user_usefulness'], (int, float)):
            issues.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): 'user_usefulness' should be a number, got {type(challenge['user_usefulness'])}")
        
        if 'fr' not in challenge:
            issues.append(f"{challenge_location}: Missing 'fr' field")
        else:
            # Validate French translation object
            fr_obj = challenge['fr']
            if not isinstance(fr_obj, dict):
                issues.append(f"{challenge_location}: 'fr' should be an object, got {type(fr_obj)}")
            else:
                if 'translation' not in fr_obj:
                    issues.append(f"{challenge_location}: Missing 'fr.translation' field")
                elif not fr_obj['translation'] or not str(fr_obj['translation']).strip():
                    issues.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): French translation is empty")
                elif str(fr_obj['translation']).strip().lower() == 'todo':
                    warnings.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): French translation is placeholder 'todo'")
                
                if 'note' not in fr_obj:
                    warnings.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): Missing 'fr.note' field")
        
        if 'en' not in challenge:
            issues.append(f"{challenge_location}: Missing 'en' field")
        else:
            # Validate English translation object
            en_obj = challenge['en']
            if not isinstance(en_obj, dict):
                issues.append(f"{challenge_location}: 'en' should be an object, got {type(en_obj)}")
            else:
                if 'translation' not in en_obj:
                    issues.append(f"{challenge_location}: Missing 'en.translation' field")
                elif not en_obj['translation'] or not str(en_obj['translation']).strip():
                    issues.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): English translation is empty")
                elif str(en_obj['translation']).strip().lower() == 'todo':
                    warnings.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): English translation is placeholder 'todo'")
                
                if 'note' not in en_obj:
                    warnings.append(f"{challenge_location} (port: '{challenge.get('port', 'N/A')}'): Missing 'en.note' field")
        
        # Track Portuguese words for duplicate detection
        if 'port' in challenge and challenge['port']:
            port_word = challenge['port'].strip().lower()
            en_trans = challenge.get('en', {}).get('translation', '')
            fr_trans = challenge.get('fr', {}).get('translation', '')
            port_word_map[port_word].append({
                'index': idx,
                'id': challenge.get('id', 'N/A'),
                'en': en_trans,
                'fr': fr_trans
            })
        
        # Track IDs for duplicate detection
        if 'id' in challenge and challenge['id']:
            id_map[challenge['id']].append({
                'index': idx,
                'port': challenge.get('port', 'N/A'),
                'en': challenge.get('en', {}).get('translation', 'N/A'),
                'fr': challenge.get('fr', {}).get('translation', 'N/A')
            })
    
    # Check for duplicate IDs (critical error)
    duplicate_ids = {cid: entries for cid, entries in id_map.items() if len(entries) > 1}
    if duplicate_ids:
        print(f"\n❌ CRITICAL: Found {len(duplicate_ids)} duplicate IDs:")
        print("-" * 80)
        for challenge_id, entries in sorted(duplicate_ids.items())[:5]:  # Show first 5
            print(f"\n  ID: {challenge_id} ({len(entries)} occurrences)")
            for entry in entries:
                print(f"    - Index {entry['index']}: port='{entry['port']}', EN='{entry['en']}', FR='{entry['fr']}'")
        if len(duplicate_ids) > 5:
            print(f"\n  ... and {len(duplicate_ids) - 5} more duplicate IDs")
        print("\n  ⚠️  Each ID must be unique! These duplicates must be fixed.")
        issues.append(f"Found {len(duplicate_ids)} duplicate IDs - each ID must be unique!")
    
    # Check for duplicate Portuguese words with different translations, excluding those with IDs in EXCLUDED_IDS
    duplicate_words = {}
    for word, entries in port_word_map.items():
        if len(entries) > 1:
            # Check if any entry has an ID in EXCLUDED_IDS
            has_excluded_id = any(entry['id'] in EXCLUDED_IDS for entry in entries)
            if not has_excluded_id:
                duplicate_words[word] = entries
    
    if duplicate_words:
        print(f"\nℹ️  INFO: Found {len(duplicate_words)} Portuguese words with multiple entries:")
        print("-" * 80)
        for word, entries in sorted(duplicate_words.items())[:10]:  # Show first 10
            print(f"\n  Portuguese: '{word}' ({len(entries)} entries)")
            for entry in entries[:3]:  # Show first 3 entries per word
                print(f"    - Index {entry['index']} (ID: {entry['id']}): EN='{entry['en']}', FR='{entry['fr']}'")
            if len(entries) > 3:
                print(f"    ... and {len(entries) - 3} more")
        if len(duplicate_words) > 10:
            print(f"\n  ... and {len(duplicate_words) - 10} more duplicate words")
        print("\n  (This may be intentional for words with multiple meanings)")
    
    # Print results
    print("\n" + "=" * 80)
    print("VALIDATION RESULTS")
    print("=" * 80)
    
    if issues:
        print(f"\n❌ CRITICAL ISSUES ({len(issues)}):")
        print("-" * 80)
        for issue in issues[:50]:  # Show first 50 issues
            print(f"  • {issue}")
        if len(issues) > 50:
            print(f"\n  ... and {len(issues) - 50} more issues")
    
    if warnings:
        print(f"\n⚠️  WARNINGS ({len(warnings)}):")
        print("-" * 80)
        for warning in warnings[:20]:  # Show first 20 warnings
            print(f"  • {warning}")
        if len(warnings) > 20:
            print(f"\n  ... and {len(warnings) - 20} more warnings")
    
    if not issues and not warnings:
        print("\n✅ ALL VALIDATION CHECKS PASSED!")
        print("   • All challenges have required fields")
        print("   • All IDs are valid UUIDs and unique")
        print("   • All French translations are present and non-empty")
        print("   • All English translations are present and non-empty")
        print("   • All Portuguese words are present and non-empty")
        print("   • All user_usefulness fields are present and valid")
    
    print("\n" + "=" * 80)
    print(f"Summary: {len(challenges)} challenges validated")
    print(f"  • Critical Issues: {len(issues)}")
    print(f"  • Warnings: {len(warnings)}")
    print("=" * 80)
    
    return len(issues) == 0


def main():
    """Main entry point."""
    # Default to challenges.json in the same directory as this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_filepath = os.path.join(script_dir, 'challenges.json')
    
    # Allow filepath as command-line argument
    filepath = sys.argv[1] if len(sys.argv) > 1 else default_filepath
    
    is_valid = validate_challenges(filepath)
    
    # Exit with appropriate code
    sys.exit(0 if is_valid else 1)


if __name__ == '__main__':
    main()
