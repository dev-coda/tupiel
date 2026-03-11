#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# TuPiel - SSL Certificate Setup (Let's Encrypt)
# ═══════════════════════════════════════════════════════════════════
#
# Run this ON THE SERVER after:
#   1. deploy.sh has been run (app is running on HTTP)
#   2. Your domain's DNS A record points to this server's IP
#   3. DNS has propagated (check with: dig YOUR_DOMAIN)
#
# Usage (on the server):
#   cd /opt/tupiel/deploy
#   sudo ./ssl-setup.sh
#
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  TuPiel SSL Certificate Setup${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Must be run as root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}This script must be run as root (use sudo)${NC}"
    exit 1
fi

# ─── Load .env ───
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${RED}ERROR: .env file not found at ${SCRIPT_DIR}/.env${NC}"
    exit 1
fi

source "$SCRIPT_DIR/.env"

if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "example.com" ]; then
    echo -e "${RED}ERROR: DOMAIN is not set in .env${NC}"
    echo "Edit .env and set your domain name."
    exit 1
fi

SSL_EMAIL="${SSL_EMAIL:-}"

echo -e "${GREEN}Domain: ${DOMAIN}${NC}"
echo ""

# ─── Step 1: Verify DNS ───
echo -e "${YELLOW}[1/4] Verifying DNS resolution...${NC}"

RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
SERVER_IP_ACTUAL=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

if [ -z "$RESOLVED_IP" ]; then
    echo -e "${RED}ERROR: Cannot resolve ${DOMAIN}${NC}"
    echo "Make sure your DNS A record points to this server's IP: ${SERVER_IP_ACTUAL}"
    echo "Then wait for DNS propagation and try again."
    exit 1
fi

if [ "$RESOLVED_IP" != "$SERVER_IP_ACTUAL" ]; then
    echo -e "${YELLOW}WARNING: ${DOMAIN} resolves to ${RESOLVED_IP} but this server's IP is ${SERVER_IP_ACTUAL}${NC}"
    echo -n "Continue anyway? (y/N): "
    read -r answer
    if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
        echo "Aborted."
        exit 1
    fi
else
    echo -e "${GREEN}  DNS OK: ${DOMAIN} -> ${RESOLVED_IP}${NC}"
fi

# ─── Step 2: Stop nginx temporarily for certbot ───
echo -e "${YELLOW}[2/4] Temporarily stopping nginx for certificate verification...${NC}"

cd "$SCRIPT_DIR"
docker compose stop nginx-proxy 2>/dev/null || true
echo -e "${GREEN}  Nginx stopped.${NC}"

# ─── Step 3: Obtain certificate ───
echo -e "${YELLOW}[3/4] Obtaining SSL certificate from Let's Encrypt...${NC}"

# Build certbot command
CERTBOT_CMD="certbot certonly --standalone"
CERTBOT_CMD="$CERTBOT_CMD -d ${DOMAIN}"
CERTBOT_CMD="$CERTBOT_CMD --non-interactive"
CERTBOT_CMD="$CERTBOT_CMD --agree-tos"

if [ -n "$SSL_EMAIL" ] && [ "$SSL_EMAIL" != "admin@example.com" ]; then
    CERTBOT_CMD="$CERTBOT_CMD --email ${SSL_EMAIL}"
else
    CERTBOT_CMD="$CERTBOT_CMD --register-unsafely-without-email"
fi

echo "Running: $CERTBOT_CMD"
eval "$CERTBOT_CMD"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Failed to obtain SSL certificate${NC}"
    echo "Starting nginx back up..."
    docker compose start nginx-proxy
    exit 1
fi

echo -e "${GREEN}  SSL certificate obtained!${NC}"

# ─── Step 4: Configure nginx for SSL and restart ───
echo -e "${YELLOW}[4/5] Configuring nginx with SSL certificate...${NC}"

