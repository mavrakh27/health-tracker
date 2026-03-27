# /process-day — Process a Day's Health Data

Analyze a specific day's health data.

## Usage
```
/process-day          # Process today
/process-day 2026-02-10  # Process a specific date
```

## How to process

1. Determine the date to process (argument or today)
2. **Read `${CLAUDE_PLUGIN_ROOT}/scripts/process-day-prompt.md`** — this is the single source of truth for all processing rules, output format, corrections system, and data handling
3. Follow every instruction in that prompt exactly
4. The data root is `$HEALTH_DATA_DIR` (default: `~/HealthTracker` on Mac/Linux, `%USERPROFILE%\HealthTracker` on Windows)
5. Look for raw data in `daily/YYYY-MM-DD/` (extracted ZIPs) or the relay

## Key rules (see prompt for full details)
- **Never re-process dates with existing analysis** — apply corrections only
- **Never delete raw data** — archive instead
- **Corrections are ground truth** — `corrections/{DATE}.json` overrides AI estimates
- **`fitness_checked`/`fitness_notes` in log.json = workout happened**
- **Goal targets come from `profile/goals.json`** — never hardcode
- Output is a **single JSON file** to `analysis/YYYY-MM-DD.json`
- **Never hand-edit analysis JSONs.** To change the regimen or any output, update profile files (regimen.json, goals.json, etc.) and rerun `/process-day`. The pipeline owns analysis files — it handles formatting, upload, and consistency.
