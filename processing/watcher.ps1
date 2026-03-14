# Health Tracker Watcher — polls relay for pending data, runs processing if found
# Runs every 30 min via Task Scheduler. Quiet hours: midnight-8am.

$hour = (Get-Date).Hour
if ($hour -ge 0 -and $hour -lt 8) {
    Write-Output "[watcher] Quiet hours (12am-8am). Exiting."
    exit 0
}

# Lock file to prevent concurrent processing
$lockFile = "$env:USERPROFILE\iCloudDrive\HealthTracker\processing.lock"
if (Test-Path $lockFile) {
    $lockAge = (Get-Date) - (Get-Item $lockFile).LastWriteTime
    if ($lockAge.TotalMinutes -lt 60) {
        Write-Output "[watcher] Processing already in progress (lock file age: $([int]$lockAge.TotalMinutes) min). Exiting."
        exit 0
    }
    # Stale lock (>60 min) — remove it
    Write-Output "[watcher] Removing stale lock file (age: $([int]$lockAge.TotalMinutes) min)."
    Remove-Item $lockFile -Force
}

$syncUrl = [System.Environment]::GetEnvironmentVariable('HEALTH_SYNC_URL', 'User')
$syncKey = [System.Environment]::GetEnvironmentVariable('HEALTH_SYNC_KEY', 'User')

if (-not $syncUrl -or -not $syncKey) {
    Write-Output "[watcher] HEALTH_SYNC_URL or HEALTH_SYNC_KEY not set. Exiting."
    exit 0
}

$pendingUrl = "$syncUrl/sync/$syncKey/pending"

try {
    $resp = Invoke-RestMethod -Uri $pendingUrl -Method Get -TimeoutSec 10
    $pending = $resp.pending

    if (-not $pending -or $pending.Count -eq 0) {
        Write-Output "[watcher] No pending data. Exiting."
        exit 0
    }

    Write-Output "[watcher] Pending dates: $($pending -join ', '). Launching processing..."

    $batPath = Join-Path $PSScriptRoot 'process-day.bat'
    $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$batPath`"" -Wait -PassThru -NoNewWindow
    Write-Output "[watcher] Processing finished with exit code $($proc.ExitCode)."
} catch {
    Write-Output "[watcher] Error checking relay: $_"
    exit 1
}
