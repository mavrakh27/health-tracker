// Screenshot the fixed weight edit flow
const { chromium } = require('playwright');
const { buildFixtures } = require('./data');
const { startServer } = require('./test-server');
const path = require('path');

(async () => {
  const server = await startServer(path.join(__dirname, '..', 'pwa'), 9040);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto('http://localhost:9040');
  await page.waitForSelector('#today-entries', { timeout: 5000 });

  const fixtures = buildFixtures();
  const day1 = fixtures.dates[0];
  console.log('Day1:', day1);

  await page.evaluate(async (data) => {
    const db = await DB.openDB();
    for (const storeName of ['entries', 'dailySummary', 'analysis', 'profile', 'mealPlan', 'photos']) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }
    for (const entry of data.fixtures.entries) await DB.addEntry(entry);
    for (const summary of data.fixtures.summaries) await DB.updateDailySummary(summary.date, summary);
    await DB.setProfile('goals', data.fixtures.goals);

    // Add weight entry on day1
    const entry = {
      id: 'weight_screenshot_test',
      type: 'weight',
      subtype: null,
      date: data.day1,
      timestamp: new Date(data.day1 + 'T07:00:00').toISOString(),
      notes: '145.2 lbs',
      photo: false,
      duration_minutes: null,
      weight_value: 145.2,
      weight_unit: 'lbs',
    };
    await DB.addEntry(entry);
    await DB.updateDailySummary(data.day1, {
      weight: { value: 145.2, unit: 'lbs', timestamp: Date.now() },
    });
  }, { fixtures, day1 });

  // Navigate to day1 AFTER data injection (separate evaluate)
  await page.evaluate((d) => App.goToDate(d), day1);
  await page.waitForTimeout(1000);

  // Check that entries include the weight entry
  const entries = await page.evaluate(async (date) => {
    const e = await DB.getEntriesByDate(date);
    return e.map(x => ({ id: x.id, type: x.type }));
  }, day1);
  console.log('Entries for day:', JSON.stringify(entries));

  const ssDir = path.join(__dirname, '..', '.claude', 'test-screenshots');

  // Screenshot 1: Weight entry visible in timeline
  await page.screenshot({ path: path.join(ssDir, 'weight-fix-timeline.png'), fullPage: true });

  // Tap weight stat card
  const statCard = await page.$('[data-stat-action="weight"]');
  if (statCard) {
    await statCard.click();
    await page.waitForTimeout(500);
    const title = await page.$eval('.modal-title', el => el.textContent).catch(() => 'no modal');
    console.log('Stat card tap modal title:', title);
    await page.screenshot({ path: path.join(ssDir, 'weight-fix-edit-modal.png'), fullPage: true });
  }

  await browser.close();
  server.close();
  console.log('Done');
})();
