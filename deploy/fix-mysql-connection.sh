#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Fix MySQL connection issues
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

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Fixing MySQL Connection Issues${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Check MySQL container status
echo -e "${YELLOW}[1/4] Checking MySQL container status...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

echo "Container status:"
docker compose ps mysql

echo ""
echo "MySQL logs (last 20 lines):"
docker compose logs --tail=20 mysql

echo ""
echo "Network info:"
docker network inspect deploy_tupiel-net 2>/dev/null | grep -A 10 "Containers" || docker network inspect tupiel-net 2>/dev/null | grep -A 10 "Containers" || echo "Could not inspect network"
REMOTE_SCRIPT

echo ""
echo -e "${YELLOW}[2/4] Testing MySQL connectivity...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Check if MySQL is listening
echo "Checking if MySQL is listening on port 3306..."
docker compose exec -T mysql netstat -tlnp 2>/dev/null | grep 3306 || docker compose exec -T mysql ss -tlnp 2>/dev/null | grep 3306 || echo "Cannot check listening ports"

# Test connection from backend container
echo ""
echo "Testing connection from backend container..."
docker compose exec -T backend sh -c "nc -zv mysql 3306 2>&1 || echo 'Connection test failed'" || echo "Backend container not running"

# Test MySQL connection with current password
if [ -f .env ]; then
    source .env
    echo ""
    echo "Testing MySQL connection with password from .env..."
    docker compose exec -T mysql mysql -u tupiel_app -p\${APP_DB_PASSWORD} -e "SELECT 1;" tupiel_app 2>&1 | head -5 || echo "Connection failed"
fi
REMOTE_SCRIPT

echo ""
echo -e "${YELLOW}[3/4] Ensuring MySQL is running and healthy...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Make sure MySQL is running
docker compose up -d mysql

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
MAX_WAIT=60
WAITED=0
while [ \$WAITED -lt \$MAX_WAIT ]; do
    if docker compose exec -T mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
        echo "MySQL is ready!"
        break
    fi
    echo -n "."
    sleep 2
    WAITED=\$((WAITED + 2))
done

if [ \$WAITED -ge \$MAX_WAIT ]; then
    echo ""
    echo "ERROR: MySQL did not become ready"
    docker compose logs mysql | tail -30
    exit 1
fi

echo ""
echo "MySQL is healthy"
REMOTE_SCRIPT

echo ""
echo -e "${YELLOW}[4/4] Restarting backend to reconnect...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Restart backend
docker compose restart backend

# Wait a moment
sleep 5

echo ""
echo "Backend status:"
docker compose ps backend

echo ""
echo "Backend logs (last 20 lines):"
docker compose logs --tail=20 backend
REMOTE_SCRIPT

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  MySQL Connection Check Complete${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Note about Production Database:${NC}"
echo "The DigitalOcean database access denied error is expected until you:"
echo "  1. Add Vultr server IP (${SERVER_IP}) to DigitalOcean trusted sources"
echo "  2. Verify DB_PASSWORD in .env matches your DigitalOcean database password"
echo ""
echo "The app database (local MySQL) should now be working."
echo ""
