# Monitoring — Prometheus Exporter

The application exposes a standard Prometheus scrape endpoint at `GET /metrics`.

## Exposed Metrics

### Application Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `app_users_registered_total` | Gauge | Number of registered (non-guest) users in the database |
| `app_users_guest_total` | Gauge | Number of active guest users in the database (TTL-expiring) |

Both values are queried live from MongoDB on every scrape, so they always reflect the current state.

### Default Node.js Runtime Metrics

The following are collected automatically by `prom-client`'s `collectDefaultMetrics()`:

| Metric group | Examples |
|---|---|
| CPU usage | `process_cpu_seconds_total` |
| Memory | `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes` |
| Event loop | `nodejs_eventloop_lag_seconds` |
| Garbage collection | `nodejs_gc_duration_seconds` |
| Active handles/requests | `nodejs_active_handles_total`, `nodejs_active_requests_total` |
| File descriptors | `process_open_fds` |

## Endpoint

```
GET /metrics
Content-Type: text/plain; version=0.0.4
```

Example output:

```
# HELP app_users_registered_total Number of registered (non-guest) users in the database
# TYPE app_users_registered_total gauge
app_users_registered_total 142

# HELP app_users_guest_total Number of active guest users in the database (TTL-expiring)
# TYPE app_users_guest_total gauge
app_users_guest_total 17

# HELP process_cpu_seconds_total Total user and system CPU time spent in seconds
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 3.14
...
```

## Scraping with Prometheus

### Manual scrape config (`prometheus.yml`)

If you are running a standalone Prometheus instance, add the app as a scrape target:

```yaml
scrape_configs:
  - job_name: 'portuguese-learning'
    static_configs:
      - targets: ['<app-service-clusterip>:3000']
    metrics_path: /metrics
    scrape_interval: 30s
```

### Prometheus Operator / kube-prometheus-stack

If the cluster runs [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack), enable auto-discovery by adding pod annotations to the Helm deployment template.

Add the following to the `template.metadata.annotations` block in `helm/portuguese-learning/templates/deployment.yaml`:

```yaml
template:
  metadata:
    labels:
      app: {{ .Release.Name }}-app
    annotations:
      prometheus.io/scrape: "true"
      prometheus.io/port: "3000"
      prometheus.io/path: "/metrics"
```

Alternatively, create a `ServiceMonitor` resource (preferred with Prometheus Operator):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: portuguese-learning
  namespace: portuguese-learning
  labels:
    release: kube-prometheus-stack   # must match Prometheus Operator selector
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: portuguese-learning
  endpoints:
    - port: http          # must match the named port in the Service
      path: /metrics
      interval: 30s
```

## Security

### Why the endpoint has no built-in authentication

`/metrics` is intentionally unauthenticated. Prometheus scrapers running inside the cluster do not send credentials by default, and adding token verification would require configuring every scraper. The endpoint is protected at the **network level** instead (see below).

> **Important**: Never expose `/metrics` publicly through the Traefik ingress. The endpoint reveals internal system details (memory usage, open file descriptors, user counts) that should not be accessible to the internet.

### Kubernetes NetworkPolicy (recommended)

Apply a `NetworkPolicy` to restrict `/metrics` access to the Prometheus namespace only.
Create `helm/portuguese-learning/templates/networkpolicy-metrics.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prometheus-scrape
  namespace: {{ .Values.namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ .Release.Name }}-app
  policyTypes:
    - Ingress
  ingress:
    # Allow Traefik ingress controller (web traffic)
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: TCP
          port: 3000
    # Allow Prometheus scraper only
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring   # adjust to your Prometheus namespace
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: prometheus
      ports:
        - protocol: TCP
          port: 3000
```

> **Note**: `NetworkPolicy` enforcement requires a CNI plugin that supports it (e.g., Calico, Cilium, Flannel with NetworkPolicy support). The default k3s bundled CNI (Flannel) does **not** enforce NetworkPolicy by default — install Calico or Cilium if you need policy enforcement.

### Traefik ingress exclusion (implemented)

`/metrics` is blocked at the Traefik ingress level via `helm/portuguese-learning/templates/ingress-metrics-block.yaml`. This file creates:

1. A `Middleware` resource (`block-metrics`) of type `ipAllowList` that only permits RFC-1918 private IP ranges (cluster-internal traffic).
2. A dedicated `Ingress` resource for `path: /metrics` (Exact) with priority 100, referencing the middleware. This rule takes precedence over the catch-all `path: /` (Prefix) rule in the main ingress.

External requests to `dialecthub.net/metrics` will receive **403 Forbidden** from Traefik before the request even reaches the app. Internal Prometheus pods are unaffected because they scrape via the Service ClusterIP directly, bypassing Traefik entirely.

> **Traefik version note**: The middleware uses `ipAllowList` (Traefik v3, k3s ≥ 1.30). If you are running an older k3s version with Traefik v2, rename the spec key to `ipWhiteList` in `ingress-metrics-block.yaml`.

### Summary of security layers

| Layer | Mechanism | Status |
|---|---|---|
| Block `/metrics` at ingress level | Traefik `ipAllowList` Middleware | ✅ Implemented — `ingress-metrics-block.yaml` |
| Restrict scrape to Prometheus pod only | Kubernetes `NetworkPolicy` | Recommended — add `networkpolicy-metrics.yaml` (see above) |
| CNI policy enforcement | Calico / Cilium | Required for NetworkPolicy to take effect |
| Optional token auth | `METRICS_TOKEN` env var + middleware | Not implemented — add if needed |
