# /contribute -- Coach OSS Contributor Guide

Guide for developers who want to contribute to Coach, the AI-powered health tracking PWA.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/nEmily/health-tracker.git
cd health-tracker

# Serve the PWA locally
cd pwa && python -m http.server 8080
# Open http://localhost:8080

# Run validation (syntax + Playwright tests)
cd .. && for f in pwa/scripts/*.js pwa/sw.js; do node --check "$f" 2>&1; done
node test-fixtures/run-tests.js --screenshots
```

No build step. No npm install for the PWA itself. Just a static file server.

For relay development: `cd health-sync && npm install`

## Architecture Overview

Coach is a **vanilla HTML/CSS/JS PWA** with no framework and no build step. It runs entirely in the browser with IndexedDB for storage.

### Data Flow
```
Phone (PWA)                  Cloudflare Worker + R2           PC (Claude Code)
  |                              |                                |
  |-- Log food, water, etc. --> IndexedDB                         |
  |-- Photos + entries -------> PUT /sync/{key}/day/{date} -----> |
  |                              |                                |
  |                              | <-- process-day.bat polls -----|
  |                              |     Downloads ZIPs             |
  |                              |     Claude analyzes photos     |
  |                              |     Uploads results            |
  |                              |                                |
  | <--- GET /results/new ------                                  |
  |      Import analysis to DB                                    |
```

### Module System

All JS modules are global objects on `window`. No import/export -- script load order in `index.html` matters.

**Load order** (from index.html):
1. `db.js` -- IndexedDB wrapper (no dependencies)
2. `ui.js` -- Shared UI utilities, SVG icons, DOM helpers
3. `log.js` -- Entry logging forms
4. `camera.js` -- Photo capture + compression
5. `sync.js` -- ZIP builder, cloud relay sync (Sync + CloudRelay objects)
6. `fitness.js` -- Exercise database, workout checklist
7. `skincare.js` -- Skincare routine checklist (SkinCareView)
8. `goals.js` -- Analysis rendering utilities (GoalsView)
9. `plan.js` -- Plan tab (PlanView)
10. `progress.js` -- Progress tab (ProgressView)
11. `coach.js` -- Async coach chat (CoachChat)
12. `score.js` -- Day score calculator (DayScore)
13. `challenges.js` -- Challenge tracking + share cards (Challenges)
14. `app.js` -- Routing, init, navigation, QuickLog, Settings (App, QuickLog, Settings)

**Rule**: Any module can reference modules loaded before it. `app.js` loads last and can reference everything.

### IndexedDB Schema

Database: `health-tracker`, version 4

| Store | Key | Indexes | Description |
|-------|-----|---------|-------------|
| `entries` | `id` | date, type, [date,type] | Meals, workouts, supplements, vices, body photos |
| `photos` | `id` | entryId, date, category, syncStatus | Photo blobs linked to entries |
| `dailySummary` | `date` | -- | Water, weight, sleep, coach chat, fitness notes per day |
| `analysis` | `date` | -- | Claude's analysis output per day |
| `profile` | `key` | -- | Key-value store: goals, preferences, cloudRelay, regimen |
| `mealPlan` | `generatedDate` | -- | AI-generated meal plans |
| `analysisHistory` | auto-increment `id` | date, importedAt | Archives old analysis before overwrite |
| `skincare` | `date` | -- | Daily skincare AM/PM checklist |
| `challenges` | `id` | status, startDate | Active/completed challenges |
| `challengeProgress` | `id` | challengeId, date | Daily progress for challenges |

### Entry Types

| Type | Subtypes | Has Photo | Fields |
|------|----------|-----------|--------|
| `meal` | -- | Yes (optional) | notes, photo |
| `workout` | strength, cardio, flexibility | Optional | duration_minutes, subtype |
| `custom` | beer, wine, cocktail, shot | No | quantity, calories_est |
| `bodyPhoto` | face, body | Yes | -- |
| `period` | -- | No | (toggle in dailySummary) |
| `water` | -- | No | (stored in dailySummary, not as entry) |
| `weight` | -- | No | (stored in dailySummary, not as entry) |

### CSS Architecture

Three CSS files loaded in order:
1. `styles/theme.css` -- CSS custom properties (colors, spacing, fonts, radii)
2. `styles/main.css` -- Layout, screens, navigation, header, stat cards
3. `styles/components.css` -- Buttons, forms, modals, entries, toasts, water picker, fitness

Design system uses CSS variables throughout. Dark theme with cool blue/teal accents.

### Service Worker

`sw.js` caches all static assets with a versioned cache name (`coach-vNN`). Strategy:
- **HTML**: Network-first (always try fresh, fall back to cache)
- **JS/CSS/images**: Cache-first (versioned via cache name bump)

**Critical**: Bump `CACHE_NAME` in sw.js every time you change any script or style file.

## Key Design Principles

1. **No frameworks, no build step.** Vanilla HTML/CSS/JS only. No npm for the PWA.
2. **Data layer is the contract.** Views are disposable. IndexedDB schema is the source of truth.
3. **Privacy first.** No user data in git. Ever. No analytics. No telemetry.
4. **Over-count calories when uncertain.** Better to over-estimate than under-estimate.
5. **Mobile-first responsive design.** Test at 320px, 390px, and 768px viewports.
6. **Body photos are private.** Hidden behind lock icon, auto-hide after 5 seconds.

## How to Add Features

### Adding a New Script Module

1. Create `pwa/scripts/your-module.js`
2. Add a `<script>` tag in `pwa/index.html` (order matters -- after dependencies, before dependents)
3. Add the file to the `ASSETS` array in `pwa/sw.js`
4. Bump `CACHE_NAME` in `pwa/sw.js`
5. Export your module as a global: `const YourModule = { ... };` or `window.YourModule = { ... };`

### Adding a New Entry Type

1. In `log.js`: Add the type to `renderTypeSelector()` types array
2. In `log.js`: Add a `buildYourTypeForm()` method and wire it in `showForm()`
3. In `ui.js`: Add an SVG icon to `UI.svg` and a label to `UI.entryLabel()`
4. In `score.js`: Update `DayScore._calc()` if the new type affects scoring
5. In `db.js` `exportDay()`: Include the new type in the export (if it should sync)
6. Update test fixtures in `test-fixtures/data.js`

### Adding a Profile Setting

1. Use `DB.setProfile(key, value)` to store and `DB.getProfile(key)` to read
2. Add UI in the Profile tab (index.html `#screen-profile` section)
3. Wire up save/load in `app.js` Settings object

### Adding a Modal

Follow the existing pattern:
```javascript
const overlay = UI.createElement('div', 'modal-overlay');
const sheet = UI.createElement('div', 'modal-sheet');
sheet.innerHTML = `
  <div class="modal-header">
    <span class="modal-title">Title</span>
    <button class="modal-close" id="my-close">&times;</button>
  </div>
  <!-- content -->
`;
overlay.appendChild(sheet);
document.body.appendChild(overlay);
const close = () => overlay.remove();
document.getElementById('my-close').addEventListener('click', close);
overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
```

### Modifying the Processing Prompt

Edit `processing/process-day-prompt.md`. This is the single source of truth for how Claude processes health data. Key sections:
- Input structure (ZIP file layout)
- Corrections system (user overrides)
- Analysis rules (calorie estimation, macros, highlights/concerns)
- Output JSON schema
- Coach chat response format

## Testing

### Static Checks (Fast)
```bash
for f in pwa/scripts/*.js pwa/sw.js; do node --check "$f" 2>&1; done
```

### Playwright Regression Tests
```bash
# Start server in background
cd pwa && python -m http.server 8080 &

# Run tests with screenshots
cd .. && node test-fixtures/run-tests.js --screenshots

# Kill server
kill %1
```

The test runner:
1. Loads the app in headless Chromium
2. Injects 5 days of fake data (entries, analysis, goals, regimen, meal plan)
3. Tests every screen, interaction, modal, and viewport
4. Verifies scoring, entry rendering, analysis status indicators
5. Checks for console errors
6. Saves screenshots to `.claude/test-screenshots/validate/`

### Chaos Tests
```bash
node test-fixtures/chaos.js --rounds 50 --screenshots
```
Adversarial testing: null inputs, type confusion, extreme values, boundary conditions. These caught 43 bugs that code review + happy-path tests missed.

### Updating Test Fixtures

When adding features, update `test-fixtures/data.js` to include test data for the new feature, and add assertions in `test-fixtures/run-tests.js`.

**Critical**: Analysis entries in fixtures MUST have `id` fields matching their corresponding IndexedDB entry IDs. Without matching IDs, inline calorie display and pending/stale indicators silently fail.

## Sync Protocol

The cloud relay is a Cloudflare Worker + R2 bucket. All routes are under `/sync/{key}/`:

| Method | Route | Description |
|--------|-------|-------------|
| PUT | `/sync/{key}/day/{date}` | Upload day ZIP (entries + photos) |
| GET | `/sync/{key}/day/{date}` | Download day ZIP |
| GET | `/sync/{key}/pending` | List unprocessed dates |
| POST | `/sync/{key}/day/{date}/done` | Upload analysis results, mark processed |
| GET | `/sync/{key}/results/new` | List new (unacked) analysis results |
| GET | `/sync/{key}/results/{date}` | Download analysis JSON |
| POST | `/sync/{key}/results/{date}/ack` | Acknowledge receipt of results |
| POST | `/sync/{key}/results/resync` | Re-mark all results as new (reinstall recovery) |

Data is isolated by sync key (UUID). No authentication beyond key possession.

## Coach Plugin Development

The Coach AI persona is a Claude Code plugin at `coach-plugin/`. Key files:
- `agents/coach.md` -- Agent system prompt (personality, session behavior, on-demand references)
- `settings.json` -- Activates coach agent as main thread (`"agent": "coach:coach"`)
- `skills/` -- setup, process-day, feedback
- `coach-rules.md` -- Coaching rules (data, workout, tone)
- `app-guide.md` -- PWA UI reference for the coach
- `coach-sdk.md` -- Auto-generated data contract (run `node coach-plugin/generate-sdk.js` to regenerate)
- `hooks/session-start.sh` -- Detects user state on session start

After changing plugin files, bump the version in `coach-plugin/.claude-plugin/plugin.json`.

## PR Process

1. **Branch from dev**: `git checkout -b feature/your-feature`
2. **Implement**: Follow existing patterns, mobile-first design
3. **Test**: Run `/validate` (syntax + Playwright). Fix any failures.
4. **Review**: Run `/review` before pushing (enforced by pre-push hook)
5. **Push & PR**: Open a pull request with a clear description
6. **No secrets**: Never commit API keys, personal info, photos, health data, webhook URLs

## Common Gotchas

- **Script load order matters.** If module A references module B, B must load first in index.html.
- **Bump sw.js CACHE_NAME** after any script/style change. Otherwise cached versions persist.
- **iOS cache is stubborn.** Users need to close/reopen the app twice after an update (first triggers SW update, second activates it).
- **Body photos are never deleted automatically.** Only meal photos get marked as "processed" and can be cleared.
- **Analysis entries need matching IDs.** The PWA matches analysis entries to IndexedDB entries by `id` field for inline calorie display.
- **dailySummary stores water/weight, not entries store.** Water and weight are per-day summaries, not individual entries (though they appear in the UI as if they are).
- **The relay has no auth beyond the sync key.** Anyone with the key can read/write that user's data. Keys should be treated as secrets.
