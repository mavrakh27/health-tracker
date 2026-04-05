#!/usr/bin/env bash

# Coach plugin SessionStart hook
# Detects user state and injects COACH_STATE context

# Data directory is always CWD (coach alias cd's here before launching)
DATA_DIR="$(pwd)"

# Build state context
if [ ! -f "$DATA_DIR/USER.md" ]; then
  STATE="COACH_STATE: new_user. DATA_DIR: $DATA_DIR"
elif [ ! -s "$DATA_DIR/USER.md" ]; then
  STATE="COACH_STATE: needs_setup. DATA_DIR: $DATA_DIR"
else
  LATEST=""
  if [ -d "$DATA_DIR/analysis" ]; then
    LATEST=$(find "$DATA_DIR/analysis" -maxdepth 1 -name '*.json' 2>/dev/null | sort | tail -1)
    if [ -n "$LATEST" ]; then
      LATEST=" LATEST_ANALYSIS: $(basename "$LATEST" .json)."
    fi
  fi
  STATE="COACH_STATE: returning_user. DATA_DIR: $DATA_DIR.$LATEST"
fi

echo "$STATE"
exit 0
