# Coach -- AI Health Coach installer (Windows)
# Run from an empty folder:  mkdir coach; cd coach; irm https://raw.githubusercontent.com/nEmily/health-tracker/main/install-coach.ps1 | iex

$ErrorActionPreference = "Stop"
$CoachDir = (Get-Location).Path
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

Write-Host "[1/3] Setting up project files..."

# Download coach plugin files (CLAUDE.md, SOUL.md, coach-rules.md)
foreach ($f in @("CLAUDE.md", "SOUL.md", "coach-rules.md", "setup-skill.md")) {
  try {
    Invoke-WebRequest -Uri "$RepoRaw/coach-plugin/$f" -OutFile "$CoachDir\$f" -ErrorAction Stop
  } catch {
    Write-Host "  WARNING: Could not download $f" -ForegroundColor Yellow
  }
}
Write-Host "  Coach personality + config installed"

Write-Host ""
Write-Host "[2/3] Creating data directories..."
$dirs = @("profile", "analysis", "logs", "processing", ".claude\skills", ".claude\memory")
foreach ($d in $dirs) { New-Item -ItemType Directory -Force "$CoachDir\$d" | Out-Null }

# Download profile templates (skip if already exist -- don't overwrite user data)
foreach ($f in @("goals.json", "preferences.json", "regimen.json")) {
  if (-not (Test-Path "$CoachDir\profile\$f")) {
    try { Invoke-WebRequest -Uri "$RepoRaw/processing/templates/$f" -OutFile "$CoachDir\profile\$f" -ErrorAction SilentlyContinue } catch {}
  }
}

# Download processing scripts
foreach ($f in @("process-day.bat", "process-day.sh", "watcher.ps1", "watcher.sh", "process-day-prompt.md", "plan-prompt.md")) {
  try { Invoke-WebRequest -Uri "$RepoRaw/processing/$f" -OutFile "$CoachDir\processing\$f" -ErrorAction SilentlyContinue } catch {}
}
foreach ($f in @("build-conversations.js", "build-summary.js", "timeline.js")) {
  try { Invoke-WebRequest -Uri "$RepoRaw/coach-plugin/$f" -OutFile "$CoachDir\processing\$f" -ErrorAction SilentlyContinue } catch {}
}

Write-Host "  Data directory: $CoachDir"

Write-Host ""
Write-Host "[3/3] Checking environment..."
if ($env:HEALTH_SYNC_URL -and $env:HEALTH_SYNC_KEY) {
  Write-Host "  Sync already configured:"
  Write-Host "    URL: $env:HEALTH_SYNC_URL"
  Write-Host "    Key: $($env:HEALTH_SYNC_KEY.Substring(0,8))..."
} else {
  Write-Host "  Sync not configured yet (Coach will set this up for you)"
}

Write-Host ""
Write-Host "  ====================" -ForegroundColor Green
Write-Host "   Setup complete!" -ForegroundColor Green
Write-Host "  ====================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next step:"
Write-Host "    Type  claude  in this folder. Coach will walk you through everything --"
Write-Host "    goals, phone setup, and automated processing."
Write-Host ""
Write-Host "  Want to contribute? https://github.com/nEmily/health-tracker"
Write-Host "    Fork the repo, run /contribute in Claude for the contributor guide."
Write-Host ""
