#!/usr/bin/env bash
# ==============================================================================
# Helper to install or update the hourly log rotation cron
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="/etc/cron.hourly/qaff-log-rotate"

if [ -f "$SCRIPT_DIR/qaff-log-rotate.sh" ]; then
    sudo cp "$SCRIPT_DIR/qaff-log-rotate.sh" "$TARGET"
    sudo chmod +x "$TARGET"
    echo "✅ Successfully installed hourly log rotation to $TARGET"
else
    echo "❌ Error: $SCRIPT_DIR/qaff-log-rotate.sh not found!"
    exit 1
fi
