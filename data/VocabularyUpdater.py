# TODO: Language awareness for DB flags
#   Currently, quality flags stored in MongoDB have no language field — they only record
#   the challengeId. This means that when a user flags a challenge (e.g. because the French
#   translation is wrong), running the script with --language en will still prioritize and
#   process that challenge in English, then clear the flag without fixing French.
#   Fix: store the user's active language in the flag document at flag creation time
#   (in the app), then filter prioritized flags by the current --language argument here,
#   and only clear flags matching that language.

import argparse
import json
import os
from openai import OpenAI
from pydantic import BaseModel
from typing import Dict, List
from datetime import datetime, timedelta

from pymongo import MongoClient

class WordTranslation(BaseModel):
    translation_accurate: bool
    target_translation: str
    target_example: str
    target_remark: str
    portuguese_word: str
    portuguese_example: str

# Initialize OpenAI client
api_key = os.environ.get('OPEN_AI_KEY')
if not api_key:
    print("ERROR: OPEN_AI_KEY environment variable not set!")
    exit(1)

client = OpenAI(api_key=api_key)

def load_challenges() -> List[Dict]:
    """Load challenges from challenges.json"""
    with open('challenges.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def save_challenges(challenges: List[Dict]):
    """Save challenges back to challenges.json"""
    with open('challenges.json', 'w', encoding='utf-8') as f:
        json.dump(challenges, f, ensure_ascii=False, indent=4)

def is_translation_recent(challenge, language, months=6):
    """
    Check if a challenge's translation was updated recently.
    
    Args:
        challenge: Challenge dictionary object
        language: Language key to check (e.g. 'fr', 'en')
        months: Number of months to consider translation as "recent" (default: 6)
    
    Returns:
        True if translation exists and was updated within the last 'months' months
    """
    fr_section = challenge.get(language)
    if not fr_section:
        return False
    
    last_update = fr_section.get('last_update')
    if not last_update:
        return False
    
    try:
        # Parse the last_update date (format: YYYY-MM-DD)
        update_date = datetime.strptime(last_update, "%Y-%m-%d")
        
        # Calculate the cutoff date (today - months)
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        
        # Translation is recent if it was updated after the cutoff date
        return update_date >= cutoff_date
    except (ValueError, TypeError):
        # If date parsing fails, consider translation as not recent
        return False

def get_flagged_challenge_ids(mongodb_uri: str, min_flags: int = 1) -> List[str]:
    """
    Connect to MongoDB and return word challenge IDs flagged by users,
    ordered by flag count descending.
    """
    try:
        mongo_client = MongoClient(mongodb_uri)
        mongo_client.admin.command('ping')
        db = mongo_client.get_database()
        pipeline = [
            {
                '$group': {
                    '_id': '$challengeId',
                    'flagCount': {'$sum': 1}
                }
            },
            {
                '$match': {'flagCount': {'$gte': min_flags}}
            },
            {
                '$sort': {'flagCount': -1}
            }
        ]
        results = list(db.challengequalityflags.aggregate(pipeline))
        mongo_client.close()
        flagged_ids = [r['_id'] for r in results]
        print(f"Found {len(flagged_ids)} flagged challenge(s) in DB (min_flags={min_flags})")
        return flagged_ids
    except Exception as e:
        print(f"⚠️  Could not fetch flagged challenges from MongoDB: {e}")
        return []


def clear_quality_flags(mongodb_uri: str, challenge_ids: List[str]):
    """
    Delete quality flags from MongoDB for the given challenge IDs.
    Called automatically after processing flagged challenges.
    """
    if not challenge_ids:
        return
    try:
        mongo_client = MongoClient(mongodb_uri)
        db = mongo_client.get_database()
        result = db.challengequalityflags.delete_many({'challengeId': {'$in': challenge_ids}})
        mongo_client.close()
        print(f"🗑️  Cleared {result.deleted_count} quality flag(s) from DB for {len(challenge_ids)} processed challenge(s)")
    except Exception as e:
        print(f"⚠️  Could not clear quality flags from MongoDB: {e}")


def build_prompt(portuguese_word: str, current_translation: str, language: str):
    """Return (system_message, user_prompt) for the given language."""
    if language == "fr":
        system_message = "You are a Portuguese teacher. you teach european portuguese to french speakers. They ask you to translate portuguese words to french. You provide the best French translation and examples in both languages."
        user_prompt = f"""Review this translation from Portuguese word to French and its examples. If you think there is a better translation, state that the translation is not accurate and provide the better one along with examples. If the current translation is accurate, confirm it. You can also provide a short remark of 2 sentence max in french about the Portuguese word, its usage or nuances about its use in the portugues language. This is optional but can be helpful for learners.
        
Portuguese word: "{portuguese_word}"
Current French translation: "{current_translation}"
Current Portuguese example: "{portuguese_word}"
Current French example: "{current_translation}"

Provide:
1. a boolean indicating if the current translation is accurate
2. The best French translation for this Portuguese word (accurate and commonly used)
3. A simple example sentence using the Portuguese word
4. The French translation of that example sentence

Focus on natural, everyday language that beginners can understand."""
    elif language == "en":
        # TODO: write the English-specific prompt
        system_message = "You are a Portuguese teacher. you teach european portuguese to english speakers. They ask you to translate portuguese words to english. You provide the best English translation and examples in both languages."
        user_prompt = f"""Review this translation from Portuguese word to English and its examples. If you think there is a better translation, state that the translation is not accurate and provide the better one along with examples. If the current translation is accurate, confirm it. You can also provide a short remark of 2 sentence max in english about the Portuguese word, its usage or nuances about its use in the portugues language. This is optional but can be helpful for learners.

Portuguese word: "{portuguese_word}"
Current English translation: "{current_translation}"

Provide:
1. a boolean indicating if the current translation is accurate
2. The best English translation for this Portuguese word (accurate and commonly used)
3. A simple example sentence using the Portuguese word
4. The English translation of that example sentence

Focus on natural, everyday language that beginners can understand."""
    else:
        raise ValueError(f"Unsupported language: '{language}'. Supported values are: 'fr', 'en'")

    return system_message, user_prompt


def verify_translation(portuguese_word: str, current_translation: str, language: str) -> Dict:
    """
    Use OpenAI to verify and suggest a translation for a Portuguese word.

    Args:
        portuguese_word: The Portuguese word to translate
        current_translation: The current translation in the target language
        language: Target language key ('fr' or 'en')

    Returns:
        Dictionary with verification results
    """
    try:
        system_message, prompt = build_prompt(portuguese_word, current_translation, language)

        response = client.chat.completions.create(
            model="gpt-5-nano-2025-08-07",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "word_translation",
                    "schema": WordTranslation.model_json_schema()
                }
            }
        )
        
        # Parse the JSON response into WordTranslation object
        result_text = response.choices[0].message.content.strip()
        translation_data = json.loads(result_text)
        translation = WordTranslation(**translation_data)
        
        return {
            "status": "success",
            "translation": translation,
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens
        }
    
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

