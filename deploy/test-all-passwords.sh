#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Test all password combinations and find the correct ones
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

PASSWORD1="DidierTuPiel2025"
PASSWORD2="YourNewPassword123"

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Testing All Password Combinations${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Testing combinations:"
echo "  1. APP_DB_PASSWORD=${PASSWORD1}, APP_DB_ROOT_PASSWORD=${PASSWORD1}"
echo "  2. APP_DB_PASSWORD=${PASSWORD1}, APP_DB_ROOT_PASSWORD=${PASSWORD2}"
echo "  3. APP_DB_PASSWORD=${PASSWORD2}, APP_DB_ROOT_PASSWORD=${PASSWORD1}"
echo "  4. APP_DB_PASSWORD=${PASSWORD2}, APP_DB_ROOT_PASSWORD=${PASSWORD2}"
echo ""

# Test each combination
FOUND_COMBO=false
CORRECT_APP_PASSWORD=""
CORRECT_ROOT_PASSWORD=""

for APP_PASS in "$PASSWORD1" "$PASSWORD2"; do
    for ROOT_PASS in "$PASSWORD1" "$PASSWORD2"; do
        echo -e "${YELLOW}Testing: APP_DB_PASSWORD=${APP_PASS}, APP_DB_ROOT_PASSWORD=${ROOT_PASS}${NC}"
        
        # Test on the server
        RESULT=$(ssh "$SSH_TARGET" bash <<REMOTE_TEST
cd ${REMOTE_DIR}/deploy

# Stop backend to avoid conflicts
docker compose stop backend 2>/dev/null || true

# Test if we can connect with app password
APP_TEST=\$(docker compose exec -T mysql mysql -u tupiel_app -p${APP_PASS} -e "SELECT 1;" tupiel_app 2>&1 | grep -c "ERROR" || echo "0")

# Test if we can connect with root password  
ROOT_TEST=\$(docker compose exec -T mysql mysql -u root -p${ROOT_PASS} -e "SELECT 1;" 2>&1 | grep -c "ERROR" || echo "0")

if [ "\$APP_TEST" = "0" ] && [ "\$ROOT_TEST" = "0" ]; then
    echo "SUCCESS"
else
    echo "FAILED"
fi
REMOTE_TEST
        )
        
        if echo "$RESULT" | grep -q "SUCCESS"; then
            echo -e "${GREEN}  ✓ This combination works!${NC}"
            FOUND_COMBO=true
            CORRECT_APP_PASSWORD="$APP_PASS"
            CORRECT_ROOT_PASSWORD="$ROOT_PASS"
            break 2
        else
            echo -e "${RED}  ✗ This combination failed${NC}"
        fi
    done
done

echo ""

if [ "$FOUND_COMBO" = false ]; then
    echo -e "${RED}No working password combination found!${NC}"
    echo ""
    echo "The MySQL container might need to be recreated with the correct password."
    echo "Let's try recreating it with each combination..."
    echo ""
    
    # Try recreating MySQL with each combination
    for APP_PASS in "$PASSWORD1" "$PASSWORD2"; do
        for ROOT_PASS in "$PASSWORD1" "$PASSWORD2"; do
            echo -e "${YELLOW}Trying to recreate MySQL with: APP_DB_PASSWORD=${APP_PASS}, APP_DB_ROOT_PASSWORD=${ROOT_PASS}${NC}"
            
            # Update .env on server
            ssh "$SSH_TARGET" bash <<REMOTE_RECREATE
cd ${REMOTE_DIR}/deploy

# Update .env
sed -i "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=${APP_PASS}/" .env
sed -i "s/^APP_DB_ROOT_PASSWORD=.*/APP_DB_ROOT_PASSWORD=${ROOT_PASS}/" .env

# Stop and remove MySQL
docker compose stop mysql backend 2>/dev/null || true
docker compose rm -f mysql 2>/dev/null || true

# Remove the volume to start fresh (optional - comment out if you want to keep data)
# docker volume rm deploy_mysql_data 2>/dev/null || true

# Start MySQL with new password
docker compose up -d mysql

# Wait for MySQL to be ready
sleep 15

# Test connection
APP_TEST=\$(docker compose exec -T mysql mysql -u tupiel_app -p${APP_PASS} -e "SELECT 1;" tupiel_app 2>&1 | grep -c "ERROR" || echo "0")
ROOT_TEST=\$(docker compose exec -T mysql mysql -u root -p${ROOT_PASS} -e "SELECT 1;" 2>&1 | grep -c "ERROR" || echo "0")

if [ "\$APP_TEST" = "0" ] && [ "\$ROOT_TEST" = "0" ]; then
    echo "SUCCESS"
else
    echo "FAILED"
fi
REMOTE_RECREATE
            
            if echo "$RESULT" | grep -q "SUCCESS"; then
                echo -e "${GREEN}  ✓ MySQL recreated successfully with this combination!${NC}"
                FOUND_COMBO=true
                CORRECT_APP_PASSWORD="$APP_PASS"
                CORRECT_ROOT_PASSWORD="$ROOT_PASS"
                break 2
            else
                echo -e "${RED}  ✗ Failed${NC}"
            fi
        done
    done
fi

if [ "$FOUND_COMBO" = true ]; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Found Working Combination!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "APP_DB_PASSWORD=${CORRECT_APP_PASSWORD}"
    echo -e "APP_DB_ROOT_PASSWORD=${CORRECT_ROOT_PASSWORD}"
    echo ""
    
    # Update local .env file
    echo -e "${YELLOW}Updating local .env file...${NC}"
    if grep -q "APP_DB_PASSWORD=" "$SCRIPT_DIR/.env"; then
        sed -i.bak "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=${CORRECT_APP_PASSWORD}/" "$SCRIPT_DIR/.env"
    else
        echo "APP_DB_PASSWORD=${CORRECT_APP_PASSWORD}" >> "$SCRIPT_DIR/.env"
    fi
    
    if grep -q "APP_DB_ROOT_PASSWORD=" "$SCRIPT_DIR/.env"; then
        sed -i.bak "s/^APP_DB_ROOT_PASSWORD=.*/APP_DB_ROOT_PASSWORD=${CORRECT_ROOT_PASSWORD}/" "$SCRIPT_DIR/.env"
    else
        echo "APP_DB_ROOT_PASSWORD=${CORRECT_ROOT_PASSWORD}" >> "$SCRIPT_DIR/.env"
    fi
    
    echo -e "${GREEN}Local .env updated${NC}"
    
    # Ensure server .env is updated
    echo -e "${YELLOW}Ensuring server .env is updated...${NC}"
    scp "$SCRIPT_DIR/.env" "${SSH_TARGET}:${REMOTE_DIR}/deploy/.env"
    
    # Restart backend
    echo -e "${YELLOW}Restarting backend...${NC}"
    ssh "$SSH_TARGET" bash <<REMOTE_RESTART
cd ${REMOTE_DIR}/deploy
docker compose up -d backend
sleep 5
docker compose ps backend
echo ""
echo "Backend logs (last 10 lines):"
docker compose logs --tail=10 backend
REMOTE_RESTART
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Setup Complete!${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo "Test the backend:"
    if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "example.com" ]; then
        echo "  curl -k https://${DOMAIN}/api/health"
    else
        echo "  curl http://${SERVER_IP}/api/health"
    fi
    echo ""
else
    echo -e "${RED}Could not find a working password combination!${NC}"
    echo ""
    echo "Please check:"
    echo "  1. MySQL container is running"
    echo "  2. The passwords you provided are correct"
    echo "  3. MySQL container logs: ssh ${SSH_TARGET} 'cd ${REMOTE_DIR}/deploy && docker compose logs mysql'"
    exit 1
fi
