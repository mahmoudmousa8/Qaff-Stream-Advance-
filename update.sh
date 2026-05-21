#!/usr/bin/env bash
#
# Qaff Stream Advance — Native Host Auto-Updater
# Run: chmod +x update.sh && sudo ./update.sh
#

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
NC="\033[0m"

PROJECT_DIR="/opt/qaff-Stream-Advance"

echo -e "${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Qaff Stream Advance — Smart Auto-Update${NC}"
echo -e "${BOLD}════════════════════════════════════════════${NC}\n"

# Ensure we are in the project directory
if [ ! -d "$PROJECT_DIR" ]; then
    # Fallback to current directory if not at /opt/qaff-Stream-Advance yet
    PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

cd "$PROJECT_DIR"
echo -e "Working directory: ${BOLD}${PROJECT_DIR}${NC}"

# 1. Fetch latest changes from Git
echo -e "\n${CYAN}[1/5] Fetching latest updates from GitHub...${NC}"
git stash 2>/dev/null || true
git fetch origin main
git pull origin main
echo -e "  ✅ Code updated to latest commit."

# 2. Re-apply Kernel & Network limits (Ensuring limits survive system updates)
echo -e "\n${CYAN}[2/5] Verifying High-Load Kernel & Network limits...${NC}"
TARGET_CONF="/etc/sysctl.d/99-qaff-tuning.conf"
sudo rm -f $TARGET_CONF
sudo touch $TARGET_CONF

ensure_min_sysctl() {
    local key=$1
    local req=$2
    local cur=$(sysctl -n $key 2>/dev/null || echo 0)
    if [ "$cur" -ge "$req" ] 2>/dev/null; then
        echo "$key = $cur" | sudo tee -a $TARGET_CONF >/dev/null
    else
        echo "$key = $req" | sudo tee -a $TARGET_CONF >/dev/null
    fi
}

ensure_min_sysctl "fs.file-max" 2097152
ensure_min_sysctl "net.core.somaxconn" 65535
ensure_min_sysctl "net.ipv4.tcp_max_syn_backlog" 65535
ensure_min_sysctl "net.core.netdev_max_backlog" 300000
ensure_min_sysctl "net.ipv4.tcp_fin_timeout" 10
ensure_min_sysctl "net.ipv4.tcp_tw_reuse" 1
ensure_min_sysctl "net.ipv4.tcp_keepalive_time" 600
ensure_min_sysctl "net.ipv4.tcp_keepalive_intvl" 60
ensure_min_sysctl "net.ipv4.tcp_keepalive_probes" 10
ensure_min_sysctl "net.ipv4.tcp_max_tw_buckets" 2000000
ensure_min_sysctl "net.core.rmem_max" 16777216
ensure_min_sysctl "net.core.wmem_max" 16777216

sudo sysctl -p $TARGET_CONF >/dev/null 2>&1
echo -e "  ✅ Kernel tuning limits verified and applied."

# Setup ENV paths
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

# Setup persistent directory
PERSISTENT_ROOT="/var/lib/qaff-stream"
REAL_USER=${SUDO_USER:-$USER}

echo -e "\n${CYAN}[Directory Setup] Ensuring persistent directories exist...${NC}"
sudo mkdir -p "${PERSISTENT_ROOT}/database"
sudo mkdir -p "${PERSISTENT_ROOT}/videos"
sudo mkdir -p "${PERSISTENT_ROOT}/upload"
sudo mkdir -p "${PERSISTENT_ROOT}/download"
sudo mkdir -p "${PERSISTENT_ROOT}/logs"

