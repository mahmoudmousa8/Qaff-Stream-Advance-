#!/bin/bash
# Worker local MediaMTX setup script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Qaff Stream: Worker MediaMTX Setup ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

# Update packages & install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
apt-get update
apt-get install -y tar wget curl

# Create directory
mkdir -p /opt/mediamtx
cd /opt/mediamtx

# Fetch latest MediaMTX release
VERSION="v1.9.0"
echo -e "${GREEN}Downloading MediaMTX ${VERSION}...${NC}"
wget -q --show-progress https://github.com/bluenviron/mediamtx/releases/download/${VERSION}/mediamtx_${VERSION}_linux_amd64.tar.gz

# Extract
tar -xzf mediamtx_${VERSION}_linux_amd64.tar.gz
rm mediamtx_${VERSION}_linux_amd64.tar.gz

# Create Systemd service
echo -e "${GREEN}Creating systemd service...${NC}"
cat << 'EOF' > /etc/systemd/system/mediamtx.service
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
EOF

# Reload and enable
systemctl daemon-reload
systemctl enable mediamtx
systemctl start mediamtx

echo -e "${GREEN}=== Worker MediaMTX Setup Completed ===${NC}"
echo -e "MediaMTX is running locally on port 1935 (systemctl status mediamtx)."
echo -e "It is now ready to receive RTMP live streams pushed from the Distributor."
