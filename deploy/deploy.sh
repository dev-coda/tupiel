#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# TuPiel - Deploy to Vultr Server
# ═══════════════════════════════════════════════════════════════════
#
# This script builds Docker images, transfers them to the server,
# copies config files, and starts all services.
#
# Run from your local machine (Mac):
#   cd deploy/
#   ./deploy.sh
#
# Prerequisites:
#   - SSH access to the server (ssh root@SERVER_IP should work)
#   - Docker installed locally (for building images)
#   - .env file created from .env.example
#   - setup-server.sh already run on the server
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
echo -e "${CYAN}  TuPiel Deployment${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ─── Load .env ───
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    echo "Create it from the template:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

source "$SCRIPT_DIR/.env"

# Validate required variables
if [ -z "${SERVER_IP:-}" ] || [ "$SERVER_IP" = "0.0.0.0" ]; then
    echo -e "${RED}ERROR: SERVER_IP is not set in .env${NC}"
    exit 1
fi

if [ -z "${DB_PASSWORD:-}" ] || [ "$DB_PASSWORD" = "CHANGE_ME" ]; then
    echo -e "${RED}ERROR: DB_PASSWORD is not configured in .env${NC}"
    exit 1
fi

if [ -z "${APP_DB_PASSWORD:-}" ] || [ "$APP_DB_PASSWORD" = "CHANGE_ME_app_password" ]; then
    echo -e "${RED}ERROR: APP_DB_PASSWORD is not configured in .env${NC}"
    exit 1
fi

SERVER_USER="${SERVER_USER:-root}"
SSH_TARGET="${SERVER_USER}@${SERVER_IP}"

echo -e "${GREEN}Server:       ${SSH_TARGET}${NC}"
echo -e "${GREEN}Remote dir:   ${REMOTE_DIR}${NC}"
echo -e "${GREEN}Project root: ${PROJECT_ROOT}${NC}"
echo ""

# ─── Step 1: Test SSH connection ───
echo -e "${YELLOW}[1/6] Testing SSH connection...${NC}"
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_TARGET" "echo 'SSH OK'" 2>/dev/null; then
    echo -e "${RED}ERROR: Cannot connect to ${SSH_TARGET}${NC}"
    echo "Make sure:"
    echo "  - The server IP is correct"
    echo "  - Your SSH key is set up (ssh-copy-id ${SSH_TARGET})"
    echo "  - The server is running"
    exit 1
fi
echo -e "${GREEN}  SSH connection OK.${NC}"

# ─── Step 2: Build Docker images ───
echo -e "${YELLOW}[2/6] Building Docker images for linux/amd64...${NC}"

# Check if buildx is available (better for cross-platform builds)
if docker buildx version &> /dev/null; then
    echo -e "  Using Docker buildx for cross-platform build..."
    # Create a builder instance if it doesn't exist
    docker buildx create --name tupiel-builder --use 2>/dev/null || docker buildx use tupiel-builder 2>/dev/null || true
    
    echo -e "  Building backend..."
    docker buildx build --platform linux/amd64 -t tupiel-backend:latest --load "$PROJECT_ROOT/backend"
    echo -e "${GREEN}  Backend image built.${NC}"
    
    echo -e "  Building frontend..."
    docker buildx build --platform linux/amd64 -t tupiel-frontend:latest --load "$PROJECT_ROOT/frontend"
    echo -e "${GREEN}  Frontend image built.${NC}"
else
    echo -e "  Using standard docker build with --platform flag..."
    echo -e "  Building backend..."
    docker build --platform linux/amd64 -t tupiel-backend:latest "$PROJECT_ROOT/backend"
    echo -e "${GREEN}  Backend image built.${NC}"
    
    echo -e "  Building frontend..."
    docker build --platform linux/amd64 -t tupiel-frontend:latest "$PROJECT_ROOT/frontend"
    echo -e "${GREEN}  Frontend image built.${NC}"
fi

# ─── Step 3: Transfer images to server ───
echo -e "${YELLOW}[3/6] Transferring images to server (this may take a few minutes)...${NC}"

