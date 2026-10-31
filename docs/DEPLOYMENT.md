# Portuguese Learning - Deployment Guide

## Kubernetes Deployment (k3s)

The application runs on Kubernetes using k3s on a single Ubuntu VM, packaged as a **Helm chart** located in `helm/portuguese-learning/`.

### Prerequisites
- k3s installed (`curl -sfL https://get.k3s.io | sh -`)
- Helm 3 installed (`curl -sSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash`)
- cert-manager installed (see [HTTPS Setup](HTTPS_SETUP.md))
- Four data directories present on the k3s node before deploying:
  - `data.hostPath` (default: `/home/ubuntu/PortugueseLearning/data`) — challenge JSON files (text data)
  - `sounds.hostPath` (default: `/home/ubuntu/PortugueseLearning/sounds`) — basic word pronunciation MP3s
  - `weeklyAudio.hostPath` (default: `/home/ubuntu/PortugueseLearning/weekly-audio`) — generated weekly challenge MP3s
  - `podcast.hostPath` (default: `/home/ubuntu/PortugueseLearning/podcast`) — generated podcast feeds, one subdirectory per show/pair

> `weekly-audio` and `podcast` are mounted with `hostPath: type: Directory`, so the directory must exist **before** `helm upgrade` — otherwise the pod stays in `ContainerCreating`.
> The `podcast` directory must be writable by uid **1000** (the Python CronJob user):
>
> ```bash
> sudo mkdir -p /home/ubuntu/PortugueseLearning/podcast
> sudo chown 1000:1000 /home/ubuntu/PortugueseLearning/podcast
> ```

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

### Weekly Publishing Pipeline

A chain of CronJobs (Python image `charly37/portuguese-learning-analytics`) produces content every week. They share the `weekly-audio` hostPath and run in this order:

| CronJob | Schedule | Command | Output |
|---|---|---|---|
| `<release>-weekly-challenge` | Mon 03:00 | `create_weekly_challenge.py --all-users` | `weeklychallenge_templates` (fr + en) + per-user `weeklychallenges` documents |
| `<release>-wchal-sounds` | Mon 04:00 | `combine_mp3.py --weekly-challenge --lang fr --output-dir /weekly-audio` | `/weekly-audio/weekly_template_*.mp3` + `/weekly-audio/weekly_*.mp3` (+ `.mp4`) |
| `<release>-weekly-story` | Mon 05:00 | `StoryCreatorGetter.py` | `weeklystories` documents |
| `<release>-vocabulary-updater-agent-fr` | Mon 06:00 | `VocabularyUpdaterAgent.py --language fr --max-words 50` | `challenges` FR translations + clears FR flags |
| `<release>-youtube-uploader` | Mon 06:30 | `upload_to_youtube.py --weekly-audio-dir /weekly-audio` | `youtube.videoId` on the document |
| `<release>-podcast-feed-<pair>` | Mon 07:00 | `generate_podcast_feed.py --show vocabulary --pair fr-pt --output-root /podcast` | `/podcast/vocabulary/fr-pt/feed.xml` |
| `<release>-vocabulary-updater-agent-en` | Mon 08:00 | `VocabularyUpdaterAgent.py --language en --max-words 50 --skip-validator` | `challenges` EN translations + clears EN flags |

> The two `vocabulary-updater-agent-*` jobs **must not overlap**: the script reloads every
> challenge and rewrites whole documents with `$set`, so a concurrent run would clobber the
> other language's changes. `--skip-validator` keeps the language-independent Portuguese-word
> validation (phase 1) to a single run per week.

Only global lessons (`userId: null`, legacy) are published — per-user lessons stay private. See [PODCAST.md](PODCAST.md) for the feed format, cover-art requirements and platform submission steps.

> **One-time step after upgrading past the template migration:** run
> `python scripts/ensure_weekly_indexes.py` once against production. It aborts on existing
> duplicates and otherwise creates the unique indexes `weeklychallenges_user_week_unique`
> (`userId` + `weekStart`) and `templates_week_language_unique` (`weekStart` + `language`) that keep
> the Monday job and the API from inserting two documents for the same week.

> **Cutover:** templates are applied from the next Monday run onwards. Older weeks are untouched, and
> the API still falls back to legacy `userId: null` documents until a template exists for the week.

```bash
# Inspect the last runs
kubectl get cronjob,job -n portuguese-learning
kubectl logs -n portuguese-learning job/prod-podcast-feed-fr-pt-<suffix>

# Run the podcast feed immediately instead of waiting for Monday
kubectl create job --from=cronjob/prod-podcast-feed-fr-pt -n portuguese-learning podcast-feed-manual-1
```

---

### Staging Deployment

The chart supports running a full second instance (staging) side-by-side with production on the same k3s node. Each release gets its own namespace, resources, and subdomain — nothing is shared except the cluster-wide cert-manager `ClusterIssuer` resources (created once by prod).

