# Audio Generation for Example Sentences - README

## Overview

The `TextToSpeechGenerator.py` script has been updated to generate audio files not only for the main Portuguese words, but also for example sentences in each language (French, Portuguese, English).

## What's New

### Updated JSON Structure

After running the script with `generate_examples=True`, each challenge entry will have audio information for:

1. **Main Portuguese word** - stored in `audio` field (existing)
2. **French example sentence** - stored in `fr.use_exemple_audio` field (NEW)
3. **Portuguese example in French section** - stored in `fr.port_exemple_audio` field (NEW)
4. **English example sentence** - stored in `en.use_exemple_audio` field (NEW)
5. **Portuguese example in English section** - stored in `en.port_exemple_audio` field (NEW)

See `data/example-updated-structure.json` for a complete example.

### Audio File Naming Convention

- Main word: `{challenge_id}.mp3`
- French example: `{challenge_id}_fr_exemple.mp3`
- Portuguese example (FR section): `{challenge_id}_fr_pt_exemple.mp3`
- English example: `{challenge_id}_en_exemple.mp3`
- Portuguese example (EN section): `{challenge_id}_en_pt_exemple.mp3`

### Voice IDs Used

The script uses different ElevenLabs voices for each language:

- **Portuguese (pt)**: `aLFUti4k8YKvtQGXv0UO` - Portuguese EU accent
- **French (fr)**: `21m00Tcm4TlvDq8ikWAM` - Rachel voice
- **English (en)**: `pNInz6obpgDQGcFmaJgB` - Adam voice

## How to Use

### Prerequisites

1. Set the ElevenLabs API key:
   ```bash
   export TEXT_TO_SPEECH_API_KEY="your-api-key-here"
   ```

2. Ensure the `elevenlabs` Python package is installed:
   ```bash
   pip install elevenlabs
   ```

### Running the Script

#### Generate Only Main Words (Original Functionality)

```bash
cd /workspaces/PortugueseLearning/data
python TextToSpeechGenerator.py
```

By default, the script is configured to:
- Skip existing audio files generated within the last 6 months
- Generate up to 300 audio files per run
- **Generate example sentences** (set to `True`)

#### Configuration Options

You can modify the script's behavior by editing the main block at the bottom of `TextToSpeechGenerator.py`:

```python
generate_audio_for_challenges(
    json_file_path=challenges_json,
    output_dir=output_directory,
    skip_existing=True,      # False = regenerate all audio
    max_conversions=300,     # Maximum files per run (cost control)
    generate_examples=True   # True = generate example sentences
)
```

**Options:**

- `skip_existing=True`: Skip audio files generated within the last 6 months
- `skip_existing=False`: Regenerate all audio files (useful for quality improvements)
- `max_conversions=50`: Limit to 50 audio files per run (to control API costs)
- `max_conversions=300`: Generate up to 300 audio files per run
- `generate_examples=True`: Generate audio for example sentences
- `generate_examples=False`: Only generate audio for main words

### Example Run

```bash
# Set API key
export TEXT_TO_SPEECH_API_KEY="sk-..."

# Run the script
cd /workspaces/PortugueseLearning/data
python TextToSpeechGenerator.py
```

### Expected Output

```
Text-to-Speech Audio Generator for Portuguese Challenges
============================================================

Loaded 2803 challenges from /workspaces/PortugueseLearning/data/challenges.json

Starting audio generation...
Output directory: /workspaces/PortugueseLearning/data
Skip existing files: True
Audio refresh policy: Regenerate if older than 6 months
Max conversions per run: 300
Generate example sentences: True

[1/2803] ⏭️  Skipping 'apenas' (audio generated on 2026-02-14)
[1/2803]   🎙️  FR: 'J'ai seulement un livre.'
[1/2803]   ✅ Saved 85998f02-d626-4496-9772-bbfab6ed072b_fr_exemple.mp3
[1/2803]   🎙️  PT: 'Eu tenho apenas um livro.'
[1/2803]   ✅ Saved 85998f02-d626-4496-9772-bbfab6ed072b_fr_pt_exemple.mp3
...

============================================================
Audio Generation Complete!
============================================================
Total challenges: 2803
Main word audio generated: 0
Main word audio skipped (recent < 6 months): 2803
Example sentences generated: 5606
Example sentences skipped (recent < 6 months): 0
Errors: 0
============================================================
```

## Cost Estimation

With ~2803 challenges and 2 example sentences per challenge (French use_exemple + French port_exemple):
- Main words already generated: ~2803 audio files
- Example sentences to generate: ~2803 × 2 = ~5606 audio files

If running with `max_conversions=300`, you would need approximately:
- 5606 / 300 = ~19 runs to complete all examples

**ElevenLabs Pricing (as of Feb 2026):**
- Typical cost: ~$0.18 per 1000 characters or ~$0.30 per 1000 conversions
- Average sentence length: ~30-50 characters
- Estimated cost: $50-$100 for all 5606 example sentences

## Features

### Intelligent Skipping

- Checks if audio was generated within the last 6 months
- Only regenerates outdated audio files
- Saves on API costs and time

### Automatic JSON Updates

- Updates `challenges.json` after each audio generation
- Adds `use_exemple_audio` and `port_exemple_audio` fields
- Tracks generation date in `last_update` field

### Rate Limiting

- Built-in 0.5 second delay between API calls
- Prevents hitting ElevenLabs rate limits
- Can be adjusted based on your API tier

### Error Handling

- Continues processing if individual conversions fail
- Reports summary statistics at the end
- Doesn't overwrite valid audio on errors

## Troubleshooting

### API Key Not Set

Error: `ERROR: TEXT_TO_SPEECH_API_KEY environment variable not set!`

Solution:
```bash
export TEXT_TO_SPEECH_API_KEY="your-api-key-here"
```

### Rate Limit Errors

If you hit rate limits, reduce `max_conversions` or increase the delay in the script:
```python
time.sleep(1.0)  # Increase from 0.5 to 1.0 seconds
```

### Invalid JSON

If the script reports JSON errors, validate your `challenges.json` file:
```bash
python -m json.tool challenges.json > /dev/null
```

## Next Steps

After generating the audio files, you may want to:

1. **Update the frontend** to play example sentence audio
2. **Add audio player controls** for each example in the UI
3. **Implement language-specific audio players** (PT, FR, EN)
4. **Add download options** for offline use
5. **Test audio quality** and adjust voice settings if needed

## Questions?

If you need help or encounter issues, please check:
- ElevenLabs API documentation: https://elevenlabs.io/docs
- Voice settings and language codes
- API usage limits and billing
