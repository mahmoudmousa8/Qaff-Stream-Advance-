#!/usr/bin/env bash
#
# Qaff Stream Advance — Native Host Installer (No Docker)
# Ubuntu 22.04 / 24.04
# Run: chmod +x install.sh && sudo ./install.sh
#

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
NC="\033[0m"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

echo -e "${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Qaff Stream Advance — Native Installer${NC}"
echo -e "${BOLD}════════════════════════════════════════════${NC}\n"

# ════════════════════════════════════════════
# 1. Timezone Configuration
# ════════════════════════════════════════════
echo -e "${GREEN}[1/8]${NC} Setting timezone to Africa/Cairo..."
sudo timedatectl set-timezone Africa/Cairo 2>/dev/null || true
echo -e "  ✅ Timezone: $(timedatectl show --property=Timezone --value 2>/dev/null || echo 'Africa/Cairo')"

# ════════════════════════════════════════════
# 2. Kernel & Network Tuning for High-Load RTMP Streams
# ════════════════════════════════════════════
echo -e "\n${GREEN}[2/8]${NC} Applying High-Load Kernel & Network limits..."

cat << 'EOF' > /tmp/qaff-tune.sh
#!/bin/bash
TARGET_CONF="/etc/sysctl.d/99-qaff-tuning.conf"
rm -f $TARGET_CONF
touch $TARGET_CONF

