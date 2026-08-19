import argparse
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timedelta
from elevenlabs.client import ElevenLabs
from elevenlabs import VoiceSettings

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from db_utils import get_challenges_collection, challenges_as_list, update_challenge_fields


class QuotaExceededException(Exception):
    """Raised when the ElevenLabs API quota is exceeded."""
    pass


def save_challenge_to_db(collection, challenge_id: str, challenge: dict) -> bool:
    """Persist updated audio metadata for one challenge to MongoDB."""
    try:
        fields = {k: v for k, v in challenge.items() if k != 'id'}
        update_challenge_fields(collection, challenge_id, fields)
        return True
    except Exception as e:
        print(f"❌ Error saving challenge {challenge_id}: {e}")
        return False


def is_audio_recent(challenge, months=6):
    """
    Check if a challenge has audio that was generated recently.
    
    Args:
        challenge: Challenge dictionary object
        months: Number of months to consider audio as "recent" (default: 6)
    
    Returns:
        True if audio exists and was generated within the last 'months' months
    """
    audio = challenge.get('audio')
    if not audio:
        return False
    
    last_update = audio.get('last_update')
    if not last_update:
        return False
    
    try:
        # Parse the last_update date (format: YYYY-MM-DD)
        update_date = datetime.strptime(last_update, "%Y-%m-%d")
        
        # Calculate the cutoff date (today - months)
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        
        # Audio is recent if it was updated after the cutoff date
        return update_date >= cutoff_date
    except (ValueError, TypeError):
        # If date parsing fails, consider audio as not recent
        return False


def is_example_audio_recent(example_audio_dict, months=6):
    """
    Check if example audio was generated recently.
    
    Args:
        example_audio_dict: Audio dictionary with 'filename' and 'last_update'
        months: Number of months to consider audio as "recent" (default: 6)
    
    Returns:
        True if audio exists and was generated within the last 'months' months
    """
    if not example_audio_dict:
        return False
    
    last_update = example_audio_dict.get('last_update')
    if not last_update:
        return False
    
    try:
        update_date = datetime.strptime(last_update, "%Y-%m-%d")
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        return update_date >= cutoff_date
    except (ValueError, TypeError):
        return False


