@echo off
REM Health Tracker - Periodic Processing via Task Scheduler
REM Runs Claude Code to analyze health data.
REM Downloads pending ZIPs from cloud relay.
REM
REM IMPORTANT: Never deletes raw data. Archives instead.
REM IMPORTANT: Never re-processes dates that already have analysis.

setlocal enabledelayedexpansion

if defined HEALTH_DATA_DIR (set DATA_DIR=%HEALTH_DATA_DIR%) else (set DATA_DIR=%USERPROFILE%\HealthTracker)
if defined HEALTH_REPO_DIR (set REPO_DIR=%HEALTH_REPO_DIR%) else (set REPO_DIR=%~dp0..)
if defined HEALTH_BACKUP_DIR (set BACKUP_DIR=%HEALTH_BACKUP_DIR%) else (set BACKUP_DIR=%USERPROFILE%\health-data-backup)
set LOCK_FILE=%DATA_DIR%\processing.lock

REM --- Get today's date using locale-independent method ---
for /f "usebackq" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"`) do set TODAY=%%d
if "%TODAY%"=="" (
    echo [ERROR] Failed to determine today's date. Aborting.
    exit /b 1
)

REM --- Lock file check (watcher.ps1 owns lock lifecycle, but guard against direct runs) ---
if exist "%LOCK_FILE%" (
    echo [%TODAY%] Another processing run is in progress - lock file exists. Aborting.
    exit /b 0
)

echo [%TODAY%] Starting processing run...

REM --- Create required directories ---
mkdir "%DATA_DIR%\logs" 2>nul
mkdir "%DATA_DIR%\archive" 2>nul
mkdir "%BACKUP_DIR%\raw" 2>nul
mkdir "%BACKUP_DIR%\analysis" 2>nul
mkdir "%BACKUP_DIR%\corrections" 2>nul

set EXTRACT_DIR=%DATA_DIR%\incoming\extracted
mkdir "%EXTRACT_DIR%" 2>nul

set ZIP_COUNT=0
set NEW_DATES=

REM --- Download pending data from cloud relay ---
if not defined HEALTH_SYNC_URL (
    echo [%TODAY%] HEALTH_SYNC_URL not set. Cannot sync.
    exit /b 1
)
if not defined HEALTH_SYNC_KEY (
    echo [%TODAY%] HEALTH_SYNC_KEY not set. Cannot sync.
    exit /b 1
)

echo [%TODAY%] Checking cloud relay for pending data...

REM Get list of pending dates
for /f "usebackq delims=" %%j in (`curl -s "%HEALTH_SYNC_URL%/sync/%HEALTH_SYNC_KEY%/pending"`) do set PENDING_JSON=%%j

