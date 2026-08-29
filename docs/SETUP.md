# Setup Guide

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- MongoDB Atlas account (free tier available at [mongodb.com](https://www.mongodb.com/cloud/atlas))

## Installation

```bash
# Install project dependencies
npm install

# Install Playwright browsers and system dependencies (required for testing)
npx playwright install --with-deps chromium
```

## Environment Setup

1. Copy the `.env.example` file to create a `.env` file:

```bash
cp .env.example .env
```

2. Update the `.env` file with your MongoDB Atlas credentials:

```env
MONGODB_URI=mongodb+srv://<db_username>:<db_password>@cluster0.kn6sc.mongodb.net/?appName=Cluster0
SESSION_SECRET=your-secret-key-change-in-production
NODE_ENV=development
PORT=3000
```

Replace `<db_username>` and `<db_password>` with your actual MongoDB Atlas credentials.

## MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account or sign in
3. Create a new cluster (free tier is sufficient)
4. Create a database user with username and password
5. Add your IP address to the IP whitelist (or allow access from anywhere for development: 0.0.0.0/0)
6. Get your connection string from the "Connect" button
7. Replace `<db_username>` and `<db_password>` in your `.env` file

## Development

Run both the server and client in development mode:

```bash
npm run dev
```

- Backend server runs on: http://localhost:3000
- Frontend dev server runs on: http://localhost:8080

## Production Build

Build both server and client:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Available Scripts

- `npm run dev` - Run both server and client in development mode
- `npm run dev:server` - Run only the server in development mode
- `npm run dev:client` - Run only the client in development mode
- `npm run build` - Build both server and client for production
- `npm run build:server` - Build only the server
- `npm run build:client` - Build only the client
- `npm start` - Start the production server
- `npm test` - Run Playwright tests in headless mode
- `npm run test:headed` - Run tests with visible browser
- `npm run test:ui` - Open Playwright UI for interactive testing
- `npm run test:report` - View the latest test report

## Database Backup & Restore

Two Python scripts in `scripts/` handle full BSON backups via the [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/) (`mongodump` / `mongorestore`). These must be installed separately and available on your PATH.

**Collections covered:** `users`, `challengeattempts`, `challenges`, `challengequalityflags`, `userwordvotes`, `weeklychallenges`, `weeklystories` (sessions are excluded — ephemeral data).

### Backup

```bash
MONGODB_URI=<uri> python scripts/backup_mongodb.py
```

Creates `backups/<YYYY-MM-DD_HH-MM-SS>/` with BSON files and a `backup_metadata.json` summary. A `backups/latest` symlink always points to the most recent backup.

```bash
# Preview without writing anything
MONGODB_URI=<uri> python scripts/backup_mongodb.py --dry-run

# Write backups to a custom directory
MONGODB_URI=<uri> python scripts/backup_mongodb.py --output-dir /mnt/backups
```

### Restore

```bash
# Restore from the latest backup (prompts for confirmation)
MONGODB_URI=<uri> python scripts/restore_mongodb.py

# Restore a specific snapshot
MONGODB_URI=<uri> python scripts/restore_mongodb.py backups/2026-08-29_14-30-00

# Skip confirmation (useful in automation / cron jobs)
MONGODB_URI=<uri> python scripts/restore_mongodb.py --yes
```

> **Warning:** Restore is a DROP-and-replace operation. Every covered collection is wiped before the backup data is inserted. Do not run against a live production database unless you intend to overwrite it.

The `backups/` directory is listed in `.gitignore` — it can contain user PII and should never be committed.
