# /validate — Health Tracker

End-to-end verification that the PWA works correctly. Four phases: static checks, Playwright data injection tests, interactive dogfood loop, and chaos testing.

## Quick Run

```bash
cd C:\Users\emily\projects\health-tracker

# Phase 1: Static checks (fast, no browser)
for f in pwa/scripts/*.js pwa/sw.js; do node --check "$f" 2>&1; done

# Phase 2: Start server, run Playwright tests with fake data
cd pwa && python -m http.server 8080 &
cd .. && node test-fixtures/run-tests.js --screenshots
# Kill server after

# Phase 2 + Phase 3: Full validation including interactive dogfood
cd pwa && python -m http.server 8080 &
cd .. && node test-fixtures/run-tests.js --screenshots --dogfood
# Kill server after

# Phase 4: Chaos testing (random user actions, invariant checks)
cd pwa && python -m http.server 8080 &
cd .. && node test-fixtures/chaos.js --rounds 50 --screenshots
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

## Phase 3 — Interactive Dogfood Loop

Pass `--dogfood` to run the full interactive E2E flow after Phase 2. This tests the app like a real user — pressing every button, filling fields, uploading photos, and screenshotting every state change.

The dogfood runner (`test-fixtures/dogfood.js`) does:

1. **Fresh start** — clears all IndexedDB data, verifies empty/welcome state
2. **Onboarding** — sets goals (1200 cal, 105g protein, 64oz water), verifies they persist
3. **Log food** — opens + Add Entry -> Food, enters notes "Test chicken salad", saves, verifies entry appears
4. **Log water** — opens water picker, selects amount, verifies total updates
5. **Log weight** — opens weight entry, enters 145, saves
6. **Log dailies** — opens dailies modal, checks for empty state or items
7. **Edit entry** — taps entry, unlocks, changes notes, saves, verifies updated text
8. **Delete entry** — taps entry, unlocks, deletes, verifies count decreases
9. **Navigate dates** — taps prev/next arrows, verifies date changes
10. **Plan tab** — navigates, screenshots empty state or content
11. **Progress tab** — navigates, verifies calendar renders
12. **Profile tab** — verifies Daily Targets, Cloud Sync card, Sync Now, storage info
13. **Goal setup modal** — edits goals to 1500, verifies card updates, restores to 1200
14. **Cloud Sync setup** — opens sync setup modal, verifies URL/Key fields
15. **Water picker detailed** — tries multiple water amounts, verifies totals accumulate
16. **Photo upload** — uses file chooser interception to upload a canvas-generated test image
17. **Multi-viewport** — runs on 320px and 390px viewports, checks overflow and touch targets on every tab

Screenshots saved to `.claude/test-screenshots/dogfood/` with sequential numbering (e.g. `dogfood-01-fresh-start.png`).

Can also run standalone: `node test-fixtures/dogfood.js`

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
- **Before pushing — never push without running tests first.** CSS layout changes (overflow, position, height) can silently break scrolling or hide content. The scroll behavior test catches these.
- After dependency or data model changes
- When adding new entry types or UI components
- Use `--dogfood` for comprehensive E2E verification before releases or major refactors

## Updating Fixtures

When adding new features, update `test-fixtures/data.js` to include test cases for the new feature, and add assertions in `test-fixtures/run-tests.js`. The fixtures should grow as the app grows.

**Critical:** Analysis entries in fixtures MUST have `id` fields matching their corresponding IndexedDB entry IDs. Without matching IDs, analysis-status features (inline calories, pending/stale indicators) won't render — they'll silently fail with no errors. Always visually verify screenshots after changes to entry rendering.

## Visual UX Review

After Playwright tests pass, take screenshots and review them for:

- **Layout alignment**: Centering, spacing, overflow — score cards centered, no left-aligned content that should be centered
- **Theme consistency**: All elements match dark theme — no white/unstyled buttons, no default browser styling bleeding through
- **Touch target sizes**: Minimum 44px on mobile — buttons, links, interactive elements all large enough to tap
- **Text readability**: Contrast ratios meet WCAG AA, font sizes appropriate for mobile, no truncated text
- **Empty states**: Graceful handling — no "undefined", "NaN", "?g", or placeholder text leaking through
- **Modal styling**: Consistent across all modals — close button, padding, border radius, backdrop

Review the screenshots in `.claude/test-screenshots/validate/` — especially:
- `today-default.png` — score centering, entry layout, quick actions
- `plan-with-data.png` — meal plan calories, Save Notes button styling
- `profile-default.png` — all cards styled consistently
- `viewport-iPhone-SE.png` — smallest viewport, check for overflow

And in `.claude/test-screenshots/dogfood/` — especially:
- `dogfood-01-fresh-start.png` — empty state appearance
- `dogfood-*-food-logged.png` — entry creation flow
- `dogfood-*-edit-modal-*.png` — edit flow
- `dogfood-*-viewport-*.png` — multi-viewport screenshots

## Phase 4 — Chaos Testing

The chaos runner (`test-fixtures/chaos.js`) simulates unpredictable user behavior — random clicks in random order, with invariant checks after every action.

**Actions pool** (weighted random):
- Navigation: tab switches, day arrows, double-taps
- Quick actions: water, dailies, more sheet
- Stat card taps: water, workout, weight
- Modal interactions: open, close, select options
- Fitness: toggle exercise checks, expand info
- **Interrupt scenarios** (high weight): open form → immediately navigate, open modal → switch tabs

**Invariants checked after every action:**
- No horizontal overflow (`body.scrollWidth <= viewport`)
- Max 1 modal overlay (no stacked modals)
- No stale inline forms (tracks which date form was opened on — flags if date changes while form stays visible)
- Exactly 4 visible nav buttons
- Exactly 1 active screen
- No unhandled JS errors

Run: `node test-fixtures/chaos.js --rounds 50 --screenshots`

### Validating Chaos Tests

**When adding new invariants or actions, always verify against a known bug.** A chaos test that passes on both buggy and fixed code is worthless. To verify:
1. Temporarily revert the fix (swap in old file)
2. Run chaos — it MUST catch the bug
3. Restore the fix — chaos MUST pass
4. Only then commit the test

This was learned the hard way: the original stale-form invariant checked "form visible on non-today screen" but the real bug was "form opened on date A, visible on date B" — both on the Today screen. The test passed on buggy code for 50 rounds until the invariant was corrected to track the form's originating date.

## Post-Deploy Smoke Test

After pushing, verify the deployed site loads:
```bash
curl -s -o /dev/null -w "%{http_code}" https://nemily.github.io/health-tracker/
# Should return 200
```
