#!/usr/bin/env python3
"""Unit tests for the podcast feed generator (stdlib only, no MongoDB needed).

Run with:
    python3 -m unittest podcast/test_generate_podcast_feed.py -v
"""

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_podcast_feed as feed  # noqa: E402

UTC = timezone.utc


def _episode(number: int, day: int, doc_id: str = "64f1a2b3c4d5e6f7a8b9c0d1") -> feed.Episode:
    published = datetime(2026, 10, day, 4, 30, tzinfo=UTC)
    return feed.Episode(
        doc_id=doc_id,
        episode_number=number,
        title=f"Leçon {number}",
        description_html="<p>Description</p>",
        link="https://dialecthub.net/weekly-challenge",
        pub_date=published,
        audio_filename=f"weekly_{doc_id}_202610{day:02d}_043000.mp3",
        audio_url=f"https://dialecthub.net/weekly-audio/weekly_{doc_id}_202610{day:02d}_043000.mp3",
        size_bytes=12_345_678,
        duration_s=1234.4,
        week_start=datetime(2026, 10, day, tzinfo=UTC),
    )


class DateHelpersTest(unittest.TestCase):
    def test_french_date(self):
        self.assertEqual(feed.format_french_date(datetime(2026, 10, 26)), "26 octobre 2026")
        self.assertEqual(feed.format_french_date(datetime(2026, 8, 3)), "3 août 2026")
        self.assertEqual(feed.format_french_date(datetime(2027, 2, 1)), "1 février 2027")

    def test_duration(self):
        self.assertEqual(feed.format_duration(0), "0:00")
        self.assertEqual(feed.format_duration(754.4), "12:34")
        self.assertEqual(feed.format_duration(3725), "1:02:05")
        self.assertIsNone(feed.format_duration(None))
        self.assertIsNone(feed.format_duration(-1))

    def test_rfc822_uses_rfc_2822_not_iso(self):
        value = datetime(2026, 10, 26, 4, 0, tzinfo=UTC)
        self.assertEqual(feed.rfc822(value), "Mon, 26 Oct 2026 04:00:00 +0000")

    def test_rfc822_treats_naive_as_utc(self):
        naive = datetime(2026, 10, 26, 4, 0)
        self.assertEqual(feed.rfc822(naive), "Mon, 26 Oct 2026 04:00:00 +0000")

    def test_current_week_start_is_monday_midnight(self):
        start = feed.current_week_start_utc()
        self.assertEqual(start.weekday(), 0)
        self.assertEqual((start.hour, start.minute, start.second), (0, 0, 0))
        self.assertEqual(start.tzinfo, UTC)


class PublishTimeTest(unittest.TestCase):
    def test_parses_generation_timestamp_from_filename(self):
        value = feed.parse_publish_time("weekly_64f1a2b3c4d5e6f7a8b9c0d1_20261026_041500.mp3")
        self.assertEqual(value, datetime(2026, 10, 26, 4, 15, tzinfo=UTC))

    def test_falls_back_to_week_start_plus_four_hours(self):
        week_start = datetime(2026, 10, 26, tzinfo=UTC)
        self.assertEqual(
            feed.parse_publish_time("not-a-weekly-file.mp3", week_start),
            datetime(2026, 10, 26, 4, 0, tzinfo=UTC),
        )

    def test_handles_naive_week_start(self):
        week_start = datetime(2026, 10, 26)  # pymongo returns naive datetimes
        self.assertEqual(
            feed.parse_publish_time("bad_name.mp3", week_start),
            datetime(2026, 10, 26, 4, 0, tzinfo=UTC),
        )


class CdataTest(unittest.TestCase):
    def test_wraps_plain_text(self):
        self.assertEqual(feed.cdata("<p>hi</p>"), "<![CDATA[<p>hi</p>]]>")

    def test_splits_embedded_cdata_terminator(self):
        # A literal "]]>" must not terminate the CDATA section early.
        root = ElementTree.fromstring(f"<root>{feed.cdata('a ]]> b')}</root>")
        self.assertEqual(root.text, "a ]]> b")


class BuildEpisodeTest(unittest.TestCase):
    def test_title_and_links(self):
        doc = {
            "_id": "abc123",
            "weekStart": datetime(2026, 10, 26, tzinfo=UTC),
            "totalChallenges": 20,
        }
        channel = feed.SHOWS["fr-pt"]
        episode = feed.build_episode(
            doc=doc,
            episode_number=3,
            channel=channel,
            base_url="https://dialecthub.net/",
            audio_base_url="https://cdn.example.org",
            size_bytes=999,
            duration_s=61.5,
            filename="weekly_abc123_20261026_041500.mp3",
        )

        self.assertEqual(episode.title, "Leçon de vocabulaire – Semaine du 26 octobre 2026")
        self.assertEqual(episode.episode_number, 3)
        self.assertEqual(episode.link, "https://dialecthub.net/weekly-challenge")
        self.assertEqual(
            episode.audio_url,
            "https://cdn.example.org/weekly-audio/weekly_abc123_20261026_041500.mp3",
        )
        self.assertIn("20 mots", episode.description_html)
        self.assertEqual(episode.pub_date, datetime(2026, 10, 26, 4, 15, tzinfo=UTC))


