#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# TuPiel - Server Initial Setup
# ═══════════════════════════════════════════════════════════════════
#
# Run this ONCE on a fresh Ubuntu server (22.04 or 24.04).
# It installs Docker, Docker Compose, Certbot, and configures the firewall.
#
# Usage:
#   ssh root@YOUR_SERVER_IP 'bash -s' < setup-server.sh
#
# Or copy it to the server and run:
#   chmod +x setup-server.sh
#   sudo ./setup-server.sh
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
echo -e "${CYAN}  TuPiel Server Setup${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Must be run as root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}This script must be run as root (use sudo)${NC}"
    exit 1
fi

# ─── Step 1: Update system packages ───
echo -e "${YELLOW}[1/6] Updating system packages...${NC}"
apt-get update -y
apt-get upgrade -y
echo -e "${GREEN}  Done.${NC}"

# ─── Step 2: Install essential tools ───
echo -e "${YELLOW}[2/6] Installing essential tools...${NC}"
apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    htop \
    nano \
    ufw \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common
echo -e "${GREEN}  Done.${NC}"

# ─── Step 3: Install Docker Engine ───
echo -e "${YELLOW}[3/6] Installing Docker Engine...${NC}"

# Remove old versions if present
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Verify Docker
docker --version
docker compose version
echo -e "${GREEN}  Docker installed successfully.${NC}"

# ─── Step 4: Install Certbot ───
echo -e "${YELLOW}[4/6] Installing Certbot (for SSL certificates)...${NC}"
apt-get install -y certbot
certbot --version
echo -e "${GREEN}  Certbot installed successfully.${NC}"

# ─── Step 5: Configure firewall ───
echo -e "${YELLOW}[5/6] Configuring firewall (UFW)...${NC}"

# Reset firewall to defaults
ufw --force reset

# Default policies: deny incoming, allow outgoing
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (port 22) - CRITICAL: do this first!
ufw allow 22/tcp comment 'SSH'

# Allow HTTP and HTTPS
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable firewall (non-interactive)
ufw --force enable
ufw status verbose

echo -e "${GREEN}  Firewall configured: SSH(22), HTTP(80), HTTPS(443) allowed.${NC}"

# ─── Step 6: Create app directory ───
echo -e "${YELLOW}[6/6] Creating application directory...${NC}"

# Create app directory
mkdir -p /opt/tupiel
chmod 755 /opt/tupiel

# Add current user to docker group (if not root)
if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER"
    chown -R "$SUDO_USER":"$SUDO_USER" /opt/tupiel
    echo -e "${GREEN}  Added ${SUDO_USER} to docker group.${NC}"
fi

echo -e "${GREEN}  Application directory created at /opt/tupiel${NC}"

# ─── Done ───
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Server setup complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Log out and back in (so docker group takes effect)"
echo "  2. Copy your project files to /opt/tupiel"
echo "  3. Create /opt/tupiel/deploy/.env from .env.example"
echo "  4. Run deploy.sh to start the application"
echo "  5. Run ssl-setup.sh to enable HTTPS"
echo ""
echo "Docker version:   $(docker --version)"
echo "Compose version:  $(docker compose version)"
echo "Certbot version:  $(certbot --version 2>&1)"
echo ""
