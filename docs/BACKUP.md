# Database Backup & Restore

Two scripts in `scripts/` handle full BSON backups of MongoDB via the
[MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/)
(`mongodump` / `mongorestore`).

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
