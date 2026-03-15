#!/usr/bin/env bash
# Health Tracker — Cron Setup (Mac/Linux)
# Adds a cron job to run watcher.sh every 30 minutes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCHER="$SCRIPT_DIR/watcher.sh"

if [ ! -f "$WATCHER" ]; then
    echo "ERROR: watcher.sh not found at $WATCHER"
    exit 1
fi

chmod +x "$WATCHER"
chmod +x "$SCRIPT_DIR/process-day.sh"

CRON_LINE="*/30 * * * * $WATCHER >> \"\${HEALTH_DATA_DIR:-\$HOME/HealthTracker}/logs/watcher.log\" 2>&1"

# Add if not already present
if crontab -l 2>/dev/null | grep -qF "$WATCHER"; then
    echo "Cron job already exists for watcher.sh — no changes made."
else
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    echo "Cron job added: runs watcher.sh every 30 minutes."
fi

echo ""
echo "Current crontab:"
crontab -l
