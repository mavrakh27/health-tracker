#!/usr/bin/env bash

# Coach plugin SessionStart hook
# Detects user state and injects COACH_STATE context

DATA_DIR=""

# Primary: current directory (coach alias always cd's here)
if [ -f "./USER.md" ]; then
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

# Build state context
if [ -z "$DATA_DIR" ]; then
  STATE="COACH_STATE: new_user. No data directory found."
elif [ ! -s "$DATA_DIR/USER.md" ]; then
  STATE="COACH_STATE: needs_setup. DATA_DIR: $DATA_DIR"
else
  LATEST=""
  if [ -d "$DATA_DIR/analysis" ]; then
    LATEST=$(ls -1 "$DATA_DIR/analysis/"*.json 2>/dev/null | sort | tail -1)
    if [ -n "$LATEST" ]; then
      LATEST=" LATEST_ANALYSIS: $(basename "$LATEST" .json)."
    fi
  fi
  STATE="COACH_STATE: returning_user. DATA_DIR: $DATA_DIR.$LATEST"
fi

echo "$STATE"
exit 0
