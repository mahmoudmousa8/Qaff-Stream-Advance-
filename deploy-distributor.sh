#!/bin/bash
# Distributor deployment script for MediaMTX
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Qaff Stream: Distributor MediaMTX Setup ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

# Update packages & install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
apt-get update
apt-get install -y tar wget curl ffmpeg

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

# Configure
echo -e "${GREEN}Configuring MediaMTX...${NC}"
cat << 'EOF' > /opt/mediamtx/mediamtx.yml
# MediaMTX configuration for Distributor

paths:
  # Enable all paths to accept RTMP publishes
  all:
    # Run a command when a stream is published.
    # This command uses FFmpeg to copy (relay) the stream to target worker nodes.
    # Replace worker node IPs/domains in the command below.
    # $MTX_PATH contains the path (e.g. the security key) used to publish the stream.
    #
    # Example for relaying to a single worker:
    # runOnPublish: ffmpeg -i rtmp://127.0.0.1/live/$MTX_PATH -c copy -f flv rtmp://<WORKER_IP>/live/$MTX_PATH
    #
    # Example for relaying to multiple workers using the tee muxer:
    # runOnPublish: ffmpeg -i rtmp://127.0.0.1/live/$MTX_PATH -c copy -f tee "[f=flv]rtmp://<WORKER_1_IP>/live/$MTX_PATH|[f=flv]rtmp://<WORKER_2_IP>/live/$MTX_PATH"
    
    runOnPublish: ffmpeg -i rtmp://127.0.0.1/live/$MTX_PATH -c copy -f flv rtmp://127.0.0.1/live_worker/$MTX_PATH
    runOnPublishRestart: yes
EOF

# Create Systemd service
echo -e "${GREEN}Creating systemd service...${NC}"
cat << 'EOF' > /etc/systemd/system/mediamtx.service
[Unit]
Description=MediaMTX Live Stream Distributor
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

echo -e "${GREEN}=== Distributor Setup Completed ===${NC}"
echo -e "MediaMTX is running as a systemd service (systemctl status mediamtx)."
echo -e "Ingest RTMP URL: rtmp://<DISTRIBUTOR_IP>/live/<securityKey>"
echo -e "Please edit /opt/mediamtx/mediamtx.yml to update worker IPs in 'runOnPublish' and restart the service using:"
echo -e "  sudo systemctl restart mediamtx"