# Copy certs into the Docker volume
docker run --rm \
    -v /etc/letsencrypt:/source:ro \
    -v deploy_certbot_certs:/target \
    alpine sh -c "
        cp -rL /source/live /target/live 2>/dev/null; \
        cp -rL /source/archive /target/archive 2>/dev/null; \
        mkdir -p /target/live/${DOMAIN} && \
        cp -L /source/live/${DOMAIN}/fullchain.pem /target/live/${DOMAIN}/fullchain.pem && \
        cp -L /source/live/${DOMAIN}/privkey.pem /target/live/${DOMAIN}/privkey.pem && \
        chmod 644 /target/live/${DOMAIN}/*.pem
    "

echo -e "${GREEN}  Certificates copied to Docker volume.${NC}"

# ─── Step 5: Create HTTPS nginx config and update HTTP to redirect ───
echo -e "${YELLOW}[5/5] Creating HTTPS nginx config...${NC}"

# Overwrite HTTP config to redirect to HTTPS
cat > ${SCRIPT_DIR}/nginx/conf.d/default.conf << HTTPCONF
# HTTP -> redirect to HTTPS
server {
    listen 80;
    server_name ${DOMAIN};

    # Let's Encrypt challenge directory
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Health check (always available on HTTP)
    location /nginx-health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }

    # Redirect everything else to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}
HTTPCONF

# Create HTTPS config
cat > ${SCRIPT_DIR}/nginx/conf.d/ssl.conf << SSLCONF
# HTTPS server
server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    # Resolver for dynamic DNS resolution (allows nginx to start even if upstreams aren't ready)
    resolver 127.0.0.11 valid=10s;
    resolver_timeout 5s;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Health check
    location /nginx-health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }

    # API requests -> backend
    # Using variable so nginx resolves DNS at request time, not startup
    # \$request_uri preserves the full original path + query string
    location /api/ {
        set \$backend_upstream http://backend:3000;
        proxy_pass \$backend_upstream\$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
    }

    # Everything else -> frontend
    location / {
        set \$frontend_upstream http://frontend:80;
        proxy_pass \$frontend_upstream\$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_redirect off;
    }
}
SSLCONF

echo -e "${GREEN}  HTTPS nginx config created.${NC}"

# Restart nginx with new config
docker compose up -d nginx-proxy
echo -e "${GREEN}  Nginx restarted with SSL.${NC}"

# ─── Set up auto-renewal ───
echo -e "${YELLOW}Setting up automatic certificate renewal...${NC}"

# Create renewal script
cat > /opt/tupiel/renew-certs.sh << RENEW
#!/bin/bash
# Auto-renew SSL certificates and copy to Docker volume
cd /opt/tupiel/deploy

# Renew certs (certbot handles checking if renewal is needed)
certbot renew --quiet --standalone --pre-hook "docker compose stop nginx-proxy" --post-hook "docker compose start nginx-proxy"

# Copy renewed certs to Docker volume
docker run --rm \\
    -v /etc/letsencrypt:/source:ro \\
    -v deploy_certbot_certs:/target \\
    alpine sh -c "
        mkdir -p /target/live/${DOMAIN} && \\
        cp -L /source/live/${DOMAIN}/fullchain.pem /target/live/${DOMAIN}/fullchain.pem && \\
        cp -L /source/live/${DOMAIN}/privkey.pem /target/live/${DOMAIN}/privkey.pem && \\
        chmod 644 /target/live/${DOMAIN}/*.pem
    "

# Reload nginx config
docker compose exec nginx-proxy nginx -s reload 2>/dev/null || docker compose restart nginx-proxy
RENEW

chmod +x /opt/tupiel/renew-certs.sh

# Add cron job for auto-renewal (twice daily, as recommended by Let's Encrypt)
CRON_JOB="0 3,15 * * * /opt/tupiel/renew-certs.sh >> /var/log/certbot-renew.log 2>&1"
(crontab -l 2>/dev/null | grep -v "renew-certs"; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}  Auto-renewal cron job installed (runs twice daily).${NC}"

# ─── Verify ───
echo ""
sleep 3

HTTPS_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" 2>/dev/null || echo "000")
if [ "$HTTPS_STATUS" = "200" ] || [ "$HTTPS_STATUS" = "301" ] || [ "$HTTPS_STATUS" = "302" ]; then
    echo -e "${GREEN}  HTTPS verification: OK (HTTP ${HTTPS_STATUS})${NC}"
else
    echo -e "${YELLOW}  HTTPS verification: HTTP ${HTTPS_STATUS} (may need a moment to start)${NC}"
fi

# ─── Done ───
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SSL setup complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Your app is now available at:"
echo -e "  ${GREEN}https://${DOMAIN}${NC}"
echo ""
echo "Certificate info:"
echo "  certbot certificates"
echo ""
echo "Auto-renewal is configured. Test it with:"
echo "  certbot renew --dry-run"
echo ""
