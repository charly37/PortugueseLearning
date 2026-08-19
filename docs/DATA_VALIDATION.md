# Data Validation Scripts

This document describes the data validation and maintenance scripts located in the `/data` directory.

## Overview

Challenge data (`challenges.json`, `verb-challenges.json`, `idiom-challenges.json`) has been migrated to MongoDB. The JSON files in `data/` are now **seed/backup sources only** — the live app reads from the `challenges` MongoDB collection.

**MongoDB collection:** `challenges` — one document per challenge, with a `type` field (`"word"`, `"verb"`, `"idiom"`) and `schemaVersion: 1`.

The JSON files are still validated (they remain the canonical source for seeding) but the app no longer reads them at startup. To re-seed or update MongoDB from the JSON files, please run:

```bash
python3 data/seed-mongodb.py
```

## Scripts

### check-duplicate-ids.py

**Location:** `/data/check-duplicate-ids.py`

**Purpose:** Validates that all challenge entries have unique UUIDs and optionally fixes duplicates automatically.

**Usage:**

```bash
# Check for duplicate UUIDs (read-only)
cd data
python3 check-duplicate-ids.py

# Check and automatically fix duplicate UUIDs
python3 check-duplicate-ids.py fix
```

**What it does:**

1. **Check Mode** (default):
   - Loads `challenges.json`
   - Groups challenges by UUID
   - Reports duplicate UUIDs with detailed information
   - Exits with code 1 if duplicates found, 0 if clean
   - Used in CI/CD pipeline to prevent seeding invalid data into MongoDB

2. **Fix Mode** (`fix` argument):
   - Performs same checks as check mode
   - For each duplicate UUID, keeps the first occurrence
   - Regenerates new UUIDs for subsequent duplicates
   - Saves updated `challenges.json` automatically
   - Displays all changes made
   - After fixing, re-run `python3 data/seed-mongodb.py` to sync changes to MongoDB
   - After fixing, re-run `python3 data/seed-mongodb.py` to sync changes to MongoDB

**Output Example:**

```
Total challenges: 312
Unique IDs: 312

✓ No duplicate IDs found! All UUIDs are unique.
```

Or when duplicates are found:

```
Total challenges: 312
Unique IDs: 283

⚠ CRITICAL: Found 29 duplicate IDs:
================================================================================

ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890 (2 occurrences)
--------------------------------------------------------------------------------
  Index: 129
  Portuguese: assim
  English: like that / thus / in this way / as is
  French: comme ça / ainsi / de cette façon / tel quel

  Index: 144
  Portuguese: vendedor
  English: salesman
  French: vendeur

⚠ These duplicate IDs should be fixed immediately!
Run: python3 check-duplicate-ids.py fix
```

**CI/CD Integration:**

This script is automatically run in the GitHub Actions workflow (`.github/workflows/ci-cd.yml`) before building the application. If duplicate UUIDs are detected, the build fails — fix and re-seed before deploying.

```yaml
- name: Validate challenge data
  run: |
    echo "Checking for duplicate UUIDs in challenges.json..."
    python3 data/check-duplicate-ids.py
    if [ $? -ne 0 ]; then
      echo "❌ FAILED: Duplicate UUIDs found in challenges.json"
      echo "Run 'python3 data/check-duplicate-ids.py fix' to fix them"
      exit 1
    fi
```

---

### find-duplicates.py

**Location:** `/data/find-duplicates.py`

**Purpose:** Identifies duplicate Portuguese words across challenges to help maintain content quality and avoid redundant entries.

**Usage:**

```bash
cd data
python3 find-duplicates.py
```

**What it does:**

1. Loads `challenges.json`
2. Groups challenges by Portuguese word (case-insensitive)
3. Reports all Portuguese words that appear multiple times
4. Shows full details for each duplicate occurrence
5. Helps identify:
   - True duplicates (exact same word/meaning)
   - Legitimate duplicates (different grammatical forms)
   - Different meanings of the same word

**Output Example:**

```
✓ No duplicates found!
Total challenges: 337
Unique Portuguese words: 337
```

Or when duplicates exist:

```
⚠ Found 28 duplicate Portuguese words:
Total challenges: 337
Unique Portuguese words: 307

================================================================================

Portuguese word: 'alto' (2 occurrences)
--------------------------------------------------------------------------------
  Index: 22
  ID: e39487a7-2796-4c8b-a0c7-b06029e28edc
  Portuguese: alto
  English: tall (masc.)
  French: grand (il est grand)

  Index: 30
  ID: 6480221f-b2a0-4cc9-adc5-fa31334a7042
  Portuguese: alto
  English: high (masc.)
  French: haut (masculin)
```