**One-time setup for staging:**

```bash
# Separate data directories — avoids any risk of corrupting prod data
mkdir -p /home/ubuntu/PortugueseLearning/data-staging
cp /home/ubuntu/PortugueseLearning/data/*.json /home/ubuntu/PortugueseLearning/data-staging/
# Sounds and weekly-audio are read-only inputs/outputs; staging can share the prod
# sounds folder (read-only) but needs its own weekly-audio output directory.
mkdir -p /home/ubuntu/PortugueseLearning/weekly-audio-staging
# Podcast feed must be separate too: the staging CronJob regenerates feed.xml and
# uses the staging hostname in every URL, which would overwrite the prod feed.
mkdir -p /home/ubuntu/PortugueseLearning/podcast-staging
sudo chown 1000:1000 /home/ubuntu/PortugueseLearning/podcast-staging

# Secret in the staging namespace (same name, different namespace — no collision)
kubectl create namespace portuguese-learning-staging
kubectl create secret generic portuguese-learning-secrets \
  --namespace=portuguese-learning-staging \
  --from-literal=mongodb-uri='your-atlas-uri' \
  --from-literal=session-secret='your-staging-secret-key'
```

**Patch CoreDNS to resolve the staging subdomain inside the cluster:**

cert-manager performs the ACME HTTP-01 challenge by reaching the ingress from within the cluster. k3s CoreDNS does not use the external DNS A record you created, so it cannot resolve `staging.dialecthub.net` without an explicit hosts entry.

```bash
kubectl edit configmap coredns -n kube-system
```

