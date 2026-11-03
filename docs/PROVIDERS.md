# External Providers

Single entry point for every third-party service and AI model this project depends on.
Use it to review providers periodically and to know exactly where a model or API has to
be changed.

**Last reviewed:** 2026-11-03

## Summary

| Provider | Used for | Where | Current models | Credential |
|---|---|---|---|---|
| [StoryCreator](#storycreator-bilingualstorynet) (`bilingualstory.net`) | Writes the weekly bilingual story | `story_writter/StoryCreatorGetter.py` | Server-side model, selectable per request (see below) | `STORYCREATOR_API_KEY` |
| [OpenAI](#openai) | Idea/planning/translation agents | `story_writter/`, `VocabularyCreatorAgent/`, `VocabularyUpdaterAgent/` | `gpt-4.1`, `gpt-4.1-mini` | `OPEN_AI_KEY` |
| [ElevenLabs](#elevenlabs) | Text-to-speech audio for words and examples | `data/TextToSpeechGenerator.py` | `eleven_flash_v2_5` | `TEXT_TO_SPEECH_API_KEY` |

StoryCreator and OpenAI are the two AI providers used today. ElevenLabs is the other
external API that owns credentials and quota, so it is tracked here too.

## StoryCreator (bilingualstory.net)

External service that actually writes the weekly story. This repo only sends the request
and polls until the story is ready.

| Item | Value |
|---|---|
| Base URL | `https://bilingualstory.net` (override with `STORYCREATOR_API_URL`) |
| Client | `story_writter/StoryCreatorGetter.py` |
| Entry point | `--generate` mode, run weekly by `helm/portuguese-learning/templates/weekly-story-cronjob.yaml` |
| Scopes | `stories:read` for read modes, `stories:write` for `--generate` |
| Model selection | `--ai-model` → `aiModel` in the request body; optional, the server default is used when omitted |
| Accepted values | `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-4o`, `gpt-5-mini` (`ALLOWED_STORY_MODELS`) |

Details: [STORY_CREATOR.md](STORY_CREATOR.md).

`ALLOWED_STORY_MODELS` mirrors `ALLOWED_AI_MODELS` in the StoryCreator server. Adding a
model requires changing both the server and the tuple in `StoryCreatorGetter.py`.

## OpenAI

All OpenAI calls go through the `openai-agents` SDK. The code reads `OPEN_AI_KEY` and
exposes it to the SDK as `OPENAI_API_KEY`.

| Script | Agent | Default model | Flag to change it |
|---|---|---|---|
| `story_writter/StoryCreatorGetter.py` | Story idea generator (title, theme, seed, cast) | `gpt-4.1-mini` | `--idea-model` |
| `VocabularyCreatorAgent/VocabularyCreatorAgent.py` | Word planner | `gpt-4.1` | `--planner-model` |
| `VocabularyCreatorAgent/VocabularyCreatorAgent.py` | Content creator (translations, examples, notes) | `gpt-4.1-mini` | `--model` |
| `VocabularyUpdaterAgent/VocabularyUpdaterAgent.py` | Portuguese word validator | `gpt-4.1` | `--validator-model` |
| `VocabularyUpdaterAgent/VocabularyUpdaterAgent.py` | Translation agent (per language) | `gpt-4.1-mini` | `--model` |

Notes:

- `StoryCreatorGetter.py` uses OpenAI only for the *idea*. The story text itself is written
  by StoryCreator (see above).
- Deployment pins the models explicitly in the CronJob args, which override the script
  defaults:
  - `helm/portuguese-learning/templates/vocabulary-creator-agent-cronjob.yaml`
    → `--planner-model gpt-4.1 --model gpt-4.1-mini`
  - `helm/portuguese-learning/templates/vocabulary-updater-agent-cronjob.yaml`
    → `--validator-model gpt-4.1 --model gpt-4.1-mini`
  - `helm/portuguese-learning/templates/weekly-story-cronjob.yaml` does not pass
    `--idea-model`, so the script default applies.
- When bumping a model, update the script default **and** the Helm CronJob args, otherwise
  the deployed job keeps the old model.

Related docs: [STORY_CREATOR.md](STORY_CREATOR.md), [VOCABULARY_UPDATER.md](VOCABULARY_UPDATER.md).

## ElevenLabs

Text-to-speech used to generate `sounds/*.mp3` (word pronunciation and example sentences).

| Item | Value |
|---|---|
| Script | `data/TextToSpeechGenerator.py` |
| Model | `eleven_flash_v2_5` (set in `generate_tts_audio`) |
| Key | `TEXT_TO_SPEECH_API_KEY` |
| Portuguese voice | `aLFUti4k8YKvtQGXv0UO` (European Portuguese accent) |
| French voice | `ICk609TItINMseDpChFt` (see `VOICES` in the script) |
| English voice | `pNInz6obpgDQGcFmaJgB` (Adam) |

The model ID and voice IDs are hard-coded in the script. `docs/AUDIO_GENERATION.md` lists a
different French voice ID (`21m00Tcm4TlvDq8ikWAM`); check which one is intended before
changing either.

Details: [AUDIO_GENERATION.md](AUDIO_GENERATION.md).

## Review Checklist

When reviewing providers (models, pricing, availability):

1. Check the models in the [Summary](#summary) table against the provider's current lineup.
2. Update the script defaults listed above.
3. Update the Helm CronJob args that pin models.
4. Update the provider's topic doc (`STORY_CREATOR.md`, `VOCABULARY_UPDATER.md`,
   `AUDIO_GENERATION.md`) if the values changed.
5. Bump **Last reviewed** at the top of this file.
