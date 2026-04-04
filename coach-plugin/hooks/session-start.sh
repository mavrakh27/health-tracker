#!/usr/bin/env bash

# Coach plugin SessionStart hook
# Outputs persona + user state as additionalContext (JSON format)
# Matches the proven pattern from learning-output-style plugin

# --- Detect user state ---
DATA_DIR=""

# Primary: current directory (coach alias always cd's here)
if [ -f "./USER.md" ] || [ -d "./profile" ]; then
  DATA_DIR="$(pwd)"
fi

# Fallback: HEALTH_DATA_DIR env var
if [ -z "$DATA_DIR" ] && [ -n "${HEALTH_DATA_DIR:-}" ] && [ -d "$HEALTH_DATA_DIR" ]; then
  DATA_DIR="$HEALTH_DATA_DIR"
fi

# Fallback: platform defaults
if [ -z "$DATA_DIR" ]; then
  if [ -f "$HOME/HealthTracker/USER.md" ]; then
    DATA_DIR="$HOME/HealthTracker"
  elif [ -n "$USERPROFILE" ] && [ -f "$USERPROFILE/HealthTracker/USER.md" ]; then
    DATA_DIR="$USERPROFILE/HealthTracker"
  fi
fi

# Build state context line
if [ -z "$DATA_DIR" ]; then
  STATE_LINE="COACH_STATE: new_user. No data directory found. Run /setup to get started."
elif [ ! -s "$DATA_DIR/USER.md" ]; then
  STATE_LINE="COACH_STATE: needs_setup. DATA_DIR: $DATA_DIR. Data directory exists but USER.md is missing. Run /setup to complete onboarding."
else
  LATEST=""
  if [ -d "$DATA_DIR/analysis" ]; then
    LATEST=$(ls -1 "$DATA_DIR/analysis/"*.json 2>/dev/null | sort | tail -1)
    if [ -n "$LATEST" ]; then
      LATEST=" LATEST_ANALYSIS: $(basename "$LATEST" .json)."
    fi
  fi
  STATE_LINE="COACH_STATE: returning_user. DATA_DIR: $DATA_DIR.$LATEST"
fi

# --- Output persona + state as additionalContext JSON ---
# Read the agent body from coach.md (everything after the frontmatter closing ---)
AGENT_FILE="${CLAUDE_PLUGIN_ROOT}/agents/coach.md"
if [ -f "$AGENT_FILE" ]; then
  # Extract body after second --- line, escape for JSON
  BODY=$(sed -n '/^---$/,/^---$/!p' "$AGENT_FILE" | tail -n +1)
else
  BODY="You are Coach, a personal health and fitness coach."
fi

# Escape the body for JSON: backslashes, quotes, newlines, tabs
ESCAPED_BODY=$(printf '%s' "$BODY" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read())[1:-1])" 2>/dev/null)

if [ -z "$ESCAPED_BODY" ]; then
  # Fallback if python3 not available: basic escaping
  ESCAPED_BODY=$(printf '%s' "$BODY" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' '\f' | sed 's/\f/\\n/g')
fi

# Escape state line for JSON too
ESCAPED_STATE=$(printf '%s' "$STATE_LINE" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${ESCAPED_BODY}\\n\\n## Current Session State\\n\\n${ESCAPED_STATE}"
  }
}
EOF

exit 0
