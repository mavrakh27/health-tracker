// test-fixtures/panel-screenshots.js — Visual capture of Today's Fitness and Skincare panels
// Injects fixture data and takes detailed screenshots of each panel at 390x844

const { chromium } = require('playwright');
const { buildFixtures } = require('./data');
const { startServer } = require('./test-server');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', '.claude', 'test-screenshots', 'validate');
const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;

async function injectFixtures(page) {
  const fixtures = buildFixtures();
  await page.evaluate(async (data) => {
    const db = await DB.openDB();

    // Clear all stores first
    for (const storeName of ['entries', 'dailySummary', 'analysis', 'profile', 'mealPlan', 'photos']) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }

    // Insert entries
    for (const entry of data.entries) {
      await DB.addEntry(entry);
    }

    // Insert daily summaries
    for (const summary of data.summaries) {
      await DB.updateDailySummary(summary.date, summary);
    }

    // Insert analyses
    for (const analysis of data.analyses) {
      const tx = db.transaction('analysis', 'readwrite');
      tx.objectStore('analysis').put({ ...analysis, importedAt: Date.now() });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }

    // Insert photos with canvas-generated scene-based blobs
    for (const photo of data.photos) {
      const s = photo.scene;
      const isPortrait = s.type === 'body';
      const canvas = document.createElement('canvas');
      canvas.width = isPortrait ? 300 : 400;
      canvas.height = isPortrait ? 500 : 400;
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;

      ctx.fillStyle = s.bg;
      ctx.fillRect(0, 0, w, h);

      if (s.type === 'plate') {
        ctx.beginPath();
        if (s.shape === 'bowl') {
          ctx.ellipse(w/2, h/2, 120, 100, 0, 0, Math.PI * 2);
        } else if (s.shape === 'triangle') {
          ctx.moveTo(w/2, h/2 - 80);
          ctx.lineTo(w/2 + 90, h/2 + 70);
          ctx.lineTo(w/2 - 90, h/2 + 70);
          ctx.closePath();
        } else {
          ctx.ellipse(w/2, h/2, 140, 130, 0, 0, Math.PI * 2);
        }
        ctx.fillStyle = s.plate;
        ctx.fill();
        const foodColors = [s.food, s.accent];
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          const fx = w/2 + (Math.random() - 0.5) * 160;
          const fy = h/2 + (Math.random() - 0.5) * 120;
          const fr = 8 + Math.random() * 18;
          ctx.arc(fx, fy, fr, 0, Math.PI * 2);
          ctx.fillStyle = foodColors[i % 2];
          ctx.globalAlpha = 0.6 + Math.random() * 0.4;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (s.type === 'body') {
        ctx.fillStyle = s.silhouette;
        ctx.beginPath();
        ctx.arc(w/2, 80, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(w/2, 250, s.pose === 'front' ? 55 : 35, 130, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(w/2 - 30, 370, 22, 110);
        ctx.fillRect(w/2 + 8, 370, 22, 110);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, h - 36, w, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, w/2, h - 18);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      const photoRecord = {
        id: photo.id, entryId: photo.entryId, date: photo.date,
        category: photo.category, syncStatus: photo.syncStatus,
        blob: blob, timestamp: Date.now(),
      };
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(photoRecord);
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }

    await DB.setProfile('goals', data.goals);
    await DB.setProfile('regimen', data.regimen);
    await DB.saveMealPlan(data.mealPlan);

    if (data.skincareProfile) {
      try { await DB.setProfile('skincare', data.skincareProfile); } catch (e) {}
    }

    if (data.skincareLogs) {
      for (const log of data.skincareLogs) {
        try {
          const tx = db.transaction('skincare', 'readwrite');
          tx.objectStore('skincare').put(log);
          await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
        } catch (e) { break; }
      }
    }
  }, fixtures);

  return fixtures;
}

async function scrollAndScreenshot(page, name, scrollAmount) {
  // Scroll the active screen panel
  await page.evaluate((px) => {
    const screen = document.querySelector('.screen.active');
    if (screen) screen.scrollTop = px;
    // Also try the screen-today element directly
    const today = document.getElementById('screen-today');
    if (today && today.classList.contains('active')) today.scrollTop = px;
  }, scrollAmount);
  await page.waitForTimeout(500);
  // Verify scroll happened
  const scrollY = await page.evaluate(() => {
    const screen = document.querySelector('.screen.active');
    return screen ? screen.scrollTop : 0;
  });
  console.log(`  scroll position for ${name}: ${scrollY}px`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
  // Reset scroll after screenshot
  await page.evaluate(() => {
    const screen = document.querySelector('.screen.active');
    if (screen) screen.scrollTop = 0;
  });
}

async function run() {
  const srv = await startServer(path.join(__dirname, '..', 'pwa'), PORT);
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  console.log('Loading app at ' + BASE_URL + '...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('Injecting fixture data...');
  const fixtures = await injectFixtures(page);
  console.log(`  ${fixtures.entries.length} entries, ${fixtures.analyses.length} analyses`);

  console.log('Reloading to activate injected data...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Navigate to Today tab
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(800);

  // ---- DIET PANEL (default) ----
  console.log('\nCapturing Diet panel...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel-diet.png') });
  console.log('  panel-diet.png');

  // Full-page capture catches all content regardless of scroll
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel-diet-full.png'), fullPage: true });
  console.log('  panel-diet-full.png');

  // Scroll down on Diet panel
  await scrollAndScreenshot(page, 'panel-diet-scrolled', 400);
  console.log('  panel-diet-scrolled.png');

  // ---- FITNESS PANEL ----
  console.log('\nCapturing Fitness panel...');
  // Look for the Fitness segment button
  const fitnessBtn = await page.$('.today-seg-btn[data-panel="fitness"]');
  if (!fitnessBtn) {
    console.log('  WARNING: Fitness segment button not found — trying text search');
    const allSegBtns = await page.$$('.today-seg-btn');
    console.log(`  Found ${allSegBtns.length} segment buttons`);
    for (const btn of allSegBtns) {
      const txt = await btn.textContent();
      console.log(`    button: "${txt.trim()}"`);
    }
  } else {
    await fitnessBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel-fitness.png') });
    console.log('  panel-fitness.png');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel-fitness-full.png'), fullPage: true });
    console.log('  panel-fitness-full.png');

    // Scroll fitness panel
    await scrollAndScreenshot(page, 'panel-fitness-scrolled', 400);
    console.log('  panel-fitness-scrolled.png');
  }

  // ---- SKINCARE PANEL ----
  console.log('\nCapturing Skincare panel...');
  const skinBtn = await page.$('.today-seg-btn[data-panel="skin"]');
  if (!skinBtn) {
    console.log('  WARNING: Skin segment button not found — trying text search');
    const allSegBtns = await page.$$('.today-seg-btn');
    console.log(`  Found ${allSegBtns.length} segment buttons`);
    for (const btn of allSegBtns) {
      const txt = await btn.textContent();
      console.log(`    button: "${txt.trim()}"`);
    }
  } else {
    await skinBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel-skincare.png') });
    console.log('  panel-skincare.png');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'panel-skincare-full.png'), fullPage: true });
    console.log('  panel-skincare-full.png');

    // Scroll skincare panel
    await scrollAndScreenshot(page, 'panel-skincare-scrolled', 400);
    console.log('  panel-skincare-scrolled.png');
  }

  // ---- FULL PAGE STATE DIAGNOSTICS ----
  const panelInfo = await page.evaluate(() => {
    const segBtns = Array.from(document.querySelectorAll('.today-seg-btn')).map(b => ({
      panel: b.dataset.panel,
      text: b.textContent.trim(),
      active: b.classList.contains('active'),
    }));
    const panels = ['diet', 'fitness', 'skin'].map(id => {
      const el = document.getElementById(`today-${id}`);
      return { id, exists: !!el, display: el ? el.style.display : 'n/a', classes: el ? el.className : 'n/a' };
    });
    return { segBtns, panels };
  });

  console.log('\nPanel structure:');
  console.log('  Segment buttons:', JSON.stringify(panelInfo.segBtns));
  console.log('  Panel elements:', JSON.stringify(panelInfo.panels));

  if (errors.length > 0) {
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('service-worker') &&
      !e.includes('sw.js') && !e.includes('manifest') &&
      !e.includes('net::ERR') && !e.includes('CloudRelay') &&
      !e.includes('not configured')
    );
    if (realErrors.length > 0) {
      console.log('\nConsole errors detected:');
      realErrors.forEach(e => console.log('  ', e));
    }
  }

  await browser.close();
  srv.close();
  console.log('\nDone. Screenshots saved to:', SCREENSHOT_DIR);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
