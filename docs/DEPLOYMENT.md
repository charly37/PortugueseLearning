# Portuguese Learning - Deployment Guide

## Kubernetes Deployment (k3s)

The application runs on Kubernetes using k3s on a single Ubuntu VM.

### Prerequisites
- k3s installed (`curl -sfL https://get.k3s.io | sh -`)
- cert-manager installed (see [HTTPS Setup](HTTPS_SETUP.md))
- `portuguese-learning` namespace and secrets created (one-time setup below)

### One-Time Setup

```bash
# Create namespace
sudo kubectl apply -f rendered-k8s/namespace.yaml

# Create secrets with real values
sudo kubectl create secret generic portuguese-learning-secrets \
  --namespace=portuguese-learning \
  --from-literal=mongodb-uri='your-atlas-uri' \
  --from-literal=session-secret='your-secret-key'
```

### Deploy a Release

1. Download the manifests zip from the [GitHub Release](https://github.com/charly37/PortugueseLearning/releases) assets
2. Unzip and apply:

```bash
unzip k8s-manifests-v1.x.x.zip -d rendered-k8s
sudo kubectl apply -f rendered-k8s/
```

Or use the `gh` CLI:
```bash
gh release download v1.x.x \
  --repo charly37/PortugueseLearning \
  --pattern "k8s-manifests-v1.x.x.zip"
unzip k8s-manifests-v1.x.x.zip -d rendered-k8s
sudo kubectl apply -f rendered-k8s/
```

### Rollback

```bash
# Download and apply manifests from a previous release
gh release download v1.x.x --repo charly37/PortugueseLearning --pattern "*.zip"
unzip k8s-manifests-v1.x.x.zip -d rendered-k8s
sudo kubectl apply -f rendered-k8s/
```

### Environment Variables

| Variable         | Required | Description                              |
|------------------|----------|------------------------------------------|
| `MONGODB_URI`    | Yes      | MongoDB Atlas connection string          |
| `SESSION_SECRET` | Yes      | Secret key for session signing           |

Both are stored in the `portuguese-learning-secrets` Kubernetes Secret — never in manifests.

### Useful Commands

```bash
sudo kubectl get all -n portuguese-learning        # Status overview
sudo kubectl logs -f <pod-name> -n portuguese-learning  # App logs
sudo kubectl rollout restart deployment/portuguese-learning-app -n portuguese-learning  # Restart app
sudo kubectl get certificate -n portuguese-learning  # TLS cert status
```

### Health Check

```bash
curl https://dialecthub.net/api/health
```

Expected response:
```json
{"status":"ok","message":"Server is running"}
```

---

## CI/CD with GitHub Actions

Two workflows handle the full pipeline:

### `ci-cd.yml` — runs on every push to master
1. Builds and tests the application
2. Builds and pushes Docker images to Docker Hub (tagged with short commit SHA)
3. Renders K8s manifests with the image tag and validates with `kubeconform`
4. Uploads rendered manifests as a 90-day artifact

### `release.yml` — triggered manually
1. Validates version format (`v1.2.3`)
2. Runs full build + tests
3. Pushes Docker images with semver tag + `latest`
4. Renders K8s manifests and attaches `k8s-manifests-v1.x.x.zip` to the GitHub Release permanently

Required GitHub secrets/vars:
- `DOCKER_USERNAME` (var): Docker Hub username
- `DOCKER_PASSWORD` (secret): Docker Hub password or access token

---

## Legacy: Docker Compose

> Docker Compose was the previous deployment method. The app now runs on k3s.
> These instructions are kept for reference only.

```bash
export MONGODB_URI=your_mongodb_connection_string
export SESSION_SECRET=your_secret_key
IMAGE_TAG=v1.2.0 ./deploy.sh
```

The `deploy.sh` script pulls images from Docker Hub and restarts containers via `docker compose`.


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
