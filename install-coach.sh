#!/bin/bash
# Coach -- AI Health Coach installer
# Run from an empty folder:  mkdir coach && cd coach && curl -sL https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.sh | bash

set -e

COACH_DIR="$(pwd)"
REPO_RAW="https://raw.githubusercontent.com/nEmily/health-tracker/main"

echo ""
echo "  ===================="
echo "   Coach -- AI Health Coach"
echo "  ===================="
echo ""

# Check prerequisites
if ! command -v claude &> /dev/null; then
  echo "ERROR: Claude Code not found. Install it first: https://claude.ai/code"
  exit 1
fi

echo "[1/3] Setting up project files..."

# Download coach plugin files (CLAUDE.md, SOUL.md, coach-rules.md)
for f in CLAUDE.md SOUL.md coach-rules.md setup-skill.md; do
  curl -sf "$REPO_RAW/coach-plugin/$f" -o "$COACH_DIR/$f" || echo "  WARNING: Could not download $f"
done
echo "  Coach personality + config installed"

echo ""
echo "[2/3] Creating data directories..."
mkdir -p "$COACH_DIR/profile" "$COACH_DIR/analysis" "$COACH_DIR/logs" "$COACH_DIR/processing" "$COACH_DIR/.claude/skills" "$COACH_DIR/.claude/memory"

# Download profile templates
for f in goals.json preferences.json regimen.json; do
  curl -sf "$REPO_RAW/processing/templates/$f" -o "$COACH_DIR/profile/$f" 2>/dev/null || true
done

# Download processing scripts
for f in process-day.bat process-day.sh watcher.ps1 watcher.sh process-day-prompt.md; do
  curl -sf "$REPO_RAW/processing/$f" -o "$COACH_DIR/processing/$f" 2>/dev/null || true
done
for f in build-conversations.js build-summary.js timeline.js; do
  curl -sf "$REPO_RAW/coach-plugin/$f" -o "$COACH_DIR/processing/$f" 2>/dev/null || true
done

echo "  Data directory: $COACH_DIR"

echo ""
echo "[3/3] Checking environment..."
if [ -n "$HEALTH_SYNC_URL" ] && [ -n "$HEALTH_SYNC_KEY" ]; then
  echo "  Sync already configured:"
  echo "    URL: $HEALTH_SYNC_URL"
  echo "    Key: ${HEALTH_SYNC_KEY:0:8}..."
else
  echo "  Sync not configured yet (Coach will set this up for you)"
fi

echo ""
echo "  ===================="
echo "   Setup complete!"
echo "  ===================="
echo ""
echo "  Next step:"
echo "    Type  claude  in this folder. Coach will walk you through everything --"
echo "    goals, phone setup, and automated processing."
echo ""
echo "  Want to contribute? https://github.com/nEmily/health-tracker"
echo "    Fork the repo, run /contribute in Claude for the contributor guide."
echo ""
