#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Check all container statuses
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

echo -e "${CYAN}Checking container statuses...${NC}"
echo ""

ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

echo "=== All Docker Containers ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAMES|tupiel" || echo "No tupiel containers found"

echo ""
echo "=== Docker Compose Status ==="
docker compose ps

echo ""
echo "=== Network Info ==="
docker network ls | grep tupiel || echo "No tupiel network found"
if docker network ls | grep -q tupiel; then
    echo ""
    echo "Containers on tupiel-net:"
    docker network inspect deploy_tupiel-net 2>/dev/null | grep -A 5 "Containers" || docker network inspect tupiel-net 2>/dev/null | grep -A 5 "Containers" || echo "Could not inspect network"
fi

echo ""
echo "=== Backend Logs (last 20 lines) ==="
docker compose logs --tail=20 backend 2>/dev/null || echo "No backend logs"

echo ""
echo "=== Frontend Logs (last 20 lines) ==="
docker compose logs --tail=20 frontend 2>/dev/null || echo "No frontend logs"

echo ""
echo "=== MySQL Logs (last 10 lines) ==="
docker compose logs --tail=10 mysql 2>/dev/null || echo "No mysql logs"
REMOTE_SCRIPT
