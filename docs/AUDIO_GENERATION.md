# Audio Generation (Vocabulary Audio Agent)

## Overview

`VocabularyAudioAgent/VocabularyAudioAgent.py` generates ElevenLabs audio files for the main Portuguese words and for example sentences in each language (French, Portuguese, English). It runs weekly as the `vocabulary-audio-agent` CronJob and can also be run manually.

> **Data source:** The script now reads from and writes to the MongoDB `challenges` collection directly. The `challenges.json` file is no longer used at runtime — audio metadata fields (`audio`, `fr.translation_audio`, etc.) are updated in MongoDB via targeted `$set` operations per challenge.

## Audio Metadata in MongoDB

After a run, each challenge document has audio information for:

1. **Main Portuguese word** - stored in the `audio` field
2. **French translation** - stored in `fr.translation_audio`
3. **French example sentence** - stored in `fr.use_exemple_audio`
4. **Portuguese example in French section** - stored in `fr.port_exemple_audio`
5. **English translation** - stored in `en.translation_audio`
6. **English example sentence** - stored in `en.use_exemple_audio`
7. **Portuguese example in English section** - stored in `en.port_exemple_audio`

### Audio File Naming Convention

- Main word: `{challenge_id}.mp3`
- French translation: `{challenge_id}_fr_translation.mp3`
- French example: `{challenge_id}_fr_exemple.mp3`
- Portuguese example (FR section): `{challenge_id}_fr_pt_exemple.mp3`
- English translation: `{challenge_id}_en_translation.mp3`
- English example: `{challenge_id}_en_exemple.mp3`
- Portuguese example (EN section): `{challenge_id}_en_pt_exemple.mp3`

### Voice IDs Used

The script uses different ElevenLabs voices for each language:

- **Portuguese (pt)**: `aLFUti4k8YKvtQGXv0UO` - Portuguese EU accent
- **French (fr)**: `ICk609TItINMseDpChFt` - French voice
- **English (en)**: `pNInz6obpgDQGcFmaJgB` - Adam voice

## How to Use

### Prerequisites

1. Set the ElevenLabs API key:
   ```bash
   export TEXT_TO_SPEECH_API_KEY="your-api-key-here"
   ```

2. Install the agent requirements (the `elevenlabs` package):
   ```bash
   pip install -r VocabularyAudioAgent/requirements.txt
   ```

### Running the Script

Run it from the repository root:

```bash
python VocabularyAudioAgent/VocabularyAudioAgent.py
```

By default the script:
- Writes MP3s to `<repo>/sounds` (the directory served by Express at `/sounds`)
- Skips audio generated within the last 6 months
- Makes at most 300 TTS API calls per run (main words + examples combined)
- Generates example sentences as well as main words

> The deployed CronJob overrides the refresh window and cap: it keeps audio for 12 months and
> allows 50 TTS calls per run (see [Kubernetes CronJob](#kubernetes-cronjob)).

### Configuration Options

All options are command-line flags:

```bash
python VocabularyAudioAgent/VocabularyAudioAgent.py --help
```

| Flag | Default | Meaning |
|---|---|---|
| `--output-dir DIR` | `<repo>/sounds` | Where MP3 files are written |
| `--max-conversions N` | `300` | Hard cap on TTS calls per run (cost control) |
| `--months N` | `6` | Regenerate audio older than N months |
| `--no-skip` | off | Regenerate everything, ignoring the recency check |
| `--no-examples` | off | Only generate main word audio |

Examples:

```bash
# Daily scheduled run: fill in missing audio, cap cost
python VocabularyAudioAgent/VocabularyAudioAgent.py --max-conversions 300

# Force a full regeneration after a voice change
python VocabularyAudioAgent/VocabularyAudioAgent.py --no-skip

# Main words only
python VocabularyAudioAgent/VocabularyAudioAgent.py --no-examples
```

### Kubernetes CronJob

The Helm chart deploys `vocabulary-audio-agent` (see
`helm/portuguese-learning/templates/vocabulary-audio-agent-cronjob.yaml`). It runs every Monday at
09:00 — after the vocabulary agents — mounts the `sounds.hostPath` directory at `/sounds`, and passes
`--output-dir /sounds`.

- Deployed cost settings: `months: 12` (keep existing audio for a year) and
  `maxConversions: 50` (at most 50 TTS calls per run). Raise `maxConversions` for a one-off backfill
  and set it back afterwards — at 50/week, a full pass over ~19k files takes years.
- Schedule, refresh window (`months`) and cap (`maxConversions`) live under `vocabularyAudioAgent`
  in `helm/portuguese-learning/values.yaml`.
- It expects a `text-to-speech-api-key` key in the `portuguese-learning-secrets` secret.
- The `sounds` directory must be writable by uid **1000** (the Python CronJob user).
- Set `vocabularyAudioAgent.enabled: false` to skip the CronJob on a release (staging does this to
  avoid duplicating prod's TTS spend against the shared sounds directory).
- Do not run it at the same time as `VocabularyUpdaterAgent`: the updater rewrites whole documents
  with `$set` and could revert the `audio` metadata written here.

### Example Run

```bash
# Set API key
export TEXT_TO_SPEECH_API_KEY="sk-..."

# Run the agent from the repository root
python VocabularyAudioAgent/VocabularyAudioAgent.py
```

### Expected Output

```
Vocabulary Audio Agent - ElevenLabs TTS for Portuguese Challenges
============================================================
Loaded 2803 challenges from MongoDB

Starting audio generation...
Output directory: /workspaces/PortugueseLearning/sounds
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

If running with `--max-conversions 300`, you would need approximately:
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

### Automatic MongoDB Updates

- Updates the `challenges` MongoDB collection after each audio generation
- Adds `use_exemple_audio` and `port_exemple_audio` fields on the challenge document
- Tracks generation date in `last_update` field
- Changes are immediately visible to the app server at the next cache refresh (default: 5 min)

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

Error: `TEXT_TO_SPEECH_API_KEY environment variable not set!` — the script exits with status 1, so the
CronJob job is marked failed instead of succeeding silently.

Solution:
```bash
export TEXT_TO_SPEECH_API_KEY="your-api-key-here"
```

### Rate Limit Errors

If you hit rate limits, reduce `--max-conversions` or increase the delay in the script:
```python
time.sleep(1.0)  # Increase from 0.5 to 1.0 seconds
```

### Invalid JSON

If the JSON seed files need validating:
```bash
python3 -m json.tool data/challenges.json > /dev/null
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
