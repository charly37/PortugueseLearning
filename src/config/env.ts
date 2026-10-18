import dotenv from 'dotenv';

// Load environment variables before any other module reads process.env at
// import time (notably src/logger.ts). Node evaluates imports in order, so
// `import './config/env'` must remain the first import in src/server.ts.
//
// In test mode, use .env.test; otherwise use .env.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
// quiet: true keeps dotenv's startup message off stdout so every log line
// remains a single JSON object for the log collector.
dotenv.config({ path: envFile, quiet: true });
