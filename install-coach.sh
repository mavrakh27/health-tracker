#!/bin/bash
# Coach -- AI Health Coach installer
# Installs Claude Code skills + processing pipeline without forking the repo.
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.sh | bash
#
# What it does:
#   1. Installs /coach, /process-day skills to ~/.claude/skills/health-coach/
#   2. Creates ~/HealthTracker/ data directory with profile templates
#   3. Downloads the processing prompt
#   4. Prompts for relay URL + sync key
#   5. Sets up a cron job (Mac/Linux) for automated processing

set -e

SKILL_DIR="$HOME/.claude/skills/health-coach"
DATA_DIR="${HEALTH_DATA_DIR:-$HOME/HealthTracker}"
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

echo "[1/5] Installing Claude skills..."
mkdir -p "$SKILL_DIR"

# Download skills
curl -sf "$REPO_RAW/install/skills/coach.md" -o "$SKILL_DIR/coach.md" || {
  echo "  Downloading coach skill..."
  # Fallback: create inline
  cat > "$SKILL_DIR/coach.md" << 'SKILL_EOF'
# /coach -- 1:1 Health Coach Session

Interactive coaching session. Run `/coach` to start.

## Steps

1. Read profile files from $HEALTH_DATA_DIR/profile/ (bio.txt, goals.json, preferences.json, regimen.json)
2. Read last 7 days of analysis from $HEALTH_DATA_DIR/analysis/
3. Adopt a supportive, direct coach persona
4. Use actual data when giving advice
5. Can update goals.json, preferences.json, regimen.json, bio.txt

## Sub-commands
- `/coach check-in` -- review today so far
- `/coach meal-plan` -- discuss what to eat
- `/coach regimen` -- adjust workout plan
- `/coach goals` -- review and adjust targets
SKILL_EOF
}

cat > "$SKILL_DIR/process-day.md" << 'SKILL_EOF'
# /process-day -- Process Health Data

Download and analyze health data from the cloud relay.

## Usage
```
/process-day          # Process today
/process-day 2026-03-15  # Specific date
```

## Steps

1. Check relay for pending data: `curl -sf "$HEALTH_SYNC_URL/sync/$HEALTH_SYNC_KEY/pending"`
2. Download ZIPs for pending dates to $HEALTH_DATA_DIR/incoming/extracted/
3. Extract and analyze each day:
   - Read log.json for entries
   - Analyze meal photos (estimate calories, always round UP)
   - Check profile/ for goals, preferences, regimen
   - Generate analysis JSON with: entries, totals, goals comparison, highlights, concerns, meal plan, regimen
4. Write to $HEALTH_DATA_DIR/analysis/DATE.json
5. Upload results: `curl -X POST --data-binary @analysis.json "$HEALTH_SYNC_URL/sync/$HEALTH_SYNC_KEY/day/DATE/done"`

## Rules
- Never re-process dates with existing analysis (apply corrections only)
- Always over-estimate calories when uncertain
- Do NOT use em dashes or smart quotes in JSON output
- Skip body/face photos (private, don't describe)
- Compute day-of-week from date string (don't assume)
SKILL_EOF

echo "  Skills installed to $SKILL_DIR"

echo ""
echo "[2/5] Creating data directory..."
mkdir -p "$DATA_DIR/profile" "$DATA_DIR/analysis" "$DATA_DIR/logs" "$DATA_DIR/archive" "$DATA_DIR/corrections" "$DATA_DIR/incoming/extracted"

# Download profile templates
echo "  Downloading profile templates..."
for f in goals.json preferences.json regimen.json; do
  curl -sf "$REPO_RAW/processing/templates/$f" -o "$DATA_DIR/profile/$f" 2>/dev/null || true
done

# Create bio template if it doesn't exist
if [ ! -f "$DATA_DIR/profile/bio.txt" ]; then
  cat > "$DATA_DIR/profile/bio.txt" << 'BIO_EOF'
YOUR STATS & GOALS
Current Stats:
  - Height, weight, activity level
  - Any specific body composition notes
Primary Goal:
  - Your main health/fitness goal
  - Secondary goals
Current Challenges:
  - Eating habits to improve
  - Schedule constraints

DIET PLAN
  - Daily calorie target
  - Meal timing and structure
  - Preferred cuisines and meals

FITNESS PLAN
  - Cardio routine
  - Strength/core work
  - Weekly schedule

Fill this in with your details. Your coach reads this to personalize everything.
Run /coach to have Claude help you fill it in interactively.
BIO_EOF
fi

echo "  Data directory: $DATA_DIR"

echo ""
echo "[3/5] Relay configuration..."

if [ -n "$HEALTH_SYNC_URL" ] && [ -n "$HEALTH_SYNC_KEY" ]; then
  echo "  Already configured:"
  echo "    URL: $HEALTH_SYNC_URL"
  echo "    Key: ${HEALTH_SYNC_KEY:0:8}..."
else
  echo "  Set these environment variables (add to ~/.zshrc or ~/.bashrc):"
  echo ""
  echo "    export HEALTH_SYNC_URL=\"https://your-relay.workers.dev\""
  echo "    export HEALTH_SYNC_KEY=\"$(python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || uuidgen 2>/dev/null || echo 'generate-a-uuid')\""
  echo "    export HEALTH_DATA_DIR=\"$DATA_DIR\""
  echo ""
  echo "  Then open the Coach app on your phone:"
  echo "    Settings > Cloud Sync > enter the same URL and key"
fi

echo ""
echo "[4/5] Processing prompt..."
curl -sf "$REPO_RAW/processing/process-day-prompt.md" -o "$DATA_DIR/process-day-prompt.md" 2>/dev/null && {
  echo "  Downloaded processing prompt to $DATA_DIR/process-day-prompt.md"
} || {
  echo "  Could not download processing prompt (will use skill instructions instead)"
}

echo ""
echo "[5/5] Automated processing (optional)..."

# Detect platform and offer cron setup
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
  echo "  To run processing every 30 minutes, add this cron job:"
  echo ""
  echo "    (crontab -l 2>/dev/null; echo '*/30 * * * * cd $DATA_DIR && claude -p \"Run /process-day\" --allowedTools \"Read,Write,Glob,Grep,Bash\" >> $DATA_DIR/logs/\$(date +\\%Y-\\%m-\\%d).log 2>&1') | crontab -"
  echo ""
else
  echo "  See docs for Windows Task Scheduler setup."
fi

echo ""
echo "  ===================="
echo "   Setup complete!"
echo "  ===================="
echo ""
echo "  Next steps:"
echo "    1. Fill in your profile:  claude  then type  /coach"
echo "       (Claude will help you set up goals, preferences, and bio interactively)"
echo "    2. Install the PWA on your phone: https://nemily.github.io/health-tracker/"
echo "    3. Configure Cloud Sync in the app with your relay URL + key"
echo "    4. Start logging!"
echo ""
