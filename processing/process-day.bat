@echo off
REM Health Tracker — Periodic Processing via Task Scheduler
REM Runs Claude Code to analyze health data from ZIP exports.
REM Designed to run every other day (or on-demand). Processes ALL
REM pending ZIPs in the incoming folder, not just "today's" data.

setlocal enabledelayedexpansion

set ICLOUD_DIR=%USERPROFILE%\iCloudDrive\HealthTracker
set REPO_DIR=%USERPROFILE%\projects\health-tracker

REM --- Get today's date (YYYY-MM-DD) using locale-independent method ---
REM  %date% is locale-dependent; use PowerShell for reliable ISO format.
for /f "usebackq" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"`) do set TODAY=%%d
if "%TODAY%"=="" (
    echo [ERROR] Failed to determine today's date. Aborting.
    exit /b 1
)

echo [%TODAY%] Starting processing run...

REM --- Create required directories ---
mkdir "%ICLOUD_DIR%\logs" 2>nul
mkdir "%ICLOUD_DIR%\processed" 2>nul

REM --- Check for pending ZIP files ---
dir /b "%ICLOUD_DIR%\incoming\*.zip" >nul 2>&1
if errorlevel 1 (
    echo [%TODAY%] No ZIP files in incoming/, nothing to process.
    exit /b 0
)

REM --- Extract all ZIP files ---
set EXTRACT_DIR=%ICLOUD_DIR%\incoming\extracted
mkdir "%EXTRACT_DIR%" 2>nul

set ZIP_COUNT=0
set EXTRACT_ERRORS=0

for %%f in ("%ICLOUD_DIR%\incoming\*.zip") do (
    set /a ZIP_COUNT+=1
    echo [%TODAY%] Extracting: %%~nxf
    powershell -NoProfile -Command "try { Expand-Archive -LiteralPath '%%f' -DestinationPath '%EXTRACT_DIR%' -Force } catch { Write-Error $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo [%TODAY%] ERROR: Failed to extract %%~nxf
        set /a EXTRACT_ERRORS+=1
    )
)

echo [%TODAY%] Extracted !ZIP_COUNT! ZIP file(s) (!EXTRACT_ERRORS! error(s)).

if !EXTRACT_ERRORS! equ !ZIP_COUNT! (
    echo [%TODAY%] All extractions failed. Aborting.
    exit /b 1
)

REM --- Run Claude Code to process extracted data ---
echo [%TODAY%] Running Claude Code analysis...
claude -p "Process the health data that has been extracted to %EXTRACT_DIR%. Today is %TODAY%. The iCloud data root is %ICLOUD_DIR%. Follow the instructions in %REPO_DIR%\processing\process-day-prompt.md. There may be data from multiple days — process each day found." --allowedTools "Read,Write,Glob,Grep,Bash" >>"%ICLOUD_DIR%\logs\%TODAY%.log" 2>&1

if errorlevel 1 (
    echo [%TODAY%] WARNING: Claude Code exited with an error. Check log: %ICLOUD_DIR%\logs\%TODAY%.log
) else (
    echo [%TODAY%] Claude Code analysis complete.
)

REM --- Move processed ZIPs to processed folder ---
for %%f in ("%ICLOUD_DIR%\incoming\*.zip") do (
    move "%%f" "%ICLOUD_DIR%\processed\" >nul 2>&1
    if errorlevel 1 (
        echo [%TODAY%] WARNING: Failed to move %%~nxf to processed/
    )
)

REM --- Clean up extracted data ---
rmdir /s /q "%EXTRACT_DIR%" 2>nul

echo [%TODAY%] Processing run complete.
endlocal
