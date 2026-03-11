#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Rebuild and redeploy images with correct architecture
# ═══════════════════════════════════════════════════════════════════
#
# Run this to fix the "exec format error" by rebuilding for linux/amd64
#
# Usage:
#   cd deploy/
#   ./rebuild-images.sh
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
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REMOTE_DIR="/opt/tupiel"

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Rebuilding Images for linux/amd64${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
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

# ─── Build images with correct platform ───
echo -e "${YELLOW}[1/3] Building images for linux/amd64...${NC}"

# Check if buildx is available
if docker buildx version &> /dev/null; then
    echo -e "  Using Docker buildx..."
    docker buildx create --name tupiel-builder --use 2>/dev/null || docker buildx use tupiel-builder 2>/dev/null || true
    
    echo -e "  Building backend..."
    docker buildx build --platform linux/amd64 -t tupiel-backend:latest --load "$PROJECT_ROOT/backend"
    
    echo -e "  Building frontend..."
    docker buildx build --platform linux/amd64 -t tupiel-frontend:latest --load "$PROJECT_ROOT/frontend"
else
    echo -e "  Using standard docker build..."
    echo -e "  Building backend..."
    docker build --platform linux/amd64 -t tupiel-backend:latest "$PROJECT_ROOT/backend"
    
    echo -e "  Building frontend..."
    docker build --platform linux/amd64 -t tupiel-frontend:latest "$PROJECT_ROOT/frontend"
fi

echo -e "${GREEN}  Images built.${NC}"

# ─── Transfer images ───
echo -e "${YELLOW}[2/3] Transferring images to server...${NC}"

echo -e "  Transferring backend..."
docker save tupiel-backend:latest | gzip | ssh "$SSH_TARGET" "docker load"
echo -e "${GREEN}  Backend transferred.${NC}"

echo -e "  Transferring frontend..."
docker save tupiel-frontend:latest | gzip | ssh "$SSH_TARGET" "docker load"
echo -e "${GREEN}  Frontend transferred.${NC}"

# ─── Restart containers ───
echo -e "${YELLOW}[3/3] Restarting containers on server...${NC}"

ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Stop and remove old containers
docker compose stop backend frontend
docker compose rm -f backend frontend

# Start with new images
docker compose up -d backend frontend

echo ""
echo "Waiting 10 seconds for containers to start..."
sleep 10

echo ""
echo "Container status:"
docker compose ps

echo ""
echo "Recent logs:"
docker compose logs --tail=10 backend
echo ""
docker compose logs --tail=10 frontend
REMOTE_SCRIPT

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Rebuild complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Check status:"
echo "  curl http://${SERVER_IP}/api/health"
echo "  curl http://${SERVER_IP}/"
echo ""
