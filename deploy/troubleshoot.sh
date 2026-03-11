#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# TuPiel - Troubleshooting Script
# ═══════════════════════════════════════════════════════════════════
#
# Run this ON THE SERVER to diagnose connection issues
#
# Usage:
#   ssh root@YOUR_IP 'bash -s' < deploy/troubleshoot.sh
# Or on the server:
#   cd /opt/tupiel/deploy
#   sudo ./troubleshoot.sh
#
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  TuPiel Troubleshooting${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ─── Check 1: Docker is running ───
echo -e "${YELLOW}[1/7] Checking Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}  Docker is not installed!${NC}"
    echo "  Run setup-server.sh first."
    exit 1
fi

if ! systemctl is-active --quiet docker; then
    echo -e "${RED}  Docker service is not running!${NC}"
    echo "  Starting Docker..."
    systemctl start docker
    systemctl enable docker
fi
echo -e "${GREEN}  Docker is running.${NC}"

# ─── Check 2: Docker Compose is available ───
echo -e "${YELLOW}[2/7] Checking Docker Compose...${NC}"
if ! docker compose version &> /dev/null; then
    echo -e "${RED}  Docker Compose is not available!${NC}"
    exit 1
fi
echo -e "${GREEN}  Docker Compose OK.${NC}"

# ─── Check 3: Deployment directory exists ───
echo -e "${YELLOW}[3/7] Checking deployment directory...${NC}"
DEPLOY_DIR="/opt/tupiel/deploy"
if [ ! -d "$DEPLOY_DIR" ]; then
    echo -e "${RED}  Deployment directory not found: ${DEPLOY_DIR}${NC}"
    echo "  Run deploy.sh from your local machine first."
    exit 1
fi

if [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
    echo -e "${RED}  docker-compose.yml not found!${NC}"
    exit 1
fi

if [ ! -f "$DEPLOY_DIR/.env" ]; then
    echo -e "${RED}  .env file not found!${NC}"
    echo "  Copy .env.example to .env and configure it."
    exit 1
fi
echo -e "${GREEN}  Deployment directory OK.${NC}"

# ─── Check 4: Firewall status ───
echo -e "${YELLOW}[4/7] Checking firewall (UFW)...${NC}"
if command -v ufw &> /dev/null; then
    UFW_STATUS=$(ufw status | head -1)
    if echo "$UFW_STATUS" | grep -q "Status: active"; then
        echo -e "${GREEN}  Firewall is active.${NC}"
        echo "  Checking rules..."
        ufw status | grep -E "(80|443|22)" || echo -e "${YELLOW}  Warning: Ports 80/443 may not be open${NC}"
    else
        echo -e "${YELLOW}  Firewall is inactive.${NC}"
    fi
else
    echo -e "${YELLOW}  UFW not found (may be using different firewall).${NC}"
fi

# ─── Check 5: Docker containers status ───
echo -e "${YELLOW}[5/7] Checking Docker containers...${NC}"
cd "$DEPLOY_DIR"

echo ""
echo "Container status:"
docker compose ps || echo -e "${RED}  Failed to check containers${NC}"

echo ""
echo "Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAMES|tupiel" || echo -e "${YELLOW}  No tupiel containers running${NC}"

# ─── Check 6: Ports listening ───
echo ""
echo -e "${YELLOW}[6/7] Checking listening ports...${NC}"
if command -v netstat &> /dev/null; then
    netstat -tlnp | grep -E ":(80|443|3000)" || echo -e "${YELLOW}  No services listening on 80/443/3000${NC}"
elif command -v ss &> /dev/null; then
    ss -tlnp | grep -E ":(80|443|3000)" || echo -e "${YELLOW}  No services listening on 80/443/3000${NC}"
else
    echo -e "${YELLOW}  Cannot check ports (netstat/ss not available)${NC}"
fi

# ─── Check 7: Container logs ───
echo ""
echo -e "${YELLOW}[7/7] Recent container logs (last 20 lines)...${NC}"
echo ""
echo -e "${CYAN}─── Nginx Proxy ───${NC}"
docker compose logs --tail=20 nginx-proxy 2>/dev/null || echo "  No logs"
echo ""
echo -e "${CYAN}─── Backend ───${NC}"
docker compose logs --tail=20 backend 2>/dev/null || echo "  No logs"
echo ""
echo -e "${CYAN}─── Frontend ───${NC}"
docker compose logs --tail=20 frontend 2>/dev/null || echo "  No logs"
echo ""
echo -e "${CYAN}─── MySQL ───${NC}"
docker compose logs --tail=20 mysql 2>/dev/null || echo "  No logs"

# ─── Summary and recommendations ───
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Troubleshooting Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Check if containers are running
CONTAINERS_RUNNING=$(docker compose ps --format json 2>/dev/null | grep -c "running" || echo "0")
if [ "$CONTAINERS_RUNNING" -eq "0" ]; then
    echo -e "${RED}❌ No containers are running!${NC}"
    echo ""
    echo "Try starting them:"
    echo "  cd $DEPLOY_DIR"
    echo "  docker compose up -d"
    echo ""
else
    echo -e "${GREEN}✓ Containers are running${NC}"
fi

# Check if nginx is listening
if docker ps | grep -q tupiel-nginx; then
    echo -e "${GREEN}✓ Nginx container exists${NC}"
else
    echo -e "${RED}❌ Nginx container is not running${NC}"
fi

echo ""
echo "To view full logs:"
echo "  cd $DEPLOY_DIR"
echo "  docker compose logs -f"
echo ""
echo "To restart all services:"
echo "  cd $DEPLOY_DIR"
echo "  docker compose restart"
echo ""
