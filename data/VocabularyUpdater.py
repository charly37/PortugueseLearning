import json
import os
from openai import OpenAI
from pydantic import BaseModel
from typing import Dict, List

class WordTranslation(BaseModel):
    translation_accurate: bool
    french: str
    french_example: str
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
        prompt = f"""Review this translation from Portuguese word to French and its examples. If you think there is a better translation, state that the translation is not accurate and provide the better one along with examples. If the current translation is accurate, confirm it.

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

def main(max_words=3):
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
    verified_count = 0
    suggestions_count = 0
    errors_count = 0
    total_tokens = {"prompt": 0, "completion": 0}
    
    # Process each challenge
    for idx, challenge in enumerate(challenges, 1):
        portuguese_word = challenge.get("port", "")
        french_translation = challenge.get("fr", {}).get("translation", "")
        english_translation = challenge.get("en", {}).get("translation", "")
        challenge_id = challenge.get("id", "unknown")
        
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
            
            # Use OpenAI's assessment of translation accuracy
            is_accurate = translation.translation_accurate
            
            print(f"  🔍 Translation Accurate: {translation.translation_accurate}")
            print(f"  🇫🇷 OpenAI French: {translation.french}")
            print(f"  🇵🇹 Portuguese: {translation.portuguese}")
            print(f"  📝 Portuguese Example: {translation.portuguese_example}")
            print(f"  📝 French Example: {translation.french_example}")
            
            total_tokens["prompt"] += verification["prompt_tokens"]
            total_tokens["completion"] += verification["completion_tokens"]
            
            if is_accurate:
                verified_count += 1
                print(f"  ✅ Translation VERIFIED")
            else:
                suggestions_count += 1
                print(f"  ⚠️  SUGGESTED change: '{french_translation}' → '{translation.french}'")
            
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
    
    # Print summary
    print("\n" + "="*60)
    print("VERIFICATION SUMMARY")
    print("="*60)
    print(f"Total challenges in file: {len(challenges)}")
    print(f"Processed in this batch: {processed_count}")
    print(f"Verified (correct): {verified_count}")
    print(f"Suggestions (needs improvement): {suggestions_count}")
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