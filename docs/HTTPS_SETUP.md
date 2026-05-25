# HTTPS Setup with Let's Encrypt

HTTPS is handled by **cert-manager** + **Traefik** (bundled with k3s). Certificates are issued by Let's Encrypt and auto-renewed — no manual intervention needed.

## Prerequisites

1. A domain name pointing to your server's IP address
2. Ports 80 and 443 open on your server/firewall
3. k3s running with Traefik enabled

## Setup

### Step 1 — Install cert-manager

```bash
sudo kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Wait for cert-manager to be ready
sudo kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=120s
```

### Step 2 — Apply the ClusterIssuer

The issuer config is in `helm/portuguese-learning/templates/` (rendered via `helm template`). It defines two issuers:
- `letsencrypt-staging` — use first to test without hitting rate limits
- `letsencrypt-prod` — use for the real certificate

```bash
helm template portuguese-learning helm/portuguese-learning | grep -A20 'ClusterIssuer' | sudo kubectl apply -f -
```

### Step 3 — Apply the Ingress

The ingress in `helm/portuguese-learning/templates/ingress.yaml` is already configured with:
```yaml
annotations:
  cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [dialecthub.net]
      secretName: dialecthub-tls
```

cert-manager automatically issues and stores the certificate in the `dialecthub-tls` secret.

```bash
helm upgrade --install portuguese-learning helm/portuguese-learning
```

### Step 4 — Verify

```bash
# Watch certificate issuance (~60 seconds)
sudo kubectl get certificate -n portuguese-learning -w

# Check the cert chain
echo | openssl s_client -connect dialecthub.net:443 2>&1 | grep -E "depth|issuer"
```

You should see `depth=1` with a Let's Encrypt issuer.

## What's Configured

- **Auto-renewal**: cert-manager renews certificates before expiry (at ~60 days, valid for 90)
- **HTTP-01 challenge**: Traefik handles the ACME challenge on port 80
- **HTTPS on port 443**: Traefik terminates TLS using the cert stored in `dialecthub-tls` secret
- **Staging issuer**: `letsencrypt-staging` available for testing without rate limits

## Troubleshooting

### Certificate stuck in pending

```bash
sudo kubectl describe certificate dialecthub-tls -n portuguese-learning
sudo kubectl describe certificaterequest -n portuguese-learning
sudo kubectl logs -n cert-manager deploy/cert-manager
```

### Check DNS is resolving correctly

```bash
nslookup dialecthub.net
nc -zv dialecthub.net 80 443
```

### Rate limiting

Use `letsencrypt-staging` issuer first. Update the annotation in the ingress:
```yaml
cert-manager.io/cluster-issuer: letsencrypt-staging
```
Then switch back to `letsencrypt-prod` once confirmed working.

## Testing

1. **SSL Labs**: https://www.ssllabs.com/ssltest/analyze.html?d=dialecthub.net
2. **Check cert**: `echo | openssl s_client -connect dialecthub.net:443 2>/dev/null | openssl x509 -noout -dates`
3. **Verify redirect**: `curl -I http://dialecthub.net`

---

## Legacy: Certbot + Nginx

> The previous HTTPS setup used certbot + nginx. Kept for reference only.

The `init-letsencrypt.sh` script initialized certificates, and the certbot container handled renewals. Config was in `nginx/conf.d/app.conf` using `fullchain.pem` + `privkey.pem` from the certbot volume.