**Use Cases:**

- **Content Review**: Identify words with multiple entries to review if they're needed
- **Data Cleanup**: Find and merge truly duplicate entries
- **Content Design**: Understand which words have multiple meanings/contexts
- **Quality Assurance**: Regular checks to maintain data integrity

**Categories of Duplicates:**

1. **Legitimate duplicates** - Same word, different meanings (e.g., "alto" = tall vs. high)
2. **Gender variations** - Tracked with and without gender markers
3. **Grammatical forms** - Articles with different uses (o, a, os, as)
4. **True duplicates** - Same word, same meaning (should be merged or removed)
5. **Incomplete entries** - Words with "todo" placeholders that duplicate existing entries

---

## Best Practices

### Before Committing Changes

Always run both validation scripts before committing changes to challenge data:

```bash
cd data

# Check for duplicate UUIDs
python3 check-duplicate-ids.py

# Check for duplicate Portuguese words
python3 find-duplicates.py
```

### Adding New Challenges

When adding new challenges, the JSON files remain the authoritative editing source. After editing, sync to MongoDB:

1. Add the new entry to the appropriate JSON file following the format below:
   ```json
   {
       "id": "unique-uuid-here",
       "port": "palavra",
       "fr": {
           "translation": "mot",
           "note": "additional context"
       },
       "en": {
           "translation": "word",
           "note": "additional context"
       }
   }
   ```

2. Generate a unique UUID:
   ```python
   import uuid; print(str(uuid.uuid4()))
   ```

3. Validate no duplicates were introduced:
   ```bash
   python3 data/check-duplicate-ids.py
   ```

4. Seed the new entry into MongoDB (idempotent — safe to re-run):
   ```bash
   python3 data/seed-mongodb.py
   ```

### Fixing Duplicate UUIDs

If duplicate UUIDs are found:

```bash
cd data
python3 check-duplicate-ids.py fix
git add challenges.json
git commit -m "fix: regenerate duplicate UUIDs in challenges.json"
# Then re-seed MongoDB to apply the fix
python3 data/seed-mongodb.py
```

### Managing Duplicate Words

When `find-duplicates.py` reports duplicate Portuguese words:

1. **Review each duplicate** - Determine if it's legitimate or truly redundant
2. **Keep legitimate duplicates** - Different meanings, grammatical forms, etc.
3. **Remove true duplicates** - Same word and meaning
4. **Update incomplete entries** - Replace "todo" placeholders with proper translations
5. **Document decisions** - If keeping duplicates, ensure notes distinguish them

---

## Data File Structure

> **Note:** The JSON files below are seed/backup sources. The live application reads from the MongoDB `challenges` collection. Each document has the same fields plus `type` (`"word"`, `"verb"`, or `"idiom"`) and `schemaVersion: 1`.

### challenges.json

Main word translation challenges:

```json
[
    {
        "id": "038f2ad2-19f6-4e0d-9aaa-04e818e1c983",
        "port": "só",
        "fr": {
            "translation": "seulement",
            "note": "todo"
        },
        "en": {
            "translation": "only",
            "note": "todo"
        }
    }
]
```

### Required Fields

- `id`: UUID (must be unique across entire file)
- `port`: Portuguese word or phrase
- `fr`: Object with `translation` and `note` fields
- `en`: Object with `translation` and `note` fields

---

## Troubleshooting

### Script Fails to Run

Ensure Python 3 is installed:
```bash
python3 --version
```

### JSON Parse Error

If scripts fail with JSON errors, validate the JSON:
```bash
python3 -m json.tool data/challenges.json > /dev/null
```

### CI/CD Build Fails Due to Duplicates

1. Pull latest changes
2. Run `python3 data/check-duplicate-ids.py fix`
3. Commit and push the fixes
4. Re-run the workflow

---

## Maintenance Schedule

**Recommended frequency:**

- **Before each commit**: Run both validation scripts
- **Weekly**: Review duplicate words report for content quality
- **Monthly**: Comprehensive data review and cleanup
- **CI/CD**: Automatic UUID validation on every build

---

## Related Documentation

- [TESTING.md](TESTING.md) - Testing infrastructure and procedures
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment process and CI/CD pipeline
- [design.md](design.md) - Overall application architecture
