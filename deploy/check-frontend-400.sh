#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Diagnose frontend 400 error
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

echo -e "${CYAN}Diagnosing frontend 400 error...${NC}"
echo ""

ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

echo "=== Frontend Container Status ==="
docker compose ps frontend

echo ""
echo "=== Frontend Logs (last 30 lines) ==="
docker compose logs --tail=30 frontend

echo ""
echo "=== Testing frontend directly from nginx container ==="
docker compose exec -T nginx-proxy wget -q -O- http://frontend:80/ 2>&1 | head -30 || echo "Failed to reach frontend"

echo ""
echo "=== Nginx Error Logs (last 20 lines) ==="
docker compose exec -T nginx-proxy cat /var/log/nginx/error.log 2>/dev/null | tail -20 || echo "No error logs"

echo ""
echo "=== Testing frontend health endpoint ==="
docker compose exec -T nginx-proxy wget -q -O- http://frontend:80/health 2>&1 || echo "Health check failed"

echo ""
echo "=== Checking if frontend container is responding ==="
docker compose exec -T frontend ps aux | head -10 || echo "Cannot check frontend processes"
REMOTE_SCRIPT

echo ""
