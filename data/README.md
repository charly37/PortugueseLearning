# Data Directory

This directory contains:

- **Challenge data files**: `challenges.json`, `verb-challenges.json`, `idiom-challenges.json`
- **Audio files**: Generated MP3 files for Portuguese words and example sentences
- **Data management scripts**: Python utilities for updating and validating data
- **Text-to-Speech generator**: `TextToSpeechGenerator.py`

## Audio Generation

For instructions on generating audio for Portuguese words and example sentences, see:

**📖 [Audio Generation Guide](../docs/AUDIO_GENERATION.md)**

Quick start:
```bash
export TEXT_TO_SPEECH_API_KEY="your-key"
python3 TextToSpeechGenerator.py
```

## Utilities

- `verify_audio_structure.py` - Check audio generation status
- `validate-challenges.py` - Validate JSON structure
- `VocabularyUpdater.py` - Update vocabulary data
- `update-french-translations.py` - Update French translations

## Data Validation

For information about data validation, see:

**📖 [Data Validation Guide](../docs/DATA_VALIDATION.md)**
