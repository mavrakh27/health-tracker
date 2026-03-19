# Health Tracker Watcher — polls relay for pending data, runs processing if found
# Runs every 30 min via Task Scheduler. Quiet hours: midnight-8am.

$dataDir = if ($env:HEALTH_DATA_DIR) { $env:HEALTH_DATA_DIR } else { "$env:USERPROFILE\HealthTracker" }
$logDir = "$dataDir\logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# Log every run for debugging (append to daily log)
$today = Get-Date -Format 'yyyy-MM-dd'
$logFile = "$logDir\watcher-$today.log"
function Log($msg) {
    $ts = Get-Date -Format 'HH:mm:ss'
    $line = "[$ts] $msg"
    Write-Output $line
    Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
}

$hour = (Get-Date).Hour
if ($hour -ge 0 -and $hour -lt 8) {
    Log "Quiet hours (12am-8am). Exiting."
    exit 0
}

# Atomic lock file — prevents concurrent processing (TOCTOU-safe)
$dataDir = if ($env:HEALTH_DATA_DIR) { $env:HEALTH_DATA_DIR } else { "$env:USERPROFILE\HealthTracker" }
$lockFile = "$dataDir\processing.lock"

# Try to acquire lock atomically (CreateNew fails if file exists)
$lockAcquired = $false
try {
    $fs = [System.IO.File]::Open($lockFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
    $writer = New-Object System.IO.StreamWriter($fs)
    $writer.WriteLine("$PID $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
    $writer.Close()
    $fs.Close()
    $lockAcquired = $true
} catch [System.IO.IOException] {
    # Lock exists — check if stale (>60 min)
    $lockAge = (Get-Date) - (Get-Item $lockFile).LastWriteTime
    if ($lockAge.TotalMinutes -lt 60) {
        Log "[watcher] Processing already in progress (lock age: $([int]$lockAge.TotalMinutes) min). Exiting."
        exit 0
    }
    # Stale lock — check if the PID is still alive
    $lockContent = Get-Content $lockFile -ErrorAction SilentlyContinue
    $lockPid = if ($lockContent -match '^\d+') { [int]$Matches[0] } else { 0 }
    if ($lockPid -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) {
        Log "[watcher] Stale lock but PID $lockPid is still running. Killing."
        Stop-Process -Id $lockPid -Force -ErrorAction SilentlyContinue
    }
    Log "[watcher] Removing stale lock file (age: $([int]$lockAge.TotalMinutes) min)."
    Remove-Item $lockFile -Force
    # Re-acquire
    Get-Date -Format 'yyyy-MM-dd HH:mm:ss' | Out-File $lockFile -Encoding ascii
    $lockAcquired = $true
}

if (-not $lockAcquired) {
    Log "[watcher] Failed to acquire lock. Exiting."
    exit 1
}

$syncUrl = [System.Environment]::GetEnvironmentVariable('HEALTH_SYNC_URL', 'User')
$syncKey = [System.Environment]::GetEnvironmentVariable('HEALTH_SYNC_KEY', 'User')

if (-not $syncUrl -or -not $syncKey) {
    Log "[watcher] HEALTH_SYNC_URL or HEALTH_SYNC_KEY not set. Exiting."
    if (Test-Path $lockFile) { Remove-Item $lockFile -Force }
    exit 0
}

$pendingUrl = "$syncUrl/sync/$syncKey/pending"

try {
    $resp = Invoke-RestMethod -Uri $pendingUrl -Method Get -TimeoutSec 10
    $pending = $resp.pending

    if (-not $pending -or $pending.Count -eq 0) {
        Log "[watcher] No pending data. Exiting."
        if (Test-Path $lockFile) { Remove-Item $lockFile -Force }
        exit 0
    }

    Log "[watcher] Pending dates: $($pending -join ', '). Launching processing..."

    try {
        $batPath = Join-Path $PSScriptRoot 'process-day.bat'
        $env:CLAUDECODE = $null
        $env:WATCHER_OWNS_LOCK = "1"
        # Ensure sync env vars are in process environment for child bat
        $env:HEALTH_SYNC_URL = $syncUrl
        $env:HEALTH_SYNC_KEY = $syncKey
        $dailyLog = Join-Path $dataDir "logs\$today.log"
        $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$batPath`" >> `"$dailyLog`" 2>&1" -PassThru -NoNewWindow
        # 60-minute timeout — kill if hung
        if (-not $proc.WaitForExit(3600000)) {
            Log "[watcher] Processing timed out after 60 min. Killing."
            $proc | Stop-Process -Force
        }
        Log "[watcher] Processing finished with exit code $($proc.ExitCode)."
    } finally {
        if (Test-Path $lockFile) { Remove-Item $lockFile -Force }
    }
} catch {
    Log "[watcher] Error: $_"
    if (Test-Path $lockFile) { Remove-Item $lockFile -Force }
    exit 1
}
