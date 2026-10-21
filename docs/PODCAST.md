# Podcast RSS Feed

Publishes the weekly vocabulary lesson MP3 (the same audio that is uploaded to YouTube) as a
podcast, via a standard **RSS 2.0 + iTunes** feed consumed by Apple Podcasts, Spotify, YouTube
Music, Pocket Casts and any other podcast directory.

| | |
|---|---|
| Feed URL | `https://dialecthub.net/podcast/feed.xml` |
| Cover art | `https://dialecthub.net/podcast/cover.jpg` |
| Source audio | `https://dialecthub.net/weekly-audio/weekly_{docId}_{YYYYmmdd}_{HHmmss}.mp3` |
| Generator | `podcast/generate_podcast_feed.py` (weekly CronJob) |
| Show type | `episodic` (newest episode first) |
| Language | French (`fr`) — an English feed is a later addition |

> ⚠️ **The feed URL is permanent.** Once submitted to Apple/Spotify, changing it means creating a
> new show. Treat `https://dialecthub.net/podcast/feed.xml` as an API contract.

## How It Works

```mermaid
flowchart LR
    A["Mon 03:00<br/>create_weekly_challenge.py<br/>--all-users"] --> B["Mon 04:00<br/>combine_mp3.py<br/>--weekly-challenge"]
    B --> C["weekly-audio/weekly_{id}_{ts}.mp3<br/>+ Mongo audio.duration_s / size_bytes"]
    C --> D["Mon 06:30<br/>upload_to_youtube.py"]
    C --> E["Mon 07:00<br/>generate_podcast_feed.py"]
    E --> F["podcast/feed.xml<br/>served at /podcast/feed.xml"]
```

1. The **global** lesson is the `weeklychallenges` document with `userId: null` (per-user lessons
   stay private — they are never published to YouTube or the podcast).
2. `combine_mp3.py` writes `weekly_{docId}_{YYYYmmdd}_{HHmmss}.mp3` into `/weekly-audio` and stores
   `audio.filename`, `audio.last_update`, `audio.duration_s` and `audio.size_bytes` in MongoDB.
3. `generate_podcast_feed.py` selects global lessons whose `weekStart >= --first-week`, resolves each
   MP3 (falling back to `stat`/`ffprobe` and backfilling Mongo when the metadata is missing), and
   writes `feed.xml` **atomically** (`feed.xml.tmp` → `os.replace`).
4. Express serves that directory at `/podcast` (`PODCAST_PATH` env var, default `/app/podcast`) with
   `Content-Type: application/rss+xml; charset=utf-8` and a 5-minute cache.

Because the feed is regenerated weekly, it always reflects the current MongoDB state — there is no
incremental publishing step and no "publish" button.

## Feed Structure

Channel level (French):

- `title` — *DialectHub – Leçon de vocabulaire portugais européen*
- `itunes:author` / `itunes:owner` — DialectHub, `admin@dialecthub.net`
- `itunes:category` — `Education > Language Learning` (Apple requires these exact English names)
- `itunes:type` — `episodic` (`podcast.episodeType` in `values.yaml`)
- `itunes:explicit` — `false`, `language` — `fr`

Episode level:

| Element | Value |
|---|---|
| `title` | `Leçon de vocabulaire – Semaine du 26 octobre 2026` |
| `guid` (`isPermaLink="false"`) | the raw `weeklychallenges._id` — **must never change** |
| `pubDate` | RFC 822, parsed from the `YYYYmmdd_HHmmss` timestamp in the filename (UTC) |
| `enclosure` | `/weekly-audio/<filename>`, exact `length` in bytes, `type="audio/mpeg"` |
| `itunes:duration` | `M:SS` or `H:MM:SS`, from `audio.duration_s` or ffprobe |
| `itunes:episode` | stable sequence number stored as `podcast.episodeNumber` |
| `itunes:image` | the cover art URL |

