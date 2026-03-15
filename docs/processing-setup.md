# Processing Setup

The processing pipeline runs on your computer every 30 minutes. It downloads new health data from the relay, runs Claude Code to analyze photos and generate recommendations, and uploads results back to the relay so your phone can sync them.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and authenticated (`claude --version` should work)
- A cloud relay URL and sync key — see [relay-setup.md](relay-setup.md)

---

## Environment Variables

Set these as persistent environment variables (user-level, not system-level):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HEALTH_SYNC_URL` | Yes | — | Relay URL, e.g. `https://health-sync.example.workers.dev` |
| `HEALTH_SYNC_KEY` | Yes | — | Your UUID sync key |
| `HEALTH_DATA_DIR` | No | `~/HealthTracker` | Where data, logs, and analysis are stored |
| `HEALTH_REPO_DIR` | No | auto-detected | Path to your cloned repo |
| `HEALTH_BACKUP_DIR` | No | `~/health-data-backup` | Local backup destination |

**Windows (PowerShell, run once):**

```powershell
[System.Environment]::SetEnvironmentVariable("HEALTH_SYNC_URL", "https://your-worker.workers.dev", "User")
[System.Environment]::SetEnvironmentVariable("HEALTH_SYNC_KEY", "your-uuid-here", "User")
```

**Mac/Linux (add to `~/.zshrc` or `~/.bashrc`):**

```bash
export HEALTH_SYNC_URL="https://your-worker.workers.dev"
export HEALTH_SYNC_KEY="your-uuid-here"
```

---

## Profile Setup

The processor uses a profile to personalize analysis. Copy the templates and fill them in:

```bash
# Mac/Linux
mkdir -p "$HEALTH_DATA_DIR/profile"
cp processing/templates/*.json "$HEALTH_DATA_DIR/profile/"
cp processing/profiles/example-bio.txt "$HEALTH_DATA_DIR/profile/bio.txt"
```

```powershell
# Windows
New-Item -ItemType Directory -Force "$env:HEALTH_DATA_DIR\profile"
Copy-Item processing\templates\*.json "$env:HEALTH_DATA_DIR\profile\"
Copy-Item processing\profiles\example-bio.txt "$env:HEALTH_DATA_DIR\profile\bio.txt"
```

Edit `bio.txt` with your personal details (age, height, weight, dietary restrictions, goals). Edit the JSON files to set your calorie targets, workout regimen, and preferences.

---

## Windows Setup

**Test manually first:**

```powershell
cd processing
.\process-day.bat
```

Check `%HEALTH_DATA_DIR%\logs\` for output. If it shows "No pending data on cloud relay", setup is working.

**Automate with Task Scheduler (run once, elevated PowerShell):**

```powershell
cd processing
powershell -ExecutionPolicy Bypass -File setup-task.ps1
```

This registers a `HealthTrackerWatcher` task that runs every 30 minutes. Verify it in Task Scheduler (`taskschd.msc`).

---

## Mac/Linux Setup

**Test manually first:**

```bash
cd processing
bash process-day.sh
```

Check `$HEALTH_DATA_DIR/logs/` for output.

**Automate with cron:**

```bash
cd processing
bash setup-cron.sh
```

This adds a cron job running `watcher.sh` every 30 minutes. Verify with `crontab -l`.

---

## Checking Logs

Logs are written per day to `$HEALTH_DATA_DIR/logs/YYYY-MM-DD.log`.

```bash
# Mac/Linux — tail today's log
tail -f "$HEALTH_DATA_DIR/logs/$(date +%Y-%m-%d).log"
```

```powershell
# Windows — view today's log
Get-Content "$env:HEALTH_DATA_DIR\logs\$(Get-Date -Format yyyy-MM-dd).log" -Wait
```

---

## Troubleshooting

**"HEALTH_SYNC_URL not set"** — environment variables aren't loaded. On Windows, open a new terminal after setting them. On Mac/Linux, `source ~/.zshrc` or open a new shell.

**"No pending data on cloud relay"** — normal if no new data has been uploaded from your phone. Log something in the app and tap Sync, then run processing again.

**Claude Code exits with error** — check the log file. Common causes: Claude isn't authenticated (`claude login`), or the prompt file is missing (`processing/process-day-prompt.md`).

**Analysis not appearing on phone** — open the app, go to Settings → Cloud Sync → Check for Results.