Add the following block inside the `data:` section (replace `149.56.132.188` with your node's public IP):

```yaml
staging.server: |
  staging.dialecthub.net:53 {
    hosts {
      149.56.132.188 staging.dialecthub.net
      fallthrough
    }
  }
```

Then restart CoreDNS to apply:
```bash
kubectl rollout restart deployment/coredns -n kube-system
```

> Without this, cert-manager will fail to complete the ACME challenge and the certificate will remain in a `False / Issuing` state. Check with `kubectl describe certificate staging-dialecthub-tls -n portuguese-learning-staging`.


**Deploy staging** (points to `staging.dialecthub.net`, uses `letsencrypt-prod` issuer):

```bash
helm upgrade --install staging \
  oci://ghcr.io/charly37/portuguese-learning \
  --version <chart-version> \
  --namespace portuguese-learning-staging --create-namespace \
  --set namespace=portuguese-learning-staging \
  --set ingress.host=staging.dialecthub.net \
  --set ingress.clusterIssuer=letsencrypt-prod \
  --set ingress.tlsSecretName=staging-dialecthub-tls \
  --set data.hostPath=/home/ubuntu/PortugueseLearning/data-staging \
  --set sounds.hostPath=/home/ubuntu/PortugueseLearning/sounds \
  --set weeklyAudio.hostPath=/home/ubuntu/PortugueseLearning/weekly-audio-staging \
  --set podcast.hostPath=/home/ubuntu/PortugueseLearning/podcast-staging \
  --set certManager.createIssuers=false
```

> The chart version strips the leading `v` (e.g. release `v5.0.0-beta` → `--version 5.0.0-beta`). Image tags are already baked into the packaged chart by the release workflow — no need to override them.

> `certManager.createIssuers=false` skips re-creating the `ClusterIssuer` resources since they are cluster-scoped and already exist from the prod install.


> **Why `letsencrypt-prod` and not `letsencrypt-staging`?**
> 
> All browser-facing environments (production and staging) must use `letsencrypt-prod` for SSL certificates. The `letsencrypt-staging` CA is untrusted by browsers, and production sets `Strict-Transport-Security: includeSubDomains`, so browsers will refuse to connect to staging if it uses a staging cert. Always use `letsencrypt-prod` for staging and production. Only use `letsencrypt-staging` for internal, non-browser testing.

**Teardown staging:**
```bash
helm uninstall staging --namespace portuguese-learning-staging
kubectl delete namespace portuguese-learning-staging
```

---

### Testing a Beta Release on a Live Cluster

Use this workflow when prod is already running and you want to validate a beta release without touching it.

**Prerequisites:** production is deployed in the `portuguese-learning` namespace and the one-time staging setup above has been completed.

**Step 1 — Trigger the release workflow** in GitHub Actions with a beta version (e.g. `v5.0.0-beta`). This builds and pushes Docker images tagged `v5.0.0-beta` and publishes the Helm chart `5.0.0-beta` to GHCR.

**Step 2 — Deploy to staging:**
```bash
helm upgrade --install staging \
  oci://ghcr.io/charly37/portuguese-learning \
  --version 5.0.0-beta \
  --namespace portuguese-learning-staging --create-namespace \
  --set namespace=portuguese-learning-staging \
  --set ingress.host=staging.dialecthub.net \
  --set ingress.clusterIssuer=letsencrypt-prod \
  --set ingress.tlsSecretName=staging-dialecthub-tls \
  --set data.hostPath=/home/ubuntu/PortugueseLearning/data-staging \
  --set sounds.hostPath=/home/ubuntu/PortugueseLearning/sounds \
  --set weeklyAudio.hostPath=/home/ubuntu/PortugueseLearning/weekly-audio-staging \
  --set podcast.hostPath=/home/ubuntu/PortugueseLearning/podcast-staging \
  --set certManager.createIssuers=false
```

> Strip the leading `v` for `--version`: `v5.0.0-beta` → `5.0.0-beta`. Image tags are already baked into the packaged chart — no need to override them.

**Step 3 — Verify pods are running:**
```bash
kubectl get all -n portuguese-learning-staging
```

**Step 4 — Access the staging app:**

| Environment | URL |
|---|---|
| Production | https://dialecthub.net |
| Staging (beta) | https://staging.dialecthub.net |

> The staging ingress now uses `letsencrypt-prod` so browsers will trust the certificate. Do not use `letsencrypt-staging` for any environment accessed by browsers.

**Step 5 — Check logs if needed:**
```bash
kubectl logs -f deployment/staging-app -n portuguese-learning-staging
```

**Step 6 — Once validated, promote to production:**
```bash
# Trigger release.yml with the stable version (e.g. v5.0.0), then:
helm upgrade prod \
  oci://ghcr.io/charly37/portuguese-learning \
  --version 5.0.0 \
  --namespace portuguese-learning
```

**Step 7 — Tear down staging:**
```bash
helm uninstall staging --namespace portuguese-learning-staging
kubectl delete namespace portuguese-learning-staging
```

---

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
| `data.hostPath` | `/home/ubuntu/PortugueseLearning/data` | Node path for challenge JSON files (text data) |
| `sounds.hostPath` | `/home/ubuntu/PortugueseLearning/sounds` | Node path for basic word pronunciation MP3s (read-only) |
| `weeklyAudio.hostPath` | `/home/ubuntu/PortugueseLearning/weekly-audio` | Node path for generated weekly challenge MP3s (read-write) |
| `podcast.hostPath` | `/home/ubuntu/PortugueseLearning/podcast` | Node path for the generated feeds, one `<show>/<pair>/` subdirectory each (read-write for the CronJob, read-only for the app) |
| `podcast.show` | `vocabulary` | Show slug used in the feed URL (`/podcast/<show>/<pair>/feed.xml`) |
| `podcast.pairs` | `[fr-pt]` | Language pairs to publish, `{native}-{learning}`; one CronJob per entry |
| `podcast.firstWeek` | `2026-10-26` | Earliest `weekStart` published in the feed (no backfill before this date) |
| `podcast.baseUrl` | `""` | Public site URL used in the feed (empty → `https://<ingress.host>`) |
| `podcast.audioBaseUrl` | `""` | Base URL for MP3 enclosures (empty → same as `baseUrl`); change it to move audio to a CDN |
| `podcast.episodeType` | `episodic` | iTunes ordering hint (`episodic` or `serial`) |
| `podcastFeed.schedule` | `0 7 * * 1` | Podcast RSS feed CronJob schedule |
| `vocabularyUpdaterAgent.languages` | `{fr: 06:00, en: 08:00}` | One CronJob per language (`schedule` + `skipValidator`), scheduled sequentially |
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

---

## Release Naming Convention

Versions follow **semver** with an optional pre-release suffix, validated by the release workflow:

```
v<MAJOR>.<MINOR>.<PATCH>[-<pre-release>]
```

| Type | Format | Example | Docker tag pushed | `latest` updated? |
|---|---|---|---|---|
| Stable release | `vX.Y.Z` | `v5.0.0` | `v5.0.0` + `latest` | Yes |
| Beta / RC | `vX.Y.Z-beta` | `v5.0.0-beta` | `v5.0.0-beta` + `latest` | Yes |
| Release candidate | `vX.Y.Z-rc.1` | `v5.0.0-rc.1` | `v5.0.0-rc.1` + `latest` | Yes |

> **Warning:** The release workflow always tags `latest` regardless of pre-release suffix. Deploy beta/RC builds to the **staging** namespace (not prod) to avoid impacting production users.

### Recommended workflow for pre-release testing

1. Trigger `release.yml` with a beta version (e.g. `v5.0.0-beta`)
2. Deploy to the **staging** namespace using `--version 5.0.0-beta` (see [Staging Deployment](#staging-deployment) above)
3. Validate on `staging.dialecthub.net`
4. When satisfied, trigger `release.yml` again with the stable version (`v5.0.0`) and deploy to prod

Required GitHub secrets/vars:
- `DOCKER_USERNAME` (var): Docker Hub username
- `DOCKER_PASSWORD` (secret): Docker Hub password or access token