REM Parse pending dates using PowerShell
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "try { ($env:PENDING_JSON | ConvertFrom-Json).pending -join ',' } catch { '' }"`) do set RELAY_DATES=%%d

if not "!RELAY_DATES!"=="" (
    echo [%TODAY%] Cloud relay has pending dates: !RELAY_DATES!

    REM Download each pending day - always download, reprocess if data is newer than analysis
    for %%d in (!RELAY_DATES!) do (
        echo [%TODAY%] Downloading %%d from relay...
        curl -sf -o "%EXTRACT_DIR%\health-%%d.zip" "%HEALTH_SYNC_URL%/sync/%HEALTH_SYNC_KEY%/day/%%d"
        if not errorlevel 1 (
            set /a ZIP_COUNT+=1
            set NEW_DATES=!NEW_DATES! %%d
            REM Backup raw ZIP locally before any processing
            copy "%EXTRACT_DIR%\health-%%d.zip" "%BACKUP_DIR%\raw\" >nul 2>&1
            REM Extract the downloaded ZIP
            powershell -NoProfile -Command "try { Expand-Archive -LiteralPath '%EXTRACT_DIR%\health-%%d.zip' -DestinationPath '%EXTRACT_DIR%' -Force } catch { Write-Error $_.Exception.Message; exit 1 }"
            REM Also backup extracted data by date
            mkdir "%BACKUP_DIR%\raw\%%d" 2>nul
            xcopy "%EXTRACT_DIR%\*" "%BACKUP_DIR%\raw\%%d\" /E /Y /Q >nul 2>&1
            REM Archive ZIP
            move "%EXTRACT_DIR%\health-%%d.zip" "%DATA_DIR%\archive\" >nul 2>&1
        ) else (
            echo [%TODAY%] WARNING: Failed to download %%d
        )
    )
) else (
    echo [%TODAY%] No pending data on cloud relay.
)

if !ZIP_COUNT! equ 0 (
    echo [%TODAY%] No new data to process.
    rmdir /s /q "%EXTRACT_DIR%" 2>nul
    exit /b 0
)

echo [%TODAY%] Processing !ZIP_COUNT! new days of data...

REM --- Run Claude Code to process extracted data ---
echo [%TODAY%] Running Claude Code analysis...
claude -p "Process the health data that has been extracted to %EXTRACT_DIR%. Today is %TODAY%. The data root is %DATA_DIR%. Follow the instructions in %REPO_DIR%\processing\process-day-prompt.md. There may be data from multiple days - process each day found." --allowedTools "Read,Write,Glob,Grep,Bash" >>"%DATA_DIR%\logs\%TODAY%.log" 2>&1

if errorlevel 1 (
    echo [%TODAY%] WARNING: Claude Code exited with an error. Check log: %DATA_DIR%\logs\%TODAY%.log
)

echo [%TODAY%] Claude Code analysis complete.

REM --- Backup analysis and corrections locally ---
echo [%TODAY%] Backing up analysis and corrections...
xcopy "%DATA_DIR%\analysis\*.json" "%BACKUP_DIR%\analysis\" /Y /Q >nul 2>&1
xcopy "%DATA_DIR%\corrections\*.json" "%BACKUP_DIR%\corrections\" /Y /Q >nul 2>&1

REM --- Upload results back to cloud relay ---
REM Upload analysis files that are new or modified since last upload.
REM Uses .uploaded marker files to track state. Catches crashed runs.
echo [%TODAY%] Uploading analysis results to cloud relay...
set UPLOAD_COUNT=0
for %%f in ("%DATA_DIR%\analysis\????-??-??.json") do (
    set "ADATE=%%~nf"
    set "NEED_UPLOAD=0"
    if not exist "%%f.uploaded" (
        set "NEED_UPLOAD=1"
    ) else (
        REM Re-upload if analysis was modified after the upload marker (corrections)
        for %%u in ("%%f.uploaded") do for %%a in ("%%f") do (
            if "%%~ta" gtr "%%~tu" set "NEED_UPLOAD=1"
        )
    )
    if "!NEED_UPLOAD!"=="1" (
        echo [%TODAY%] Uploading analysis for !ADATE!...
        curl -sf -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @"%%f" "%HEALTH_SYNC_URL%/sync/%HEALTH_SYNC_KEY%/day/!ADATE!/done"
        if not errorlevel 1 (
            echo [%TODAY%] Uploaded results for !ADATE!
            echo %TODAY% %TIME% > "%%f.uploaded"
            set /a UPLOAD_COUNT+=1
        ) else (
            echo [%TODAY%] WARNING: Failed to upload results for !ADATE!
        )
    )
)
if !UPLOAD_COUNT! gtr 0 (
    echo [%TODAY%] Uploaded !UPLOAD_COUNT! analysis files.
) else (
    echo [%TODAY%] All analysis files up to date.
)
REM Clean up old upload markers (>30 days)
forfiles /p "%DATA_DIR%\analysis" /m "*.uploaded" /d -30 /c "cmd /c del @path" 2>nul

REM --- Clean up extracted data ---
rmdir /s /q "%EXTRACT_DIR%" 2>nul

echo [%TODAY%] Processing run complete.
endlocal
