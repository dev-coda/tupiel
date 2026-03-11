#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Test HTTPS endpoints and check for 400 errors
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

if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "example.com" ]; then
    if [ -z "${SERVER_IP:-}" ] || [ "$SERVER_IP" = "0.0.0.0" ]; then
        echo -e "${RED}ERROR: DOMAIN or SERVER_IP must be set in .env${NC}"
        exit 1
    fi
    TEST_URL="https://${SERVER_IP}"
else
    TEST_URL="https://${DOMAIN}"
fi

echo -e "${CYAN}Testing HTTPS endpoints...${NC}"
echo ""

echo "Testing ${TEST_URL}/api/health:"
echo "----------------------------------------"
curl -k -v "${TEST_URL}/api/health" 2>&1 | grep -E "< HTTP|error|400|Bad Request" || curl -k "${TEST_URL}/api/health"
echo ""
echo ""

echo "Testing ${TEST_URL}/:"
echo "----------------------------------------"
curl -k -v "${TEST_URL}/" 2>&1 | grep -E "< HTTP|error|400|Bad Request" || curl -k "${TEST_URL}/" | head -20
echo ""
