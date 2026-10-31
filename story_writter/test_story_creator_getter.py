#!/usr/bin/env python3
"""Unit tests for StoryCreatorGetter.py (no network, no MongoDB server).

Run with:
    python3 story_writter/test_story_creator_getter.py -v
"""

from __future__ import annotations

import argparse
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import StoryCreatorGetter as scg  # noqa: E402  (path set above)


WEEK_START = datetime(2026, 10, 26, tzinfo=timezone.utc)
WEEK_END = WEEK_START + timedelta(days=7)


# ---------------------------------------------------------------------------
# Minimal in-memory pymongo stand-in
# ---------------------------------------------------------------------------

class _ReplaceResult:
    def __init__(self, upserted_id=None):
        self.upserted_id = upserted_id


class FakeCollection:
    def __init__(self):
        self.docs: list[dict] = []
        self.indexes: list[dict] = []
        self._next_id = 1

    @staticmethod
    def _matches(doc, query):
        for key, expected in query.items():
            actual = doc.get(key)
            if isinstance(expected, dict) and "$gte" in expected:
                if actual is None or actual < expected["$gte"]:
                    return False
            elif actual != expected:
                return False
        return True

    def find_one(self, query=None, projection=None, sort=None):
        matches = [doc for doc in self.docs if self._matches(doc, query or {})]
        if sort:
            for field, direction in reversed(sort):
                matches.sort(key=lambda d: d.get(field), reverse=direction < 0)
        return matches[0] if matches else None

    def replace_one(self, query, doc, upsert=False):
        for index, existing in enumerate(self.docs):
            if self._matches(existing, query):
                stored = dict(doc)
                stored["_id"] = existing["_id"]
                self.docs[index] = stored
                return _ReplaceResult()
        if not upsert:
            return _ReplaceResult()

        stored = dict(doc)
        stored["_id"] = f"id-{self._next_id}"
        self._next_id += 1
        self.docs.append(stored)
        return _ReplaceResult(upserted_id=stored["_id"])

    def create_index(self, keys, unique=False, name=None):
        self.indexes.append({"keys": keys, "unique": unique, "name": name})
        return name


