# /bug-hunt — Full Interactive UI Review

Comprehensive bug hunt using parallel agents. Each agent runs its own dev server on a unique port and interacts with every feature.

## Usage

```
/bug-hunt
```

## How It Works

1. **Launch 4+ agents in parallel**, each on its own port (9001-9006) to avoid server conflicts
2. Each agent starts its own server, injects test data, and interacts with every button/form/modal
3. Results are compiled into `.claude/notes/bug-hunt-{date}.md`
4. Also run chaos testing (`node test-fixtures/chaos.js --rounds 50`)

## Critical Rules (learned from experience)

### Server isolation
- **Every agent MUST use its own port** (9001, 9002, 9003, etc.)
- Never use port 8080 — that's the user's dev server
- Each agent starts its own server in its Playwright script:
  ```js
  const { spawn } = require('child_process');
  const port = 900X; // unique per agent
  const server = spawn('python', ['-m', 'http.server', String(port)],
    { cwd: 'C:/Users/emily/projects/health-tracker/pwa', stdio: 'ignore', detached: true });
  server.unref();
  await new Promise(r => setTimeout(r, 2000));
  ```
- Kill the server when done

### Interactive testing > code review
- **Bugs are found by clicking, not reading.** Static code analysis finds styling issues but misses real interaction bugs (stale overlays, forms not closing, data not persisting).
- Every agent must use Playwright to actually click buttons, fill forms, save entries, navigate, and verify results.
- Screenshot BEFORE and AFTER every interaction.

### What to test
Divide these across agents — one focus area per agent:

**Agent 1 — Entry flows (port 9001):**
- Log each entry type: Food, Workout, Water, Weight, Alcohol, Body Photo, Dailies
- Use "Save & Log Another" button
- Verify entries appear with correct type, time, notes
- Check photo thumbnails render
- Check no stale overlays after save

**Agent 2 — Edit/delete flows (port 9002):**
- Tap entry to open edit modal
- Change notes, save, verify update
- Change date, save, verify entry moved to new date
- Delete entry, verify gone
- Test edge cases: empty notes, future date, very long notes

**Agent 3 — Navigation + settings (port 9003):**
- Navigate dates with arrows (prev/next)
- Check all tabs render (Today, Coach, Progress, Settings)
- Change Day Starts At, verify persistence across reload
- Test goal editing modal
- Test cloud sync setup modal

**Agent 4 — Dailies manager (port 9004):**
- Add items with text only, photo only, text + nutrition
- Remove items, re-add same name
- Long text overflow
- Check items persist after modal close/reopen
- Select and log dailies, verify entries appear

**Agent 5 — Onboarding gate (port 9005):**
- Fresh state (clear all data)
- Can user bypass setup? Test every quick action and tab
- Setup modal dismiss methods (X, overlay, escape)
- Welcome card reappears after water logging?
- ?key= URL param flow

**Agent 6 — Chaos testing (no server needed):**
- `node test-fixtures/chaos.js --rounds 50 --screenshots`
- Reports invariant violations

### Test data injection
Always inject via `page.evaluate`:
```js
await page.evaluate(async () => {
  await DB.addEntry({ id:'t1', type:'meal', date:'2026-03-23', timestamp: new Date().toISOString(), notes:'Test', photo:false });
  await DB.setProfile('goals', { calories: 1200, protein: 105, water_oz: 64 });
});
await page.reload({ waitUntil: 'networkidle' });
```

### Reporting
Each agent reports:
- Test performed (what was clicked/filled/saved)
- Expected behavior
- Actual behavior
- Screenshot paths
- Bug or PASS

### After agents complete
1. Compile all findings into `.claude/notes/bug-hunt-{date}.md`
2. Categorize: Critical / Medium / Minor
3. For each bug, note file:line if identifiable
4. Ask user which bugs to fix

## All agents use Opus model
