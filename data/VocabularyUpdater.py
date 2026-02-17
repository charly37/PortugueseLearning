import json
import os
from openai import OpenAI
from pydantic import BaseModel
from typing import Dict, List
from datetime import datetime, timedelta

class WordTranslation(BaseModel):
    translation_accurate: bool
    french: str
    french_example: str
    french_remark: str
    portuguese: str
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

def is_translation_recent(challenge, months=6):
    """
    Check if a challenge's French translation was updated recently.
    
    Args:
        challenge: Challenge dictionary object
        months: Number of months to consider translation as "recent" (default: 6)
    
    Returns:
        True if translation exists and was updated within the last 'months' months
    """
    fr_section = challenge.get('fr')
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

def verify_french_translation(portuguese_word: str, current_french: str, english_translation: str) -> Dict:
    """
    Use OpenAI to verify and suggest French translation for a Portuguese word
    
    Args:
        portuguese_word: The Portuguese word to translate
        current_french: The current French translation
        english_translation: The English translation for context
    
    Returns:
        Dictionary with verification results
    """
    try:
        prompt = f"""Review this translation from Portuguese word to French and its examples. If you think there is a better translation, state that the translation is not accurate and provide the better one along with examples. If the current translation is accurate, confirm it. You can also provide a short remark of 2 sentence max in french about the Portuguese word, its usage or nuances. This is optional but can be helpful for learners.

Portuguese word: "{portuguese_word}"
Current French translation: "{current_french}"
Current Portuguese example: "{portuguese_word}"
Current French example: "{current_french}"

Provide:
1. a boolean indicating if the current translation is accurate
2. The best French translation for this Portuguese word (accurate and commonly used)
3. A simple example sentence using the Portuguese word
4. The French translation of that example sentence

Focus on natural, everyday language that beginners can understand."""

        response = client.chat.completions.create(
            model="gpt-5-nano-2025-08-07",
            messages=[
                {"role": "system", "content": "You are a Portuguese teacher. you teach european portuguese to french speakers. They ask you to translate portuguese words to french. You provide the best French translation and examples in both languages."},
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

def main(max_words=10):
    """
    Main function to process all challenges
    
    Args:
        max_words: Maximum number of words to process in this batch (default: 300)
    """
    print("Loading challenges.json...")
    challenges = load_challenges()
    print(f"Loaded {len(challenges)} challenges")
    print(f"Max words to process in this batch: {max_words}\n")
    
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
    
    # Process each challenge
    for idx, challenge in enumerate(challenges, 1):
        portuguese_word = challenge.get("port", "")
        french_translation = challenge.get("fr", {}).get("translation", "")
        english_translation = challenge.get("en", {}).get("translation", "")
        challenge_id = challenge.get("id", "unknown")
        current_note = challenge.get("fr", {}).get("note", "")
        
        # Skip if translation was updated within the last 6 months
        if is_translation_recent(challenge, months=6):
            last_update = challenge.get("fr", {}).get("last_update", "unknown")
            print(f"[{idx}/{len(challenges)}] ⏭️  Skipping '{portuguese_word}' (updated on {last_update})")
            skipped_count += 1
            continue
        
        # Check if examples need to be populated
        port_exemple = challenge.get("fr", {}).get("port_exemple", "")
        fr_exemple = challenge.get("fr", {}).get("fr_exemple", "")
        needs_examples = not port_exemple or not fr_exemple
        
        print(f"[{idx}/{len(challenges)}] Processing: {portuguese_word}")
        print(f"  Current French: {french_translation}")
        
        # Verify translation
        verification = verify_french_translation(
            portuguese_word, 
            french_translation, 
            english_translation
        )
        
        if verification["status"] == "success":
            translation = verification["translation"]
            
            # Get today's date for tracking updates
            today_date = datetime.now().strftime("%Y-%m-%d")
            
            # Use OpenAI's assessment of translation accuracy
            is_accurate = translation.translation_accurate
            
            print(f"  🔍 Translation Accurate: {translation.translation_accurate}")
            print(f"  🇫🇷 OpenAI French: {translation.french}")
            print(f"  🇵🇹 Portuguese: {translation.portuguese}")
            print(f"  📝 Portuguese Example: {translation.portuguese_example}")
            print(f"  📝 French Example: {translation.french_example}")
            print(f"  💬 French Remark: {translation.french_remark}")
            
            total_tokens["prompt"] += verification["prompt_tokens"]
            total_tokens["completion"] += verification["completion_tokens"]
            
            # Track if we made any updates
            made_updates = False
            
            if is_accurate:
                verified_count += 1
                print(f"  ✅ Translation VERIFIED")
            else:
                suggestions_count += 1
                print(f"  ⚠️  SUGGESTED change: '{french_translation}' → '{translation.french}'")
                # Update the French translation when it's not accurate
                if "fr" not in challenge:
                    challenge["fr"] = {}
                challenge["fr"]["translation"] = translation.french
                updated_translations_count += 1
                made_updates = True
                print(f"  💾 Updated French translation in challenges.json")
            
            # Update examples if they are empty
            if needs_examples:
                if "fr" not in challenge:
                    challenge["fr"] = {}
                challenge["fr"]["port_exemple"] = translation.portuguese_example
                challenge["fr"]["fr_exemple"] = translation.french_example
                updated_examples_count += 1
                made_updates = True
                print(f"  💾 Updated examples in challenges.json")
            
            # Update note if current note is "todo"
            if current_note == "todo" and translation.french_remark:
                if "fr" not in challenge:
                    challenge["fr"] = {}
                challenge["fr"]["note"] = translation.french_remark
                updated_notes_count += 1
                made_updates = True
                print(f"  💾 Updated note in challenges.json")
            
            # Always update last_update timestamp after processing (even if just verified)
            if "fr" not in challenge:
                challenge["fr"] = {}
            challenge["fr"]["last_update"] = today_date
            if made_updates:
                print(f"  🕒 Set last_update: {today_date}")
            
            processed_count += 1
        else:
            errors_count += 1
            print(f"  ❌ Error: {verification['error']}")
            # Still count errors toward the batch limit
            processed_count += 1
        
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
    main()