class ResolvePathsTest(unittest.TestCase):
    def test_derives_feed_and_cover_urls(self):
        output_dir, feed_url, cover_url = feed.resolve_paths(
            show="vocabulary",
            pair="fr-pt",
            output_root="/podcast",
            base_url="https://dialecthub.net",
        )
        self.assertEqual(output_dir, Path("/podcast/vocabulary/fr-pt"))
        self.assertEqual(
            feed_url, "https://dialecthub.net/podcast/vocabulary/fr-pt/feed.xml"
        )
        self.assertEqual(cover_url, "https://dialecthub.net/podcast/fr-pt/cover.jpg")

    def test_tolerates_trailing_slash_in_base_url(self):
        _, feed_url, cover_url = feed.resolve_paths(
            show="vocabulary",
            pair="en-pt",
            output_root="/tmp/out",
            base_url="https://dialecthub.net/",
        )
        self.assertEqual(
            feed_url, "https://dialecthub.net/podcast/vocabulary/en-pt/feed.xml"
        )
        self.assertEqual(cover_url, "https://dialecthub.net/podcast/en-pt/cover.jpg")

    def test_explicit_cover_url_wins(self):
        _, _, cover_url = feed.resolve_paths(
            show="vocabulary",
            pair="fr-pt",
            output_root="/podcast",
            base_url="https://dialecthub.net",
            cover_url="https://cdn.example.org/cover.jpg",
        )
        self.assertEqual(cover_url, "https://cdn.example.org/cover.jpg")


class RenderFeedTest(unittest.TestCase):
    def setUp(self):
        self.channel = feed.SHOWS["fr-pt"]
        self.xml = feed.render_feed(
            channel=self.channel,
            episodes=[_episode(1, 5, "aaaa"), _episode(2, 12, "bbbb")],
            feed_url="https://dialecthub.net/podcast/vocabulary/fr-pt/feed.xml",
            base_url="https://dialecthub.net",
            cover_url="https://dialecthub.net/podcast/fr-pt/cover.jpg",
            episode_type="episodic",
            build_time=datetime(2026, 10, 12, 7, 0, tzinfo=UTC),
        )

    def test_is_well_formed_xml(self):
        root = ElementTree.fromstring(self.xml)
        self.assertEqual(root.tag, "rss")
        self.assertEqual(root.get("version"), "2.0")

    def test_channel_metadata(self):
        self.assertIn("<language>fr</language>", self.xml)
        self.assertIn('<itunes:category text="Education">', self.xml)
        self.assertIn('<itunes:category text="Language Learning"/>', self.xml)
        self.assertIn("<itunes:type>episodic</itunes:type>", self.xml)
        self.assertIn("<itunes:email>admin@dialecthub.net</itunes:email>", self.xml)
        self.assertIn(
            '<atom:link href="https://dialecthub.net/podcast/vocabulary/fr-pt/feed.xml" rel="self" '
            'type="application/rss+xml"/>',
            self.xml,
        )

    def test_guid_is_the_mongo_id(self):
        self.assertIn('<guid isPermaLink="false">aaaa</guid>', self.xml)
        self.assertIn('<guid isPermaLink="false">bbbb</guid>', self.xml)

    def test_enclosure_has_exact_length_and_mime(self):
        self.assertIn(
            'length="12345678" type="audio/mpeg"/>',
            self.xml,
        )
        self.assertIn("/weekly-audio/weekly_aaaa_20261005_043000.mp3", self.xml)

    def test_episodes_are_newest_first(self):
        self.assertLess(self.xml.index("<guid isPermaLink=\"false\">bbbb"),
                        self.xml.index("<guid isPermaLink=\"false\">aaaa"))

    def test_itunes_duration_present(self):
        self.assertIn("<itunes:duration>20:34</itunes:duration>", self.xml)

    def test_empty_feed_still_valid(self):
        xml = feed.render_feed(
            channel=self.channel,
            episodes=[],
            feed_url="https://dialecthub.net/podcast/vocabulary/fr-pt/feed.xml",
            base_url="https://dialecthub.net",
            cover_url="https://dialecthub.net/podcast/fr-pt/cover.jpg",
            episode_type="episodic",
            build_time=datetime(2026, 10, 12, 7, 0, tzinfo=UTC),
        )
        ElementTree.fromstring(xml)
        self.assertNotIn("<item>", xml)


if __name__ == "__main__":
    unittest.main()
