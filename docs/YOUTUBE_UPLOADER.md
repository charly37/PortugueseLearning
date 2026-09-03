# YouTube Uploader

Uploads weekly Portuguese lesson MP4 files to a YouTube channel and records the resulting video ID back into MongoDB.

## How It Works

1. Scans `weekly-audio/` for `*.mp4` files whose names follow the pattern `weekly_{mongoId}_{YYYYMMDD}_{HHmmss}.mp4`.
2. Looks up the corresponding document in the `weeklychallenges` MongoDB collection.
3. Skips files that already have a `youtube.videoId` stored in the document (idempotent).
4. Uploads each new file via the YouTube Data API v3 (resumable upload, 10 MB chunks).
5. Writes `youtube.videoId`, `youtube.url`, and `youtube.uploadedAt` back to the MongoDB document.

## One-time Setup

### 1. Create a Google Cloud project and OAuth2 credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Enable APIs**.
2. Enable the **YouTube Data API v3**.
3. Go to **Credentials** → **Create Credentials** → **OAuth client ID**.
4. Choose **Desktop app**, give it a name, and download the client ID and secret.

### 2. Obtain a refresh token (run once on your laptop)

```bash
pip install google-auth-oauthlib
python youtube-uploader/get_refresh_token.py \
  --client-id <YOUR_CLIENT_ID> \
  --client-secret <YOUR_CLIENT_SECRET>
```

A browser window opens for Google consent (select your channel account). After approving, the script prints the refresh token and the `kubectl patch` command to store all three values in the k8s secret.

### 3. Store credentials

**Local / development** — add to `.env`:

```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
```

**Kubernetes** — use the `kubectl patch` command printed by `get_refresh_token.py`, or set the values in `helm/portuguese-learning/values.yaml`.

## Usage

```bash
# Install dependencies
pip install -r youtube-uploader/requirements.txt

# Upload any new MP4 files in weekly-audio/
python youtube-uploader/upload_to_youtube.py

# Use a different directory
python youtube-uploader/upload_to_youtube.py --weekly-audio-dir /path/to/videos

# Increase verbosity
python youtube-uploader/upload_to_youtube.py --log-level DEBUG
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `YOUTUBE_CLIENT_ID` | Yes | OAuth2 client ID from Google Cloud Console |
| `YOUTUBE_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `YOUTUBE_REFRESH_TOKEN` | Yes | Long-lived refresh token (from `get_refresh_token.py`) |

## MP4 Filename Convention

Files must be named by the weekly challenge generator in the format:

```
weekly_<mongoId>_<YYYYMMDD>_<HHmmss>.mp4
```

Example: `weekly_64f1a2b3c4d5e6f7a8b9c0d1_20260831_120000.mp4`

The `<mongoId>` segment is used to look up the parent document in the `weeklychallenges` collection. Files that don't match this pattern are skipped with a warning.

## Output Summary

After each run the script logs a summary:

```
=== YouTube Upload Summary ===
Files scanned   : 3
Uploaded        : 1
Already uploaded: 2
No doc found    : 0
Errors          : 0
```
