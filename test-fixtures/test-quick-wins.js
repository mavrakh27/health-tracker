// test-quick-wins.js — Edge-case QA for streak counter + calorie ring
// Goal: find bugs, not confirm things work. Expects some failures.
//
// Usage: node test-fixtures/test-quick-wins.js

const { chromium } = require('playwright');
const { startServer } = require('./test-server');
const path = require('path');

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
let errors = [];
let consoleErrors = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    errors.push(testName);
    console.log(`  [FAIL] ${testName}`);
  }
}

// Helper: format date as YYYY-MM-DD in local time
function localDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper: build a date string N days ago from today
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
}

// Helper: clear all IndexedDB stores
async function clearAll(page) {
  await page.evaluate(async () => {
    const db = await DB.openDB();
    for (const storeName of ['entries', 'dailySummary', 'analysis', 'profile', 'mealPlan', 'photos']) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }
  });
}

// Helper: inject entries for specific dates
async function injectMealEntries(page, dates) {
  await page.evaluate(async (dates) => {
    for (const date of dates) {
      const ts = new Date(date + 'T12:00:00').getTime();
      await DB.addEntry({
        id: `meal_${ts}_test`,
        date: date,
        type: 'meal',
        subtype: 'lunch',
        timestamp: ts,
        notes: 'Test meal'
      });
    }
  }, dates);
}

