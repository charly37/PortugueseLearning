# Portuguese Learning - System Design

## Architecture Overview

The Portuguese Learning application runs on Kubernetes (k3s) with Traefik as the ingress controller and cert-manager for TLS. The Node.js/Express application is containerised as a single image and deployed via Helm.

## Key Features

### 1. **Internationalization (i18n)**
- Full multi-language support using i18next
- Supported languages: French (fr) and English (en)
- User preference stored in database and localStorage
- Real-time language switching without page reload
- All UI text, buttons, and instructions are translated
- Language preference persists across sessions

### 2. **Three Learning Modes**

#### Practice Mode
- Endless practice with immediate feedback
- No time limits or scores
- Perfect for casual learning

#### Challenge Mode
- Timed challenges with configurable difficulty
- Tracks performance and scoring
- Records results to database (for logged-in users)
- **Challenge Configuration Options**:
  - **Number of Rounds**: Choose 10-50 challenges per session
  - **Difficulty Level**: Adjust from 0 (random) to 10 (focus on weak areas)
  - **Usefulness Filter**: Filter vocabulary by usefulness level (1-3)
    - *All words (1+)*: Includes all vocabulary regardless of usefulness
    - *Useful+ (2+)*: Only moderately and very useful words
    - *Very Useful Only (3)*: Only the most useful vocabulary
  - **Mobile-Friendly Mode**: Enable multiple-choice options instead of typing

#### Learn Mode (Flashcards)
- Interactive flashcard interface with flip animation
- Browse all available vocabulary/verbs/idioms
- Navigation controls (previous/next)
- Shuffle feature for randomized learning
- Shows Portuguese on front, translation + notes on back
- No pressure, self-paced learning
- **Configuration Options**:
  - **Number of Cards**: Choose 10-50 flashcards per session
  - **Difficulty Level**: Adjust focus on weak areas vs. random selection
  - **Usefulness Filter**: Same filtering options as Challenge Mode

### 3. **Challenge Statistics Dashboard**
- Per-challenge-type statistics page
- Visual progress bars and accuracy metrics
- Recent attempt history (last 20 attempts)
- Weak areas analysis with specific recommendations
- Time spent tracking per challenge
- Streak tracking and accuracy percentages

### 4. **Three Challenge Types**

#### Word Challenges
- Vocabulary translation from French/English to Portuguese
- Hundreds of common words categorized by topic

#### Verb Challenges
- Portuguese verb conjugation in present tense
- All pronouns (eu, tu, você, nós, vocês, eles/elas)

#### Idiom Challenges
- Common Portuguese expressions and idioms
- Cultural context and usage notes

### 5. **User Feedback & Quality Monitoring**

#### Usefulness Voting
- Optional voting system for challenge usefulness (1-3 scale: not useful, moderately useful, very useful)
- Visible after answering each challenge
- Aggregated nightly to show community consensus
- Helps prioritize which vocabulary/verbs/idioms to focus on
- **Integration with Challenge Generation**: Users can filter challenges by minimum usefulness level when configuring their practice sessions

#### Quality Flagging
- "Flag for Review" button on all challenges
- Users can report issues like missing translations, errors, typos
- No detailed reason required - simple one-click flagging
- Flagged challenges aggregated nightly
- Challenges with 2+ flags appear in analytics reports for manual review
- Helps crowdsource data quality improvements

## Project Structure

