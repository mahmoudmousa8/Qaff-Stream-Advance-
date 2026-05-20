#!/usr/bin/env bash
#
# Qaff Stream Advance — VPS Native Setup Script
# This script prepares a fresh Ubuntu server and clones the repository.
#
# Run on fresh VM: curl -fsSL https://raw.githubusercontent.com/mahmoudmousa8/Qaff-Stream-Advance-/main/vps-setup.sh | bash
#

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
NC="\033[0m"

REPO_URL="https://github.com/mahmoudmousa8/Qaff-Stream-Advance-.git"
INSTALL_DIR="/opt/qaff-Stream-Advance"

echo -e "${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Qaff Stream Advance — VPS Initial Setup${NC}"
echo -e "${BOLD}════════════════════════════════════════════${NC}\n"

# 1. Update system & install Git
echo -e "${CYAN}[1/3] Updating system packages and installing Git...${NC}"
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

sudo apt-get update -qq
sudo apt-get install -y -qq git curl unzip sqlite3 ffmpeg fail2ban

echo -e "  ✅ Basic system packages ready"

# 2. Clone Repository
echo -e "\n${CYAN}[2/3] Cloning Qaff Stream Advance Repository...${NC}"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Directory $INSTALL_DIR already exists. Pulling latest instead...${NC}"
    cd "$INSTALL_DIR"
    git stash 2>/dev/null || true
    git pull origin main
else
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown -R "$(whoami):$(whoami)" "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo -e "  ✅ Repository cloned successfully into $INSTALL_DIR"

# 3. Trigger the main native auto-installer
echo -e "\n${CYAN}[3/3] Starting the Native Auto-Installer...${NC}"

if [ -f "install.sh" ]; then
    chmod +x install.sh deploy.sh update.sh setup-worker-mediamtx.sh deploy-distributor.sh
    echo -e "${GREEN}Running install.sh... Please wait.${NC}\n"
    sudo ./install.sh
else
    echo -e "${RED}install.sh not found inside $INSTALL_DIR!${NC}"
    exit 1
fi

echo -e "\n${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Qaff Stream Advance is Installed Natively!${NC}"
echo -e "${BOLD}════════════════════════════════════════════${NC}\n"
