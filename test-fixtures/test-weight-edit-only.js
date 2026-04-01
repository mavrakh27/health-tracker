// Quick runner for just the weight edit test
const { chromium } = require('playwright');
const { buildFixtures } = require('./data');
const { startServer } = require('./test-server');
const path = require('path');

let passed = 0, failed = 0, errors = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log('  [PASS] ' + testName);
  } else {
    failed++;
    errors.push(testName);
    console.log('  [FAIL] ' + testName);
  }
}

async function screenshot() {}

(async () => {
  const server = await startServer(path.join(__dirname, '..', 'pwa'), 9039);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:9039');
  await page.waitForSelector('#today-entries', { timeout: 5000 });

  // Inject fixtures
  const fixtures = buildFixtures();
  await page.evaluate(async (data) => {
    const db = await DB.openDB();
    for (const storeName of ['entries', 'dailySummary', 'analysis', 'profile', 'mealPlan', 'photos']) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }
    for (const entry of data.entries) await DB.addEntry(entry);
    for (const summary of data.summaries) await DB.updateDailySummary(summary.date, summary);
    await DB.setProfile('goals', data.goals);
    if (data.regimen) await DB.setProfile('regimen', data.regimen);
  }, fixtures);

  console.log('\n--- Weight Entry Tap-to-Edit ---');

  const testDate = fixtures.dates[0];
  await page.evaluate((d) => App.goToDate(d), testDate);
  await page.waitForTimeout(500);

  // Inject a weight entry
  await page.evaluate(async (date) => {
    const existing = await DB.getEntriesByDate(date);
    for (const e of existing) {
      if (e.type === 'weight') await DB.deleteEntry(e.id);
    }
    const entry = {
      id: 'weight_edit_test_' + Date.now(),
      type: 'weight',
      subtype: null,
      date: date,
      timestamp: new Date(date + 'T07:00:00').toISOString(),
      notes: '145.2 lbs',
      photo: false,
      duration_minutes: null,
      weight_value: 145.2,
      weight_unit: 'lbs',
    };
    await DB.addEntry(entry);
    await DB.updateDailySummary(date, {
      weight: { value: 145.2, unit: 'lbs', timestamp: Date.now() },
    });
    await App.loadDayView();
  }, testDate);
  await page.waitForTimeout(500);

  const weightInTimeline = await page.$('.entry-item[data-type="weight"]');
  assert(!!weightInTimeline, 'Weight entry appears in timeline');

  // Tap entry in timeline
  if (weightInTimeline) {
    await weightInTimeline.click();
    await page.waitForTimeout(500);
    const modal = await page.$('.modal-overlay');
    assert(!!modal, 'Edit modal opens when tapping weight entry in timeline');
    if (modal) {
      const title = await page.$eval('.modal-title', el => el.textContent);
      assert(title.includes('Edit'), 'Modal title says "Edit" (not "Log")');
      const weightInput = await page.$('#edit-weight-value');
      assert(!!weightInput, 'Weight value input shown in edit modal');
      if (weightInput) {
        const val = await weightInput.inputValue();
        assert(val === '145.2', 'Weight value pre-filled correctly: ' + val);
      }
      const closeBtn = await page.$('.modal-close');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(200);
    }
  }

  // KEY TEST: Tap weight stat card when entry exists
  const statCard = await page.$('[data-stat-action="weight"]');
  assert(!!statCard, 'Weight stat card exists');
  if (statCard) {
    await statCard.click();
    await page.waitForTimeout(500);
    const modal = await page.$('.modal-overlay');
    assert(!!modal, 'Modal opens from weight stat card tap');
    if (modal) {
      const title = await page.$eval('.modal-title', el => el.textContent);
      console.log('  Modal title: "' + title + '"');
      assert(title.includes('Edit'), 'Stat card tap opens Edit modal (not Log Weight) when entry exists');
      const closeBtn = await page.$('.modal-close');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(200);
    }
  }

  // Clean up
  await page.evaluate(async (date) => {
    const entries = await DB.getEntriesByDate(date);
    for (const e of entries) {
      if (e.type === 'weight') await DB.deleteEntry(e.id);
    }
  }, testDate);

  await browser.close();
  server.close();

  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
  if (errors.length > 0) {
    console.log('Failed:');
    errors.forEach(e => console.log('  - ' + e));
  }
  process.exit(failed > 0 ? 1 : 0);
})();