Episode numbers are assigned **once** and persisted, so changing `--first-week` or skipping a week
never renumbers already-published episodes.

## Why some lessons are not in the feed

- **Per-user lessons** (documents with a `userId`) are excluded: they are built from each learner's
  weak words.
- **Lessons older than `podcast.firstWeek`** are excluded on purpose — the show does not backfill
  the archive that existed before podcasting was enabled.
- **Lessons whose MP3 is missing** are skipped with a warning in the CronJob log.

## Cover Art

Apple Podcasts and Spotify both require:

- Square, **1400 × 1400** to **3000 × 3000** pixels
- RGB, JPEG or PNG
- Under **512 KB**
- No transparency, no rounded corners, no explicit content

The cover is committed with the source and shipped with the web app, exactly like the favicons:

```
src/images/podcast-cover.jpg      (source — commit this)
        │  webpack CopyPlugin
        ▼
public/podcast/cover.jpg          (build output, served by Express)
        │
        ▼
https://dialecthub.net/podcast/cover.jpg
```

- Add or replace the file at `src/images/podcast-cover.jpg`, then rebuild (`npm run build`). The
  rule in `webpack.config.js` copies it to `public/podcast/cover.jpg`, which `express.static` serves
  before the `/podcast` feed mount — nothing is copied to the node, so updating the artwork is just
  a commit + image build + `helm upgrade`.
- The copy is `noErrorOnMissing`, so a build never fails before the artwork is added. Until the file
  exists the URL returns 404 and Apple/Spotify will reject the feed; the app logs
  `podcast cover art missing` at startup when the built file is absent.
- The generator does not validate the image (the CronJob cannot read `public/`). To check the
  committed file locally:
  `python3 podcast/generate_podcast_feed.py --cover src/images/podcast-cover.jpg …`

## Configuration

`helm/portuguese-learning/values.yaml`:

```yaml
podcast:
  hostPath: /home/ubuntu/PortugueseLearning/podcast
  firstWeek: "2026-10-26"   # no earlier lesson is published
  baseUrl: ""               # empty → https://<ingress.host>
  audioBaseUrl: ""          # empty → same as baseUrl
  coverUrl: ""              # empty → https://<ingress.host>/podcast/cover.jpg
  episodeType: episodic

podcastFeed:
  schedule: "0 7 * * 1"
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
```

`audioBaseUrl` exists so the MP3 delivery host can be changed later (Cloudflare proxy, R2 bucket)
without touching code — see *Moving the audio to a CDN* below.

## Deployment

### One-time: create the host directory

Both the Deployment and the CronJob mount the podcast directory with `hostPath: type: Directory`,
so it **must exist before `helm upgrade`** — otherwise the pod stays in `ContainerCreating` with a
`hostPath type check failed` event.

```bash
ssh ubuntu@<node>
sudo mkdir -p /home/ubuntu/PortugueseLearning/podcast
sudo chown 1000:1000 /home/ubuntu/PortugueseLearning/podcast   # the job runs as appuser (uid 1000)
```

Then deploy:

```bash
helm upgrade --install prod helm/portuguese-learning \
  --namespace portuguese-learning \
  --values helm/portuguese-learning/values-prod.yaml \
  --set image.app.tag=<version> \
  --set image.analytics.tag=<version>
```

### Run the generator immediately

The CronJob only fires on Monday 07:00. To publish now:

```bash
kubectl create job --from=cronjob/prod-podcast-feed -n portuguese-learning podcast-feed-manual-1
kubectl logs -n portuguese-learning job/podcast-feed-manual-1 -f
```

### Local run

Dependencies: `pymongo` and `ffprobe` (from `ffmpeg`). Neither needs to be declared for the
container — the shared analytics image already installs `pymongo` through
`weekly_challenge/requirements.txt` (and `vocal_lesson_creator/requirements.txt`) and ships
`ffmpeg`. For a local run: `pip install pymongo`.

