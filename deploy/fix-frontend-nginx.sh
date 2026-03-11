#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Rebuild frontend with fixed nginx config
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REMOTE_DIR="/opt/tupiel"

echo -e "${CYAN}Rebuilding frontend with fixed nginx config...${NC}"
echo ""

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

# Build frontend image
echo -e "${YELLOW}[1/3] Building frontend image...${NC}"
if docker buildx version &> /dev/null; then
    docker buildx build --platform linux/amd64 -t tupiel-frontend:latest --load "$PROJECT_ROOT/frontend"
else
    docker build --platform linux/amd64 -t tupiel-frontend:latest "$PROJECT_ROOT/frontend"
fi
echo -e "${GREEN}  Frontend image built.${NC}"

# Transfer to server
echo -e "${YELLOW}[2/3] Transferring frontend image to server...${NC}"
docker save tupiel-frontend:latest | gzip | ssh "$SSH_TARGET" "docker load"
echo -e "${GREEN}  Frontend image transferred.${NC}"

# Restart frontend on server
echo -e "${YELLOW}[3/3] Restarting frontend container...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Stop and remove old container
docker compose stop frontend
docker compose rm -f frontend

# Start with new image
docker compose up -d frontend

# Wait a moment
sleep 5

echo ""
echo "Frontend status:"
docker compose ps frontend

echo ""
echo "Frontend logs (last 10 lines):"
docker compose logs --tail=10 frontend
REMOTE_SCRIPT

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Frontend Rebuilt and Restarted!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Test with:"
if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "example.com" ]; then
    echo "  curl -k https://${DOMAIN}/"
else
    echo "  curl http://${SERVER_IP}/"
fi
echo ""
