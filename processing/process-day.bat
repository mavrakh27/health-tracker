@echo off
REM Health Tracker — Periodic Processing via Task Scheduler
REM Runs Claude Code to analyze health data.
REM Supports two modes:
REM   1. Cloud relay (preferred) — downloads pending ZIPs from Cloudflare Worker
REM   2. iCloud Drive fallback — reads ZIPs from incoming/ folder
REM
REM IMPORTANT: Never deletes raw data (ZIPs, photos). Archives instead.
REM IMPORTANT: Never re-processes dates that already have analysis — corrections only.

setlocal enabledelayedexpansion

set ICLOUD_DIR=%USERPROFILE%\iCloudDrive\HealthTracker
set REPO_DIR=%USERPROFILE%\projects\health-tracker
set LOCK_FILE=%ICLOUD_DIR%\processing.lock

REM --- Get today's date (YYYY-MM-DD) using locale-independent method ---
for /f "usebackq" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"`) do set TODAY=%%d
if "%TODAY%"=="" (
    echo [ERROR] Failed to determine today's date. Aborting.
    exit /b 1
)

REM --- Lock file to prevent concurrent processing ---
if exist "%LOCK_FILE%" (
    echo [%TODAY%] Another processing run is in progress (lock file exists). Aborting.
    exit /b 0
)
echo %TODAY% %TIME% > "%LOCK_FILE%"

echo [%TODAY%] Starting processing run...

REM --- Create required directories ---
mkdir "%ICLOUD_DIR%\logs" 2>nul
mkdir "%ICLOUD_DIR%\archive" 2>nul

set EXTRACT_DIR=%ICLOUD_DIR%\incoming\extracted
mkdir "%EXTRACT_DIR%" 2>nul

set ZIP_COUNT=0
set RELAY_MODE=0
set RELAY_DATES=
set NEW_DATES=

REM --- Try cloud relay first ---
if defined HEALTH_SYNC_URL if defined HEALTH_SYNC_KEY (
    echo [%TODAY%] Checking cloud relay for pending data...

    REM Get list of pending dates
    for /f "usebackq delims=" %%j in (`curl -s "%HEALTH_SYNC_URL%/sync/%HEALTH_SYNC_KEY%/pending"`) do set PENDING_JSON=%%j

    REM Parse pending dates using PowerShell
    for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "try { ($env:PENDING_JSON | ConvertFrom-Json).pending -join ',' } catch { '' }"`) do set RELAY_DATES=%%d

    if not "!RELAY_DATES!"=="" (
        set RELAY_MODE=1
        echo [%TODAY%] Cloud relay has pending dates: !RELAY_DATES!

        REM Download each pending day — skip dates that already have analysis
        for %%d in (!RELAY_DATES!) do (
            if exist "%ICLOUD_DIR%\analysis\%%d.json" (
                echo [%TODAY%] %%d already has analysis — uploading result and marking done
                curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @"%ICLOUD_DIR%\analysis\%%d.json" "%HEALTH_SYNC_URL%/sync/%HEALTH_SYNC_KEY%/day/%%d/done"
                echo.
            ) else (
                echo [%TODAY%] Downloading %%d from relay...
                curl -sf -o "%EXTRACT_DIR%\health-%%d.zip" "%HEALTH_SYNC_URL%/sync/%HEALTH_SYNC_KEY%/day/%%d"
                if not errorlevel 1 (
                    set /a ZIP_COUNT+=1
                    set NEW_DATES=!NEW_DATES! %%d
                    REM Extract the downloaded ZIP
                    powershell -NoProfile -Command "try { Expand-Archive -LiteralPath '%EXTRACT_DIR%\health-%%d.zip' -DestinationPath '%EXTRACT_DIR%' -Force } catch { Write-Error $_.Exception.Message; exit 1 }"
                    REM Archive ZIP (never delete raw data)
                    move "%EXTRACT_DIR%\health-%%d.zip" "%ICLOUD_DIR%\archive\" >nul 2>&1
                ) else (
                    echo [%TODAY%] WARNING: Failed to download %%d
                )
            )
        )
    ) else (
        echo [%TODAY%] No pending data on cloud relay.
    )
)

REM --- Fall back to iCloud Drive if no relay data ---
if !ZIP_COUNT! equ 0 (
    dir /b "%ICLOUD_DIR%\incoming\*.zip" >nul 2>&1
    if not errorlevel 1 (
        echo [%TODAY%] Processing ZIP files from iCloud Drive...
        for %%f in ("%ICLOUD_DIR%\incoming\*.zip") do (
            set /a ZIP_COUNT+=1
            echo [%TODAY%] Extracting: %%~nxf
            powershell -NoProfile -Command "try { Expand-Archive -LiteralPath '%%f' -DestinationPath '%EXTRACT_DIR%' -Force } catch { Write-Error $_.Exception.Message; exit 1 }"
            if errorlevel 1 (
                echo [%TODAY%] ERROR: Failed to extract %%~nxf
            )
        )
    )
)

if !ZIP_COUNT! equ 0 (
    echo [%TODAY%] No new data to process from any source.
    REM Clean up
    rmdir /s /q "%EXTRACT_DIR%" 2>nul
    del "%LOCK_FILE%" 2>nul
    exit /b 0
)

echo [%TODAY%] Processing !ZIP_COUNT! day(s) of new data...

REM --- Run Claude Code to process extracted data ---
echo [%TODAY%] Running Claude Code analysis...
claude -p "Process the health data that has been extracted to %EXTRACT_DIR%. Today is %TODAY%. The iCloud data root is %ICLOUD_DIR%. Follow the instructions in %REPO_DIR%\processing\process-day-prompt.md. There may be data from multiple days — process each day found." --allowedTools "Read,Write,Glob,Grep,Bash" >>"%ICLOUD_DIR%\logs\%TODAY%.log" 2>&1

if errorlevel 1 (
    echo [%TODAY%] WARNING: Claude Code exited with an error. Check log: %ICLOUD_DIR%\logs\%TODAY%.log
)

echo [%TODAY%] Claude Code analysis complete.

REM --- Upload results back to cloud relay (only for dates with analysis) ---
if !RELAY_MODE! equ 1 (
    echo [%TODAY%] Uploading analysis results to cloud relay...
    for %%d in (!NEW_DATES!) do (
        if exist "%ICLOUD_DIR%\analysis\%%d.json" (
            echo [%TODAY%] Uploading analysis for %%d...
            curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary @"%ICLOUD_DIR%\analysis\%%d.json" "%HEALTH_SYNC_URL%/sync/%HEALTH_SYNC_KEY%/day/%%d/done"
            if not errorlevel 1 (
                echo [%TODAY%] Uploaded results for %%d
            ) else (
                echo [%TODAY%] WARNING: Failed to upload results for %%d
            )
        ) else (
            echo [%TODAY%] WARNING: No analysis produced for %%d — NOT marking as done. Data preserved in relay.
        )
    )
)

REM --- Archive iCloud Drive ZIPs (never delete) ---
for %%f in ("%ICLOUD_DIR%\incoming\*.zip") do (
    move "%%f" "%ICLOUD_DIR%\archive\" >nul 2>&1
)

REM --- Clean up extracted data (this is a temp copy, originals are archived) ---
rmdir /s /q "%EXTRACT_DIR%" 2>nul

REM --- Remove lock file ---
del "%LOCK_FILE%" 2>nul

echo [%TODAY%] Processing run complete.
endlocal