```bash
# .env must provide MONGODB_URI
set -a && . ./.env && set +a

python3 podcast/generate_podcast_feed.py \
  --audio-dir ./weekly-audio \
  --output-dir /tmp/podcast \
  --first-week 2000-01-01 \
  --base-url https://dialecthub.net

xmllint --noout /tmp/podcast/feed.xml
```

`--dry-run` prints the XML to stdout without writing files or touching MongoDB.

### Unit tests

```bash
python3 -m unittest podcast/test_generate_podcast_feed.py -v
```

## Submitting the show

Do this once, after the feed contains **at least one episode** and returns HTTP 200:

1. Verify the feed is publicly reachable and well formed:
   `curl -sI https://dialecthub.net/podcast/feed.xml` → `200`, `application/rss+xml`.
2. Validate with a cast-feed validator (e.g. Cast Feed Validator or Podcast Validator) — fix any
   errors before submitting. Most rejections are a missing `itunes:image` or a bad enclosure length.
3. **Apple Podcasts** — [Podcasts Connect](https://podcastsconnect.apple.com): *New Show* → paste
   the feed URL. Apple reviews manually (a few days).
4. **Spotify** — [Spotify for Creators](https://creators.spotify.com): *Add a podcast* → *Use an
   existing RSS feed*.
5. **YouTube Music / Amazon Music** — same RSS flow, separate submission.
6. Afterwards, platforms poll the feed on their own schedule (Spotify: hours; Apple: daily). New
   episodes appear with no further action.

There is **no API** for podcast submission: all of the above is manual UI work, once per platform.

## Moving the audio to a CDN later

Spotify and Apple stream from the `<enclosure>` URL on **every play** (unlike YouTube, which
downloads and rehosts). A 30 MB weekly episode served from the k3s node is fine for a small
audience; if traffic grows:

1. **Cloudflare in front of the apex** — all URLs stay identical, but the apex must then use a
   **DNS-01** challenge (the current HTTP-01 renewal breaks behind an orange-cloud proxy). This is
   the only option that keeps `dialecthub.net/weekly-audio/...` unchanged with zero feed edits.
2. **Different host** (e.g. `audio.dialecthub.net` on R2) — set `podcast.audioBaseUrl`, redeploy,
   and run the job: all `<enclosure>` URLs are rewritten in the feed while `guid`s stay stable, so
   directories update the episodes in place.

**Never delete MP3s that the feed references.** `/weekly-audio` currently has no retention, and it
must not get one without excluding the published episodes.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `permission denied` writing `/podcast` | Host directory not owned by uid 1000 — `sudo chown 1000:1000` |
| Pod stuck `ContainerCreating`, `hostPath type check failed` | Create the host directory before `helm upgrade` |
| Feed returns the React `index.html` | A route was registered after the `/{*path}` catch-all in `src/server.ts` |
| Feed has no `<item>` | No global lesson with `weekStart >= firstWeek`, or the MP3 was missing — check job logs |
| Apple rejects the feed | Missing/invalid cover art at `/podcast/cover.jpg` (check `src/images/podcast-cover.jpg` was committed and the client rebuilt), or the feed URL redirects (must be plain HTTPS 200) |
| Episode order looks wrong in Apple | `episodic` shows newest first by `pubDate`; verify the container clock is UTC |
| Numbering jumps after editing `firstWeek` | Expected for newly included lessons; existing episodes keep their numbers |

## Related Documentation

- [Audio Generation](AUDIO_GENERATION.md) — how `sounds/*.mp3` are produced
- [Vocal Lesson Creator](VOCAL_LESSON_CREATOR.md) — the weekly MP3 builder
- [YouTube Uploader](YOUTUBE_UPLOADER.md) — the video counterpart of this pipeline
- [Deployment](DEPLOYMENT.md) — Helm, k3s and hostPath layout
