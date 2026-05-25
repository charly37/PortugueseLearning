# Portuguese Learning - Deployment Guide

## Kubernetes Deployment (k3s)

The application runs on Kubernetes using k3s on a single Ubuntu VM, packaged as a **Helm chart** located in `helm/portuguese-learning/`.

### Prerequisites
- k3s installed (`curl -sfL https://get.k3s.io | sh -`)
- Helm 3 installed (`curl -sSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash`)
- cert-manager installed (see [HTTPS Setup](HTTPS_SETUP.md))
- Challenge data files present on the node at the path set in `data.hostPath` (default: `/home/ubuntu/PortugueseLearning/data`)

### One-Time Setup (production)

**Create the Kubernetes secret** — this must exist before running `helm install`. It is intentionally not managed by Helm to avoid storing credentials in the chart.

```bash
kubectl create secret generic portuguese-learning-secrets \
  --namespace=portuguese-learning \
  --from-literal=mongodb-uri='your-atlas-uri' \
  --from-literal=session-secret='your-secret-key'
```

> The namespace is created by the chart on first install. If the secret creation fails because the namespace doesn't exist yet, run `kubectl create namespace portuguese-learning` first.

### Deploy a Release (production)

```bash
helm upgrade --install prod helm/portuguese-learning \
  --namespace portuguese-learning --create-namespace \
  --values helm/portuguese-learning/values-prod.yaml \
  --set image.app.tag=<version> \
  --set image.analytics.tag=<version>
```

Example with a specific release version:
```bash
helm upgrade --install prod helm/portuguese-learning \
  --namespace portuguese-learning --create-namespace \
  --values helm/portuguese-learning/values-prod.yaml \
  --set image.app.tag=v1.5.0 \
  --set image.analytics.tag=v1.5.0
```

### Rollback

```bash
# List release history
helm history prod

# Roll back to the previous revision
helm rollback prod
```

---

### Staging Deployment

The chart supports running a full second instance (staging) side-by-side with production on the same k3s node. Each release gets its own namespace, resources, and subdomain — nothing is shared except the cluster-wide cert-manager `ClusterIssuer` resources (created once by prod).

**One-time setup for staging:**

```bash
# Separate data directory — avoids any risk of corrupting prod data
mkdir -p /home/ubuntu/PortugueseLearning/data-staging
cp /home/ubuntu/PortugueseLearning/data/*.json /home/ubuntu/PortugueseLearning/data-staging/

# Secret in the staging namespace (same name, different namespace — no collision)
kubectl create namespace portuguese-learning-staging
kubectl create secret generic portuguese-learning-secrets \
  --namespace=portuguese-learning-staging \
  --from-literal=mongodb-uri='your-atlas-uri' \
  --from-literal=session-secret='your-staging-secret-key'
```

**Deploy staging** (points to `staging.dialecthub.net`, uses `letsencrypt-staging` issuer):

```bash
helm upgrade --install staging helm/portuguese-learning \
  --namespace portuguese-learning-staging --create-namespace \
  --set namespace=portuguese-learning-staging \
  --set ingress.host=staging.dialecthub.net \
  --set ingress.clusterIssuer=letsencrypt-staging \
  --set ingress.tlsSecretName=staging-dialecthub-tls \
  --set data.hostPath=/home/ubuntu/PortugueseLearning/data-staging \
  --set certManager.createIssuers=false \
  --set image.app.tag=dev-<sha> \
  --set image.analytics.tag=dev-<sha>
```

> `certManager.createIssuers=false` skips re-creating the `ClusterIssuer` resources since they are cluster-scoped and already exist from the prod install.

**Teardown staging:**
```bash
helm uninstall staging --namespace portuguese-learning-staging
kubectl delete namespace portuguese-learning-staging
```

### Configuration

All tuneable values are in `helm/portuguese-learning/values.yaml`. Key overrides for production are in `values-prod.yaml`.

| Value | Default | Description |
|---|---|---|
| `namespace` | `portuguese-learning` | Kubernetes namespace for all resources. Change per release for multi-instance deployments. |
| `image.app.tag` | `latest` | App Docker image tag |
| `image.analytics.tag` | `latest` | Analytics Docker image tag |
| `replicaCount` | `1` | Number of app pods |
| `ingress.host` | `dialecthub.net` | Public hostname |
| `ingress.clusterIssuer` | `letsencrypt-prod` | cert-manager issuer name |
| `ingress.tlsSecretName` | `dialecthub-tls` | Name of the TLS secret cert-manager will create |
| `data.hostPath` | `/home/ubuntu/PortugueseLearning/data` | Node path for challenge JSON files |
| `certManager.email` | `admin@dialecthub.net` | Let's Encrypt registration email |
| `certManager.createIssuers` | `true` | Create `ClusterIssuer` resources. Set `false` for secondary releases (staging) since ClusterIssuers are cluster-scoped and shared. |

### Useful Commands

```bash
# Production
kubectl get all -n portuguese-learning                                            # Status overview
kubectl logs -f <pod-name> -n portuguese-learning                                 # App logs
kubectl rollout restart deployment/prod-app -n portuguese-learning               # Restart app
kubectl get certificate -n portuguese-learning                                    # TLS cert status
helm list -A                                                                      # All Helm releases
helm history prod                                                                 # Prod release history

# Staging
kubectl get all -n portuguese-learning-staging
kubectl logs -f <pod-name> -n portuguese-learning-staging
kubectl rollout restart deployment/staging-app -n portuguese-learning-staging
helm history staging
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

