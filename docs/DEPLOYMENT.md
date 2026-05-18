# Portuguese Learning - Deployment Guide

## Docker Deployment

### Prerequisites
- Docker installed on your server
- Docker Compose installed on your server
- `MONGODB_URI` and `SESSION_SECRET` environment variables set

### Quick Deploy

1. Clone the repository **at the tag you want to deploy**, so that `deploy.sh` and `docker-compose.yml` are guaranteed to match the image:
```bash
# Replace v1.2.0 with the target release tag
git clone --branch v1.2.0 --depth 1 <your-repo-url>
cd PortugueseLearning
```

> **Why?** `deploy.sh` and `docker-compose.yml` evolve alongside the app. Cloning HEAD risks running a newer (possibly broken) script against an older image. Always pin the checkout to the same tag as the image you are deploying.

2. Make the deployment script executable:
```bash
chmod +x deploy.sh
```

3. Set required environment variables:
```bash
export MONGODB_URI=your_mongodb_connection_string
export SESSION_SECRET=your_secret_key
```

4. Run the deployment script with the matching tag:
```bash
IMAGE_TAG=v1.2.0 ./deploy.sh
```

The application will be available at `http://localhost`

### Deploying a Specific Version

`deploy.sh` reads the `IMAGE_TAG` environment variable to select which image to pull from Docker Hub (`charly37/portuguese-learning:<tag>`). If omitted, it defaults to `latest`.

```bash
# Deploy a specific commit SHA
IMAGE_TAG=abc1234 ./deploy.sh

# Deploy a named tag / release
IMAGE_TAG=v1.2.0 ./deploy.sh

# Deploy latest (default)
./deploy.sh
```

The script will:
1. Pull `charly37/portuguese-learning:<IMAGE_TAG>` from Docker Hub
2. Restart the `app` and `analytics` containers (nginx stays up to avoid downtime)
3. Run health checks against `/api/health` and `/nginx-health`
4. Append a record to `deployments.log`

### Rollback

Roll back to any previously-deployed image by passing its tag:

```bash
IMAGE_TAG=<previous-commit-sha> ./deploy.sh
```

Check `deployments.log` in the repo root for a history of deployed tags.

### Manual Docker Deployment

#### Using Docker Compose (Recommended)
```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

#### Using Docker directly
```bash
# Build image
docker build -t portuguese-learning .

# Run container
docker run -d \
  -p 3000:3000 \
  --name portuguese-learning-app \
  -v $(pwd)/data:/app/data \
  portuguese-learning

# View logs
docker logs -f portuguese-learning-app

# Stop container
docker stop portuguese-learning-app
docker rm portuguese-learning-app
```

### Environment Variables

| Variable        | Required | Description                              |
|-----------------|----------|------------------------------------------|
| `MONGODB_URI`   | Yes      | MongoDB Atlas connection string          |
| `SESSION_SECRET`| Yes      | Secret key for session signing           |
| `IMAGE_TAG`     | No       | Docker image tag to deploy (default: `latest`) |

### Updating the Application

Checkout the target release tag first so the scripts stay in sync with the image:

```bash
git fetch --tags
git checkout v1.2.0        # pin to the release you want to deploy
IMAGE_TAG=v1.2.0 ./deploy.sh
```

### Useful Commands

```bash
docker compose logs -f            # All logs
docker compose logs -f app        # App logs only
docker compose logs -f analytics  # Analytics logs
docker compose ps                 # Container status
docker compose restart nginx      # Reload nginx (e.g. after config change)
docker compose down               # Stop everything
```

### Health Check

Check if the application is running:
```bash
curl http://localhost/api/health
```

Expected response:
```json
{"status":"ok","message":"Server is running"}
```

### Useful Commands

```bash
# View running containers
docker ps

# View all containers
docker ps -a

# View logs
docker compose logs -f

# Restart application
docker compose restart

# Stop application
docker compose down

# Remove all containers and images
docker compose down --rmi all

# Access container shell
docker compose exec portuguese-learning sh
```

### Nginx Reverse Proxy (Optional)

If you want to expose the application on port 80 or use a domain name:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### CI/CD with GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/ci-cd.yml`) that:
- Automatically builds and tests the application on every push
- Builds a Docker image
- Optionally pushes to Docker Hub

To use Docker Hub integration, add these secrets to your GitHub repository:
- `DOCKER_USERNAME`: Your Docker Hub username
- `DOCKER_PASSWORD`: Your Docker Hub password or access token

### Troubleshooting

**Container won't start:**
```bash
docker compose logs
```

**Port already in use:**
```bash
# Change the port in docker-compose.yml
ports:
  - "8080:3000"  # Use port 8080 instead
```

**Data not persisting:**
Make sure the `data` directory exists and has proper permissions:
```bash
mkdir -p data
chmod 755 data
```
