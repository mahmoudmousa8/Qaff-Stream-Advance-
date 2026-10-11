#!/bin/bash
# ==============================================================================
# Qaff Stream — Automated Hourly Log Rotation Script
# ==============================================================================
# Automatically checks all log files in /var/lib/qaff-stream/logs/
# If any log exceeds 100MB, it safely preserves the most recent 20MB in-place,
# preventing disk exhaustion while preserving recent operational history.
# ==============================================================================

LOG_DIR="/var/lib/qaff-stream/logs"
MAX_SIZE_MB=100
KEEP_SIZE="20M"

if [ -d "$LOG_DIR" ]; then
  for logfile in "$LOG_DIR"/*.log; do
    if [ -f "$logfile" ]; then
      size_mb=$(du -m "$logfile" 2>/dev/null | cut -f1)
      if [ -n "$size_mb" ] && [ "$size_mb" -ge "$MAX_SIZE_MB" ] 2>/dev/null; then
        tail -c "$KEEP_SIZE" "$logfile" > "${logfile}.tmp" && cat "${logfile}.tmp" > "$logfile" && rm -f "${logfile}.tmp"
      fi
    fi
  done
fi
