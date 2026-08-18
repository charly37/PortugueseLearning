# Vocabulary Quality Updater - README

## Overview

The `VocabularyUpdaterAgent.py` script improves the quality of word challenges by calling the OpenAI API to:

- **Verify** whether the current translation for a word is accurate
- **Correct** inaccurate translations automatically
- **Populate** missing example sentences (Portuguese + target language)
- **Fill in** notes marked as `"todo"` with a short contextual remark about the word
- **Stamp** a `last_update` date on each processed entry to avoid redundant re-processing

The script supports multiple target languages (`fr` for French, `en` for English) and processes challenges in batches to control API costs.

> **Data source:** The script reads word challenges from and writes updates directly to the MongoDB `challenges` collection. The `challenges.json` file is no longer used at runtime.

## JSON Structure Updated

After running the script, each processed challenge entry gains or updates the following fields in the target language section:

```json
{
    "id": "...",
    "port": "apenas",
    "fr": {
        "translation": "seulement",
        "note": "En portugais, 'apenas' signifie surtout 'seulement'...",
        "port_exemple": "Eu tenho apenas um livro.",
        "fr_exemple": "J'ai seulement un livre.",
        "last_update": "2026-05-07"
    },
    "en": {
        "translation": "barely/just",
        "note": "...",
        "port_exemple": "Eu tenho apenas um livro.",
        "en_exemple": "I only have one book.",
        "last_update": "2026-05-07"
    }
}
```

The example field is named `{language}_exemple` (e.g. `fr_exemple`, `en_exemple`).

## How to Use

### Prerequisites

1. Set the OpenAI API key:
   ```bash
   export OPEN_AI_KEY="your-openai-api-key"
   ```

2. Ensure the required Python packages are installed:
   ```bash
   pip install openai pydantic
   ```

### Running the Script

#### Update French translations (default)

```bash
cd /workspaces/PortugueseLearning/data
python VocabularyUpdater.py
```

#### Update English translations

```bash
cd /workspaces/PortugueseLearning/data
python VocabularyUpdater.py --language en
```

#### Limit batch size (to control API cost)

```bash
python VocabularyUpdater.py --language fr --max-words 50
```

#### Use a shorter refresh period (e.g. 3 months)

```bash
python VocabularyUpdater.py --months 3
```

### CLI Arguments

| Argument | Values | Default | Description |
|---|---|---|---|
| `--language` | `fr`, `en` | `fr` | Language section to update in the `challenges` MongoDB collection |
| `--max-words` | integer | `300` | Maximum number of challenges to process per run |
| `--months` | integer | `6` | Number of months before a translation is considered stale and eligible for refresh |

### Batching

The script skips any challenge whose `last_update` in the target language section is within the refresh period (default: **6 months**). Use `--months` to override this. This means:

- You can safely re-run the script repeatedly — already-fresh entries are skipped automatically
- Run multiple times to process the full dataset in batches (e.g. `--max-words 300` per run)
- A tip at the end of each run shows how many challenges remain

### Expected Output

```
Loading challenges from MongoDB...
Loaded 2645 challenges
Language: fr
Max words to process in this batch: 300

[1/2803] ⏭️  Skipping 'apenas' (updated on 2026-02-17)
[2/2803] Processing: demais
  Current French: trop
  🔍 Translation Accurate: True
  🇫🇷 OpenAI French: trop
  🇵🇹 Portuguese: demais
  📝 Portuguese Example: Gosto demais.
  📝 French Example: J'aime trop.
  💬 French Remark: 'Demais' s'emploie surtout comme intensificateur...
  ✅ Translation VERIFIED

...

============================================================
VERIFICATION SUMMARY
============================================================
Total challenges in file: 2803
Skipped (recently updated): 1
Processed in this batch: 300
Verified (correct): 285
Suggestions (needs improvement): 15
Translations updated: 15
Examples updated: 42
Notes updated: 30
Errors: 0
Total tokens used: 124500
  - Prompt tokens: 98000
  - Completion tokens: 26500
============================================================

💡 Tip: 2502 challenges remaining. Run again to continue.
```

## Cost Considerations

Each word processed makes one OpenAI API call. Use `--max-words` to limit spending per run. The `last_update` timestamp mechanism ensures you only pay to process each word once per refresh window (default: 6 months, configurable with `--months`).