echo -e "  Saving and transferring backend image..."
docker save tupiel-backend:latest | gzip | ssh "$SSH_TARGET" "docker load"
echo -e "${GREEN}  Backend image transferred.${NC}"

echo -e "  Saving and transferring frontend image..."
docker save tupiel-frontend:latest | gzip | ssh "$SSH_TARGET" "docker load"
echo -e "${GREEN}  Frontend image transferred.${NC}"

# ─── Step 4: Copy config files to server ───
echo -e "${YELLOW}[4/6] Copying configuration files to server...${NC}"

# Create directory structure on server
ssh "$SSH_TARGET" "mkdir -p ${REMOTE_DIR}/deploy/nginx/conf.d"

# Copy files
scp "$SCRIPT_DIR/docker-compose.yml" "${SSH_TARGET}:${REMOTE_DIR}/deploy/docker-compose.yml"
scp "$SCRIPT_DIR/.env" "${SSH_TARGET}:${REMOTE_DIR}/deploy/.env"
scp "$SCRIPT_DIR/nginx/nginx.conf" "${SSH_TARGET}:${REMOTE_DIR}/deploy/nginx/nginx.conf"
scp "$SCRIPT_DIR/nginx/conf.d/default.conf" "${SSH_TARGET}:${REMOTE_DIR}/deploy/nginx/conf.d/default.conf"
scp "$SCRIPT_DIR/ssl-setup.sh" "${SSH_TARGET}:${REMOTE_DIR}/deploy/ssl-setup.sh"

# Make scripts executable on server
ssh "$SSH_TARGET" "chmod +x ${REMOTE_DIR}/deploy/ssl-setup.sh"

echo -e "${GREEN}  Config files copied.${NC}"

# ─── Step 5: Start services ───
echo -e "${YELLOW}[5/6] Starting services on server...${NC}"

ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
set -e
cd ${REMOTE_DIR}/deploy

# Stop existing containers if running
docker compose down --remove-orphans 2>/dev/null || true

# Pull base images
docker pull mysql:8.0
docker pull nginx:alpine

# Start all services (--no-build because images are pre-built and transferred).
# --force-recreate: same tag (e.g. tupiel-frontend:latest) can point to a new image after docker load;
# without this, Compose may keep running the old container and the UI never updates.
docker compose --env-file .env up -d --no-build --force-recreate --remove-orphans

echo ""
echo "Container status:"
docker compose ps
REMOTE_SCRIPT

echo -e "${GREEN}  Services started.${NC}"

# ─── Step 6: Verify health ───
echo -e "${YELLOW}[6/6] Verifying deployment...${NC}"

# Wait a moment for services to start
echo "  Waiting 20 seconds for services to initialize..."
sleep 20

# Check if the server responds
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_IP}/api/health" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}  Backend health check: OK (HTTP 200)${NC}"
else
    echo -e "${YELLOW}  Backend health check: HTTP ${HTTP_STATUS} (may still be starting up)${NC}"
    echo "  Check logs with: ssh ${SSH_TARGET} 'cd ${REMOTE_DIR}/deploy && docker compose logs'"
fi

FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_IP}/" 2>/dev/null || echo "000")

if [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}  Frontend: OK (HTTP 200)${NC}"
else
    echo -e "${YELLOW}  Frontend: HTTP ${FRONTEND_STATUS} (may still be starting up)${NC}"
fi

# ─── Done ───
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Your app is running at:"
echo -e "  ${GREEN}http://${SERVER_IP}${NC}"
echo ""
echo "Useful commands (run on the server):"
echo "  cd ${REMOTE_DIR}/deploy"
echo "  docker compose ps              # Check service status"
echo "  docker compose logs -f         # Follow all logs"
echo "  docker compose logs backend    # Backend logs only"
echo "  docker compose restart backend # Restart a service"
echo "  docker compose down            # Stop everything"
echo ""
echo "Next steps:"
echo "  1. Add Vultr server IP (${SERVER_IP}) to DigitalOcean DB trusted sources"
echo "  2. Point your domain DNS A record to ${SERVER_IP}"
echo "  3. Run ssl-setup.sh on the server to enable HTTPS"
echo ""
