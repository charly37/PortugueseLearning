import os
import json
import time
from pathlib import Path
from datetime import datetime
from elevenlabs.client import ElevenLabs
from elevenlabs import VoiceSettings


def save_challenges_json(json_file_path, challenges):
    """
    Save the updated challenges array back to the JSON file.
    
    Args:
        json_file_path: Path to the challenges JSON file
        challenges: Updated challenges array
    """
    try:
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(challenges, f, ensure_ascii=False, indent=4)
        return True
    except Exception as e:
        print(f"❌ Error saving JSON file: {e}")
        return False


def generate_audio_for_challenges(json_file_path, output_dir=".", skip_existing=True, max_conversions=50):
    """
    Generate audio files for all challenges in a JSON file.
    
    Args:
        json_file_path: Path to the challenges JSON file
        output_dir: Directory where MP3 files will be saved (default: current directory)
        skip_existing: If True, skip challenges that already have audio files
        max_conversions: Maximum number of audio files to generate in this run (default: 50)
    """
    # Initialize ElevenLabs client
    api_key = os.environ.get('TEXT_TO_SPEECH_API_KEY')
    if not api_key:
        print("ERROR: TEXT_TO_SPEECH_API_KEY environment variable not set!")
        return
    
    client = ElevenLabs(api_key=api_key)
    
    # Load challenges from JSON file
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            challenges = json.load(f)
        print(f"Loaded {len(challenges)} challenges from {json_file_path}")
    except FileNotFoundError:
        print(f"ERROR: File '{json_file_path}' not found!")
        return
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in '{json_file_path}': {e}")
        return
    
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Statistics
    total = len(challenges)
    generated = 0
    skipped = 0
    errors = 0
    
    print(f"\nStarting audio generation...")
    print(f"Output directory: {output_path.absolute()}")
    print(f"Skip existing files: {skip_existing}")
    print(f"Max conversions per run: {max_conversions}\n")
    
    for idx, challenge in enumerate(challenges, 1):
        # Stop if we've reached the maximum number of conversions
        if generated >= max_conversions:
            print(f"\n⚠️  Reached maximum conversions limit ({max_conversions}). Stopping.")
            break
        
        challenge_id = challenge.get('id')
        portuguese_text = challenge.get('port')
        
        if not challenge_id or not portuguese_text:
            print(f"[{idx}/{total}] ⚠️  Skipping invalid challenge (missing id or port field)")
            errors += 1
            continue
        
        output_file = output_path / f"{challenge_id}.mp3"
        
        # Skip if file already exists
        if skip_existing and output_file.exists():
            print(f"[{idx}/{total}] ⏭️  Skipping '{portuguese_text}' (file already exists)")
            skipped += 1
            continue
        
        # Generate audio
        try:
            print(f"[{idx}/{total}] 🎙️  Generating audio for '{portuguese_text}'...")
            
            audio = client.text_to_speech.convert(
                text=portuguese_text,
                voice_id="aLFUti4k8YKvtQGXv0UO",  # Pt EU accent
                language_code="pt",  # Portuguese
                model_id="eleven_flash_v2_5",
                output_format="mp3_44100_128",
                voice_settings=VoiceSettings(
                    speed=0.85,
                ),
            )
            
            # Save audio to file
            with open(output_file, "wb") as f:
                for chunk in audio:
                    f.write(chunk)
            
            print(f"[{idx}/{total}] ✅ Saved to {output_file.name}")
            generated += 1
            
            # Update the challenge entry in the JSON
            audio_filename = output_file.name
            today_date = datetime.now().strftime("%Y-%m-%d")
            challenge['audio'] = {
                'filename': audio_filename,
                'last_update': today_date
            }
            
            # Save updated JSON back to file
            if save_challenges_json(json_file_path, challenges):
                print(f"[{idx}/{total}] 📝 Updated JSON entry for '{portuguese_text}'")
            else:
                print(f"[{idx}/{total}] ⚠️  Failed to update JSON entry")
            
            # Small delay to avoid rate limiting
            time.sleep(0.5)
            
        except Exception as e:
            print(f"[{idx}/{total}] ❌ Error generating audio for '{portuguese_text}': {e}")
            errors += 1
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"Audio Generation Complete!")
    print(f"{'='*60}")
    print(f"Total challenges: {total}")
    print(f"Generated: {generated}")
    print(f"Skipped (already exist): {skipped}")
    print(f"Errors: {errors}")
    remaining = total - generated - skipped
    if remaining > 0:
        print(f"Remaining (not processed): {remaining}")
        print(f"\n💡 Run the script again to generate more (up to {max_conversions} per run)")
    print(f"{'='*60}")


if __name__ == "__main__":
    # Path to challenges.json relative to this script
    script_dir = Path(__file__).parent
    challenges_json = script_dir.parent / "data" / "challenges.json"
    output_directory = script_dir.parent / "data"
    
    print(f"Text-to-Speech Audio Generator for Portuguese Challenges")
    print(f"{'='*60}\n")
    
    # Generate audio for all challenges
    generate_audio_for_challenges(
        json_file_path=challenges_json,
        output_dir=output_directory,
        skip_existing=True,  # Change to False to regenerate all files
        max_conversions=50   # Maximum number of conversions per run to control costs
    )