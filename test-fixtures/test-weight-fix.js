// test-fixtures/test-weight-fix.js — Verify weight entries are stored independently
const { chromium } = require('playwright');
const { startServer } = require('./test-server');
const { buildFixtures } = require('./data');
const path = require('path');

(async () => {
  const srv = await startServer(path.join(__dirname, '..', 'pwa'), 9039);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  await page.goto('http://localhost:9039', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Inject minimal fixtures
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
    await DB.setProfile('regimen', data.regimen);
  }, fixtures);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const today = fixtures.dates[fixtures.dates.length - 1];
  await page.evaluate((d) => App.goToDate(d), today);
  await page.waitForTimeout(500);

  // Save first weight via QuickLog modal
  await page.evaluate(() => QuickLog.showWeightEntry());
  await page.waitForTimeout(500);
  await page.fill('#qw-weight', '145.2');
  await page.click('#qw-save');
  await page.waitForTimeout(500);

  const count1 = await page.evaluate(async (date) => {
    return (await DB.getEntriesByDate(date)).filter(e => e.type === 'weight').length;
  }, today);
  console.log('Weight entries after first save:', count1);

  // Save second weight
  await page.evaluate(() => QuickLog.showWeightEntry());
  await page.waitForTimeout(500);
  await page.fill('#qw-weight', '144.8');
  await page.click('#qw-save');
  await page.waitForTimeout(500);

  const count2 = await page.evaluate(async (date) => {
    return (await DB.getEntriesByDate(date)).filter(e => e.type === 'weight').length;
  }, today);
  console.log('Weight entries after second save:', count2);

  // Check timeline
  const weightInTimeline = await page.$$eval('.entry-item[data-type="weight"]', els => els.length);
  console.log('Weight entries in timeline:', weightInTimeline);

  const weightTexts = await page.$$eval('.entry-item[data-type="weight"] .entry-notes', els => els.map(e => e.textContent));
  console.log('Weight note texts:', JSON.stringify(weightTexts));

  // Stat card
  const statWeight = await page.evaluate(() => {
    const card = document.querySelector('.stat-card[data-stat-action="weight"]');
    return card ? card.textContent.trim() : '';
  });
  console.log('Stat card:', statWeight);

  await page.screenshot({ path: path.join(__dirname, '..', '.claude', 'test-screenshots', 'weight-fix-verify.png') });

  await browser.close();
  srv.close();

  const pass = count2 === 2 && weightInTimeline === 2;
  console.log('\nRESULT:', pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