ensure_min_sysctl() {
    local key=$1
    local req=$2
    local cur=$(sysctl -n $key 2>/dev/null || echo 0)
    if [ "$cur" -ge "$req" ] 2>/dev/null; then
        echo "$key = $cur" >> $TARGET_CONF
    else
        echo "$key = $req" >> $TARGET_CONF
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

modprobe nf_conntrack 2>/dev/null || true
ensure_min_sysctl "net.netfilter.nf_conntrack_max" 2000000

echo "net.ipv4.ip_local_port_range = 1024 65535" >> $TARGET_CONF
echo "net.core.default_qdisc = fq" >> $TARGET_CONF
echo "net.ipv4.tcp_congestion_control = bbr" >> $TARGET_CONF
echo "net.ipv4.tcp_rmem = 4096 87380 16777216" >> $TARGET_CONF
echo "net.ipv4.tcp_wmem = 4096 65536 16777216" >> $TARGET_CONF
echo "net.netfilter.nf_conntrack_tcp_timeout_established = 7200" >> $TARGET_CONF
echo "net.netfilter.nf_conntrack_tcp_timeout_time_wait = 10" >> $TARGET_CONF

sysctl -p $TARGET_CONF >/dev/null 2>&1

mkdir -p /etc/security/limits.d
cat << 'LIMITS' > /etc/security/limits.d/99-qaff.conf
* soft nofile 2097152
* hard nofile 2097152
* soft nproc 2097152
* hard nproc 2097152
root soft nofile 2097152
root hard nofile 2097152
LIMITS

mkdir -p /etc/systemd/system.conf.d/
cat << 'SYSCONF' > /etc/systemd/system.conf.d/limits.conf
[Manager]
DefaultLimitNOFILE=2097152
DefaultLimitNPROC=2097152
SYSCONF
systemctl daemon-reload
EOF

sudo bash /tmp/qaff-tune.sh
rm -f /tmp/qaff-tune.sh
echo -e "  ✅ High-Load Kernel Limits and BBR Congestion Control configured"

# ════════════════════════════════════════════
# 3. Installing Host Packages
# ════════════════════════════════════════════
echo -e "\n${GREEN}[3/8]${NC} Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  curl wget unzip openssl build-essential sqlite3 ethtool ffmpeg git fail2ban

if ! command -v ffmpeg &>/dev/null; then
  echo -e "  ${RED}ffmpeg install failed!${NC}" && exit 1
fi
echo -e "  ✅ ffmpeg: $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f3)"
echo -e "  ✅ SQLite3: $(sqlite3 --version | cut -d' ' -f1)"
echo -e "  ✅ System packages installed successfully"

# ════════════════════════════════════════════
# 4. Setting up Node.js 20 & PM2 & tsx
# ════════════════════════════════════════════
echo -e "\n${GREEN}[4/8]${NC} Setting up Node.js 20.x & PM2..."

install_node20() {
  echo -e "  ${YELLOW}Installing Node.js 20.x via NodeSource...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>&1 | grep -E "(found|adding|Executing)" || true
  sudo apt-get install -y -qq nodejs
}

if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
  if [ "$NODE_VER" -ge 20 ]; then
    echo -e "  ✅ Node.js $(node -v) — OK"
  else
    echo -e "  ${YELLOW}Node.js v${NODE_VER} found, upgrading to 20...${NC}"
    sudo apt-get remove -y -qq nodejs nodejs-doc 2>/dev/null || true
    install_node20
  fi
else
  install_node20
fi

echo -e "  ✅ Node.js: $(node -v)"
echo -e "  ✅ npm: $(npm -v)"

# Install PM2 and tsx interpreter globally
if ! command -v pm2 &>/dev/null; then
  echo -e "  Installing PM2..."
  sudo npm install -g pm2 2>&1 | tail -2
fi
if ! command -v tsx &>/dev/null; then
  echo -e "  Installing tsx..."
  sudo npm install -g tsx 2>&1 | tail -2
fi
echo -e "  ✅ PM2: $(pm2 -v)"
echo -e "  ✅ tsx: $(tsx -v 2>/dev/null || echo 'installed')"

# ════════════════════════════════════════════
# 5. Preparing Project Directories & Environment (Persistent Setup)
# ════════════════════════════════════════════
echo -e "\n${GREEN}[5/8]${NC} Creating directories & environment..."

PERSISTENT_ROOT="/var/lib/qaff-stream"
REAL_USER=${SUDO_USER:-$USER}

echo -e "  Creating persistent directories under ${PERSISTENT_ROOT}..."
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

# Setup .env file
if [ -f "$ENV_FILE" ]; then
  echo -e "  ✅ .env already exists — keeping existing"
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo -e "  ✅ Created .env from .env.example"
fi

if grep -q "change-me-to-a-random-secure-string" "$ENV_FILE" 2>/dev/null; then
  NEW_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')
  sed -i "s/change-me-to-a-random-secure-string/$NEW_SECRET/" "$ENV_FILE"
  echo -e "  ✅ SESSION_SECRET auto-generated"
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
else
  echo -e "  ✅ cloudflared already installed"
fi

# Check and prompt for YouTube Credentials if missing
if grep -q "^YOUTUBE_CLIENT_ID=" "$ENV_FILE" 2>/dev/null; then
  YT_ID_VAL=$(grep "^YOUTUBE_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2-)
else
  YT_ID_VAL=""
fi

if [ -z "$YT_ID_VAL" ] || [ "$YT_ID_VAL" = "change-me" ]; then
  echo -e "\n${YELLOW}🔑 Setup YouTube live stream automation (Google Client Credentials)${NC}"
  echo -e "You can get these from Google Cloud Console (OAuth 2.0 Client IDs)"
  read -p "Enter YOUTUBE_CLIENT_ID (leave empty to skip): " USER_YT_ID
  if [ -n "$USER_YT_ID" ]; then
    set_env_var "YOUTUBE_CLIENT_ID" "$USER_YT_ID"
    read -p "Enter YOUTUBE_CLIENT_SECRET: " USER_YT_SECRET
    set_env_var "YOUTUBE_CLIENT_SECRET" "$USER_YT_SECRET"
    echo -e "  ✅ YouTube credentials updated."
  else
    echo -e "  ⚠️ Skipping YouTube API credentials configuration. You can add them manually to .env later."
  fi
fi

# Ensure firewall permissions
if command -v ufw &>/dev/null; then
  sudo ufw allow 22/tcp 2>/dev/null || true
  sudo ufw allow 3000/tcp 2>/dev/null || true
  sudo ufw allow 3002/tcp 2>/dev/null || true
  sudo ufw allow 1935/tcp 2>/dev/null || true
  sudo ufw --force enable 2>/dev/null || true
  echo -e "  ✅ UFW: ports 22, 3000 (web), 3002 (stream manager), 1935 (RTMP ingest) opened"
fi

# ════════════════════════════════════════════
# 6. Installing Dependencies & Building Dashboard Natively
# ════════════════════════════════════════════
echo -e "\n${GREEN}[6/8]${NC} Building Next.js Web App & Stream Manager natively..."
cd "$PROJECT_DIR"

# Install production and development dependencies natively
npm install --production=false 2>&1 | tail -3
echo -e "  ✅ npm install complete"

# Initialize SQLite database
npx prisma generate 2>&1 | tail -2
npx prisma db push 2>&1 | tail -2
echo -e "  ✅ SQLite database initialized"

# Seed default admin/client credentials
node scripts/seed.mjs
echo -e "  ✅ Default users and slots seeded successfully"

# Build dashboard production bundle
sudo rm -rf "$PROJECT_DIR/.next"
npm run build 2>&1 | tail -5
echo -e "  ✅ Production build compiled"

# ════════════════════════════════════════════
# 7. Installing and Configuring MediaMTX Natively (Systemd)
# ════════════════════════════════════════════
echo -e "\n${GREEN}[7/8]${NC} Setting up MediaMTX Live Ingest Receiver natively..."

sudo mkdir -p /opt/mediamtx
cd /opt/mediamtx

MTX_VER="v1.9.0"
if [ ! -f "/opt/mediamtx/mediamtx" ]; then
  echo -e "  Downloading MediaMTX ${MTX_VER}..."
  sudo wget -q --show-progress https://github.com/bluenviron/mediamtx/releases/download/${MTX_VER}/mediamtx_${MTX_VER}_linux_amd64.tar.gz
  sudo tar -xzf mediamtx_${MTX_VER}_linux_amd64.tar.gz
  sudo rm -f mediamtx_${MTX_VER}_linux_amd64.tar.gz
  echo -e "  ✅ MediaMTX binary extracted"
fi

# Write MediaMTX configuration
sudo bash -c "cat << 'EOF' > /opt/mediamtx/mediamtx.yml
# MediaMTX Native Ingest & Direct Relay Configuration
paths:
  all:
    # Disable default rtsp/webrtc output logs to keep syslog clean
    source: publisher
EOF"

# Create Systemd service for MediaMTX
sudo bash -c "cat << 'EOF' > /etc/systemd/system/mediamtx.service
[Unit]
Description=MediaMTX Live Ingest Receiver
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/mediamtx
ExecStart=/opt/mediamtx/mediamtx
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=mediamtx

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable mediamtx
sudo systemctl restart mediamtx
echo -e "  ✅ MediaMTX service enabled and running natively on port 1935 (systemctl status mediamtx)"

# ════════════════════════════════════════════
# 8. Start Native Dashboard and Stream Manager via PM2
# ════════════════════════════════════════════
echo -e "\n${GREEN}[8/8]${NC} Launching App Services via PM2..."
cd "$PROJECT_DIR"

# Clean up any stale PM2 processes
pm2 delete qaff-web qaff-stream-manager 2>/dev/null || true

# Start services via ecosystem.config.cjs
pm2 start ecosystem.config.cjs
pm2 save

# Setup PM2 Startup script
PM2_STARTUP_CMD=$(sudo pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null | grep "sudo env" | grep -v "^\[" || true)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD" 2>/dev/null || true
fi
pm2 save --force

# Final statistics
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "\n${BOLD}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Qaff Stream Advance — Installation Complete!${NC}"
echo -e "  No Docker used. All services are running natively."
echo -e "${BOLD}════════════════════════════════════════════${NC}\n"
echo -e "  🎛️  Dashboard:      ${BOLD}http://${SERVER_IP}:3000${NC}"
echo -e "  📶  RTMP Ingest Port: ${BOLD}1935${NC}"
echo -e ""
echo -e "  🔑  Default Admin Credentials:"
echo -e "      • Username: ${BOLD}admin${NC}"
echo -e "      • Password: ${BOLD}admin2026${NC}"
echo -e ""
echo -e "  🔑  Default Client Credentials:"
echo -e "      • Username: ${BOLD}user${NC}"
echo -e "      • Password: ${BOLD}user2026${NC}"
echo -e "      • Ingest Key: ${BOLD}qaff-key-123${NC}"
echo -e ""
echo -e "  💡 To stream from OBS to your server:"
echo -e "     • Server: ${BOLD}rtmp://${SERVER_IP}/live${NC}"
echo -e "     • Stream Key: ${BOLD}qaff-key-123${NC}"
echo -e ""
echo -e "  🔍 Monitor your native processes:"
echo -e "     • pm2 status"
echo -e "     • pm2 logs"
echo -e "     • systemctl status mediamtx"
echo -e "  ✅ All done! Good luck! 🎉\n"
