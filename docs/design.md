# Portuguese Learning - System Design

## Architecture Overview

The Portuguese Learning application uses a multi-container Docker architecture with nginx as a reverse proxy in front of a Node.js/Express application.

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

### Why Docker Compose?

**Benefits:**
1. **Orchestration**: Manage multiple containers as a single application
2. **Networking**: Automatic service discovery and DNS resolution
3. **Configuration**: Single file defines entire stack
4. **Reproducibility**: Same setup in dev, staging, and production
5. **Scalability**: Easy to add more services (Redis, workers, etc.)

### Why Separate Containers?

**Benefits:**
1. **Separation of concerns**: Each container has one responsibility
2. **Independent scaling**: Can run multiple app containers behind one nginx
3. **Security isolation**: Compromised app container doesn't affect nginx
4. **Resource management**: Different resource limits per container
5. **Update independence**: Update nginx without touching app (and vice versa)

## Configuration Files

### docker-compose.yml
- Defines all services and their relationships
- Sets up internal networking
- Configures environment variables
- Manages restart policies

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

# On production server
./deploy.sh
# → Creates .env file
# → Pulls latest image
# → Starts containers via docker-compose
# → Runs health checks
```

## Monitoring and Logging

### Nginx Logs
```bash
# Access logs (all requests)
docker compose logs -f nginx

# View in real-time
docker compose exec nginx tail -f /var/log/nginx/access.log
```

### Application Logs
```bash
# App container logs
docker compose logs -f app

# All logs together
docker compose logs -f
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

### Horizontal Scaling (Future)
To handle more traffic, add multiple app instances:

```yaml
# docker-compose.yml
services:
  app:
    deploy:
      replicas: 3  # Run 3 app containers
  
  nginx:
    # Automatically load balances across all app instances
```

### Vertical Scaling
Adjust resource limits per container:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
```

## Future Enhancements

### Short-term
1. **HTTPS Support**
   - Add Let's Encrypt certificates
   - Enable secure cookies
   - Force HTTPS redirects

2. **Improved Monitoring**
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

3. **Container Orchestration**
   - Migrate to Kubernetes
   - Auto-scaling
   - Rolling updates

4. **Database Caching**
   - Add Redis cache layer
   - Reduce MongoDB queries
   - Improve response times

## Troubleshooting

### Container won't start
```bash
# Check logs
docker compose logs app
docker compose logs nginx

# Verify configuration
docker compose config
```

### Can't reach application
```bash
# Check containers are running
docker compose ps

# Test internal connectivity
docker compose exec nginx ping app

# Check nginx config
docker compose exec nginx nginx -t
```

### Session/auth issues
```bash
# Verify trust proxy setting in server.ts
# Check cookie settings (secure flag)
# Verify X-Forwarded-* headers are set in nginx
```

## References

- [Nginx Documentation](https://nginx.org/en/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Express Behind Proxies](https://expressjs.com/en/guide/behind-proxies.html)
- [Docker Networking](https://docs.docker.com/network/)

---

Last Updated: December 21, 2025
