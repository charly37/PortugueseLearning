// Reads the podcast episode manifest that podcast/generate_podcast_feed.py writes
// next to feed.xml, so the website and the RSS feed always publish the same
// episodes: one CronJob run produces both files.
//
// Nothing here touches MongoDB or the session, so the page built on top of it is
// public. When the feed generator starts publishing a different source (e.g.
// weeklychallenge_templates), this module needs no change - it keeps reading
// whatever the job wrote.

import fs from 'fs';
import path from 'path';
import logger from '../logger';

const log = logger.child({ module: 'podcast-manifest' });

export const MANIFEST_FILENAME = 'episodes.json';

const DEFAULT_SHOW = 'vocabulary';
const DEFAULT_PAIR = 'fr-pt';
const AUDIO_PREFIX = '/weekly-audio';

/** Raw entry as written by generate_podcast_feed.py -> _episodes_json(). */
interface ManifestEpisode {
  episodeNumber?: number;
  docId?: string;
  title?: string;
  pubDate?: string;
  filename?: string;
  sizeBytes?: number;
  durationSeconds?: number | null;
}

/** Entry as exposed to the client: audioUrl is always same-origin and relative. */
export interface PodcastEpisode {
  episodeNumber: number;
  docId: string;
  title: string;
  pubDate: string;
  filename: string;
  audioUrl: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

export interface PodcastShow {
  pair: string;
  show: string;
  nativeLanguage: string;
  feedUrl: string;
  coverUrl: string;
  episodes: PodcastEpisode[];
}

/** Directory holding every show/pair (hostPath volume in production). */
export function podcastRoot(): string {
  return process.env.PODCAST_PATH || path.join(__dirname, '../../podcast');
}

export function showName(): string {
  return process.env.PODCAST_SHOW || DEFAULT_SHOW;
}

/** Language pairs rendered by the podcast-feed CronJob, e.g. "fr-pt,en-pt". */
export function configuredPairs(): string[] {
  const pairs = (process.env.PODCAST_PAIRS || '')
    .split(',')
    .map(pair => pair.trim())
    .filter(Boolean);

  // Fall back to the first published pair so local dev and tests still render a
  // show tab instead of an empty page.
  return pairs.length > 0 ? pairs : [DEFAULT_PAIR];
}

/** "fr-pt" -> "fr": native language first, learning language second. */
export function nativeLanguageForPair(pair: string): string {
  return pair.split('-')[0] || '';
}

export function feedUrlFor(pair: string, show = showName()): string {
  return `/podcast/${show}/${pair}/feed.xml`;
}

/** Cover art ships with the client bundle (webpack copies src/images/podcast). */
export function coverUrlFor(pair: string): string {
  return `/podcast/${pair}/cover.jpg`;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeEpisode(raw: ManifestEpisode): PodcastEpisode | null {
  if (!raw || typeof raw !== 'object') return null;
  const docId = typeof raw.docId === 'string' ? raw.docId.trim() : '';
  const filename = typeof raw.filename === 'string' ? raw.filename.trim() : '';
  if (!docId || !filename) return null;

  return {
    episodeNumber: toNumber(raw.episodeNumber, 0),
    docId,
    title: typeof raw.title === 'string' ? raw.title : '',
    pubDate: typeof raw.pubDate === 'string' ? raw.pubDate : '',
    filename,
    // Same-origin relative URL: works in dev/staging and lets the browser honour
    // the `download` attribute. The absolute URL stays in the manifest for RSS.
    audioUrl: `${AUDIO_PREFIX}/${encodeURIComponent(filename)}`,
    sizeBytes: toNumber(raw.sizeBytes, 0),
    durationSeconds:
      typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds)
        ? raw.durationSeconds
        : null,
  };
}

/**
 * Episodes of one show/pair, newest first.
 *
 * Returns an empty list (never throws) when the manifest is missing, unreadable or
 * malformed: the feed job may not have run yet, and a public page must degrade to
 * an empty state rather than an error page.
 */
export function readManifest(show: string, pair: string): PodcastEpisode[] {
  const filePath = path.join(podcastRoot(), show, pair, MANIFEST_FILENAME);

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn({ err, path: filePath }, 'failed to read podcast manifest');
    }
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn({ err, path: filePath }, 'podcast manifest is not valid JSON');
    return [];
  }

  if (!Array.isArray(parsed)) {
    log.warn({ path: filePath }, 'podcast manifest is not a JSON array');
    return [];
  }

  const episodes = parsed
    .map(entry => normalizeEpisode(entry as ManifestEpisode))
    .filter((episode): episode is PodcastEpisode => episode !== null)
    // The feed is episodic (newest first); mirror that ordering on the page.
    .sort((a, b) => b.episodeNumber - a.episodeNumber);

  if (episodes.length !== parsed.length) {
    log.warn(
      { path: filePath, skipped: parsed.length - episodes.length },
      'podcast manifest contained unusable episode entries'
    );
  }

  return episodes;
}

/** One entry per configured language pair, for the page tabs. */
export function readShows(): PodcastShow[] {
  const show = showName();
  return configuredPairs().map(pair => ({
    pair,
    show,
    nativeLanguage: nativeLanguageForPair(pair),
    feedUrl: feedUrlFor(pair, show),
    coverUrl: coverUrlFor(pair),
    episodes: readManifest(show, pair),
  }));
}

/**
 * Allow-list lookup: only docIds that the published manifest links to may be
 * expanded, so private per-user weekly lessons can never be enumerated.
 */
export function findPublishedEpisode(pair: string, docId: string): PodcastEpisode | null {
  if (!configuredPairs().includes(pair)) return null;
  return readManifest(showName(), pair).find(episode => episode.docId === docId) || null;
}
