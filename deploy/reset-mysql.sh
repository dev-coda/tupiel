#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Reset MySQL and recreate with known passwords
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

# Use DidierTuPiel2025 for both (you can change this if needed)
APP_PASSWORD="DidierTuPiel2025"
ROOT_PASSWORD="DidierTuPiel2025"

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Resetting MySQL with Known Passwords${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "Setting passwords to:"
echo -e "  APP_DB_PASSWORD=${APP_PASSWORD}"
echo -e "  APP_DB_ROOT_PASSWORD=${ROOT_PASSWORD}"
echo ""
echo -e "${YELLOW}WARNING: This will delete all data in the MySQL container!${NC}"
echo -e "${YELLOW}The backend will recreate the tables on startup.${NC}"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo -e "${YELLOW}[1/5] Stopping services...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy
docker compose stop backend mysql 2>/dev/null || true
REMOTE_SCRIPT

echo -e "${GREEN}  Services stopped.${NC}"

echo ""
echo -e "${YELLOW}[2/5] Removing MySQL container and volume...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Remove container
docker compose rm -f mysql 2>/dev/null || true

# Remove volume (this deletes all data!)
docker volume rm deploy_mysql_data 2>/dev/null || true
docker volume rm tupiel_mysql_data 2>/dev/null || true

# Also try to find and remove any mysql_data volume
docker volume ls | grep mysql_data | awk '{print \$2}' | xargs -r docker volume rm 2>/dev/null || true

echo "MySQL container and volume removed"
REMOTE_SCRIPT

echo -e "${GREEN}  MySQL removed.${NC}"

echo ""
echo -e "${YELLOW}[3/5] Updating .env files...${NC}"

# Update local .env
if grep -q "APP_DB_PASSWORD=" "$SCRIPT_DIR/.env"; then
    sed -i.bak "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=${APP_PASSWORD}/" "$SCRIPT_DIR/.env"
else
    echo "APP_DB_PASSWORD=${APP_PASSWORD}" >> "$SCRIPT_DIR/.env"
fi

if grep -q "APP_DB_ROOT_PASSWORD=" "$SCRIPT_DIR/.env"; then
    sed -i.bak "s/^APP_DB_ROOT_PASSWORD=.*/APP_DB_ROOT_PASSWORD=${ROOT_PASSWORD}/" "$SCRIPT_DIR/.env"
else
    echo "APP_DB_ROOT_PASSWORD=${ROOT_PASSWORD}" >> "$SCRIPT_DIR/.env"
fi

echo -e "${GREEN}  Local .env updated.${NC}"

# Copy to server
scp "$SCRIPT_DIR/.env" "${SSH_TARGET}:${REMOTE_DIR}/deploy/.env"
echo -e "${GREEN}  Server .env updated.${NC}"

echo ""
echo -e "${YELLOW}[4/5] Creating MySQL container with new passwords...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Start MySQL with new passwords
docker compose up -d mysql

echo "Waiting for MySQL to initialize (this may take 30-60 seconds)..."
sleep 10

# Wait for MySQL to be ready
MAX_WAIT=60
WAITED=0
while [ \$WAITED -lt \$MAX_WAIT ]; do
    if docker compose exec -T mysql mysqladmin ping -h localhost -u root -p${ROOT_PASSWORD} --silent 2>/dev/null; then
        echo "MySQL is ready!"
        break
    fi
    echo -n "."
    sleep 2
    WAITED=\$((WAITED + 2))
done

if [ \$WAITED -ge \$MAX_WAIT ]; then
    echo ""
    echo "MySQL did not become ready in time. Check logs:"
    docker compose logs mysql | tail -20
    exit 1
fi

echo ""
echo "Testing connections..."

# Test root connection
if docker compose exec -T mysql mysql -u root -p${ROOT_PASSWORD} -e "SELECT 1;" 2>&1 | grep -q "ERROR"; then
    echo "ERROR: Root password test failed"
    exit 1
else
    echo "✓ Root password works"
fi

# Test app user connection
if docker compose exec -T mysql mysql -u tupiel_app -p${APP_PASSWORD} -e "SELECT 1;" tupiel_app 2>&1 | grep -q "ERROR"; then
    echo "ERROR: App password test failed"
    exit 1
else
    echo "✓ App password works"
fi
REMOTE_SCRIPT

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create MySQL container${NC}"
    exit 1
fi

echo -e "${GREEN}  MySQL created and tested.${NC}"

echo ""
echo -e "${YELLOW}[5/5] Starting backend...${NC}"
ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Start backend (it will initialize the database)
docker compose up -d backend

echo "Waiting for backend to start..."
sleep 10

echo ""
echo "Container status:"
docker compose ps

echo ""
echo "Backend logs (last 20 lines):"
docker compose logs --tail=20 backend
REMOTE_SCRIPT

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  MySQL Reset Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Passwords set:"
echo -e "  APP_DB_PASSWORD=${APP_PASSWORD}"
echo -e "  APP_DB_ROOT_PASSWORD=${ROOT_PASSWORD}"
echo ""
echo "Test the backend:"
if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "example.com" ]; then
    echo "  curl -k https://${DOMAIN}/api/health"
else
    echo "  curl http://${SERVER_IP}/api/health"
fi
echo ""
echo "The backend should have automatically created the app database tables."
echo ""
