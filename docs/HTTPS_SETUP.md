# HTTPS Setup with Let's Encrypt

This guide explains how to set up HTTPS for your Portuguese Learning application using Let's Encrypt SSL certificates with automatic renewal.

## Prerequisites

1. **A domain name** pointing to your server's IP address
2. **Ports 80 and 443** open on your server/firewall
3. **Docker and Docker Compose** installed
4. Your application running on a publicly accessible server

## Quick Start

### Step 1: Update Domain in Nginx Configuration

The domain is configured in `nginx/conf.d/app.conf`. Update the SSL certificate paths if you need to change from `dialecthub.net` to your domain:

```nginx
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

### Step 2: Initialize Let's Encrypt Certificates

Run the initialization script with your domain and email:

```bash
./init-letsencrypt.sh dialecthub.net your-email@example.com
```

**Options:**
- Add `1` as third parameter for staging mode (testing without rate limits):
  ```bash
  ./init-letsencrypt.sh dialecthub.net your-email@example.com 1
  ```

This script will:
1. Download recommended TLS parameters from certbot
2. Create a dummy certificate to allow Nginx to start
3. Start Nginx
4. Request a real Let's Encrypt certificate
5. Reload Nginx with the real certificate

### Step 3: Start Your Application

```bash
docker-compose up -d
```

Your application should now be accessible at `https://dialecthub.net`

## What's Configured

### Automatic Certificate Renewal

The certbot container automatically checks for certificate renewal twice daily. Certificates are renewed when they're within 30 days of expiration.

### HTTP to HTTPS Redirect

All HTTP traffic is automatically redirected to HTTPS for security.

### Security Headers

The following security headers are enabled:
- **HSTS**: Enforces HTTPS for 1 year
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing
- **X-XSS-Protection**: Enables browser XSS protection

### SSL Configuration

- **TLS 1.2 and 1.3** enabled
- **Strong cipher suites** configured
- **4096-bit RSA keys**
- **OCSP stapling** enabled

## Manual Operations

### Check Certificate Status

```bash
docker-compose run --rm certbot certificates
```

### Force Certificate Renewal

```bash
docker-compose run --rm certbot renew --force-renewal
docker-compose exec nginx nginx -s reload
```

### View Certbot Logs

```bash
docker-compose logs certbot
```

### Test Nginx Configuration

```bash
docker-compose exec nginx nginx -t
```

## Troubleshooting

### Certificate Request Failed

**Issue:** Let's Encrypt couldn't verify domain ownership.

**Solutions:**
1. Verify DNS is pointing to your server: `nslookup dialecthub.net`
2. Check ports 80 and 443 are accessible: `nc -zv dialecthub.net 80 443`
3. Check Nginx logs: `docker-compose logs nginx`
4. Try staging mode first to test: `./init-letsencrypt.sh dialecthub.net email 1`

### Rate Limiting

**Issue:** "too many certificates already issued"

**Solution:** Let's Encrypt has rate limits. Use staging mode for testing or wait for the rate limit to reset (usually weekly).

### Nginx Won't Start

**Issue:** Nginx fails to start after certificate setup.

**Solutions:**
1. Verify domain is correctly set in config: `grep dialecthub.net nginx/conf.d/app.conf`
2. Verify certificate files exist: `ls -la certbot/conf/live/dialecthub.net/`
3. Test Nginx config: `docker-compose exec nginx nginx -t`

### Certificate Not Renewing

**Issue:** Certificate expired or not auto-renewing.

**Solutions:**
1. Check certbot container is running: `docker-compose ps certbot`
2. Force renewal manually (see Manual Operations above)
3. Check certbot logs for errors

## File Structure

```
.
├── docker-compose.yml              # Updated with certbot service
├── init-letsencrypt.sh            # Certificate initialization script
├── nginx/
│   └── conf.d/
│       └── app.conf               # Nginx config with HTTPS (domain: dialecthub.net)
└── certbot/                       # Created by init script
    ├── conf/                      # SSL certificates stored here
    │   ├── live/
    │   │   └── dialecthub.net/
    │   │       ├── fullchain.pem
    │   │       └── privkey.pem
    │   ├── options-ssl-nginx.conf
    │   └── ssl-dhparams.pem
    └── www/                       # ACME challenge files
```

## Testing Your SSL Setup

After setup, test your SSL configuration:

1. **SSL Labs Test**: https://www.ssllabs.com/ssltest/
2. **Check certificate**: `openssl s_client -connect dialecthub.net:443`
3. **Verify redirect**: `curl -I http://dialecthub.net`

## Important Notes

- **DNS propagation** may take time. Wait 15-60 minutes after updating DNS before running init script
- **Let's Encrypt certificates** are valid for 90 days and auto-renew at 60 days
- **Staging certificates** won't work in browsers - use only for testing
- **Rate limits**: 50 certificates per domain per week (production)
- The certbot container runs renewals every 12 hours automatically

## Production Checklist

- [ ] Domain DNS points to server
- [ ] Ports 80 and 443 are open
- [ ] Tested with staging mode first
- [ ] Obtained production certificate
- [ ] Verified HTTPS works in browser
- [ ] Confirmed HTTP redirects to HTTPS
- [ ] Tested certificate auto-renewal
- [ ] Set up monitoring for certificate expiration

## Support

For Let's Encrypt documentation: https://letsencrypt.org/docs/
For Certbot documentation: https://certbot.eff.org/docs/
