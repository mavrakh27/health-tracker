# /validate — Health Tracker

End-to-end verification that the PWA works correctly. Runs static checks, then Playwright tests with injected fake data for regression coverage.

## Quick Run

```bash
cd C:\Users\emily\projects\health-tracker

# Phase 1: Static checks (fast, no browser)
for f in pwa/scripts/*.js pwa/sw.js; do node --check "$f" 2>&1; done

# Phase 2: Start server, run Playwright tests with fake data
cd pwa && python -m http.server 8080 &
cd .. && node test-fixtures/run-tests.js --screenshots
# Kill server after
```

## Phase 1 — Static Checks

1. **JS syntax**: `node --check` on all scripts and sw.js
2. **File integrity**: Verify all files referenced in index.html, manifest.json, and sw.js exist
3. **Manifest validation**: start_url resolves correctly, scope is consistent, paths use `/health-tracker/`
4. **Service worker**: sw.js cache list references existing files

## Phase 2 — Playwright Regression Tests

The test runner (`test-fixtures/run-tests.js`) does:

1. **Loads app** in headless Chromium, captures console errors
2. **Injects fake data** — 5 days of entries, analyses, goals, regimen, meal plan (from `test-fixtures/data.js`)
3. **Tests every screen**:
   - Today: score ring, entry list, quick actions, coach input, + Add Entry
   - Plan: meal plan rendering (not empty state)
   - Progress: timeline, sparkline, calendar heatmap, averages, streaks, fitness goals
   - Profile: daily targets, goal setup modal, cloud sync, backup, storage, danger button
4. **Tests interactions**:
   - Water picker modal open/close
   - Supplement modal open/close
   - Goal setup modal (labels, pre-filled values)
   - Entry tap-to-edit modal
   - Date navigation between fixture days
5. **Verifies scoring**:
   - Full day scores higher than minimal day
   - Vice day gets penalty
   - Rest day shows "Rest" chip
   - Score numbers are valid (0-100)
6. **Verifies entry types**: Food, Workout, Supplement labels render correctly
7. **Multi-viewport**: 320px, 390px, 768px — no horizontal overflow, nav visible
8. **Verifies analysis status**: Entry cards show inline calories when analysis IDs match, "Pending analysis" when unmatched
9. **Console errors**: Flags any JS errors (ignoring favicon/SW noise)

Pass `--screenshots` to save screenshots to `.claude/test-screenshots/validate/`.

## Test Data

`test-fixtures/data.js` builds 5 days of fixture data (dates are relative to today):

| Day | Offset | Content | Expected Score |
|-----|--------|---------|---------------|
| 1 | -4 | Full: 3 meals, workout, supplements, water met | High |
| 2 | -3 | Partial: 2 meals, missed workout | Medium |
| 3 | -2 | Rest day, 3 meals, water met | High |
| 4 | -1 | Minimal: 1 drink | Low |
| 5 | 0 | Vices: 2 meals + 3 drinks | Penalized |

Plus: goals (1200/1000 cal), weekly regimen, meal plan, fitness goals, streaks.

## When to Run

- After any code changes to scripts, HTML, or CSS
- Before committing/pushing
- After dependency or data model changes
- When adding new entry types or UI components

## Updating Fixtures

When adding new features, update `test-fixtures/data.js` to include test cases for the new feature, and add assertions in `test-fixtures/run-tests.js`. The fixtures should grow as the app grows.

**Critical:** Analysis entries in fixtures MUST have `id` fields matching their corresponding IndexedDB entry IDs. Without matching IDs, analysis-status features (inline calories, pending/stale indicators) won't render — they'll silently fail with no errors. Always visually verify screenshots after changes to entry rendering.

## Post-Deploy Smoke Test

After pushing, verify the deployed site loads:
```bash
curl -s -o /dev/null -w "%{http_code}" https://nemily.github.io/health-tracker/
# Should return 200
```
