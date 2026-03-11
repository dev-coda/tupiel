#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Quick Fix: Update nginx config and restart
# ═══════════════════════════════════════════════════════════════════
#
# Run from your local machine to fix nginx on the server
#
# Usage:
#   cd deploy/
#   ./quick-fix-nginx.sh
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

echo -e "${CYAN}Updating nginx config on server...${NC}"
echo ""

# Copy fixed nginx config
scp "$SCRIPT_DIR/nginx/conf.d/default.conf" "${SSH_TARGET}:${REMOTE_DIR}/deploy/nginx/conf.d/default.conf"
scp "$SCRIPT_DIR/docker-compose.yml" "${SSH_TARGET}:${REMOTE_DIR}/deploy/docker-compose.yml"

echo -e "${GREEN}Config files copied.${NC}"

# Restart nginx
echo -e "${YELLOW}Restarting nginx...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy
docker compose stop nginx-proxy
docker compose up -d nginx-proxy
sleep 3
docker compose ps nginx-proxy
echo ""
echo "Recent logs:"
docker compose logs --tail=10 nginx-proxy
REMOTE_SCRIPT

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Nginx should now be working!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Test with:"
echo "  curl http://${SERVER_IP}/api/health"
echo "  curl http://${SERVER_IP}/"
echo ""
