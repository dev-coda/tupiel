#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Check backend errors and test endpoints
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

echo -e "${CYAN}Checking backend status and errors...${NC}"
echo ""

ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

echo "=== Container Status ==="
docker compose ps

echo ""
echo "=== Backend Logs (last 30 lines) ==="
docker compose logs --tail=30 backend

echo ""
echo "=== Testing backend directly (from inside container network) ==="
docker compose exec -T backend curl -s http://localhost:3000/api/health || echo "Backend not responding"

echo ""
echo "=== Testing from nginx container ==="
docker compose exec -T nginx-proxy wget -q -O- http://backend:3000/api/health || echo "Cannot reach backend from nginx"
REMOTE_SCRIPT

echo ""
echo -e "${CYAN}Testing from outside...${NC}"
echo ""

# Test endpoints
echo "Testing /api/health:"
curl -v "http://${SERVER_IP}/api/health" 2>&1 | head -20

echo ""
echo ""
echo "Testing /:"
curl -v "http://${SERVER_IP}/" 2>&1 | head -20

echo ""