// Helper: inject analysis for a date
async function injectAnalysis(page, date, calories, protein) {
  await page.evaluate(async ({ date, calories, protein }) => {
    const db = await DB.openDB();
    const tx = db.transaction('analysis', 'readwrite');
    tx.objectStore('analysis').put({
      date,
      entries: [],
      totals: { calories, protein, carbs: 0, fat: 0 },
      importedAt: Date.now()
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
  }, { date, calories, protein });
}

// Helper: inject goals
async function injectGoals(page, goals) {
  await page.evaluate(async (goals) => {
    await DB.setProfile('goals', goals);
  }, goals);
}

// Helper: navigate to a specific date and wait for render
async function navigateToDate(page, targetDate) {
  await page.evaluate(async (date) => {
    App.selectedDate = date;
    App.showScreen('today');
    // Wait for async rendering to complete
    await new Promise(r => setTimeout(r, 300));
  }, targetDate);
  await page.waitForTimeout(300);
}

async function run() {
  console.log('\n=== Quick Wins QA: Streak Counter + Calorie Ring ===\n');

  const { server, url, close } = await startServer(path.join(__dirname, '..', 'pwa'), PORT);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ================================================================
  // STREAK COUNTER TESTS
  // ================================================================
  console.log('\n--- Streak Counter ---\n');

  // Test 1: First-ever day, no entries at all -> streak should be 0
  {
    await clearAll(page);
    await navigateToDate(page, daysAgo(0));
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 0, 'Streak is 0 when DB is completely empty');
  }

  // Test 2: Single day with a meal -> streak should be 1 (but badge hidden since < 2)
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectMealEntries(page, [today]);
    await navigateToDate(page, today);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 1, 'Streak is 1 with single day meal entry');
    const badge = await page.$('.streak-badge');
    assert(badge === null, 'No streak badge shown when streak is 1');
  }

  // Test 3: Two consecutive days -> streak should be 2 and badge visible
  {
    await clearAll(page);
    const today = daysAgo(0);
    const yesterday = daysAgo(1);
    await injectMealEntries(page, [today, yesterday]);
    await navigateToDate(page, today);
    // Need score to render to get the badge
    await injectGoals(page, { calories: 2000, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 500, 20);
    await navigateToDate(page, today);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 2, 'Streak is 2 with two consecutive days');
    const badge = await page.$('.streak-badge');
    assert(badge !== null, 'Streak badge visible when streak >= 2');
    if (badge) {
      const text = await badge.textContent();
      assert(text.includes('2 day streak'), `Badge says "2 day streak" (got: "${text}")`);
    }
  }

  // Test 4: Gap in the middle breaks the streak
  {
    await clearAll(page);
    const today = daysAgo(0);
    const twoDaysAgo = daysAgo(2); // skip yesterday
    await injectMealEntries(page, [today, twoDaysAgo]);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 1, 'Gap of 1 day breaks the streak (should be 1, not 2)');
  }

  // Test 5: Day with ONLY non-meal entries (workout, supplement, water) -> not counted
  {
    await clearAll(page);
    const today = daysAgo(0);
    const yesterday = daysAgo(1);
    // Today has a meal
    await injectMealEntries(page, [today]);
    // Yesterday has only a workout entry (no meals)
    await page.evaluate(async (date) => {
      const ts = new Date(date + 'T10:00:00').getTime();
      await DB.addEntry({
        id: `workout_${ts}_test`,
        date: date,
        type: 'workout',
        subtype: 'cardio',
        timestamp: ts,
        notes: 'Morning jog'
      });
    }, yesterday);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 1, 'Day with only workout entries does not count toward streak');
  }

  // Test 6: Streak viewed from a PAST date (not today) — walking backward from that date
  {
    await clearAll(page);
    const threeDaysAgo = daysAgo(3);
    const fourDaysAgo = daysAgo(4);
    const fiveDaysAgo = daysAgo(5);
    await injectMealEntries(page, [threeDaysAgo, fourDaysAgo, fiveDaysAgo]);
    // Navigate to 3 days ago
    await navigateToDate(page, threeDaysAgo);
    const streak = await page.evaluate(async (date) => {
      return DayScore.calculateStreak(date);
    }, threeDaysAgo);
    assert(streak === 3, `Streak from past date counts correctly (expected 3, got ${streak})`);
  }

  // Test 7: Today has NO entries, yesterday does -> streak starts from yesterday
  {
    await clearAll(page);
    const today = daysAgo(0);
    const yesterday = daysAgo(1);
    const twoDaysAgo = daysAgo(2);
    await injectMealEntries(page, [yesterday, twoDaysAgo]);
    await navigateToDate(page, today);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 2, `When today is empty, streak starts from yesterday (expected 2, got ${streak})`);
  }

  // Test 8: Very long streak (30 days) — performance/correctness
  {
    await clearAll(page);
    const dates = [];
    for (let i = 0; i < 30; i++) {
      dates.push(daysAgo(i));
    }
    await injectMealEntries(page, dates);
    const today = daysAgo(0);
    await navigateToDate(page, today);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 30, `30-day streak counted correctly (got ${streak})`);
  }

  // Test 9: Streak on a date with entries but none are meals (e.g. only drinks)
  {
    await clearAll(page);
    const today = daysAgo(0);
    await page.evaluate(async (date) => {
      const ts = new Date(date + 'T14:00:00').getTime();
      await DB.addEntry({
        id: `drink_${ts}_test`,
        date: date,
        type: 'drink',
        timestamp: ts,
        notes: 'Just a soda'
      });
    }, today);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 0, 'Day with only drink entries gives streak 0');
  }

  // ================================================================
  // CALORIE RING TESTS
  // ================================================================
  console.log('\n--- Calorie Ring ---\n');

  // Test 10: No goals set, no analysis -> fallback UI shown
  {
    await clearAll(page);
    const today = daysAgo(0);
    await navigateToDate(page, today);
    const ringCard = await page.$('.calorie-ring-card');
    assert(ringCard !== null, 'Calorie ring card exists even with no data');
    if (ringCard) {
      const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
      assert(centerText === '--', `Fallback shows "--" when no analysis (got: "${centerText}")`);
    }
  }

  // Test 11: Analysis with 0 calories -> ring should show 0, not fallback
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 0, 0);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    // analysis.totals.calories is 0, which is != null, so calEaten = 0
    // But ratio = 0/1200 = 0, ring should show "0"
    assert(centerText === '0', `Ring shows "0" when calories are 0 (got: "${centerText}")`);
  }

  // Test 12: Calories exactly at target -> green ring, full circle
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 1200, 100);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    assert(centerText === '1200', `Ring shows exact calorie count at target (got: "${centerText}")`);
    // Should be green (not over)
    const color = await page.$eval('.calorie-ring-center', el => el.style.color);
    assert(color.includes('green') || color === 'var(--accent-green)', `At-target ring is green (got: "${color}")`);
  }

  // Test 13: Calories WAY over target (3x) -> red ring, but visually capped at 100%
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 3600, 50);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    assert(centerText === '3600', `Ring shows actual calories even when 3x over (got: "${centerText}")`);
    // Color should be red (over target)
    const color = await page.$eval('.calorie-ring-center', el => el.style.color);
    assert(color.includes('red') || color === 'var(--accent-red)', `Over-target ring is red (got: "${color}")`);
    // The fill circle's dashoffset should be 0 (fully filled) since ratio is capped at 1
    const dashOffset = await page.$eval('.calorie-ring-fill', el => {
      return parseFloat(el.getAttribute('stroke-dashoffset'));
    });
    assert(dashOffset === 0, `Ring fill is capped at 100% when over target (dashoffset: ${dashOffset})`);
  }

  // Test 14: Goals not set (defaults to 1200) -> ring uses default target
  {
    await clearAll(page);
    const today = daysAgo(0);
    // No goals injected — should fall back to 1200
    await injectAnalysis(page, today, 800, 50);
    await navigateToDate(page, today);
    const label = await page.$eval('.calorie-ring-card .stat-label', el => el.textContent.trim());
    assert(label.includes('1200'), `Default calorie target is 1200 when no goals set (got: "${label}")`);
  }

  // Test 15: Goals with nested structure (moderate.calories.daily vs flat)
  {
    await clearAll(page);
    const today = daysAgo(0);
    // Real goals format from data.js — flat calories key
    await injectGoals(page, {
      calories: 1500,
      protein: 120,
      water_oz: 64,
      hardcore: { calories: 1000, protein: 130, water_oz: 64 }
    });
    await injectAnalysis(page, today, 1000, 80);
    await navigateToDate(page, today);
    const label = await page.$eval('.calorie-ring-card .stat-label', el => el.textContent.trim());
    assert(label.includes('1500'), `Ring uses moderate calories goal (got: "${label}")`);
  }

  // Test 16: Calorie ring at 320px viewport — check for overflow/clipping
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 800, 60);

    // Resize to 320px
    await page.setViewportSize({ width: 320, height: 568 });
    await navigateToDate(page, today);

    // Check that the ring card is fully visible (not clipped)
    const ringBox = await page.$eval('.calorie-ring-card', el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, top: rect.top, bottom: rect.bottom };
    });
    assert(ringBox.left >= 0, `Calorie ring not clipped on left at 320px (left: ${ringBox.left})`);
    assert(ringBox.right <= 320, `Calorie ring not clipped on right at 320px (right: ${ringBox.right})`);

    // Check center text is readable (not truncated/overlapping)
    const centerBox = await page.$eval('.calorie-ring-center', el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert(centerBox.width > 0 && centerBox.height > 0, 'Calorie ring center text has dimensions at 320px');

    // Check that large calorie numbers fit in the ring at narrow viewport
    await injectAnalysis(page, today, 9999, 60);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    assert(centerText === '9999', `4-digit calories display at 320px (got: "${centerText}")`);

    // Verify the number doesn't overflow the SVG ring
    const svgBox = await page.$eval('.calorie-ring-svg', el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    const textBox = await page.$eval('.calorie-ring-center', el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    assert(
      textBox.left >= svgBox.left - 2 && textBox.right <= svgBox.right + 2,
      `Calorie text (${textBox.width}px) fits within ring SVG (${svgBox.width}px) at 320px`
    );

    // Reset viewport
    await page.setViewportSize({ width: 390, height: 844 });
  }

  // Test 17: Analysis exists but totals is missing/null
  {
    await clearAll(page);
    const today = daysAgo(0);
    await page.evaluate(async (date) => {
      const db = await DB.openDB();
      const tx = db.transaction('analysis', 'readwrite');
      tx.objectStore('analysis').put({
        date,
        entries: [],
        // totals is missing entirely
        importedAt: Date.now()
      });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }, today);
    await navigateToDate(page, today);
    // Should show fallback since totals.calories is undefined
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    assert(centerText === '--', `Missing totals shows fallback (got: "${centerText}")`);
  }

  // Test 18: Analysis exists but totals.calories is null
  {
    await clearAll(page);
    const today = daysAgo(0);
    await page.evaluate(async (date) => {
      const db = await DB.openDB();
      const tx = db.transaction('analysis', 'readwrite');
      tx.objectStore('analysis').put({
        date,
        entries: [],
        totals: { calories: null, protein: null },
        importedAt: Date.now()
      });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }, today);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    assert(centerText === '--', `Null calories in totals shows fallback (got: "${centerText}")`);
  }

  // Test 19: Calorie ring with 0 calorie target (division by zero)
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 0, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 500, 50);
    await navigateToDate(page, today);
    // calories: 0 in goals -> calTarget = goals.calories || 1200 -> 1200 (falsy fallback)
    // But what if someone explicitly sets 0? The || operator treats 0 as falsy.
    // This is arguably a bug if the intent was "no calorie goal"
    const label = await page.$eval('.calorie-ring-card .stat-label', el => el.textContent.trim());
    // The || 1200 fallback means 0 calories goal is impossible to set
    assert(label.includes('1200'), `Zero calorie goal falls back to 1200 (got: "${label}")`);
    // Check no JS errors from division
    const jsErrors = consoleErrors.filter(e => e.includes('NaN') || e.includes('Infinity'));
    assert(jsErrors.length === 0, 'No NaN/Infinity errors with 0 calorie target');
  }

  // Test 20: Streak badge + calorie ring together — combined rendering
  {
    await clearAll(page);
    const today = daysAgo(0);
    const yesterday = daysAgo(1);
    const twoDaysAgo = daysAgo(2);
    await injectMealEntries(page, [today, yesterday, twoDaysAgo]);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 850, 70);
    await navigateToDate(page, today);

    // Both should be present
    const badge = await page.$('.streak-badge');
    const ring = await page.$('.calorie-ring-card');
    assert(badge !== null, 'Streak badge renders alongside calorie ring');
    assert(ring !== null, 'Calorie ring renders alongside streak badge');
    if (badge) {
      const text = await badge.textContent();
      assert(text.includes('3 day streak'), `Badge shows 3-day streak (got: "${text}")`);
    }
  }

  // Test 21: Negative calorie count (edge case from analysis bug)
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, -100, 0);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    // -100 is != null, so calEaten = -100, ratio = Math.min(-100/1200, 1) = negative
    // offset = circumference - (negative * circumference) = circumference + something = larger than circumference
    // This could cause a visual glitch
    assert(centerText === '-100', `Negative calories shown as-is (got: "${centerText}")`);
    const dashOffset = await page.$eval('.calorie-ring-fill', el => {
      return parseFloat(el.getAttribute('stroke-dashoffset'));
    });
    const circumference = 2 * Math.PI * 18;
    assert(dashOffset <= circumference, `Ring dashoffset doesn't exceed circumference with negative cal (offset: ${dashOffset.toFixed(1)}, circ: ${circumference.toFixed(1)})`);
  }

  // Test 22: Streak counter when viewing "today" but today has only non-meal,
  // and yesterday+day-before have meals -> streak should be 2 (starts from yesterday)
  {
    await clearAll(page);
    const today = daysAgo(0);
    const yesterday = daysAgo(1);
    const twoDaysAgo = daysAgo(2);
    // Today: only a supplement
    await page.evaluate(async (date) => {
      const ts = new Date(date + 'T08:00:00').getTime();
      await DB.addEntry({
        id: `supplement_${ts}_test`,
        date: date,
        type: 'supplement',
        timestamp: ts,
        notes: 'Vitamins'
      });
    }, today);
    await injectMealEntries(page, [yesterday, twoDaysAgo]);
    await navigateToDate(page, today);
    const streak = await page.evaluate(async () => {
      return DayScore.calculateStreak(App.selectedDate);
    });
    assert(streak === 2, `Today with only supplements, yesterday+day-before with meals -> streak 2 (got: ${streak})`);
  }

  // Test 23: Streak from a future date with no entries
  {
    await clearAll(page);
    const today = daysAgo(0);
    const tomorrow = localDate(new Date(new Date().setDate(new Date().getDate() + 1)));
    await injectMealEntries(page, [today]);
    // Navigate to tomorrow — no entries there
    const streak = await page.evaluate(async (date) => {
      return DayScore.calculateStreak(date);
    }, tomorrow);
    // Tomorrow has no meals, so it should start from "yesterday" of tomorrow = today
    assert(streak === 1, `Streak from future date with no entries falls back to today (got: ${streak})`);
  }

  // Test 25: Calorie ring with fractional calories (e.g. 1200.5)
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 1200.5, 80);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    // 1200.5 displayed as-is — is this desired? Most users expect whole numbers.
    const isWholeNumber = !centerText.includes('.');
    assert(isWholeNumber, `Fractional calories should be rounded for display (got: "${centerText}")`);
  }

  // Test 26: Calorie ring color when calories == 0 and target is 1200
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 0, 0);
    await navigateToDate(page, today);
    // calEaten=0, calTarget=1200, over = 0 > 1200 = false, so green
    // But 0 calories eaten showing as "green" is misleading — you haven't eaten!
    const color = await page.$eval('.calorie-ring-center', el => el.style.color);
    // This is arguably a UX bug: green implies "on track" but 0 cal means you haven't eaten
    assert(
      color.includes('green') || color === 'var(--accent-green)',
      `0 calories shows green (under target) — potential UX issue (got: "${color}")`
    );
  }

  // Test 27: Calorie ring with very large number (10000+) — text overflow?
  {
    await clearAll(page);
    const today = daysAgo(0);
    await injectGoals(page, { calories: 1200, protein: 100, water_oz: 64 });
    await injectAnalysis(page, today, 12345, 200);
    await navigateToDate(page, today);
    const centerText = await page.$eval('.calorie-ring-center', el => el.textContent.trim());
    assert(centerText === '12345', `5-digit calories display (got: "${centerText}")`);
    // At 390px viewport, check it fits
    const svgBox = await page.$eval('.calorie-ring-svg', el => el.getBoundingClientRect());
    const textBox = await page.$eval('.calorie-ring-center', el => el.getBoundingClientRect());
    assert(
      textBox.width <= svgBox.width + 10, // small tolerance
      `5-digit calorie text (${textBox.width.toFixed(0)}px) reasonably fits in ring (${svgBox.width.toFixed(0)}px)`
    );
  }

  // ================================================================
  // RESULTS
  // ================================================================

  console.log('\n--- Console Errors ---');
  if (consoleErrors.length === 0) {
    console.log('  (none)');
  } else {
    for (const err of consoleErrors) {
      console.log(`  ! ${err}`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (errors.length > 0) {
    console.log('Failures:');
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
    console.log('');
  }

  await browser.close();
  close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
