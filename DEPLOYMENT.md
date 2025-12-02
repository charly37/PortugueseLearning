# Portuguese Learning - Deployment Guide

## Docker Deployment

### Prerequisites
- Docker installed on your server
- Docker Compose installed on your server

### Quick Deploy

1. Clone the repository on your server:
```bash
git clone <your-repo-url>
cd PortugueseLearning
```

2. Make the deployment script executable:
```bash
chmod +x deploy.sh
```

3. Run the deployment script:
```bash
./deploy.sh
```

The application will be available at `http://localhost:3000`

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

You can customize the deployment by setting environment variables:

```bash
# In docker-compose.yml or when running docker run
PORT=3000                    # Application port
NODE_ENV=production          # Environment mode
```

### Updating the Application

```bash
# Pull latest changes
git pull origin master

# Rebuild and restart
./deploy.sh
```

Or manually:
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Health Check

Check if the application is running:
```bash
curl http://localhost:3000/api/health
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
