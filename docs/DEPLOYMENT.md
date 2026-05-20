# Portuguese Learning - Deployment Guide

## Kubernetes Deployment (k3s)

The application runs on Kubernetes using k3s on a single Ubuntu VM, packaged as a **Helm chart** located in `helm/portuguese-learning/`.

### Prerequisites
- k3s installed (`curl -sfL https://get.k3s.io | sh -`)
- Helm 3 installed (`curl -sSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash`)
- cert-manager installed (see [HTTPS Setup](HTTPS_SETUP.md))
- Challenge data files present on the node at the path set in `data.hostPath` (default: `/home/ubuntu/PortugueseLearning/data`)

### One-Time Setup

**Create the Kubernetes secret** — this must exist before running `helm install`. It is intentionally not managed by Helm to avoid storing credentials in the chart.

```bash
kubectl create secret generic portuguese-learning-secrets \
  --namespace=portuguese-learning \
  --from-literal=mongodb-uri='your-atlas-uri' \
  --from-literal=session-secret='your-secret-key'
```

> If the namespace does not exist yet, Helm will create it on first install (it is included in the chart templates).

### Deploy a Release

```bash
helm upgrade --install portuguese-learning helm/portuguese-learning \
  --values helm/portuguese-learning/values-prod.yaml \
  --set image.app.tag=<version> \
  --set image.analytics.tag=<version>
```

Example with a specific release version:
```bash
helm upgrade --install portuguese-learning helm/portuguese-learning \
  --values helm/portuguese-learning/values-prod.yaml \
  --set image.app.tag=v1.5.0 \
  --set image.analytics.tag=v1.5.0
```

### Rollback

```bash
# List release history
helm history portuguese-learning

# Roll back to the previous revision
helm rollback portuguese-learning
```

### Configuration

All tuneable values are in `helm/portuguese-learning/values.yaml`. Key overrides for production are in `values-prod.yaml`.

| Value | Default | Description |
|---|---|---|
| `image.app.tag` | `latest` | App Docker image tag |
| `image.analytics.tag` | `latest` | Analytics Docker image tag |
| `replicaCount` | `1` | Number of app pods |
| `ingress.host` | `dialecthub.net` | Public hostname |
| `ingress.clusterIssuer` | `letsencrypt-prod` | cert-manager issuer name |
| `data.hostPath` | `/home/ubuntu/PortugueseLearning/data` | Node path for challenge JSON files |
| `certManager.email` | `admin@dialecthub.net` | Let's Encrypt registration email |

### Useful Commands

```bash
kubectl get all -n portuguese-learning                                               # Status overview
kubectl logs -f <pod-name> -n portuguese-learning                                    # App logs
kubectl rollout restart deployment/portuguese-learning-app -n portuguese-learning    # Restart app
kubectl get certificate -n portuguese-learning                                        # TLS cert status
helm list                                                                             # Helm release status
helm history portuguese-learning                                                      # Release history
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
3. Lints the Helm chart and validates rendered templates with `kubeconform`

### `release.yml` — triggered manually
1. Validates version format (`v1.2.3`)
2. Runs full build + tests
3. Pushes Docker images with semver tag + `latest`
4. Packages the Helm chart and attaches the `.tgz` to the GitHub Release

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