```
├── src/
│   ├── server.ts          # Express.js server
│   ├── i18n.ts            # i18next configuration
│   ├── config/
│   │   └── database.ts    # MongoDB connection
│   ├── locales/           # Translation files
│   │   ├── en.json        # English translations
│   │   └── fr.json        # French translations
│   ├── models/
│   │   ├── User.ts                  # User model with preferredLanguage
│   │   ├── ChallengeAttempt.ts      # Challenge attempt tracking
│   │   ├── UserWordVote.ts          # User word usefulness votes
│   │   └── ChallengeQualityFlag.ts  # User quality issue flags
│   ├── routes/
│   │   ├── auth.ts        # Authentication routes
│   │   └── challenge.ts   # Challenge and stats routes
│   └── client/            # React frontend
│       ├── index.tsx      # React entry point
│       ├── App.tsx        # Main App component with auth state
│       ├── components/
│       │   ├── LoginPage.tsx           # Login page
│       │   ├── RegisterPage.tsx        # Registration page
│       │   ├── LandingPage.tsx         # Home page with language selector
│       │   ├── ChallengePage.tsx       # Word challenges
│       │   ├── VerbChallengePage.tsx   # Verb challenges
│       │   ├── IdiomChallengePage.tsx  # Idiom challenges
│       │   ├── FlashcardLearnPage.tsx   # Learn mode (flashcards)
│       │   ├── ChallengeStatsPage.tsx   # Statistics dashboard
│       │   ├── ProfilePage.tsx          # User profile
│       │   ├── WordUsefulnessVote.tsx   # Word usefulness voting
│       │   └── ChallengeQualityFlag.tsx # Quality issue flagging
│       └── index.html     # HTML template
├── analytics/             # Python analytics service
├── data/                  # Challenge data (JSON files)
├── docs/                  # Documentation
├── tests/                 # Playwright E2E tests
├── dist/                  # Compiled server code
├── public/                # Built client assets
├── .env                   # Environment variables (not in git)
├── .env.example           # Environment template
├── package.json
├── tsconfig.json          # TypeScript config for client
├── tsconfig.server.json   # TypeScript config for server
└── webpack.config.js      # Webpack configuration
```

## Kubernetes Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ HTTPS (443) / HTTP (80 → redirect)
                      │
         ┌────────────▼───────────┐
         │                        │
         │  Traefik Ingress        │
         │  (bundled with k3s)    │
         │                        │
         │  - TLS termination     │
         │  - HTTP→HTTPS redirect │
         │  - www→apex redirect   │
         │  - Routes to Service   │
         │                        │
         └────────────┬───────────┘
                      │
                      │ HTTP (Port 80, ClusterIP)
                      │
         ┌────────────▼───────────┐
         │                        │
         │   App Pod              │
         │   (Node.js/Express)    │
         │                        │
         │  - REST API            │
         │  - Session Management  │
         │  - Business Logic      │
         │  - Serves React SPA    │
         │                        │
         └────────────┬───────────┘
                      │
                      │ TCP (Port 27017)
                      │ External Connection
                      │
         ┌────────────▼───────────┐
         │                        │
         │   MongoDB Atlas        │
         │   (Cloud Database)     │
         │                        │
         └────────────────────────┘
```

## Container Architecture

### 1. **App Container**
- **Image**: `charly37/portuguese-learning:latest`
- **Purpose**: Main application logic
- **Exposed Ports**: None (only accessible via internal network)
- **Responsibilities**:
  - Serve REST API endpoints
  - Handle user authentication
  - Manage sessions
  - Process challenge submissions
  - Track user progress
  - Generate random challenges

### 3. **MongoDB Atlas** (External Service)
- **Type**: Cloud-hosted database (not containerized)
- **Purpose**: Persistent data storage
- **Connection**: Via MONGODB_URI environment variable
- **Data Stored**:
  - User accounts and credentials
  - Challenge attempts and history
  - User progress statistics
  - Session data

## Network Architecture

### Kubernetes Networking
- Traefik (k3s built-in) handles all external traffic on ports 80 and 443
- The app is exposed internally via a `ClusterIP` Service on port 80
- cert-manager issues and renews Let's Encrypt certificates automatically
- The `app-network` bridge network no longer exists — pods communicate via k8s DNS

### Port Mapping
```
External → Internal
Port 80  → Traefik (301 → HTTPS)
Port 443 → Traefik TLS termination → app Service:80 → app Pod:3000
```

## Request Flow

### 1. **User Request Flow**
```
User Browser
    ↓
    │ https://dialecthub.net/api/challenge/progress
    ↓
Traefik (TLS termination, Port 443)
    ↓
    │ Adds headers:
    │ - X-Forwarded-For: client_ip
    │ - X-Forwarded-Proto: https
    │ - X-Real-IP: client_ip
    │ - Host: original_host
    ↓
App Pod (Port 3000)
    ↓
    │ Express processes request
    │ - app.set('trust proxy', 1) interprets headers
    │ - Session middleware validates cookie
    │ - Route handler executes
    ↓
MongoDB Atlas
    ↓
    │ Query user data
    │ Return results
    ↓
App Container
    ↓
    │ JSON response
    ↓
Nginx
    ↓
    │ Compress response (gzip)
    │ Add security headers
    ↓
User Browser
```

### 2. **Static File Request Flow**
```
User Browser
    ↓
    │ https://dialecthub.net/bundle.js
    ↓
Traefik (Port 443)
    ↓
    │ Proxy to app Service
    ↓
