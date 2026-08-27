# Portuguese Learning App - AI Agent Guide

## Documentation Structure

This project follows a **lean README + detailed docs** pattern:

- **[README.md](../README.md)**: Short overview (~30 lines) with Quick Start + features + links to docs
- **[docs/](../docs/)**: All detailed documentation organized by topic:
  - `SETUP.md` - Installation, environment setup, MongoDB Atlas, scripts
  - `design.md` - Architecture, features, project structure
  - `TESTING.md` - Playwright setup, test patterns
  - `DEPLOYMENT.md` - Docker, CI/CD, deployment scripts
  - `AUTHENTICATION_SETUP.md` - User auth implementation
  - `HTTPS_SETUP.md` - SSL certificate setup
  - `PROGRESS_TRACKING.md` - Development milestones
  - `TODO.md` - Planned improvements and known issues

**When documenting**: Keep README minimal. Add detailed content to appropriate topic-specific doc file in `docs/`. Never duplicate content between README and docs.

## Architecture Overview

Full-stack Portuguese language learning application with **separated build systems**:
- **Backend**: Express.js + TypeScript (compiled with `tsc` to `dist/`)
- **Frontend**: React + TypeScript (bundled with webpack to `public/`)
- **Database**: MongoDB Atlas (cloud-hosted, connection via `MONGODB_URI`)
- **Deployment**: Kubernetes/k3s via Helm (Traefik ingress + Node.js app pod + Python analytics CronJob)

Key architectural pattern: Backend serves static frontend from `public/` directory after both are built.

## Critical Workflows

### Development
```bash
npm run dev          # Runs BOTH: backend (port 3000) + webpack-dev-server (port 8080)
                    # webpack proxies /api/* requests to backend
```

### Testing
```bash
npm test            # Uses MongoDB Memory Server (auto-managed, no Atlas needed)
./run-tests.sh      # Wrapper that starts/stops in-memory MongoDB + runs Playwright
```
- Tests use `.env.test` (auto-generated, never committed)
- In CI: Only `@smoke` tagged tests run (grep filter in `playwright.config.ts`)
- Playwright config: 2 projects (chromium desktop, Pixel 7 mobile)

### Building
```bash
npm run build       # Sequentially: build:server THEN build:client
npm run build:server  # tsc -p tsconfig.server.json → dist/
npm run build:client  # webpack --mode production → public/bundle.js
```

### Deployment
- Production uses Docker multi-stage builds (`Dockerfile`)
- Deployed on k3s via Helm charts (`helm/portuguese-learning/`)
- CI/CD: GitHub Actions builds and pushes images; release workflow packages and uploads the Helm chart

## Project-Specific Conventions

### Data Loading Pattern
Challenges loaded at server startup from JSON files (`data/*.json`), not database:
```typescript
// src/server.ts & src/routes/challenge.ts
const challenges = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/challenges.json'), 'utf-8'));
```
- `challenges.json`: Word translations (~3000 entries)
- `verb-challenges.json`: Verb conjugations
- `idiom-challenges.json`: Portuguese expressions

Challenge structure:
```json
{"id": "uuid", "port": "palavra", "fr": {"translation": "...", "note": "..."}, "en": {...}}
```

### Session Management
- Uses `express-session` with MongoDB store (`connect-mongo`)
- Session stored in `req.session.userId` (not JWT)
- Auth middleware: `requireAuth` checks `req.session.userId` existence
- Cookie config: `httpOnly: true`, `secure: false` (Traefik handles HTTPS termination at ingress level)

### Internationalization (i18n)
- Client-side only, using `react-i18next`
- Languages: `fr` (French), `en` (English)
- Translation files: `src/locales/{en,fr}.json`
- User preference stored: MongoDB (`User.preferredLanguage`) + localStorage (`preferredLanguage` key)
- Initialize in [src/i18n.ts](src/i18n.ts), consumed via `useTranslation()` hook

### Frontend Routing
Uses **React Router v7** (`react-router-dom`). `BrowserRouter` wraps the app in `App.tsx`; all routes are declared with `<Routes>/<Route>`. Navigation uses `useNavigate()` and `<Navigate>`.

Key routes:
- `/` — LandingPage
- `/login`, `/register`, `/profile`, `/about`
- `/word-challenge`, `/word-learn`, `/verb-challenge`, `/verb-learn`
- `/idiom-challenge`, `/idiom-learn`
- `/word-stats`, `/verb-stats`, `/idiom-stats`
- `/weekly-challenge`, `/weekly-story`
- `*` → redirects to `/`