# Migrate existing local data if present to avoid data loss
if [ -d "$PROJECT_DIR/data" ]; then
  echo -e "  🔄 Migrating existing local data to persistent storage..."
  if [ -f "$PROJECT_DIR/data/app.db" ] && [ ! -f "${PERSISTENT_ROOT}/database/app.db" ]; then
    sudo cp "$PROJECT_DIR/data/app.db" "${PERSISTENT_ROOT}/database/app.db"
    echo -e "    ✅ Migrated SQLite database."
  fi
  if [ -d "$PROJECT_DIR/data/videos" ]; then
    # Copy files recursively without overwriting
    sudo cp -rn "$PROJECT_DIR/data/videos/"* "${PERSISTENT_ROOT}/videos/" 2>/dev/null || true
    echo -e "    ✅ Migrated video library."
  fi
fi

# Set ownership and permissions
sudo chown -R "$REAL_USER":"$REAL_USER" "${PERSISTENT_ROOT}"
sudo chmod -R 775 "${PERSISTENT_ROOT}"

# Setup .env if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo -e "  ✅ Created .env from .env.example"
fi

# Helper function to inject/update key-value in .env safely
set_env_var() {
  local key=$1
  local val=$2
  sed -i "/^${key}=/d" "$ENV_FILE" 2>/dev/null || true
  echo "${key}=${val}" >> "$ENV_FILE"
}

# Inject persistent directory configurations
set_env_var "DATABASE_URL" "file:${PERSISTENT_ROOT}/database/app.db"
set_env_var "APP_DATA_DIR" "${PERSISTENT_ROOT}/database"
set_env_var "VIDEOS_DIR" "${PERSISTENT_ROOT}/videos"
set_env_var "UPLOAD_DIR" "${PERSISTENT_ROOT}/upload"
set_env_var "DOWNLOAD_DIR" "${PERSISTENT_ROOT}/download"
set_env_var "LOGS_DIR" "${PERSISTENT_ROOT}/logs"
set_env_var "CLOUDFLARE_LOG_PATH" "${PERSISTENT_ROOT}/logs/cloudflare-tunnel.log"
echo -e "  ✅ Persistent paths environment variables injected"

# Install cloudflared quick tunnel if not already installed
if ! command -v cloudflared &>/dev/null; then
  echo -e "  Installing cloudflared quick tunnel..."
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    sudo wget -q -O /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  elif [ "$ARCH" = "aarch64" ]; then
    sudo wget -q -O /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
  else
    sudo wget -q -O /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  fi
  sudo chmod +x /usr/local/bin/cloudflared
  echo -e "  ✅ cloudflared installed successfully"
fi

# 3. Installing Node dependencies and updating DB schema
echo -e "\n${CYAN}[3/5] Installing new dependencies & applying database schema...${NC}"
npm install --production=false 2>&1 | tail -3
npx prisma generate 2>&1 | tail -2
npx prisma db push 2>&1 | tail -2
echo -e "  ✅ Dependencies & Database schema successfully updated."

# 4. Compiling the Next.js Production App
echo -e "\n${CYAN}[4/5] Building the Next.js application natively...${NC}"
# Kill any hung build processes
pkill -f "next build" 2>/dev/null || true
sleep 1
# Remove build cache to avoid permission lock issues
sudo rm -rf "$PROJECT_DIR/.next"
npm run build 2>&1 | tail -5
echo -e "  ✅ Production build ready."

# 5. Reloading running PM2 services & MediaMTX (Zero Downtime)
echo -e "\n${CYAN}[5/5] Reloading running services natively...${NC}"

# Reload PM2 apps (Zero Downtime reloading)
if pm2 show qaff-web &>/dev/null; then
    pm2 reload ecosystem.config.cjs
    echo -e "  ✅ PM2 web and stream-manager services reloaded."
else
    pm2 start ecosystem.config.cjs
    echo -e "  ✅ PM2 web and stream-manager services started."
fi

# Save current PM2 processes
pm2 save --force

# Restart MediaMTX
sudo systemctl restart mediamtx
echo -e "  ✅ MediaMTX service restarted natively."

SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "\n${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Qaff Stream Advance — Update Successful!${NC}"
echo -e "  All services are running natively in background."
echo -e "  Dashboard: http://${SERVER_IP}:3000"
echo -e "${BOLD}════════════════════════════════════════════${NC}\n"
