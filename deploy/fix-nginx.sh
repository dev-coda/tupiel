#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# TuPiel - Fix Nginx Container
# ═══════════════════════════════════════════════════════════════════
#
# Run this ON THE SERVER to diagnose and fix nginx issues
#
# Usage:
#   ssh root@YOUR_IP 'bash -s' < deploy/fix-nginx.sh
# Or on the server:
#   cd /opt/tupiel/deploy
#   sudo ./fix-nginx.sh
#
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DEPLOY_DIR="/opt/tupiel/deploy"

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Fixing Nginx Container${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

cd "$DEPLOY_DIR"

# ─── Check nginx logs ───
echo -e "${YELLOW}[1/4] Checking nginx container logs...${NC}"
echo ""
docker compose logs nginx-proxy | tail -50
echo ""

# ─── Check if config files exist ───
echo -e "${YELLOW}[2/4] Checking nginx config files...${NC}"
if [ ! -f "nginx/nginx.conf" ]; then
    echo -e "${RED}  ERROR: nginx/nginx.conf not found!${NC}"
    exit 1
fi
if [ ! -f "nginx/conf.d/default.conf" ]; then
    echo -e "${RED}  ERROR: nginx/conf.d/default.conf not found!${NC}"
    exit 1
fi
echo -e "${GREEN}  Config files exist.${NC}"

# ─── Test nginx config syntax ───
echo -e "${YELLOW}[3/4] Testing nginx config syntax...${NC}"
docker run --rm \
    -v "$(pwd)/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "$(pwd)/nginx/conf.d:/etc/nginx/conf.d:ro" \
    nginx:alpine nginx -t 2>&1 || {
    echo -e "${RED}  Nginx config has syntax errors!${NC}"
    echo "  Fix the errors above and try again."
    exit 1
}
echo -e "${GREEN}  Config syntax OK.${NC}"

# ─── Stop and restart nginx ───
echo -e "${YELLOW}[4/4] Restarting nginx container...${NC}"
docker compose stop nginx-proxy 2>/dev/null || true
docker compose rm -f nginx-proxy 2>/dev/null || true
docker compose up -d nginx-proxy

echo ""
echo "Waiting 5 seconds for nginx to start..."
sleep 5

# ─── Verify nginx is running ───
if docker ps | grep -q tupiel-nginx; then
    echo -e "${GREEN}  ✓ Nginx container is running!${NC}"
    echo ""
    echo "Container status:"
    docker compose ps nginx-proxy
    echo ""
    echo "Recent logs:"
    docker compose logs --tail=10 nginx-proxy
else
    echo -e "${RED}  ✗ Nginx container failed to start${NC}"
    echo ""
    echo "Full logs:"
    docker compose logs nginx-proxy
    exit 1
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Nginx should now be accessible${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Test with:"
echo "  curl http://localhost"
echo "  curl http://localhost/api/health"
echo ""