App Pod (Express Static)
    ↓
    │ Serve from /public directory
    ↓
Nginx
    ↓
    │ Cache and compress
    ↓
User Browser
```

## Design Decisions

### Why Traefik + k3s?

**Benefits:**
1. **Bundled with k3s**: No extra setup — Traefik is the default k3s ingress controller
2. **Automatic TLS**: Works natively with cert-manager for Let's Encrypt certificates
3. **Middleware support**: Redirects (www → apex, HTTP → HTTPS) via `Middleware` CRDs
4. **Zero-downtime deploys**: Kubernetes rolling updates keep the app available
5. **Observability**: Built-in dashboard and metrics

## Configuration Files

### helm/portuguese-learning/
- Defines all services, deployments, ingress and their relationships
- Sets up internal networking and resource limits
- Configures environment variables via secrets
- Manages rolling update policies

### src/server.ts
- `app.set('trust proxy', 1)` - Critical for proxy compatibility
- Session cookies with `secure: false` (HTTP mode)
- Express app configuration

## Security Considerations

### Current (HTTP Mode)
- ⚠️ Unencrypted traffic
- ⚠️ Session cookies: `secure: false`
- ✅ httpOnly cookies (prevent XSS)
- ✅ Network isolation between containers
- ✅ App not directly exposed to internet

### Future (HTTPS Mode)
- ✅ Encrypted traffic (TLS 1.2/1.3)
- ✅ Session cookies: `secure: true`
- ✅ HSTS headers
- ✅ Certificate auto-renewal
- ✅ Protection against MITM attacks

## Deployment Workflow

```bash
# On development machine
./build.sh
# → Builds Docker image
# → Pushes to Docker Hub

# On production cluster
helm upgrade --install portuguese-learning helm/portuguese-learning \
  --set image.tag=<version>
# → Updates k8s Deployments with new image
# → Performs rolling update (zero-downtime)
```

## Monitoring and Logging

### Application Logs
```bash
# App container logs
kubectl logs -n portuguese-learning -l app=portuguese-learning

# All pods
kubectl get pods -n portuguese-learning
```

### Health Checks

**App Health:**
```bash
curl http://server-ip/api/health
# Returns: {"status":"ok","message":"Server is running"}
```

### Prometheus Metrics

The app exposes a Prometheus scrape endpoint:
```bash
curl http://server-ip/metrics
# Returns Prometheus text format with Node.js runtime metrics
# and app_users_registered_total / app_users_guest_total gauges
```

See [docs/MONITORING.md](MONITORING.md) for full metric reference, Prometheus Operator integration, and security hardening (NetworkPolicy, Traefik exclusion).

## Scaling Considerations

### Horizontal Scaling
To handle more traffic, scale the app Deployment:

```bash
kubectl scale deployment portuguese-learning-app -n portuguese-learning --replicas=3
# Or set in helm/portuguese-learning/values.yaml: replicaCount: 3
```

### Vertical Scaling
Adjust resource limits in `helm/portuguese-learning/values.yaml`:

```yaml
resources:
  limits:
    cpu: "2"
    memory: 2Gi
```

## Future Enhancements

### Short-term
1. **Improved Monitoring**
   - ~~Add Prometheus metrics~~ ✅ Done — see [docs/MONITORING.md](MONITORING.md)
   - Health check dashboard
   - Error rate monitoring

### Long-term
1. **Redis for Sessions**
   - Faster session storage
   - Support for multiple app instances
   - Session persistence across restarts

2. **CDN Integration**
   - Serve static assets via CDN
   - Reduce server load
   - Improve global performance

3. **Database Caching**
   - Add Redis cache layer
   - Reduce MongoDB queries
   - Improve response times

## Troubleshooting

### Pod won't start
```bash
# Check pod status and events
kubectl describe pod -n portuguese-learning -l app=portuguese-learning

# Check logs
kubectl logs -n portuguese-learning -l app=portuguese-learning
```

### Can't reach application
```bash
# Check pods are running
kubectl get pods -n portuguese-learning

# Check ingress
kubectl get ingress -n portuguese-learning
```

### Session/auth issues
```bash
# Verify trust proxy setting in server.ts
# Check cookie settings (secure flag)
# Verify X-Forwarded-* headers are set in nginx
```

## References

- [Nginx Documentation](https://nginx.org/en/docs/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Express Behind Proxies](https://expressjs.com/en/guide/behind-proxies.html)

---

Last Updated: February 8, 2026