def main(max_words=300, language="fr", months=6, min_flags=1):
    """
    Main function to process all challenges
    
    Args:
        max_words: Maximum number of words to process in this batch (default: 300)
        language: Language key to update in challenges ('fr' or 'en', default: 'fr')
        months: Number of months before a translation is considered stale and eligible for refresh (default: 6)
    """
    print("Loading challenges.json...")
    challenges = load_challenges()
    print(f"Loaded {len(challenges)} challenges")
    print(f"Language: {language}")
    print(f"Max words to process in this batch: {max_words}")
    print(f"Refresh period: {months} months")

    # Prioritize challenges flagged by users in the DB
    mongodb_uri = os.environ.get('MONGODB_URI')
    if not mongodb_uri:
        print("ERROR: MONGODB_URI environment variable not set!")
        exit(1)

    flagged_id_set = set()
    print("\nChecking MongoDB for user-flagged challenges...")
    flagged_ids = get_flagged_challenge_ids(mongodb_uri, min_flags=min_flags)
    if flagged_ids:
        flagged_id_set = set(flagged_ids)
        flagged_order = {cid: i for i, cid in enumerate(flagged_ids)}
        flagged = sorted(
            [c for c in challenges if c.get('id') in flagged_id_set],
            key=lambda c: flagged_order.get(c.get('id'), 999999)
        )
        non_flagged = [c for c in challenges if c.get('id') not in flagged_id_set]
        challenges = flagged + non_flagged
        print(f"🚩 Prioritized {len(flagged)} flagged challenge(s) at the start of the queue")
    else:
        print("No flagged challenges found. Processing in normal order.")
    print()
    
    # Statistics
    processed_count = 0
    skipped_count = 0
    verified_count = 0
    suggestions_count = 0
    errors_count = 0
    updated_examples_count = 0
    updated_translations_count = 0
    updated_notes_count = 0
    total_tokens = {"prompt": 0, "completion": 0}
    processed_flagged_ids = []
    
    # Process each challenge
    for idx, challenge in enumerate(challenges, 1):
        portuguese_word = challenge.get("port", "")
        current_translation = challenge.get(language, {}).get("translation", "")
        challenge_id = challenge.get("id", "unknown")
        current_note = challenge.get(language, {}).get("note", "")
        
        # Skip if translation was updated within the refresh period
        # but never skip user-flagged challenges — they must be reviewed regardless
        is_flagged = challenge_id in flagged_id_set
        if not is_flagged and is_translation_recent(challenge, language, months=months):
            skipped_count += 1
            continue
        
        # Check if examples need to be populated
        port_exemple = challenge.get(language, {}).get("port_exemple", "")
        lang_exemple = challenge.get(language, {}).get("use_exemple", "")
        needs_examples = not port_exemple or not lang_exemple
        
        print(f"[{idx}/{len(challenges)}] Processing: {portuguese_word}")
        print(f"  Current {language} translation: {current_translation}")
        
        # Verify translation
        verification = verify_translation(
            portuguese_word,
            current_translation,
            language
        )
        
        if verification["status"] == "success":
            translation = verification["translation"]
            
            # Get today's date for tracking updates
            today_date = datetime.now().strftime("%Y-%m-%d")
            
            # Use OpenAI's assessment of translation accuracy
            is_accurate = translation.translation_accurate
            
            print(f"  🔍 Translation Accurate: {translation.translation_accurate}")
            print(f"  � OpenAI {language}: {translation.target_translation}")
            print(f"  🇵🇹 Portuguese: {translation.portuguese_word}")
            print(f"  📝 Portuguese Example: {translation.portuguese_example}")
            print(f"  📝 {language} Example: {translation.target_example}")
            print(f"  💬 Remark: {translation.target_remark}")
            
            total_tokens["prompt"] += verification["prompt_tokens"]
            total_tokens["completion"] += verification["completion_tokens"]
            
            # Track if we made any updates
            made_updates = False
            
            if is_accurate:
                verified_count += 1
                print(f"  ✅ Translation VERIFIED")
            else:
                suggestions_count += 1
                print(f"  ⚠️  SUGGESTED change: '{current_translation}' → '{translation.target_translation}'")
                # Update the translation when it's not accurate
                if language not in challenge:
                    challenge[language] = {}
                challenge[language]["translation"] = translation.target_translation
                updated_translations_count += 1
                made_updates = True
                print(f"  💾 Updated {language} translation in challenges.json")
            
            # Update examples if they are empty
            if needs_examples:
                if language not in challenge:
                    challenge[language] = {}
                challenge[language]["port_exemple"] = translation.portuguese_example
                challenge[language]["use_exemple"] = translation.target_example
                updated_examples_count += 1
                made_updates = True
                print(f"  💾 Updated examples in challenges.json")
            
            # Update note if current note is "todo" and a remark was provided
            if current_note == "todo" and translation.target_remark:
                if language not in challenge:
                    challenge[language] = {}
                challenge[language]["note"] = translation.target_remark
                updated_notes_count += 1
                made_updates = True
                print(f"  💾 Updated note in challenges.json")
            
            # Always update last_update timestamp after processing (even if just verified)
            if language not in challenge:
                challenge[language] = {}
            challenge[language]["last_update"] = today_date
            if made_updates:
                print(f"  🕒 Set last_update: {today_date}")
            
            processed_count += 1
            if challenge_id in flagged_id_set:
                processed_flagged_ids.append(challenge_id)
        else:
            errors_count += 1
            print(f"  ❌ Error: {verification['error']}")
            # Still count errors toward the batch limit
            processed_count += 1
            if challenge_id in flagged_id_set:
                processed_flagged_ids.append(challenge_id)
        
        print()
        
        # Stop if we've reached the maximum number of words to process
        if processed_count >= max_words:
            print(f"\n⚠️  Reached maximum batch limit ({max_words}). Stopping.")
            print(f"Progress: Processed {processed_count} out of {len(challenges)} total challenges")
            break
    
    # Save updated challenges back to file if any were processed
    if processed_count > 0:
        print(f"\n💾 Saving changes to challenges.json...")
        print(f"   - Translations updated: {updated_translations_count}")
        print(f"   - Examples updated: {updated_examples_count}")
        print(f"   - Notes updated: {updated_notes_count}")
        print(f"   - Timestamps updated: {processed_count}")
        save_challenges(challenges)
        print("✅ Saved successfully!")

    # Clean up processed flags from DB
    if processed_flagged_ids:
        print(f"\n🗑️  Cleaning up {len(processed_flagged_ids)} processed flag(s) from DB...")
        clear_quality_flags(mongodb_uri, processed_flagged_ids)
    
    # Print summary
    print("\n" + "="*60)
    print("VERIFICATION SUMMARY")
    print("="*60)
    print(f"Total challenges in file: {len(challenges)}")
    print(f"Skipped (recently updated): {skipped_count}")
    print(f"Processed in this batch: {processed_count}")
    print(f"Verified (correct): {verified_count}")
    print(f"Suggestions (needs improvement): {suggestions_count}")
    print(f"Translations updated: {updated_translations_count}")
    print(f"Examples updated: {updated_examples_count}")
    print(f"Notes updated: {updated_notes_count}")
    print(f"Errors: {errors_count}")
    print(f"Total tokens used: {total_tokens['prompt'] + total_tokens['completion']}")
    print(f"  - Prompt tokens: {total_tokens['prompt']}")
    print(f"  - Completion tokens: {total_tokens['completion']}")
    print("="*60)
    
    if processed_count < len(challenges):
        remaining = len(challenges) - (idx)
        print(f"\n💡 Tip: {remaining} challenges remaining. Run again to continue.")
        print(f"    To process more per batch, modify max_words parameter.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update vocabulary translations in challenges.json")
    parser.add_argument("--language", choices=["fr", "en"], default="fr",
                        help="Language section to update (default: fr)")
    parser.add_argument("--max-words", type=int, default=300,
                        help="Maximum number of words to process per batch (default: 300)")
    parser.add_argument("--months", type=int, default=6,
                        help="Number of months before a translation is considered stale and eligible for refresh (default: 6)")
    parser.add_argument("--min-flags", type=int, default=1,
                        help="Minimum number of user flags to prioritize a challenge (default: 1)")
    args = parser.parse_args()
    main(max_words=args.max_words, language=args.language, months=args.months, min_flags=args.min_flags)