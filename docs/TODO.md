# TODO List

## Implement TTL Index for Challenge Attempts Cleanup

To prevent unbounded growth of the `challengeattempts` collection, implement MongoDB TTL (Time To Live) indexing:

**Why:** Without cleanup, the `challengeattempts` collection will grow indefinitely as users practice challenges.

**Solution:** Create a TTL index to automatically delete attempts older than 90 days:

```javascript
// Run once in MongoDB shell or via Node.js startup script
db.challengeattempts.createIndex(
  { "attemptedAt": 1 },
  { expireAfterSeconds: 7776000 }  // 90 days = 7,776,000 seconds
)
```

**Implementation options:**
1. Add to a database initialization script
2. Run manually via MongoDB shell
3. Add to Node.js server startup (check if index exists, create if not)

**Benefits:**
- Automatic cleanup (no maintenance needed)
- Keeps 90 days of data (sufficient for weakness analysis in [`analytics/`](../analytics/))
- Bounded storage growth
- No impact on user documents (they stay small)

## Optimize Usefulness Vote Fetching - Batch API Calls

**Current issue:** Each `WordUsefulnessVote` component makes a separate `/api/challenge/get-votes` call when rendered, resulting in N database queries for N challenges (e.g., 20 queries for a 20-question challenge).

**Solution:** Batch-fetch all votes upfront when challenge set is generated:

1. **Modify challenge pages** (ChallengePage, FlashcardLearnPage, VerbChallengePage, IdiomChallengePage):
   - After generating challenges, extract all `challengeIds`
   - Make single `/api/challenge/get-votes` call with full array
   - Store results in component state: `const [userVotes, setUserVotes] = useState<{[key: string]: number}>({})`

2. **Update WordUsefulnessVote component**:
   - Add optional `userVote` prop to accept pre-fetched vote
   - Add optional `skipFetch` prop to disable useEffect API call
   - Use `userVote ?? currentUsefulness` for display

**Benefits:**
- Reduces 20 database queries → 1 batch query per challenge session
- Significant reduction in database traffic and API calls
- Faster page load (parallel fetch with challenge generation)
- Backend already supports batch queries via `challengeIds` array

**Priority:** Medium (performance optimization, not critical but noticeable at scale)

**Note:** The same optimization should be applied to `ChallengeQualityFlag` component once implemented, using the existing `/api/challenge/get-quality-flags` batch endpoint.

## Generic Challenge Schema for Additional Native Languages (deferred)

**Status:** Not started. Current decision (2026-10) is to keep the existing `{port, fr, en}` shape and ship
the **fr-pt** and **en-pt** experiences first. Revisit this when a **third native language** (es, de, it…)
is actually wanted.

**Invariant to preserve:** Portuguese is **always** the target language. Only the *native* side may grow.
The collection is therefore legitimately N:1 — one canonical Portuguese term with N renderings — and only
the native dimension needs to become generic.

### Why the current shape blocks a third language

```json
{
  "_id": "...", "type": "word", "port": "casa",
  "fr": { "translation": "maison", "note": "", "port_exemple": "...", "use_exemple": "..." },
  "en": { "translation": "house",  "note": "", "port_exemple": "...", "use_exemple": "..." }
}
```

- The native languages are **two hardcoded keys**, not data.
- `required: ["fr", "en"]` forbids partial coverage (a term translated only to French is invalid).
- Nothing validates a new key, and `additionalProperties: false` rejects it.
- `VocabularyCreatorAgent.py` exposes **8 fixed parameters** (`fr_translation`, `fr_example_pt`, `fr_note`,
  `en_translation`, …) — the LLM literally cannot produce an `es` block.

### Proposed shape (minimal delta)

```json
{
  "_id": "...", "type": "word", "port": "casa",
  "translations": {
    "fr": { "translation": "maison", "note": "", "port_exemple": "...", "use_exemple": "...", "last_update": "2026-10-29" },
    "en": { "translation": "house",  "note": "", "port_exemple": "...", "use_exemple": "...", "last_update": "2026-10-29" },
    "es": { "translation": "casa",   "note": "", "port_exemple": "...", "use_exemple": "...", "last_update": "2026-11-05" }
  },
  "audio": { "filename": "...mp3", "last_update": "..." },
  "user_usefulness": 0
}
```

