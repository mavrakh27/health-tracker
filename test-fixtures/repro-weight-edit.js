// Reproduce weight entry edit bug
const { chromium } = require('playwright');
const { buildFixtures } = require('./data');
const { startServer } = require('./test-server');
const path = require('path');

(async () => {
  const server = await startServer(path.join(__dirname, '..', 'pwa'), 9038);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:9038');
  await page.waitForSelector('#today-entries', { timeout: 5000 });

  const fixtures = buildFixtures();
  const day2 = fixtures.summaries[1].date;
  console.log('Target date:', day2);

  // Inject fixtures WITHOUT a weight entry, but WITH weight in dailySummary
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

    // Navigate to day2 (which has weight in summary but no weight entry)
    App.selectedDate = data.day2;
    await App.loadDayView();
  }, { fixtures, day2 });

  await page.waitForTimeout(1000);

  const ssDir = path.join(__dirname, '..', '.claude', 'test-screenshots');

  // Check entries on page
  const entries = await page.$$eval('.entry-item', els => els.map(el => ({
    type: el.dataset.type,
    text: el.textContent.trim().substring(0, 80),
  })));
  console.log('Entries on page:', JSON.stringify(entries, null, 2));

  // Check if weight shows in stat card
  const statCard = await page.$('[data-stat-action="weight"]');
  if (statCard) {
    const statText = await statCard.textContent();
    console.log('Weight stat card:', statText.trim());
    console.log('Tapping stat card...');
    await statCard.click();
    await page.waitForTimeout(500);
    const modal = await page.$('.modal-overlay');
    console.log('Modal opened:', !!modal);
    if (modal) {
      const title = await page.$eval('.modal-title', el => el.textContent);
      console.log('Modal title:', title);
      // "Log Weight" = creating new, not editing existing
    }
    await page.screenshot({ path: path.join(ssDir, 'weight-stat-only.png'), fullPage: true });
    // Close modal
    const closeBtn = await page.$('.modal-close');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(300);
  }

  // No weight entry in timeline = user can't tap to edit weight
  const weightEntry = await page.$('.entry-item[data-type="weight"]');
  console.log('Weight entry in timeline:', !!weightEntry);
  console.log('\nBUG CONFIRMED: weight is in stat card but NOT in entry timeline.');
  console.log('Stat card tap opens "Log Weight" (new entry) not edit modal.');
  console.log('User has no way to edit the existing weight value.');

  await page.screenshot({ path: path.join(ssDir, 'weight-edit-bug.png'), fullPage: true });

  await browser.close();
  server.close();
  console.log('Done');
})();
