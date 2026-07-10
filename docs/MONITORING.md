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

### Traefik ingress exclusion

Make sure `/metrics` is not routed through the public ingress. The current ingress in `helm/portuguese-learning/templates/ingress.yaml` only routes to the app service — but if you ever add path-based rules, explicitly exclude `/metrics`:

```yaml
# In ingress rules, do NOT add a rule for /metrics
# If using Traefik Middleware for path filtering, block /metrics at the ingress level:
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: block-metrics
  namespace: {{ .Values.namespace }}
spec:
  ipAllowList:
    sourceRange:
      - "10.0.0.0/8"      # internal cluster CIDR only
      - "172.16.0.0/12"
      - "192.168.0.0/16"
```

### Summary of security layers

| Layer | Mechanism | Status |
|---|---|---|
| No public ingress rule for `/metrics` | Traefik ingress config | Verify manually |
| Restrict scrape to Prometheus pod only | Kubernetes `NetworkPolicy` | Recommended — add `networkpolicy-metrics.yaml` |
| CNI policy enforcement | Calico / Cilium | Required for NetworkPolicy to take effect |
| Optional token auth | `METRICS_TOKEN` env var + middleware | Not implemented — add if needed |
