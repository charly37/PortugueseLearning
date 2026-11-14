# Backup & Restore

Backups cover two things:

1. **MongoDB** — the scripts in `scripts/` dump the database to BSON via the
   [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/)
   (`mongodump` / `mongorestore`). In production the `<release>-backup` CronJob runs this weekly
   (see [DEPLOYMENT.md](DEPLOYMENT.md)).
2. **The `/home/ubuntu/PortugueseLearning` folder on the VM** — the website's most valuable
   runtime content (`sounds/`, `weekly-audio/`, `podcast/`, `backup/`, `data/`) is copied to the
   maintainer's **local laptop** with `rsync`. This is a fully manual step: see
   [Full project backup to a local laptop](#full-project-backup-to-a-local-laptop-rsync).

The filesystem copy is the safety net for the ElevenLabs MP3s — they are expensive to
regenerate — and for the in-cluster MongoDB dumps. The MongoDB database itself lives in Atlas,
not on the VM.

## Prerequisites

Install the **MongoDB Database Tools** and make sure `mongodump` and `mongorestore`
are on your `PATH`. The scripts will exit with a clear error if either tool is missing.

- macOS: `brew install mongodb-database-tools`
- Debian/Ubuntu: follow the [official install guide](https://www.mongodb.com/docs/database-tools/installation/installation-linux/)
- Windows: download the MSI from the link above

Python dependency: `pymongo` (already in `requirements.txt`).

---

## Backup

`scripts/backup_mongodb.py` dumps every collection **except `sessions`** to BSON using
`mongodump`.

### Basic usage

```bash
MONGODB_URI=<uri> python scripts/backup_mongodb.py
```

Creates `backups/<YYYY-MM-DD_HH-MM-SS>/` in the working directory and updates a
`backups/latest` symlink to point to the new snapshot.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--output-dir <path>` | `backups/` | Directory that will contain snapshot subdirectories |
| `--dry-run` | off | Print what would happen without writing any files |

### Examples

```bash
# Preview what would be backed up (no files written)
MONGODB_URI=<uri> python scripts/backup_mongodb.py --dry-run

# Write snapshots to a custom location
MONGODB_URI=<uri> python scripts/backup_mongodb.py --output-dir /mnt/backups
```

### Output structure

```
backups/
  2026-09-18_10-30-00/
    <database-name>/
      challenges.bson
      challenges.metadata.json
      users.bson
      users.metadata.json
      ...
    backup_metadata.json   ← document counts, timestamp, source host
  latest -> 2026-09-18_10-30-00   (symlink)
```

`backup_metadata.json` records the UTC timestamp, redacted source URI, `mongodump`
version, excluded collections, and per-collection document counts.

> The `backups/` directory is listed in `.gitignore`. It can contain user PII and must
> never be committed.

---

## Restore

`scripts/restore_mongodb.py` restores collections from a snapshot using `mongorestore`.

> **Warning:** This is a **DROP-and-replace** operation. Every collection covered by
> the backup is wiped before the backup data is inserted. Do not run against a live
> production database unless you intend to permanently overwrite its data.

### Basic usage

```bash
# Restore from the most recent snapshot (uses backups/latest symlink)
MONGODB_URI=<uri> python scripts/restore_mongodb.py

# Restore a specific snapshot
MONGODB_URI=<uri> python scripts/restore_mongodb.py backups/2026-09-18_10-30-00
```

Both commands display a summary of what will be overwritten and prompt for confirmation
before proceeding.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `backup_dir` (positional) | `backups/latest` | Path to the snapshot directory to restore |
| `--yes` / `-y` | off | Skip the confirmation prompt (useful in scripts) |

### Examples

```bash
# Skip the confirmation prompt (e.g. in an automated recovery script)
MONGODB_URI=<uri> python scripts/restore_mongodb.py --yes

# Restore a specific snapshot without prompting
MONGODB_URI=<uri> python scripts/restore_mongodb.py backups/2026-09-18_10-30-00 --yes
```

---

## Automating backups

To run a nightly backup via cron (example: every day at 3 AM):

```cron
0 3 * * * cd /path/to/PortugueseLearning && MONGODB_URI=<uri> python scripts/backup_mongodb.py --output-dir /mnt/backups >> /var/log/mongodb-backup.log 2>&1
```

Rotate old snapshots periodically to manage disk space, e.g. keep the last 30 days:

```bash
find /mnt/backups -maxdepth 1 -mindepth 1 -type d -mtime +30 -exec rm -rf {} +
```

---

## Full project backup to a local laptop (rsync)

The database scripts above only cover MongoDB. Everything else that matters on the VM lives in
`/home/ubuntu/PortugueseLearning`, and the maintainer copies it to a **local laptop** with `rsync`.
There is no automation — run it whenever you want a fresh copy.

### What is copied

| Path under `/home/ubuntu/PortugueseLearning` | Content | Why keep it |
|---|---|---|
| `sounds/` | ~19k ElevenLabs MP3s | expensive to regenerate |
| `weekly-audio/` | generated weekly lesson MP3s | regenerable but convenient |
| `podcast/` | generated RSS feeds | published episode history |
| `backup/` | `mongodump` snapshots from the `<release>-backup` CronJob | database safety net |
| `data/*.json` | vocabulary source data | also in git, but cheap to include |
| source code (`src/`, `helm/`, `scripts/`, …) | application code | already in GitHub; optional |

The rsync excludes are build/dependency junk (`node_modules/`, `dist/`, `public/bundle.js`,
`.git/`, `__pycache__/`, `playwright-report/`, `test-results/`). Drop `--exclude '.git/'` if you
want the full Git history in the copy.

### One snapshot per run (recommended)

Each run creates a new `snapshots/<timestamp>/` directory, but unchanged files are **hardlinked**
to the previous snapshot via `--link-dest`, so extra snapshots cost almost no disk space.

```bash
cd ~/code/PortugueseLearningBackups
STAMP=$(date +%F_%H%M%S)
LATEST=$(readlink -f "$PWD/latest" 2>/dev/null || true)

# rsync only creates the last path component, so create snapshots/ first.
mkdir -p "$PWD/snapshots"

rsync -aHAX --numeric-ids --partial --human-readable --info=progress2 \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude 'dist/' \
  --exclude 'public/bundle.js' \
  --exclude '__pycache__/' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  ${LATEST:+--link-dest="$LATEST"} \
  ubuntu@<vm-host>:/home/ubuntu/PortugueseLearning/ \
  "$PWD/snapshots/$STAMP/"

ln -sfn "$PWD/snapshots/$STAMP" "$PWD/latest"
```

- Replace `<vm-host>` with the VM's hostname or IP.
- Trailing slash on the source is required (copies the contents, not the folder itself).
- The first run copies everything; later runs only transfer new/changed files.
- `--partial` makes interrupted runs resumable — rerun with the **same** `$STAMP`.
- On rsync ≥ 3.2.3, `--mkpath` also works and removes the need for `mkdir -p`.

> **Common error:** `mkdir ".../snapshots/<timestamp>" failed: No such file or directory (2)`
> just means `snapshots/` did not exist yet (rsync only creates the final directory). Fix it with
> `mkdir -p snapshots` or add `--mkpath`.

### Verify a backup

```bash
# Snapshots and their sizes
du -sh ~/code/PortugueseLearningBackups/snapshots/*

# MP3 count on the VM vs the local latest snapshot (should match)
ssh ubuntu@<vm-host> 'find /home/ubuntu/PortugueseLearning/sounds -type f | wc -l'
find ~/code/PortugueseLearningBackups/latest/sounds -type f | wc -l

# Dry-run: what still differs between the VM and the local snapshot?
rsync -aHAXn --delete --itemize-changes \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude 'dist/' \
  --exclude 'public/bundle.js' \
  --exclude '__pycache__/' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  ubuntu@<vm-host>:/home/ubuntu/PortugueseLearning/ \
  ~/code/PortugueseLearningBackups/latest/
```

An empty dry-run output means the snapshot matches the VM (excluding the ignored build/runtime
junk above).

### Restoring files to the VM

Restores are **destructive** — always dry-run first and stop the app/CronJobs before overwriting:

```bash
# 1. Preview what would change on the VM
rsync -aHAXn --itemize-changes \
  ~/code/PortugueseLearningBackups/latest/ \
  ubuntu@<vm-host>:/home/ubuntu/PortugueseLearning/

# 2. Apply (add --delete only if you want an exact mirror of the snapshot)
rsync -aHAX --info=progress2 \
  ~/code/PortugueseLearningBackups/latest/ \
  ubuntu@<vm-host>:/home/ubuntu/PortugueseLearning/
```

After restoring, fix ownership if needed (`sudo chown -R ubuntu:ubuntu /home/ubuntu/PortugueseLearning`)
and make sure `sounds/` and `podcast/` are writable by uid **1000** for the CronJobs.

### Notes and caveats

- **Never target the source folder itself** — the destination must be outside
  `/home/ubuntu/PortugueseLearning`.
- The copy includes **`.env`** (MongoDB URI, session secret). Keep the backup drive secure and do
  not upload it to cloud storage unencrypted.
- Avoid running the copy during the Monday CronJob window (03:00–09:00 UTC); `backup/` and
  `sounds/` change during that time.
- If the laptop drive is exFAT/NTFS, `-aHAX` will warn about permissions/xattrs — format the
  backup drive as ext4, or use `-rt --no-permissions --no-owner --no-group --modify-window=1`.
- This is a manual procedure by design: it is the maintainer's laptop copy, not a cluster job.
