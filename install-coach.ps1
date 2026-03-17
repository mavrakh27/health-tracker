# Coach -- AI Health Coach installer (Windows)
# Run: irm https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.ps1 | iex

$ErrorActionPreference = "Stop"
$SkillDir = "$env:USERPROFILE\.claude\skills\health-coach"
$DataDir = if ($env:HEALTH_DATA_DIR) { $env:HEALTH_DATA_DIR } else { "$env:USERPROFILE\HealthTracker" }
$RepoRaw = "https://raw.githubusercontent.com/nEmily/health-tracker/main"

Write-Host ""
Write-Host "  ====================" -ForegroundColor Cyan
Write-Host "   Coach -- AI Health Coach" -ForegroundColor Cyan
Write-Host "  ====================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
try { claude --version | Out-Null } catch {
  Write-Host "ERROR: Claude Code not found. Install it first: https://claude.ai/code" -ForegroundColor Red
  exit 1
}

Write-Host "[1/5] Installing Claude skills..."
New-Item -ItemType Directory -Force $SkillDir | Out-Null

# Coach skill
@"
# /coach -- 1:1 Health Coach Session

Interactive coaching session. Run ``/coach`` to start.

## Steps

1. Read profile files from `$HEALTH_DATA_DIR/profile/` (bio.txt, goals.json, preferences.json, regimen.json)
2. Read last 7 days of analysis from `$HEALTH_DATA_DIR/analysis/`
3. Adopt a supportive, direct coach persona -- celebrate wins, forward-looking tips, never preachy
4. Use actual data when giving advice (not generic tips)
5. Can update goals.json, preferences.json, regimen.json, bio.txt

## Sub-commands
- ``/coach check-in`` -- review today so far
- ``/coach meal-plan`` -- discuss what to eat
- ``/coach regimen`` -- adjust workout plan
- ``/coach goals`` -- review and adjust targets
"@ | Set-Content "$SkillDir\coach.md"

# Process-day skill
@"
# /process-day -- Process Health Data

Download and analyze health data from the cloud relay.

## Usage
``/process-day`` or ``/process-day 2026-03-15``

## Steps
1. Check relay for pending data
2. Download ZIPs to `$HEALTH_DATA_DIR/incoming/extracted/`
3. Analyze each day (photos, entries, generate analysis JSON)
4. Write to `$HEALTH_DATA_DIR/analysis/DATE.json`
5. Upload results back to relay

## Rules
- Never re-process dates with existing analysis
- Always over-estimate calories
- No em dashes or smart quotes in JSON
- Skip body photos (private)
- Compute day-of-week from date string
"@ | Set-Content "$SkillDir\process-day.md"

Write-Host "  Skills installed to $SkillDir"

Write-Host ""
Write-Host "[2/5] Creating data directory..."
$dirs = @("profile", "analysis", "logs", "archive", "corrections", "incoming\extracted")
foreach ($d in $dirs) { New-Item -ItemType Directory -Force "$DataDir\$d" | Out-Null }

# Bio template
if (-not (Test-Path "$DataDir\profile\bio.txt")) {
  @"
YOUR STATS & GOALS
Current Stats:
  - Height, weight, activity level
Primary Goal:
  - Your main health/fitness goal
Current Challenges:
  - Eating habits to improve

DIET PLAN
  - Daily calorie target
  - Meal timing and structure

FITNESS PLAN
  - Cardio routine
  - Strength/core work

Fill this in. Run /coach to have Claude help you set it up interactively.
"@ | Set-Content "$DataDir\profile\bio.txt"
}

# Download templates
foreach ($f in @("goals.json", "preferences.json", "regimen.json")) {
  try { Invoke-WebRequest -Uri "$RepoRaw/processing/templates/$f" -OutFile "$DataDir\profile\$f" -ErrorAction SilentlyContinue } catch {}
}

Write-Host "  Data directory: $DataDir"

Write-Host ""
Write-Host "[3/5] Relay configuration..."
if ($env:HEALTH_SYNC_URL -and $env:HEALTH_SYNC_KEY) {
  Write-Host "  Already configured:"
  Write-Host "    URL: $env:HEALTH_SYNC_URL"
  Write-Host "    Key: $($env:HEALTH_SYNC_KEY.Substring(0,8))..."
} else {
  $uuid = [guid]::NewGuid().ToString()
  Write-Host "  Run these commands to set your relay credentials:"
  Write-Host ""
  Write-Host "    [System.Environment]::SetEnvironmentVariable('HEALTH_SYNC_URL', 'https://your-relay.workers.dev', 'User')" -ForegroundColor Yellow
  Write-Host "    [System.Environment]::SetEnvironmentVariable('HEALTH_SYNC_KEY', '$uuid', 'User')" -ForegroundColor Yellow
  Write-Host "    [System.Environment]::SetEnvironmentVariable('HEALTH_DATA_DIR', '$DataDir', 'User')" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Then in the Coach app: Settings > Cloud Sync > enter same URL + key"
}

Write-Host ""
Write-Host "[4/5] Processing prompt..."
try {
  Invoke-WebRequest -Uri "$RepoRaw/processing/process-day-prompt.md" -OutFile "$DataDir\process-day-prompt.md" -ErrorAction Stop
  Write-Host "  Downloaded processing prompt"
} catch {
  Write-Host "  Could not download prompt (will use skill instructions instead)"
}

Write-Host ""
Write-Host "[5/5] Automated processing..."
Write-Host "  To process every 30 minutes, run (elevated PowerShell):"
Write-Host ""
Write-Host "    `$action = New-ScheduledTaskAction -Execute 'claude' -Argument '-p `"Run /process-day`" --allowedTools Read,Write,Glob,Grep,Bash'" -ForegroundColor Yellow
Write-Host "    `$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)" -ForegroundColor Yellow
Write-Host "    Register-ScheduledTask -TaskName 'HealthCoach' -Action `$action -Trigger `$trigger" -ForegroundColor Yellow

Write-Host ""
Write-Host "  ====================" -ForegroundColor Green
Write-Host "   Setup complete!" -ForegroundColor Green
Write-Host "  ====================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Fill in your profile:  claude  then type  /coach"
Write-Host "    2. Install the PWA: https://nemily.github.io/health-tracker/"
Write-Host "    3. Configure Cloud Sync in the app"
Write-Host "    4. Start logging!"
Write-Host ""
Write-Host "  Want to contribute? https://github.com/nEmily/health-tracker"
Write-Host "    Fork the repo, run /contribute in Claude for the contributor guide."
Write-Host ""
