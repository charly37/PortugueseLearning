#!/usr/bin/env npx ts-node
/**
 * One-time seed: imports the 3 challenge JSON files into the MongoDB `challenges` collection.
 * Safe to re-run — uses upsert so existing documents are updated, not duplicated.
 *
 * Usage:
 *   MONGODB_URI=<uri> npx ts-node data/seed-mongodb.ts
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Challenge from '../src/models/Challenge';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname);

const FILES: Array<{ file: string; type: 'word' | 'verb' | 'idiom' }> = [
  { file: 'challenges.json',       type: 'word'  },
  { file: 'verb-challenges.json',  type: 'verb'  },
  { file: 'idiom-challenges.json', type: 'idiom' },
];

async function seed(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI environment variable not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  for (const { file, type } of FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`WARN: ${file} not found, skipping`);
      continue;
    }

    const raw: any[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let upserted = 0;
    let failed = 0;

    for (const item of raw) {
      const { id, ...fields } = item;
      if (!id) { failed++; continue; }

      try {
        await Challenge.findByIdAndUpdate(
          id,
          { _id: id, type, schemaVersion: 1, ...fields },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        upserted++;
      } catch (err) {
        console.error(`  Failed to upsert ${id}:`, err);
        failed++;
      }
    }

    console.log(`[${type}] ${file}: ${upserted} upserted, ${failed} failed`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
