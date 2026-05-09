#!/usr/bin/env python3
"""
Validate data quality for challenges.json

Level 1 - JSON Schema (challenges.schema.json):
  Structural validation: required fields, types, UUID format, date patterns,
  minLength constraints, and unknown field detection (additionalProperties: false).

Level 2 - Custom Python checks (not expressible in JSON Schema):
  - No duplicate IDs
  - No unexpected duplicate Portuguese words
  - Translations are not placeholder value "todo"
  - fr.note and en.note fields are present
"""

import json
import jsonschema
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
    '442e210d-0c1a-4b77-9c5a-28186456f2a9',  #saber - avoir un gout
    '65aa69b8-76bf-46a4-9106-f1412fbaaa23', #patient - malade
    '8373574d-ebc9-4c91-9d22-6d62e4b4ab6d'  #patient - calme
]


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
    
    # --- Level 1: JSON Schema validation ---
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'challenges.schema.json')
    try:
        with open(schema_path, 'r', encoding='utf-8') as f:
            schema = json.load(f)
    except FileNotFoundError:
        print(f"❌ ERROR: Schema file not found: {schema_path}")
        return False
    
    print("Running schema validation...")
    validator = jsonschema.Draft7Validator(schema, format_checker=jsonschema.FormatChecker())
    schema_errors = sorted(validator.iter_errors(challenges), key=lambda e: list(e.absolute_path))
    
    if schema_errors:
        print(f"\n❌ Schema validation failed with {len(schema_errors)} error(s):")
        print("-" * 80)
        for error in schema_errors[:20]:
            path = ' -> '.join(str(p) for p in error.absolute_path) or '(root)'
            print(f"  • [{path}]: {error.message}")
            issues.append(f"[Schema] {path}: {error.message}")
        if len(schema_errors) > 20:
            print(f"\n  ... and {len(schema_errors) - 20} more schema errors")
        print("\n" + "=" * 80)
        print(f"Summary: {len(challenges)} challenges validated")
        print(f"  • Critical Issues: {len(issues)}")
        print(f"  • Warnings: 0")
        print("=" * 80)
        return False
    
    print("✅ Schema validation passed\n")
    
    # --- Level 2: Custom checks (not expressible in JSON Schema) ---
    for idx, challenge in enumerate(challenges):
        challenge_location = f"Challenge at index {idx}"
        port = challenge['port']
        fr_trans = challenge['fr'].get('translation', '')
        en_trans = challenge['en'].get('translation', '')
        
        # Warn on "todo" placeholder translations
        if str(fr_trans).strip().lower() == 'todo':
            warnings.append(f"{challenge_location} (port: '{port}'): French translation is placeholder 'todo'")
        if str(en_trans).strip().lower() == 'todo':
            warnings.append(f"{challenge_location} (port: '{port}'): English translation is placeholder 'todo'")
        
        # Warn on missing notes (optional field, but expected)
        if 'note' not in challenge['fr']:
            warnings.append(f"{challenge_location} (port: '{port}'): Missing 'fr.note' field")
        if 'note' not in challenge['en']:
            warnings.append(f"{challenge_location} (port: '{port}'): Missing 'en.note' field")
        
        # Track Portuguese words for duplicate detection
        port_word = port.strip().lower()
        port_word_map[port_word].append({
            'index': idx,
            'id': challenge['id'],
            'en': en_trans,
            'fr': fr_trans
        })
        
        # Track IDs for duplicate detection
        id_map[challenge['id']].append({
            'index': idx,
            'port': port,
            'en': en_trans,
            'fr': fr_trans
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
        print("   • Schema validation passed (structure, types, formats, unknown fields)")
        print("   • All IDs are valid UUIDs and unique")
        print("   • No unexpected duplicate Portuguese words")
        print("   • No placeholder 'todo' translations")
        print("   • All fr.note and en.note fields are present")
    
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