def generate_tts_audio(client, text, language_code, voice_id, output_file, speed=0.75):
    """
    Generate TTS audio for a given text and save to file.
    
    Args:
        client: ElevenLabs client instance
        text: Text to convert to speech
        language_code: Language code (e.g., 'pt', 'fr', 'en')
        voice_id: ElevenLabs voice ID
        output_file: Path object for output MP3 file
        speed: Speech speed (default: 0.85)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        audio = client.text_to_speech.convert(
            text=text,
            voice_id=voice_id,
            language_code=language_code,
            model_id="eleven_flash_v2_5",
            output_format="mp3_44100_128",
            voice_settings=VoiceSettings(speed=speed),
        )
        
        with open(output_file, "wb") as f:
            for chunk in audio:
                f.write(chunk)
        return True
    except Exception as e:
        error_str = str(e)
        if 'quota_exceeded' in error_str or ('401' in error_str and 'quota' in error_str.lower()):
            raise QuotaExceededException(f"ElevenLabs quota exceeded: {e}")
        print(f"❌ Error: {e}")
        return False


def generate_audio_for_challenges(collection, output_dir=".", skip_existing=True, max_conversions=50, generate_examples=False, months=6):
    """
    Generate audio files for all word challenges stored in MongoDB.
    """
    # Initialize ElevenLabs client
    api_key = os.environ.get('TEXT_TO_SPEECH_API_KEY')
    if not api_key:
        print("ERROR: TEXT_TO_SPEECH_API_KEY environment variable not set!")
        return
    
    client = ElevenLabs(api_key=api_key)
    
    # Load challenges from MongoDB
    challenges = challenges_as_list(collection, challenge_type='word')
    print(f"Loaded {len(challenges)} challenges from MongoDB")
    
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Statistics
    total = len(challenges)
    generated = 0
    skipped = 0
    errors = 0
    examples_generated = 0
    examples_skipped = 0
    total_converted = 0  # Total TTS API calls made (main words + examples)
    
    # Voice IDs for different languages
    VOICES = {
        'pt': 'aLFUti4k8YKvtQGXv0UO',  # Portuguese EU accent
        'fr': 'ICk609TItINMseDpChFt',  # French (Rachel)
        'en': 'pNInz6obpgDQGcFmaJgB',  # English (Adam)
    }
    
    print(f"\nStarting audio generation...")
    print(f"Output directory: {output_path.absolute()}")
    print(f"Skip existing files: {skip_existing}")
    if skip_existing:
        print(f"Audio refresh policy: Regenerate if older than {months} months")
    print(f"Max conversions per run: {max_conversions}")
    print(f"Generate example sentences: {generate_examples}\n")
    
    quota_exceeded = False
    for idx, challenge in enumerate(challenges, 1):
        if quota_exceeded:
            break
        # Stop if we've reached the maximum number of conversions
        if total_converted >= max_conversions:
            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
            break
        
        challenge_id = challenge.get('id')
        portuguese_text = challenge.get('port')
        
        if not challenge_id or not portuguese_text:
            print(f"[{idx}/{total}] ⚠️  Skipping invalid challenge (missing id or port field)")
            errors += 1
            continue
        
        # === MAIN WORD AUDIO ===
        output_file = output_path / f"{challenge_id}.mp3"
        
        # Skip if audio was recently generated (within last 6 months)
        if skip_existing and is_audio_recent(challenge, months=months):
            last_update = challenge.get('audio', {}).get('last_update', 'unknown')
            print(f"[{idx}/{total}] ⏭️  Skipping '{portuguese_text}' (audio generated on {last_update})")
            skipped += 1
        else:
            # Generate audio for main word
            print(f"[{idx}/{total}] 🎙️  Generating audio for '{portuguese_text}'...")
            
            try:
                success = generate_tts_audio(client, portuguese_text, 'pt', VOICES['pt'], output_file)
            except QuotaExceededException as e:
                print(f"\n🚫 Quota exceeded — stopping generation. ({e})")
                quota_exceeded = True
                continue
            
            if success:
                print(f"[{idx}/{total}] ✅ Saved to {output_file.name}")
                generated += 1
                total_converted += 1
                
                today_date = datetime.now().strftime("%Y-%m-%d")
                challenge['audio'] = {
                    'filename': output_file.name,
                    'last_update': today_date
                }
                
                if save_challenge_to_db(collection, challenge_id, challenge):
                    print(f"[{idx}/{total}] 📝 Updated DB entry for '{portuguese_text}'")
                
                # Small delay to avoid rate limiting
                time.sleep(0.5)
            else:
                errors += 1
        
        # === EXAMPLE SENTENCES AUDIO ===
        if generate_examples:
          try:
            today_date = datetime.now().strftime("%Y-%m-%d")
            
            # Process French examples
            fr_data = challenge.get('fr', {})
            if fr_data and isinstance(fr_data, dict):
                # French translation audio
                fr_translation = fr_data.get('translation')
                if fr_translation:
                    audio_dict = fr_data.get('translation_audio', {})
                    if skip_existing and is_example_audio_recent(audio_dict, months=months):
                        print(f"[{idx}/{total}]   ⏭️  Skipping FR translation (recent)")
                        examples_skipped += 1
                    else:
                        if total_converted >= max_conversions:
                            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
                            break
                        fr_trans_filename = f"{challenge_id}_fr_translation.mp3"
                        fr_trans_output = output_path / fr_trans_filename
                        print(f"[{idx}/{total}]   🎙️  FR translation: '{fr_translation[:40]}'")

                        if generate_tts_audio(client, fr_translation, 'fr', VOICES['fr'], fr_trans_output):
                            print(f"[{idx}/{total}]   ✅ Saved {fr_trans_filename}")
                            fr_data['translation_audio'] = {
                                'filename': fr_trans_filename,
                                'last_update': today_date
                            }
                            examples_generated += 1
                            total_converted += 1
                            save_challenge_to_db(collection, challenge_id, challenge)
                            time.sleep(0.5)
                        else:
                            errors += 1

                # French example sentence
                fr_use_exemple = fr_data.get('use_exemple')
                if fr_use_exemple:
                    audio_dict = fr_data.get('use_exemple_audio', {})
                    if skip_existing and is_example_audio_recent(audio_dict, months=months):
                        print(f"[{idx}/{total}]   ⏭️  Skipping FR example (recent)")
                        examples_skipped += 1
                    else:
                        if total_converted >= max_conversions:
                            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
                            break
                        fr_filename = f"{challenge_id}_fr_exemple.mp3"
                        fr_output = output_path / fr_filename
                        print(f"[{idx}/{total}]   🎙️  FR: '{fr_use_exemple[:40]}...'")
                        
                        if generate_tts_audio(client, fr_use_exemple, 'fr', VOICES['fr'], fr_output):
                            print(f"[{idx}/{total}]   ✅ Saved {fr_filename}")
                            fr_data['use_exemple_audio'] = {
                                'filename': fr_filename,
                                'last_update': today_date
                            }
                            examples_generated += 1
                            total_converted += 1
                            save_challenge_to_db(collection, challenge_id, challenge)
                            time.sleep(0.5)
                        else:
                            errors += 1
                
                # Portuguese example in French section
                fr_port_exemple = fr_data.get('port_exemple')
                if fr_port_exemple:
                    audio_dict = fr_data.get('port_exemple_audio', {})
                    if skip_existing and is_example_audio_recent(audio_dict, months=months):
                        print(f"[{idx}/{total}]   ⏭️  Skipping PT example (recent)")
                        examples_skipped += 1
                    else:
                        if total_converted >= max_conversions:
                            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
                            break
                        pt_filename = f"{challenge_id}_fr_pt_exemple.mp3"
                        pt_output = output_path / pt_filename
                        print(f"[{idx}/{total}]   🎙️  PT: '{fr_port_exemple[:40]}...'")
                        
                        if generate_tts_audio(client, fr_port_exemple, 'pt', VOICES['pt'], pt_output):
                            print(f"[{idx}/{total}]   ✅ Saved {pt_filename}")
                            fr_data['port_exemple_audio'] = {
                                'filename': pt_filename,
                                'last_update': today_date
                            }
                            examples_generated += 1
                            total_converted += 1
                            save_challenge_to_db(collection, challenge_id, challenge)
                            time.sleep(0.5)
                        else:
                            errors += 1
            
            # Process English examples (if they exist)
            en_data = challenge.get('en', {})
            if en_data and isinstance(en_data, dict):
                # English translation audio
                en_translation = en_data.get('translation')
                if en_translation:
                    audio_dict = en_data.get('translation_audio', {})
                    if skip_existing and is_example_audio_recent(audio_dict, months=months):
                        print(f"[{idx}/{total}]   ⏭️  Skipping EN translation (recent)")
                        examples_skipped += 1
                    else:
                        if total_converted >= max_conversions:
                            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
                            break
                        en_trans_filename = f"{challenge_id}_en_translation.mp3"
                        en_trans_output = output_path / en_trans_filename
                        print(f"[{idx}/{total}]   🎙️  EN translation: '{en_translation[:40]}'")

                        if generate_tts_audio(client, en_translation, 'en', VOICES['en'], en_trans_output):
                            print(f"[{idx}/{total}]   ✅ Saved {en_trans_filename}")
                            en_data['translation_audio'] = {
                                'filename': en_trans_filename,
                                'last_update': today_date
                            }
                            examples_generated += 1
                            total_converted += 1
                            save_challenge_to_db(collection, challenge_id, challenge)
                            time.sleep(0.5)
                        else:
                            errors += 1

                # English example sentence
                en_use_exemple = en_data.get('use_exemple')
                if en_use_exemple:
                    audio_dict = en_data.get('use_exemple_audio', {})
                    if skip_existing and is_example_audio_recent(audio_dict, months=months):
                        print(f"[{idx}/{total}]   ⏭️  Skipping EN example (recent)")
                        examples_skipped += 1
                    else:
                        if total_converted >= max_conversions:
                            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
                            break
                        en_filename = f"{challenge_id}_en_exemple.mp3"
                        en_output = output_path / en_filename
                        print(f"[{idx}/{total}]   🎙️  EN: '{en_use_exemple[:40]}...'")
                        
                        if generate_tts_audio(client, en_use_exemple, 'en', VOICES['en'], en_output):
                            print(f"[{idx}/{total}]   ✅ Saved {en_filename}")
                            en_data['use_exemple_audio'] = {
                                'filename': en_filename,
                                'last_update': today_date
                            }
                            examples_generated += 1
                            total_converted += 1
                            save_challenge_to_db(collection, challenge_id, challenge)
                            time.sleep(0.5)
                        else:
                            errors += 1
                
                # Portuguese example in English section
                en_port_exemple = en_data.get('port_exemple')
                if en_port_exemple:
                    audio_dict = en_data.get('port_exemple_audio', {})
                    if skip_existing and is_example_audio_recent(audio_dict, months=months):
                        print(f"[{idx}/{total}]   ⏭️  Skipping PT example (recent)")
                        examples_skipped += 1
                    else:
                        if total_converted >= max_conversions:
                            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
                            break
                        pt_filename = f"{challenge_id}_en_pt_exemple.mp3"
                        pt_output = output_path / pt_filename
                        print(f"[{idx}/{total}]   🎙️  PT: '{en_port_exemple[:40]}...'")
                        
                        if generate_tts_audio(client, en_port_exemple, 'pt', VOICES['pt'], pt_output):
                            print(f"[{idx}/{total}]   ✅ Saved {pt_filename}")
                            en_data['port_exemple_audio'] = {
                                'filename': pt_filename,
                                'last_update': today_date
                            }
                            examples_generated += 1
                            total_converted += 1
                            save_challenge_to_db(collection, challenge_id, challenge)
                            time.sleep(0.5)
                        else:
                            errors += 1
          except QuotaExceededException as e:
            print(f"\n🚫 Quota exceeded — stopping generation. ({e})")
            quota_exceeded = True
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"Audio Generation Complete!")
    print(f"{'='*60}")
    print(f"Total challenges: {total}")
    print(f"Total TTS conversions made: {total_converted} / {max_conversions}")
    print(f"Main word audio generated: {generated}")
    print(f"Main word audio skipped (recent < {months} months): {skipped}")
    if generate_examples:
        print(f"Example sentences generated: {examples_generated}")
        print(f"Example sentences skipped (recent < {months} months): {examples_skipped}")
    print(f"Errors: {errors}")
    remaining = total - generated - skipped
    if remaining > 0 and not generate_examples:
        print(f"Remaining (not processed): {remaining}")
        print(f"\n💡 Run the script again to generate more (up to {max_conversions} per run)")
    print(f"{'='*60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Text-to-Speech Audio Generator for Portuguese Challenges")
    parser.add_argument(
        "--months",
        type=int,
        default=6,
        help="Number of months before audio is considered outdated and regenerated (default: 6)"
    )
    parser.add_argument(
        "--max-conversions",
        type=int,
        default=300,
        help="Maximum number of audio files to generate per run (default: 300)"
    )
    parser.add_argument(
        "--no-skip",
        action="store_true",
        help="Regenerate all audio files, ignoring recency check"
    )
    parser.add_argument(
        "--examples",
        action="store_true",
        default=True,
        help="Also generate audio for example sentences (default: True)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory where MP3 files will be saved (default: script directory)"
    )
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    output_directory = Path(args.output_dir) if args.output_dir else script_dir

    mongo_client, collection = get_challenges_collection()

    print(f"Text-to-Speech Audio Generator for Portuguese Challenges")
    print(f"{'='*60}\n")

    try:
        generate_audio_for_challenges(
            collection=collection,
            output_dir=output_directory,
            skip_existing=not args.no_skip,
            max_conversions=args.max_conversions,
            generate_examples=args.examples,
            months=args.months,
        )
    finally:
        mongo_client.close()