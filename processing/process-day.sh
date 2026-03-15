#!/usr/bin/env bash
# Health Tracker - Periodic Processing (Mac/Linux)
# Runs Claude Code to analyze health data.
# Downloads pending ZIPs from cloud relay.
#
# IMPORTANT: Never deletes raw data. Archives instead.
# IMPORTANT: Never re-processes dates that already have analysis.
#
# Environment variables:
#   HEALTH_DATA_DIR   — path to data root (default: ~/HealthTracker)
#   HEALTH_REPO_DIR   — path to repo (default: parent of this script)
#   HEALTH_BACKUP_DIR — path to backup dir (default: ~/health-data-backup)
#   HEALTH_SYNC_URL   — cloud relay URL (required)
#   HEALTH_SYNC_KEY   — cloud relay key (required)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DATA_DIR="${HEALTH_DATA_DIR:-$HOME/HealthTracker}"
REPO_DIR="${HEALTH_REPO_DIR:-$(dirname "$SCRIPT_DIR")}"
BACKUP_DIR="${HEALTH_BACKUP_DIR:-$HOME/health-data-backup}"
LOCK_FILE="$DATA_DIR/processing.lock"

TODAY=$(date +%Y-%m-%d)

# --- Lock file to prevent concurrent processing ---
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(( $(date +%s) - $(date -r "$LOCK_FILE" +%s 2>/dev/null || stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0) ))
    if [ "$LOCK_AGE" -lt 3600 ]; then
        echo "[$TODAY] Another processing run is in progress - lock file exists. Aborting."
        exit 0
    fi
    echo "[$TODAY] Removing stale lock file (age: ${LOCK_AGE}s)."
    rm -f "$LOCK_FILE"
fi
echo "$TODAY $(date +%H:%M:%S)" > "$LOCK_FILE"

echo "[$TODAY] Starting processing run..."

# --- Create required directories ---
mkdir -p "$DATA_DIR/logs"
mkdir -p "$DATA_DIR/archive"
mkdir -p "$BACKUP_DIR/raw"
mkdir -p "$BACKUP_DIR/analysis"
mkdir -p "$BACKUP_DIR/corrections"

EXTRACT_DIR="$DATA_DIR/incoming/extracted"
mkdir -p "$EXTRACT_DIR"

ZIP_COUNT=0
NEW_DATES=()

# --- Check env vars ---
if [ -z "${HEALTH_SYNC_URL:-}" ]; then
    echo "[$TODAY] HEALTH_SYNC_URL not set. Cannot sync."
    rm -f "$LOCK_FILE"
    exit 1
fi
if [ -z "${HEALTH_SYNC_KEY:-}" ]; then
    echo "[$TODAY] HEALTH_SYNC_KEY not set. Cannot sync."
    rm -f "$LOCK_FILE"
    exit 1
fi

echo "[$TODAY] Checking cloud relay for pending data..."

# Get list of pending dates
PENDING_JSON=$(curl -s "$HEALTH_SYNC_URL/sync/$HEALTH_SYNC_KEY/pending" || echo '{}')
RELAY_DATES=$(echo "$PENDING_JSON" | jq -r '.pending[]? // empty' 2>/dev/null | tr '\n' ' ' | xargs)

if [ -n "$RELAY_DATES" ]; then
    echo "[$TODAY] Cloud relay has pending dates: $RELAY_DATES"

    for DATE in $RELAY_DATES; do
        if [ -f "$DATA_DIR/analysis/$DATE.json" ]; then
            echo "[$TODAY] $DATE already has analysis - uploading result and marking done"
            curl -s -X POST \
                -H "Content-Type: application/json; charset=utf-8" \
                --data-binary "@$DATA_DIR/analysis/$DATE.json" \
                "$HEALTH_SYNC_URL/sync/$HEALTH_SYNC_KEY/day/$DATE/done"
            echo
        else
            echo "[$TODAY] Downloading $DATE from relay..."
            if curl -sf -o "$EXTRACT_DIR/health-$DATE.zip" "$HEALTH_SYNC_URL/sync/$HEALTH_SYNC_KEY/day/$DATE"; then
                ZIP_COUNT=$(( ZIP_COUNT + 1 ))
                NEW_DATES+=("$DATE")
                # Backup raw ZIP before processing
                cp "$EXTRACT_DIR/health-$DATE.zip" "$BACKUP_DIR/raw/"
                # Extract ZIP
                unzip -o "$EXTRACT_DIR/health-$DATE.zip" -d "$EXTRACT_DIR" >/dev/null
                # Backup extracted data by date
                mkdir -p "$BACKUP_DIR/raw/$DATE"
                cp -r "$EXTRACT_DIR/." "$BACKUP_DIR/raw/$DATE/" 2>/dev/null || true
                # Archive ZIP
                mv "$EXTRACT_DIR/health-$DATE.zip" "$DATA_DIR/archive/" 2>/dev/null || true
            else
                echo "[$TODAY] WARNING: Failed to download $DATE"
            fi
        fi
    done
else
    echo "[$TODAY] No pending data on cloud relay."
fi

if [ "$ZIP_COUNT" -eq 0 ]; then
    echo "[$TODAY] No new data to process."
    rm -rf "$EXTRACT_DIR"
    rm -f "$LOCK_FILE"
    exit 0
fi

echo "[$TODAY] Processing $ZIP_COUNT new days of data..."

# --- Run Claude Code to process extracted data ---
echo "[$TODAY] Running Claude Code analysis..."
CLAUDECODE="" claude -p "Process the health data that has been extracted to $EXTRACT_DIR. Today is $TODAY. The data root is $DATA_DIR. Follow the instructions in $REPO_DIR/processing/process-day-prompt.md. There may be data from multiple days - process each day found." \
    --allowedTools "Read,Write,Glob,Grep,Bash" \
    >> "$DATA_DIR/logs/$TODAY.log" 2>&1 || echo "[$TODAY] WARNING: Claude Code exited with an error. Check log: $DATA_DIR/logs/$TODAY.log"

echo "[$TODAY] Claude Code analysis complete."

# --- Backup analysis and corrections ---
echo "[$TODAY] Backing up analysis and corrections..."
cp "$DATA_DIR/analysis/"*.json "$BACKUP_DIR/analysis/" 2>/dev/null || true
cp "$DATA_DIR/corrections/"*.json "$BACKUP_DIR/corrections/" 2>/dev/null || true

# --- Upload results back to cloud relay ---
echo "[$TODAY] Uploading analysis results to cloud relay..."
for DATE in "${NEW_DATES[@]}"; do
    if [ -f "$DATA_DIR/analysis/$DATE.json" ]; then
        echo "[$TODAY] Uploading analysis for $DATE..."
        if curl -s -X POST \
            -H "Content-Type: application/json; charset=utf-8" \
            --data-binary "@$DATA_DIR/analysis/$DATE.json" \
            "$HEALTH_SYNC_URL/sync/$HEALTH_SYNC_KEY/day/$DATE/done"; then
            echo "[$TODAY] Uploaded results for $DATE"
        else
            echo "[$TODAY] WARNING: Failed to upload results for $DATE"
        fi
    else
        echo "[$TODAY] WARNING: No analysis produced for $DATE - NOT marking as done."
    fi
done

# --- Clean up extracted data ---
rm -rf "$EXTRACT_DIR"

# --- Remove lock file ---
rm -f "$LOCK_FILE"

echo "[$TODAY] Processing run complete."
