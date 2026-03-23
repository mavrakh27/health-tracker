# Coach (Health Tracker)

AI-powered health tracking PWA. Capture food photos, workouts, water, weight, sleep, and body progress on any device. Auto-syncs to your computer via cloud relay. Claude Code processes every 30 min — analyzing food photos, estimating calories/macros, tracking goals, generating meal plans and workout recommendations.

## Tech Stack

- **PWA**: Vanilla HTML/CSS/JS, no build step, no framework
- **Storage**: IndexedDB for phone-side data
- **Sync**: Cloud relay (Cloudflare Worker + R2) — auto-upload on save, auto-download results
- **Processing**: Claude Code CLI every 30 min via Task Scheduler
- **Hosting**: GitHub Pages
- **Data**: JSON + JPEG + Markdown
- **Backup**: Local archive at `$HEALTH_BACKUP_DIR`

## Project Structure

- `pwa/` — the PWA served via GitHub Pages
  - `index.html` — single-page app shell
  - `manifest.json` — PWA manifest
  - `sw.js` — service worker for offline
  - `styles/` — CSS (theme.css, main.css, components.css)
  - `scripts/` — JS modules (app.js, db.js, log.js, camera.js, sync.js, fitness.js, goals.js, plan.js, progress.js, coach.js, profile.js, score.js, ui.js)
  - 4-tab layout: Today (logging + workout + meal suggestion) | Coach (inbox + analysis) | Progress (insights + trends) | Settings
  - `assets/icons/` — PWA icons
- `health-sync/` — Cloudflare Worker for cloud relay
- `processing/` — Claude processing scripts (watcher, process-day — Windows + Mac/Linux)
- `docs/` — setup guides

## Data Location

- **Processing data root**: `$HEALTH_DATA_DIR` (default: `~/HealthTracker` on Mac/Linux, `%USERPROFILE%\HealthTracker` on Windows). NEVER in git.
- **Local backup**: `$HEALTH_BACKUP_DIR` (default: `~/health-data-backup`). Raw ZIPs, analysis, corrections.
- **Repo location**: `$HEALTH_REPO_DIR` (default: auto-detected from script location)

## Multi-User Model

Coach supports multiple independent users. Each user:
1. Installs the PWA on their own device (browser isolation handles data separation)
2. Configures their own sync key (UUID) for cloud relay
3. Runs processing on their own computer with their own Claude Code subscription
4. Stores profile/goals in their own `$HEALTH_DATA_DIR/profile/`

No server-side auth — sync keys provide data isolation. See `docs/getting-started.md` for setup.

## Coach Interaction Avenues

Users interact with the AI coach through three channels:

1. **Inbox (in-app)** — Async messaging on the Coach tab. User sends a message, it syncs to the relay, processing picks it up within ~30 min, response syncs back. Good for quick questions throughout the day.

2. **Analysis (cron processing)** — Every 30 min, `process-day.bat/sh` runs Claude Code which analyzes food photos, estimates calories, generates meal plans and workout regimen, and produces highlights/concerns. This is the "always-on" coach that monitors your day.

3. **1:1 session (`/coach` skill)** — Direct, real-time conversation with Claude as your health coach. Run `claude` in the project directory and type `/coach`. Claude loads your full profile, recent history, and goals, then has a live coaching conversation. Can update goals, regimen, and preferences on the spot.

## Skills

- `/coach` — 1:1 real-time coaching session (loads profile + history, coach persona)
- `/process-day [date]` — Process a day's health data (download, analyze, upload)
- `/setup` — New user setup wizard (fork, relay, profile, processing)
- `/validate` — End-to-end PWA verification

## Key Principles

1. Meal photos are temporary (delete after analysis), body photos are permanent
2. Data layer is the stable contract — views are disposable
3. No build step, no framework, vanilla everything
4. All data stays private and local
5. Always over-count calories when estimating
6. No emojis in the UI or code output

## Branching

- **`dev`** — default working branch. All iteration happens here. Push freely.
- **`main`** — release branch. GitHub Pages deploys from here. Only gets polished, tested merges.
- To release: merge `dev` → `main` via PR or direct merge after `/validate` + `/review` pass.
- Never push untested work directly to `main`.

## Running Locally

```bash
cd pwa && python -m http.server 8080
```

Then open http://localhost:8080

## Validation

Run `/validate` after any code changes. It checks:
- HTML/JS syntax validity
- Service worker registration
- All script files load without errors
- App renders and routes work

## Deprecation Log

See `.claude/notes/deprecation-log.md` for removed features and why (iCloud sync, separate food categories, warm theme, etc.)

## Sync Gotchas

- **SW cache on iOS is stubborn.** Always bump `CACHE_NAME` in `sw.js` when changing any script. Users need to close/reopen the app twice (first triggers SW update, second activates it). Worst case: clear Safari website data.
- **process-day.bat skips dates with existing analysis files.** To force reprocess: move/delete the analysis JSON first, download the ZIP manually from the relay, then run Claude directly.
- **Relay `newResults` can become empty** (already acked or race condition). The `/results/resync` endpoint re-queues all results from R2. The PWA has a "Re-sync All Results" button for this.
- **Never add upload skip logic based on timestamps.** `queueUpload` is only called from user actions — if it fires, data changed. Previous skip logic comparing entry timestamps to `analysis.importedAt` silently blocked uploads after resyncs or metadata edits.

## Status Tracking

This project is coordinated by an orchestrator at `~/projects`. Update `.claude/status.md` whenever you work on this project:

- **On start:** Set `Status` to `active`, update `Summary` with what you're doing
- **On finish:** Set `Status` to `needs-review`, update `Summary` and `Next`
- **If blocked:** Set `Status` to `blocked`, fill in `Blocked` field
- **Log:** Append a dated entry to the `## Log` section summarizing what you did
- **Human Notes:** Check the `## Human Notes` section — Emily leaves async feedback there. Act on it, then clear it back to the placeholder comment.

The orchestrator reads these status files to build a dashboard and decide what to dispatch next.

## Project Tracking
This project is tracked on the maintainer's Obsidian kanban board (not in this repo).
