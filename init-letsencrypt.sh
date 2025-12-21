#!/bin/bash

# Initialize Let's Encrypt SSL certificates
# This script should be run once before starting the services with docker compose

if [ -z "$1" ]; then
    echo "Usage: ./init-letsencrypt.sh <domain> [<email>]"
    echo "Example: ./init-letsencrypt.sh example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=${2:-""}
STAGING=${3:-0} # Set to 1 if you're testing to avoid rate limits

DATA_PATH="./certbot"
RSA_KEY_SIZE=4096

# Check if certificates already exist
if [ -d "$DATA_PATH/conf/live/$DOMAIN" ]; then
    read -p "Existing certificates found for $DOMAIN. Remove and continue? (y/N) " decision
    if [ "$decision" != "y" ] && [ "$decision" != "Y" ]; then
        echo "Exiting."
        exit 0
    fi
fi

# Download recommended TLS parameters
echo "### Downloading recommended TLS parameters..."
sudo mkdir -p "$DATA_PATH/conf"
sudo curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf -o "$DATA_PATH/conf/options-ssl-nginx.conf"
sudo curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem -o "$DATA_PATH/conf/ssl-dhparams.pem"
sudo chmod -R 755 "$DATA_PATH/conf"
echo

# Create dummy certificate for nginx to start
echo "### Creating dummy certificate for $DOMAIN..."
mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
docker compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:$RSA_KEY_SIZE -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=localhost'" certbot
echo

# Start nginx
echo "### Starting nginx..."
docker compose up --force-recreate -d nginx
echo

# Delete dummy certificate
echo "### Deleting dummy certificate for $DOMAIN..."
docker compose run --rm --entrypoint "\
    rm -Rf /etc/letsencrypt/live/$DOMAIN && \
    rm -Rf /etc/letsencrypt/archive/$DOMAIN && \
    rm -Rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot
echo

# Request Let's Encrypt certificate
echo "### Requesting Let's Encrypt certificate for $DOMAIN..."

# Select appropriate email arg
case "$EMAIL" in
    "") EMAIL_ARG="--register-unsafely-without-email" ;;
    *) EMAIL_ARG="--email $EMAIL" ;;
esac

# Enable staging mode if needed
if [ $STAGING != "0" ]; then
    STAGING_ARG="--staging"
else
    STAGING_ARG=""
fi

docker compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    $EMAIL_ARG \
    -d $DOMAIN \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot
echo

# Reload nginx
echo "### Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "### SSL certificate successfully obtained!"
echo "### You can now access your application at https://$DOMAIN"
