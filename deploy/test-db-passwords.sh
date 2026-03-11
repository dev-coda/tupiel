#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Test and update database passwords
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

TEST_PASSWORD="DidierTuPiel2025"

echo -e "${CYAN}Testing database passwords...${NC}"
echo ""

# Test MySQL connection with the test password
echo -e "${YELLOW}Testing MySQL connection with password: ${TEST_PASSWORD}${NC}"

ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Test if we can connect to MySQL with the test password
docker compose exec -T mysql mysql -u tupiel_app -p${TEST_PASSWORD} -e "SELECT 1;" tupiel_app 2>&1 | head -5

if [ \$? -eq 0 ]; then
    echo "✓ APP_DB_PASSWORD works!"
else
    echo "✗ APP_DB_PASSWORD does not work"
fi

# Test root password
docker compose exec -T mysql mysql -u root -p${TEST_PASSWORD} -e "SELECT 1;" 2>&1 | head -5

if [ \$? -eq 0 ]; then
    echo "✓ APP_DB_ROOT_PASSWORD works!"
else
    echo "✗ APP_DB_ROOT_PASSWORD does not work"
fi
REMOTE_SCRIPT

echo ""
echo -e "${YELLOW}Updating .env file with test password...${NC}"

# Update .env file
if grep -q "APP_DB_PASSWORD=" "$SCRIPT_DIR/.env"; then
    sed -i.bak "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=${TEST_PASSWORD}/" "$SCRIPT_DIR/.env"
    echo -e "${GREEN}Updated APP_DB_PASSWORD in .env${NC}"
else
    echo "APP_DB_PASSWORD=${TEST_PASSWORD}" >> "$SCRIPT_DIR/.env"
    echo -e "${GREEN}Added APP_DB_PASSWORD to .env${NC}"
fi

if grep -q "APP_DB_ROOT_PASSWORD=" "$SCRIPT_DIR/.env"; then
    sed -i.bak "s/^APP_DB_ROOT_PASSWORD=.*/APP_DB_ROOT_PASSWORD=${TEST_PASSWORD}/" "$SCRIPT_DIR/.env"
    echo -e "${GREEN}Updated APP_DB_ROOT_PASSWORD in .env${NC}"
else
    echo "APP_DB_ROOT_PASSWORD=${TEST_PASSWORD}" >> "$SCRIPT_DIR/.env"
    echo -e "${GREEN}Added APP_DB_ROOT_PASSWORD to .env${NC}"
fi

# Copy updated .env to server
echo ""
echo -e "${YELLOW}Copying updated .env to server...${NC}"
scp "$SCRIPT_DIR/.env" "${SSH_TARGET}:${REMOTE_DIR}/deploy/.env"

# Restart MySQL and backend to pick up new password
echo ""
echo -e "${YELLOW}Restarting MySQL and backend with new password...${NC}"

ssh "$SSH_TARGET" bash <<REMOTE_SCRIPT
cd ${REMOTE_DIR}/deploy

# Stop services
docker compose stop backend mysql

# Remove MySQL container to recreate with new password
docker compose rm -f mysql

# Start MySQL with new password
docker compose up -d mysql

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
sleep 10

# Start backend
docker compose up -d backend

# Wait a moment
sleep 5

# Check status
echo ""
echo "Container status:"
docker compose ps

echo ""
echo "Backend logs (last 10 lines):"
docker compose logs --tail=10 backend
REMOTE_SCRIPT

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Password update complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Test the backend:"
if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "example.com" ]; then
    echo "  curl -k https://${DOMAIN}/api/health"
else
    echo "  curl http://${SERVER_IP}/api/health"
fi
echo ""