class FakeDatabase(dict):
    def __getitem__(self, name):
        if name not in self:
            dict.__setitem__(self, name, FakeCollection())
        return dict.__getitem__(self, name)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_args(**overrides) -> argparse.Namespace:
    values = {
        "learning_language": "pt",
        "learning_language_name": "European Portuguese",
        "level": "beginner",
        "chapters": 2,
        "sentences_per_chapter": 4,
        "publish": True,
        "ai_model": None,
        "theme": "food and cafés",
        "idempotency_key": "",
        "languages": ["fr", "en"],
        "output": "",
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def make_idea() -> dict:
    return {
        "title_native": "Le marché",
        "title_learning": "O mercado",
        "theme": "food and cafés",
        "vocabulary": ["mercado", "pão"],
        "characters": [{"name": "Ana", "role": "baker", "description": "", "appearance": ""}],
        "seed": "Ana goes to the market.",
    }


def make_provider_story(native_language="fr") -> dict:
    texts = {
        "fr": {"title": ("Le marché", "O mercado"), "sentences": [("Le pain", "O pão"), ("Merci", "Obrigado")]},
        "en": {"title": ("The market", "O mercado"), "sentences": [("Bread", "O pão"), ("Thank you", "Obrigado")]},
    }[native_language]
    native_title, pt_title = texts["title"]

    return {
        "id": "story-1",
        "nativeLanguage": native_language,
        "learningLanguage": "pt",
        "level": "beginner",
        "labels": ["food", "market"],
        "createdAt": "2026-10-26T10:00:00Z",
        "title": {"lang1": native_title, "lang2": pt_title},
        "chapters": [
            {
                "sentences": [
                    {"lang1": native, "lang2": pt}
                    for native, pt in texts["sentences"]
                ]
            }
        ],
    }


# ---------------------------------------------------------------------------
# Generation helpers
# ---------------------------------------------------------------------------

class BuildPayloadTests(unittest.TestCase):
    def test_payload_mirrors_the_idea(self):
        payload = scg.build_story_payload(make_idea(), make_args(), "en")

        self.assertEqual(payload["title"], {"lang1": "Le marché", "lang2": "O mercado"})
        self.assertEqual(payload["nativeLanguage"], "en")
        self.assertEqual(payload["learningLanguage"], "pt")
        self.assertEqual(payload["level"], "beginner")
        self.assertEqual(payload["topic"], "food and cafés")
        self.assertTrue(payload["published"])
        self.assertEqual(payload["targetChapters"], 2)
        self.assertEqual(len(payload["chapters"]), 2)
        self.assertEqual(payload["chapters"][0]["targetSentences"], 4)
        self.assertIn("Ana goes to the market.", payload["seed"])
        self.assertIn("mercado, pão", payload["seed"])

    def test_payload_omits_optional_fields(self):
        payload = scg.build_story_payload(make_idea(), make_args(publish=False), "fr")

        self.assertFalse(payload["published"])
        self.assertNotIn("aiModel", payload)

    def test_payload_adds_ai_model_when_requested(self):
        payload = scg.build_story_payload(make_idea(), make_args(ai_model="gpt-4o"), "fr")
        self.assertEqual(payload["aiModel"], "gpt-4o")


class NormalizeIdeaTests(unittest.TestCase):
    def test_trims_and_limits_vocabulary(self):
        raw = make_idea()
        raw["vocabulary"] = [f"word{i}" for i in range(20)]
        idea = scg._normalize_idea(raw)

        self.assertEqual(len(idea["vocabulary"]), 12)
        self.assertEqual(idea["title_native"], "Le marché")

    def test_requires_seed(self):
        raw = make_idea()
        raw["seed"] = "  "
        with self.assertRaises(scg.StoryCreatorError):
            scg._normalize_idea(raw)

    def test_requires_native_title(self):
        raw = make_idea()
        raw["title_native"] = ""
        with self.assertRaises(scg.StoryCreatorError):
            scg._normalize_idea(raw)

    def test_drops_characters_without_a_name(self):
        raw = make_idea()
        raw["characters"] = [{"role": "baker"}, {"name": "Ana"}]
        self.assertEqual(len(scg._normalize_idea(raw)["characters"]), 1)


class IdempotencyKeyTests(unittest.TestCase):
    def test_default_key_is_per_week_and_language(self):
        key = scg._idempotency_key(make_args(), "fr")

        self.assertTrue(key.startswith("dialecthub-"))
        self.assertIn("-fr-", key)
        self.assertNotEqual(key, scg._idempotency_key(make_args(), "en"))

    def test_explicit_key_gets_the_language_suffix(self):
        key = scg._idempotency_key(make_args(idempotency_key="job-42"), "en")
        self.assertEqual(key, "job-42-en")

    def test_environment_key_is_used(self):
        os.environ["STORYCREATOR_IDEMPOTENCY_KEY"] = "env-key"
        try:
            self.assertEqual(scg._idempotency_key(make_args(), "fr"), "env-key-fr")
        finally:
            del os.environ["STORYCREATOR_IDEMPOTENCY_KEY"]


# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------

class ToAppStoryTests(unittest.TestCase):
    def test_french_pair_writes_native_and_legacy_keys(self):
        app_story = scg.to_app_story(make_provider_story("fr"))

        self.assertEqual(app_story["language"], "fr")
        self.assertEqual(app_story["title_pt"], "O mercado")
        self.assertEqual(app_story["title_fr"], "Le marché")
        self.assertEqual(app_story["title_native"], "Le marché")
        self.assertEqual(app_story["sentences"][0], {"pt": "O pão", "fr": "Le pain", "native": "Le pain"})
        self.assertEqual(app_story["topic"], "food, market")

    def test_english_pair_labels_english_and_keeps_pt_first(self):
        app_story = scg.to_app_story(make_provider_story("en"))

        self.assertEqual(app_story["language"], "en")
        self.assertEqual(app_story["title_pt"], "O mercado")
        self.assertEqual(app_story["title_native"], "The market")
        self.assertEqual(app_story["sentences"][0]["pt"], "O pão")
        self.assertEqual(app_story["sentences"][0]["native"], "Bread")

    def test_english_pair_uses_english_title_fallback(self):
        empty = make_provider_story("en")
        empty["title"] = {}
        app_story = scg.to_app_story(empty)

        self.assertEqual(app_story["title_pt"], "Sem título")
        self.assertEqual(app_story["title_native"], "Untitled")
        self.assertEqual(app_story["title_fr"], "Untitled")

    def test_explicit_language_wins(self):
        app_story = scg.to_app_story(make_provider_story("fr"), native_language="en")
        self.assertEqual(app_story["language"], "en")


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def template_doc(language="fr", week_start=WEEK_START):
    return {
        "language": language,
        "weekStart": week_start,
        "weekEnd": week_start + timedelta(days=7),
        "createdAt": datetime.now(timezone.utc),
        "story": {"title_pt": f"title-{language}"},
        "totalSentences": 2,
    }


class TemplateStorageTests(unittest.TestCase):
    def test_ensure_indexes_creates_both_unique_indexes(self):
        db = FakeDatabase()
        scg.ensure_story_indexes(db)

        template_indexes = db[scg.STORY_TEMPLATES_COLLECTION].indexes
        user_indexes = db[scg.STORY_COLLECTION].indexes
        self.assertEqual(template_indexes[0]["name"], "story_templates_week_language_unique")
        self.assertTrue(template_indexes[0]["unique"])
        self.assertEqual(user_indexes[0]["name"], "weeklystories_user_week_unique")

    def test_upsert_reports_insert_then_replace(self):
        db = FakeDatabase()
        app_story = scg.to_app_story(make_provider_story("fr"))

        doc_id, is_new = scg.upsert_story_template(db, "fr", app_story, WEEK_START, WEEK_END)
        self.assertTrue(is_new)

        doc_id_again, is_new_again = scg.upsert_story_template(db, "fr", app_story, WEEK_START, WEEK_END)
        self.assertFalse(is_new_again)
        self.assertEqual(doc_id, doc_id_again)
        self.assertEqual(len(db[scg.STORY_TEMPLATES_COLLECTION].docs), 1)

    def test_exists_is_language_scoped(self):
        db = FakeDatabase()
        db[scg.STORY_TEMPLATES_COLLECTION].docs.append(template_doc("fr"))

        self.assertTrue(scg.story_template_exists(db, WEEK_START, "fr"))
        self.assertFalse(scg.story_template_exists(db, WEEK_START, "en"))

    def test_find_prefers_the_exact_week_and_language(self):
        db = FakeDatabase()
        db[scg.STORY_TEMPLATES_COLLECTION].docs.extend(
            [template_doc("fr", WEEK_START), template_doc("en", WEEK_START)]
        )

        found = scg.find_week_story_template(db, WEEK_START, "en")
        self.assertEqual(found["language"], "en")
        self.assertEqual(found["weekStart"], WEEK_START)

    def test_find_falls_back_to_same_week_then_upcoming(self):
        db = FakeDatabase()
        db[scg.STORY_TEMPLATES_COLLECTION].docs.append(template_doc("fr", WEEK_START))
        fallback = scg.find_week_story_template(db, WEEK_START, "en")
        self.assertEqual(fallback["language"], "fr")  # same week, other language

        upcoming = WEEK_START + timedelta(days=14)
        db2 = FakeDatabase()
        db2[scg.STORY_TEMPLATES_COLLECTION].docs.append(template_doc("en", upcoming))
        self.assertEqual(scg.find_week_story_template(db2, WEEK_START, "en")["weekStart"], upcoming)


class LinkUserStoryTests(unittest.TestCase):
    def test_links_template_without_copying_the_story(self):
        db = FakeDatabase()
        db[scg.STORY_TEMPLATES_COLLECTION].docs.append(template_doc("fr"))

        doc_id, is_new = scg.link_user_story(db, "user-1", "fr", {"_id": "tpl-1"}, WEEK_START, WEEK_END)

        stored = db[scg.STORY_COLLECTION].docs[0]
        self.assertTrue(is_new)
        self.assertEqual(stored["_id"], doc_id)
        self.assertEqual(stored["userId"], "user-1")
        self.assertEqual(stored["templateId"], "tpl-1")
        self.assertEqual(stored["language"], "fr")
        self.assertEqual(stored["status"], "active")
        self.assertNotIn("story", stored)

    def test_relinking_preserves_created_at_and_status(self):
        db = FakeDatabase()
        created = datetime(2026, 10, 26, tzinfo=timezone.utc)
        db[scg.STORY_COLLECTION].docs.append(
            {
                "_id": "doc-1",
                "userId": "user-1",
                "weekStart": WEEK_START,
                "createdAt": created,
                "status": "completed",
                "story": {"title_pt": "legacy"},
            }
        )

        _, is_new = scg.link_user_story(db, "user-1", "fr", {"_id": "tpl-2"}, WEEK_START, WEEK_END)

        stored = db[scg.STORY_COLLECTION].docs[0]
        self.assertFalse(is_new)
        self.assertEqual(stored["createdAt"], created)
        self.assertEqual(stored["status"], "completed")
        self.assertEqual(stored["templateId"], "tpl-2")
        self.assertNotIn("story", stored)


class UserLanguageTests(unittest.TestCase):
    def test_preferred_language_is_respected(self):
        self.assertEqual(scg.user_language({"preferredLanguage": "en"}), "en")

    def test_unknown_or_missing_defaults_to_french(self):
        self.assertEqual(scg.user_language({"preferredLanguage": "de"}), "fr")
        self.assertEqual(scg.user_language({}), "fr")


class ValidationTests(unittest.TestCase):
    def args_for_validation(self, **overrides) -> argparse.Namespace:
        values = {
            "api_key": "key",
            "dry_run": False,
            "generate": True,
            "list": False,
            "languages": ["fr", "en"],
            "learning_language": "pt",
            "timeout": 60.0,
            "generation_timeout": 900.0,
            "poll_interval": 5.0,
            "save_to_mongo": False,
            "story_id": None,
            "limit": 20,
            "page": 1,
            "all_users": True,
            "user_id": None,
            "username": None,
        }
        values.update(overrides)
        return argparse.Namespace(**values)

    def test_generate_rejects_an_existing_id(self):
        error = scg.validate_args(self.args_for_validation(story_id="abc"))
        self.assertIn("story id", error)

    def test_generate_rejects_list(self):
        self.assertIsNotNone(scg.validate_args(self.args_for_validation(list=True)))

    def test_dry_run_requires_generate(self):
        error = scg.validate_args(self.args_for_validation(generate=False, dry_run=True))
        self.assertIn("--dry-run", error)

    def test_learning_language_cannot_be_generated(self):
        error = scg.validate_args(self.args_for_validation(languages=["fr", "pt"]))
        self.assertIn("--learning-language", error)

    def test_dry_run_does_not_need_an_api_key(self):
        self.assertIsNone(scg.validate_args(self.args_for_validation(api_key="", dry_run=True)))

    def test_valid_generate_args_pass(self):
        self.assertIsNone(scg.validate_args(self.args_for_validation()))


if __name__ == "__main__":
    unittest.main(verbosity=2)