The `PageType` union type still exists in `App.tsx` but routing is URL-based, not state-based.

### Challenge Generation Algorithm
**Personalized challenge sets** ([src/routes/challenge.ts](src/routes/challenge.ts)):
1. `POST /api/challenge/generate` fetches user's weak areas from `ChallengeAttempt` collection
2. Aggregates accuracy per `challengeId` (correctAttempts/totalAttempts)
3. Applies `weaknessWeight` (0-1) to bias selection toward mistakes
4. Returns shuffled array of challenges (default 10, max 50)

### Analytics Service
Separate Python container (`analytics/`) running on cron-like scheduler:
- Executes `analyze_weaknesses.py` daily at 2 AM
- Aggregates last 30 days of attempts, updates `User.weaknesses` field
- Shares MongoDB connection with main app
- Logs visible via `docker logs portuguese-learning-analytics-1`

## API Endpoints Reference

### Authentication (`/api/auth`)
- `POST /register` - Create account (bcrypt password hashing)
- `POST /login` - Session creation
- `POST /logout` - Session destruction
- `GET /check-auth` - Returns current user if session valid
- `POST /create-guest` - Temporary user (30-day expiry)
- `POST /update-language` - Persist language preference

### Challenges (`/api/challenge`)
- `POST /generate` - Personalized challenge set with weakness weighting
- `POST /submit` - Record attempt + update user stats (points, streak, level)
- `GET /progress` - User statistics (word/verb/idiom accuracy)
- `GET /history` - Recent attempts (last 20)
- `GET /weak-areas` - Challenges with < 50% accuracy

### Legacy Endpoints (backward compatibility)
- `GET /api/challenge` → Random word challenge
- `GET /api/challenges/word` → Random word challenge
- `GET /api/challenges/verb` → Random verb challenge
- `GET /api/challenges/idiom` → Random idiom challenge

## Database Models

### User (`src/models/User.ts`)
Key fields: `username`, `email`, `password` (hashed), `preferredLanguage`, `weaknesses`, `level`, `totalPoints`, `currentStreak`

### ChallengeAttempt (`src/models/ChallengeAttempt.ts`)
Tracks: `userId`, `challengeType`, `challengeId`, `userAnswer`, `correct`, `timeSpentMs`, `attemptedAt`

## Environment Variables

Development: `.env`
```
MONGODB_URI=mongodb+srv://...
SESSION_SECRET=random-string
NODE_ENV=development
PORT=3000
```

Testing: `.env.test` (auto-generated by `run-tests.sh`)
Production: Set as k8s secrets or Helm values (see `helm/portuguese-learning/values.yaml`)

## Common Gotchas

1. **Port confusion**: Dev mode uses TWO ports (3000 backend, 8080 webpack). Production uses only 3000.
2. **Build order matters**: Client build MUST come after server build (webpack needs compiled server types in some edge cases, though typically independent).
3. **Static files**: Backend serves from `public/`, not `src/client/`. After `npm run build`, `public/index.html` + `public/bundle.js` are served by Express.
4. **Test isolation**: Each test run gets fresh MongoDB Memory Server. Don't rely on persistent test data.
5. **Session secrets**: Change `SESSION_SECRET` in production (default is insecure).

## Material-UI Styling

Custom theme in [src/client/App.tsx](src/client/App.tsx):
- Primary: `#1976d2` (blue)
- Border radius: 12px for cards/papers, 8px for buttons
- No text transforms on buttons (`textTransform: 'none'`)

## Testing Patterns

Playwright tests in `tests/*.spec.ts`:
- Helper: `tests/helpers/auth-helper.ts` for login/register actions
- Mobile tests: Use `pixel-7` project for responsive checks
- Selectors: Prefer `getByRole()` over `getByTestId()`
- Tag smoke tests with `test('name @smoke', ...)` for CI runs

## Ingress / TLS

Handled by Traefik (bundled with k3s) + cert-manager (Let's Encrypt).
Config in `helm/portuguese-learning/templates/ingress.yaml` and `www-redirect.yaml`.
- HTTP → HTTPS redirect handled by Traefik
- `www.dialecthub.net` → `dialecthub.net` 301 redirect via Traefik `Middleware`
- Certificates auto-issued and renewed by cert-manager
