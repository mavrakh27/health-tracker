#!/usr/bin/env bash

# Coach plugin SessionStart hook
# Stdout is injected into Claude's context at session start

# Primary: current directory (coach alias always cd's here)
if [ -f "./USER.md" ] || [ -d "./profile" ]; then
  DATA_DIR="$(pwd)"
fi

# Fallback: HEALTH_DATA_DIR env var (for non-standard setups)
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

if [ -z "$DATA_DIR" ]; then
  echo "COACH_STATE: new_user"
  echo "No data directory found. Run /setup to get started."
  exit 0
fi

if [ ! -s "$DATA_DIR/USER.md" ]; then
  echo "COACH_STATE: needs_setup"
  echo "DATA_DIR: $DATA_DIR"
  echo "Data directory exists but USER.md is missing. Run /setup to complete onboarding."
  exit 0
fi

# Returning user
echo "COACH_STATE: returning_user"
echo "DATA_DIR: $DATA_DIR"

# Find latest analysis date
if [ -d "$DATA_DIR/analysis" ]; then
  LATEST=$(ls -1 "$DATA_DIR/analysis/"*.json 2>/dev/null | sort | tail -1)
  if [ -n "$LATEST" ]; then
    echo "LATEST_ANALYSIS: $(basename "$LATEST" .json)"
  fi
fi

exit 0
