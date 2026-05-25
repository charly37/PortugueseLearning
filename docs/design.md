# Portuguese Learning - System Design

## Architecture Overview

The Portuguese Learning application uses a multi-container Docker architecture with nginx as a reverse proxy in front of a Node.js/Express application.

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
├── nginx/                 # Nginx configuration
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

## Container Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ HTTP (Port 80)
                      │
         ┌────────────▼───────────┐
         │                        │
         │    Nginx Container     │
         │   (nginx:alpine)       │
         │                        │
         │  - Reverse Proxy       │
         │  - Static File Serving │
         │  - Compression         │
         │  - Request Routing     │
         │                        │
         └────────────┬───────────┘
                      │
                      │ HTTP (Port 3000)
                      │ Internal Network
                      │
         ┌────────────▼───────────┐
         │                        │
         │   App Container        │
         │   (Node.js/Express)    │
         │                        │
         │  - REST API            │
         │  - Session Management  │
         │  - Business Logic      │
         │  - Authentication      │
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

### 1. **Nginx Container**
- **Image**: `nginx:alpine`
- **Purpose**: Reverse proxy and web server
- **Exposed Ports**: 80 (HTTP), 443 (HTTPS - future)
- **Responsibilities**:
  - Route incoming requests to the app container
  - Handle SSL/TLS termination (when HTTPS is added)
  - Compress responses (gzip)
  - Serve static files efficiently
  - Add security headers
  - Load balancing capability (future scaling)

### 2. **App Container**
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

### Docker Network: `app-network`
- **Type**: Bridge network
- **Purpose**: Isolated internal communication between containers
- **Members**: nginx, app
- **Benefits**:
  - Containers can communicate using service names (e.g., `http://app:3000`)
  - Isolated from host network
  - Security through network isolation
  - DNS resolution built-in

### Port Mapping
```
External → Internal
Port 80  → nginx:80    → app:3000
Port 443 → nginx:443   → app:3000 (future HTTPS)
```

## Request Flow

### 1. **User Request Flow**
```
User Browser
    ↓
    │ http://server-ip/api/challenge/progress
    ↓
Nginx (Port 80)
    ↓
    │ Adds headers:
    │ - X-Forwarded-For: client_ip
    │ - X-Forwarded-Proto: http
    │ - X-Real-IP: client_ip
    │ - Host: original_host
    ↓
App Container (Port 3000)
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
    │ http://server-ip/bundle.js
    ↓
Nginx (Port 80)
    ↓
    │ Proxy to app
    ↓
App Container (Express Static)
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

### Why Nginx Reverse Proxy?

**Benefits:**
1. **Performance**: Nginx is highly optimized for serving static content and handling concurrent connections
2. **Security**: Extra layer between public internet and application
3. **Flexibility**: Easy to add SSL/TLS, load balancing, or multiple backends
4. **Zero-downtime deploys**: Nginx stays up while app container restarts
5. **Industry standard**: Battle-tested pattern used by major companies

**Trade-offs:**
- Additional complexity (one more container)
- Slight latency overhead (negligible in practice)

### Why Separate Containers?

**Benefits:**
1. **Separation of concerns**: Each container has one responsibility
2. **Independent scaling**: Can run multiple app containers behind one nginx
3. **Security isolation**: Compromised app container doesn't affect nginx
4. **Resource management**: Different resource limits per container
5. **Update independence**: Update nginx without touching app (and vice versa)

## Configuration Files

### helm/portuguese-learning/
- Defines all services, deployments, ingress and their relationships
- Sets up internal networking and resource limits
- Configures environment variables via secrets
- Manages rolling update policies

### nginx/nginx.conf
- Main nginx configuration
- Worker processes and connections
- HTTP settings (gzip, logs, etc.)
- Includes site-specific configs

### nginx/conf.d/app.conf
- Application-specific routing
- Upstream definition (backend servers)
- Proxy settings and headers
- Health check endpoint

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

### Nginx Logs
```bash
# Access logs (all requests)
kubectl logs -n portuguese-learning -l app=nginx
```

### Application Logs
```bash
# App container logs
kubectl logs -n portuguese-learning -l app=portuguese-learning

# All pods
kubectl get pods -n portuguese-learning
```

### Health Checks

**Nginx Health:**
```bash
curl http://server-ip/nginx-health
# Returns: "nginx OK"
```

**App Health:**
```bash
curl http://server-ip/api/health
# Returns: {"status":"ok","message":"Server is running"}
```

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
   - Add Prometheus metrics
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