Only the two language blocks move down one level. **Keep `port`** — renaming it would touch the seed files,
the Mongoose model, the TTS script, `combine_mp3.py`, the weekly-challenge scripts and the React pages for
zero functional gain.

Schema rules:
- Top level `required`: `["id", "port", "translations", "user_usefulness"]`.
- Inside `translations`: `minProperties: 1` (partial coverage allowed); keys matching `^[a-z]{2}(-[A-Z]{2})?$`.
- One `$defs/translation` instead of `fr_translation` + `en_translation`.
- Mongoose: `translations: { type: Map, of: LanguageSectionSchema }`.

### Migration strategy — shadow collection (recommended)

Do **not** migrate `challenges` in place. Build a new collection and switch a pointer:

1. `migrate_challenges_v2.py`: read `challenges`, transform, `replace_one({_id}, doc, upsert=True)` into
   `challenges_v2`. Must be idempotent so it can be re-run right before cutover.
2. `verify_challenges_v2.py`: for every `_id`, assert both documents exist, `v2.translations.fr == v1.fr`,
   `v2.translations.en == v1.en`, `audio` identical, and per-`type` counts match.
3. Flip a `CHALLENGES_COLLECTION` env var (consumed by `scripts/db_utils.get_challenges_collection`, the
   Mongoose model, `analytics/`, `data/flag_challenge.py`, `data/seed-mongodb.py`, `usefulness_aggregator`).
4. Rollback = flip the env var back. Drop `challenges_legacy` once confident.

**Preserve `_id` verbatim.** `weeklychallenges.challengeId`, `ChallengeAttempt.challengeId`, votes, quality
flags and the audio filenames (`{id}.mp3`, `{id}_fr_translation.mp3`) all key off it.

**Writers to freeze (or re-sync right before cutover):** `data/TextToSpeechGenerator.py`,
`VocabularyUpdaterAgent/`, `VocabularyCreatorAgent/`, `usefulness_aggregator/`, `data/seed-mongodb.py`.
The Node app appears read-only on `challenges`.

The JSON seed files (`data/challenges.json`, `verb-challenges.json`, `idiom-challenges.json`) and the
Playwright seeding must be migrated in the same commit — otherwise the next reseed restores the old shape.

### Impact map (≈14 files)

| Area | File | Notes |
|---|---|---|
| Schema | `data/challenges.schema.json` | one `$defs/translation`, `minProperties: 1` |
| Seed data | `data/*.json` | scripted transform of ~2.7k entries |
| Validator | `data/validate-challenges.py` | 7 references |
| Node model | `src/models/Challenge.ts` | two fields → one map |
| Routes | `src/routes/challenge.ts`, `src/routes/weeklyChallenge.ts` | keep API field names (`translation_fr`, `fr_note`) to avoid touching `WeeklyChallengePage.tsx` |
| React | `ChallengePage`, `FlashcardLearnPage`, `IdiomChallengePage`, `VerbChallengePage` | 35 call sites + `preferredLanguage: 'fr' \| 'en'` in ~9 files. Also fixes a latent bug: `challenge.fr.note` is hardcoded in 4 places, so English users currently see French notes |
| TTS | `data/TextToSpeechGenerator.py` | two duplicated blocks (~150 lines) → one loop over `VOICES`; **keep the existing audio filenames** |
| Weekly | `weekly_challenge/create_weekly_challenge.py` | reads `c['fr']` / `c['en']` (4 spots) |
| Agents | `VocabularyCreatorAgent.py` (8 params → one translations param), `VocabularyUpdaterAgent.py` (`--language {fr,en}` choices) | do last |
| Tests | `tests/word-challenge.spec.ts` | reads `c.fr?.translation` / `c.en?.translation` |

**Estimate:** ~10–16 h focused work. ~6–8 h if you keep the API field names, keep the audio filenames, and
run the shadow collection instead of an in-place migration.

**Separate follow-up (not required for the schema):** a `--translate <lang>` mode in
`VocabularyCreatorAgent.py` that fills missing `translations.<lang>` on **existing** terms, so adding a
language becomes a translation job rather than a new-vocabulary job.

### Related: podcast feeds

The podcast generator (`podcast/generate_podcast_feed.py`) publishes the same global weekly lesson for every
pair listed in `podcast.pairs`. Publishing an `es-pt` feed before the data model above exists would publish
French audio under a Spanish URL. Both changes should land together — see [PODCAST.md](PODCAST.md).

**Priority:** Low — only when a third native language is decided.
