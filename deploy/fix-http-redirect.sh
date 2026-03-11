#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Fix HTTP redirect issue - restore HTTP serving
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

echo -e "${CYAN}Fixing HTTP redirect issue...${NC}"
echo ""

# Copy the correct HTTP config (serves HTTP, doesn't redirect)
scp "$SCRIPT_DIR/nginx/conf.d/default.conf" "${SSH_TARGET}:${REMOTE_DIR}/deploy/nginx/conf.d/default.conf"

# Restart nginx
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy
docker compose restart nginx-proxy
sleep 2
docker compose logs --tail=5 nginx-proxy
REMOTE_SCRIPT

echo ""
echo -e "${GREEN}HTTP should now work without redirecting to HTTPS${NC}"
echo ""
echo "Test with:"
echo "  curl http://${SERVER_IP}/api/health"
echo ""
