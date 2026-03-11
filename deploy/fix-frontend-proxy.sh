#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Fix frontend proxy configuration
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    exit 1
fi

source "$SCRIPT_DIR/.env"

if [ -z "${SERVER_IP:-}" ] || [ "$SERVER_IP" = "0.0.0.0" ]; then
    echo -e "${RED}ERROR: SERVER_IP is not set in .env${NC}"
    exit 1
fi

SERVER_USER="${SERVER_USER:-root}"
SSH_TARGET="${SERVER_USER}@${SERVER_IP}"
REMOTE_DIR="/opt/tupiel"

echo -e "${CYAN}Fixing frontend proxy configuration...${NC}"
echo ""

# Copy updated HTTP config
scp "$SCRIPT_DIR/nginx/conf.d/default.conf" "${SSH_TARGET}:${REMOTE_DIR}/deploy/nginx/conf.d/default.conf"

# Update SSL config if it exists
if [ -f "${REMOTE_DIR}/deploy/nginx/conf.d/ssl.conf" ]; then
    echo "Updating SSL config on server..."
    ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Update the frontend location block in ssl.conf
sed -i 's|proxy_pass \\\\\$frontend_upstream/;|proxy_pass \\\\\$frontend_upstream;|' nginx/conf.d/ssl.conf
sed -i 's|proxy_set_header Host \\\\\$host;|proxy_set_header Host frontend;|' nginx/conf.d/ssl.conf
sed -i '/proxy_set_header X-Forwarded-Proto/a\        proxy_redirect off;' nginx/conf.d/ssl.conf

echo "SSL config updated"
REMOTE_SCRIPT
fi

# Restart nginx
echo "Restarting nginx..."
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy
docker compose restart nginx-proxy
sleep 3
docker compose logs --tail=10 nginx-proxy
REMOTE_SCRIPT

echo ""
echo -e "${GREEN}Frontend proxy configuration updated!${NC}"
echo ""
echo "Test with:"
if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "example.com" ]; then
    echo "  curl -k https://${DOMAIN}/"
else
    echo "  curl http://${SERVER_IP}/"
fi
echo ""
