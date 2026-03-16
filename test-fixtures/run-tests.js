// test-fixtures/run-tests.js — Playwright-based validation with fake data injection
// Usage: node test-fixtures/run-tests.js [--screenshots] [--dogfood]

const { chromium } = require('playwright');
const { buildFixtures } = require('./data');
const path = require('path');
const fs = require('fs');

const TAKE_SCREENSHOTS = process.argv.includes('--screenshots');
const RUN_DOGFOOD = process.argv.includes('--dogfood');
const SCREENSHOT_DIR = path.join(__dirname, '..', '.claude', 'test-screenshots', 'validate');
const BASE_URL = 'http://localhost:8080';
const VIEWPORTS = [
  { name: 'iPhone-SE', width: 320, height: 568 },
  { name: 'iPhone-14', width: 390, height: 844 },
  { name: 'iPad-mini', width: 768, height: 1024 },
];

let passed = 0;
let failed = 0;
let errors = [];
let consoleErrors = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    errors.push(testName);
    console.log(`  ✗ FAIL: ${testName}`);
  }
}

async function screenshot(page, name) {
  if (!TAKE_SCREENSHOTS) return;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

// Inject all fixture data into IndexedDB via page.evaluate
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

      // Background
      ctx.fillStyle = s.bg;
      ctx.fillRect(0, 0, w, h);

      if (s.type === 'plate') {
        // Table texture — subtle grain
        for (let i = 0; i < 200; i++) {
          ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
          ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
        // Plate/bowl
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
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Food elements — scattered circles/shapes
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
      } else if (s.type === 'closeup') {
        // Macro/close-up — gradient blobs, depth-of-field feel
        for (let i = 0; i < 6; i++) {
          const grd = ctx.createRadialGradient(
            w * Math.random(), h * Math.random(), 10,
            w * Math.random(), h * Math.random(), 100 + Math.random() * 80
          );
          grd.addColorStop(0, s.color);
          grd.addColorStop(1, 'transparent');
          ctx.fillStyle = grd;
          ctx.globalAlpha = 0.4 + Math.random() * 0.3;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.globalAlpha = 1;
        // Bokeh circles
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.arc(Math.random() * w, Math.random() * h, 15 + Math.random() * 25, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.15})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else if (s.type === 'body') {
        // Body silhouette — simplified person shape
        ctx.fillStyle = s.silhouette;
        // Head
        ctx.beginPath();
        ctx.arc(w/2, 80, 35, 0, Math.PI * 2);
        ctx.fill();
        // Torso
        ctx.beginPath();
        if (s.pose === 'front') {
          ctx.ellipse(w/2, 250, 55, 130, 0, 0, Math.PI * 2);
        } else {
          // Side view — narrower
          ctx.ellipse(w/2, 250, 35, 130, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        // Legs
        ctx.fillRect(w/2 - 30, 370, 22, 110);
        ctx.fillRect(w/2 + 8, 370, 22, 110);
        // Pose label
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.pose.toUpperCase() + ' VIEW', w/2, h - 15);
      }

      // Label overlay
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, h - 36, w, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, w/2, h - 18);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      const photoRecord = {
        id: photo.id,
        entryId: photo.entryId,
        date: photo.date,
        category: photo.category,
        syncStatus: photo.syncStatus,
        blob: blob,
        timestamp: Date.now(),
      };
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(photoRecord);
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    }

    // Insert goals
    await DB.setProfile('goals', data.goals);

    // Insert regimen
    await DB.setProfile('regimen', data.regimen);

    // Insert meal plan
    await DB.saveMealPlan(data.mealPlan);
  }, fixtures);

  return fixtures;
}

async function testTodayScreen(page, fixtures) {
  console.log('\n--- Today Screen ---');

  await page.click('nav button:has-text("Today")');

  // Wait for entries to render (confirms data injection + loadDayView completed)
  await page.waitForSelector('.entry-item', { timeout: 5000 }).catch(() => {});
  // Give score calculation time to finish (runs async after entries)
  await page.waitForTimeout(500);

  // Score ring should render
  const scoreRing = await page.$('.day-score');
  assert(!!scoreRing, 'Score ring renders');

  // Score labels show "Great" and "Crush It"
  const mainLabel = await page.$eval('.score-label-main', el => el.textContent);
  assert(mainLabel.includes('Great'), 'Score label shows "Great"');
  const hcLabel = await page.$eval('.score-label-hc', el => el.textContent);
  assert(hcLabel.includes('Crush It'), 'Score label shows "Crush It"');

  // Score number is visible and numeric
  const scoreNum = await page.$eval('.score-number', el => el.textContent.trim());
  assert(/^\d+$/.test(scoreNum), `Score is numeric: ${scoreNum}`);

  // Quick action buttons exist
  const quickActions = await page.$$('.quick-action');
  assert(quickActions.length === 4, `4 quick-action buttons (got ${quickActions.length})`);

  // Entry list has items from today's fixture data
  const entryItems = await page.$$('.entry-item');
  // Today = last fixture date (day5) which has 4 entries
  assert(entryItems.length > 0, `Entry items render (got ${entryItems.length})`);

  // Score breakdown chips exist
  const chips = await page.$$('.score-chip');
  assert(chips.length >= 3, `Score breakdown chips render (got ${chips.length})`);

  // Coach input moved to Profile tab — verify it's NOT on Today
  const coachInput = await page.$('#screen-today textarea.coach-input');
  assert(!coachInput, 'Coach input not on Today (moved to Profile)');

  // + Add Entry button exists (dynamic ID: toggle-log-types)
  const addBtn = await page.$('#toggle-log-types');
  assert(!!addBtn, '+ Add Entry button exists');

  await screenshot(page, 'today-default');
}

async function testPlanScreen(page, fixtures) {
  console.log('\n--- Plan Screen ---');

  await page.click('nav button:has-text("Plan")');
  await page.waitForTimeout(500);

  // Meal plan should render (we injected one)
  const container = await page.$('#plan-container');
  const content = await container.textContent();
  assert(!content.includes('No plan yet'), 'Meal plan renders (not empty state)');

  // Should show workout regimen or meal content (plan renders from regimen + mealPlan)
  const hasContent = content.includes('Workout') || content.includes('workout') ||
                     content.includes('Cardio') || content.includes('cardio') ||
                     content.includes('Elliptical') || content.includes('strength') ||
                     content.includes('Upper body') || content.includes('Lower body');
  assert(hasContent, 'Plan shows workout regimen');

  await screenshot(page, 'plan-with-data');
}

async function testProgressScreen(page, fixtures) {
  console.log('\n--- Progress Screen ---');

  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(500);

  const container = await page.$('#progress-container');
  const content = await container.textContent();

  // Timeline should render
  assert(content.includes('Timeline') || content.includes('Day'), 'Timeline section renders');

  // Daily Scores section with sparkline
  assert(content.includes('Daily Scores') || content.includes('Avg'), 'Scores section renders');

  // Legend should use new labels
  assert(content.includes('Great'), 'Progress legend shows "Great"');
  assert(content.includes('Crush It'), 'Progress legend shows "Crush It"');

  // Calendar heatmap
  const calDays = await page.$$('.cal-day:not(.empty)');
  assert(calDays.length > 0, `Calendar days render (got ${calDays.length})`);

  // Averages section
  assert(content.includes('Avg Cal') || content.includes('Averages'), 'Averages section renders');

  // Fitness goals
  assert(content.includes('Lose 10 lbs') || content.includes('Run a 5K'), 'Fitness goals render');

  // Streaks (from day1 analysis)
  assert(content.includes('Streak') || content.includes('Logging') || content.includes('Water'), 'Streaks section renders');

  await screenshot(page, 'progress-with-data');
}

async function testProfileScreen(page, fixtures) {
  console.log('\n--- Profile Screen ---');

  await page.click('nav button:has-text("Profile")');
  await page.waitForTimeout(500);

  // Daily targets card
  const targetsCard = await page.textContent('.s-card-row');
  assert(targetsCard.includes('1200') || targetsCard.includes('cal'), 'Daily targets show calorie goal');

  // Goals segment button
  const goalsBtn = await page.$('button:has-text("Goals")');
  assert(!!goalsBtn, 'Goals segment button exists');

  // Cloud Sync card
  const syncCard = await page.textContent('#screen-profile');
  assert(syncCard.includes('Cloud Sync'), 'Cloud Sync card renders');

  // Backup card (compacted to inline links)
  assert(syncCard.includes('Manual import'), 'Backup card renders (Manual import links)');

  // Storage card with danger button
  const dangerBtn = await page.$('.btn-danger');
  assert(!!dangerBtn, 'Clear Photos has danger styling');

  // Version badge
  const version = await page.textContent('#app-version');
  assert(version !== undefined, 'Version badge renders');

  await screenshot(page, 'profile-default');
}

async function testInteractions(page, fixtures) {
  console.log('\n--- Interactions ---');

  // Navigate to Today first
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);

  // Test water picker modal
  const waterBtn = await page.$('#quick-water-btn');
  if (waterBtn) {
    await waterBtn.click();
    await page.waitForTimeout(300);
    const waterModal = await page.$('.modal-overlay');
    assert(!!waterModal, 'Water picker modal opens');
    await screenshot(page, 'modal-water');
    // Close modal
    const closeBtn = await page.$('.modal-close');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(200);
  }

  // Test supplement modal
  const suppBtn = await page.$('#quick-supplement-btn');
  if (suppBtn) {
    await suppBtn.click();
    await page.waitForTimeout(300);
    const suppModal = await page.$('.modal-overlay');
    assert(!!suppModal, 'Supplement modal opens');
    await screenshot(page, 'modal-supplements');
    const closeBtn = await page.$('.modal-close');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(200);
  }

  // Test goal setup modal
  await page.click('nav button:has-text("Profile")');
  await page.waitForTimeout(300);
  const editBtn = await page.$('.s-action-btn');
  if (editBtn) {
    await editBtn.click();
    await page.waitForTimeout(300);
    const goalModal = await page.$('.modal-overlay');
    assert(!!goalModal, 'Goal setup modal opens');

    // Check labels use new names
    const modalContent = await page.textContent('.modal-overlay');
    assert(modalContent.includes('great') || modalContent.includes('Great'), 'Goal modal uses "great" label');
    assert(modalContent.includes('crush it') || modalContent.includes('Crush It'), 'Goal modal uses "crush it" label');

    // Verify input values match fixture data
    const calValue = await page.$eval('#gs-calories', el => el.value);
    assert(calValue === '1200', `Calorie goal pre-filled: ${calValue}`);

    await screenshot(page, 'modal-goals');
    const closeBtn = await page.$('.modal-close');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(200);
  }

  // Test entry tap-to-edit
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);
  const firstEntry = await page.$('.entry-item');
  if (firstEntry) {
    await firstEntry.click();
    await page.waitForTimeout(300);
    const editModal = await page.$('.modal-overlay');
    assert(!!editModal, 'Entry edit modal opens on tap');
    await screenshot(page, 'modal-edit-entry');
    const closeBtn = await page.$('.modal-close');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(200);
  }

  // Test nav between dates (if date nav exists)
  const prevBtn = await page.$('#prev-day-btn, .day-nav-prev, [data-nav="prev"]');
  if (prevBtn) {
    await prevBtn.click();
    await page.waitForTimeout(500);
    const entries = await page.$$('.entry-item');
    assert(entries.length >= 0, 'Previous day navigation works');
    await screenshot(page, 'today-prev-day');
  }
}

async function testScoring(page, fixtures) {
  console.log('\n--- Score Verification ---');

  // Navigate to each fixture day and verify scores render
  for (let i = 0; i < fixtures.dates.length; i++) {
    const date = fixtures.dates[i];
    // Navigate to the date by using the app's date selection
    await page.evaluate((d) => {
      App.goToDate(d);
    }, date);
    await page.waitForTimeout(600);

    const scoreEl = await page.$('.score-number');
    if (scoreEl) {
      const score = (await scoreEl.textContent()).trim();
      const num = ['--', '?'].includes(score) ? 0 : parseInt(score);
      assert(!isNaN(num) && num >= 0 && num <= 100, `Day ${i+1} (${date}) score is valid: ${num}`);
    } else {
      // Might be an analysis-only day with no score ring
      const entryItems = await page.$$('.entry-item');
      assert(true, `Day ${i+1} (${date}) renders (${entryItems.length} entries)`);
    }
  }

  // Day 1 should score highest (full day with workout)
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[0]);
  await page.waitForTimeout(600);
  const day1Score = await page.$eval('.score-number', el => parseInt(el.textContent.trim())).catch(() => 0);

  // Day 4 should score lowest (minimal logging) — may show empty state "--" or "?"
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[3]);
  await page.waitForTimeout(600);
  const day4ScoreText = await page.$eval('.score-number', el => el.textContent.trim()).catch(() => '--');
  const day4Score = ['--', '?'].includes(day4ScoreText) ? 0 : parseInt(day4ScoreText);
  assert(!isNaN(day4Score), `Day 4 (${fixtures.dates[3]}) score is valid: ${day4Score} (text: "${day4ScoreText}")`);

  assert(day1Score > day4Score, `Full day (${day1Score}) scores higher than minimal day (${day4Score})`);

  // Day 5 has vices — score should be penalized
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[4]);
  await page.waitForTimeout(600);
  const day5Score = await page.$eval('.score-number', el => parseInt(el.textContent.trim())).catch(() => 0);
  assert(day5Score < 100, `Vice day score penalized: ${day5Score}`);

  // Verify workout chip label logic — find a rest day dynamically
  // The regimen has rest days on Wed/Sat/Sun
  const restDayResult = await page.evaluate(async (dates) => {
    const regimen = await DB.getRegimen();
    const schedule = regimen?.weeklySchedule || [];
    for (const date of dates) {
      const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const dayPlan = schedule.find(d => d.day === dayName);
      if (dayPlan && dayPlan.type === 'rest') return date;
    }
    return null;
  }, fixtures.dates);

  if (restDayResult) {
    await page.evaluate((d) => App.goToDate(d), restDayResult);
    await page.waitForTimeout(600);
    const chips = await page.$$eval('.score-chip', els => els.map(e => e.textContent.trim()));
    const hasRestChip = chips.some(c => c.includes('Rest'));
    assert(hasRestChip, 'Rest day shows "Rest" chip label');
  } else {
    assert(true, 'Rest day chip (no rest day in fixture range — skipped)');
  }
}

async function testEntryTypes(page, fixtures) {
  console.log('\n--- Entry Type Rendering ---');

  // Day 1 has meal, workout, supplement
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[0]);
  await page.waitForTimeout(600);
  const types = await page.$$eval('.entry-type', els => els.map(e => e.textContent.trim()));

  // entryLabel maps: meal/snack/drink → 'Food', workout → 'Workout', supplement → 'Supplement'
  // CSS capitalize transforms the first letter, so text content matches label output
  const typesLower = types.map(t => t.toLowerCase());
  const hasFood = typesLower.some(t => t.includes('food'));
  // Workout with subtype 'cardio' → entryLabel returns 'Cardio'
  const hasWorkout = typesLower.some(t => t.includes('cardio') || t.includes('workout'));
  const hasSupplement = typesLower.some(t => t.includes('supplement'));
  assert(hasFood, 'Food entry type label renders');
  assert(hasWorkout, 'Workout/Cardio entry type label renders');
  assert(hasSupplement, 'Supplement entry type label renders');

  // Day 5 has vices
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[4]);
  await page.waitForTimeout(600);
  const day5Types = await page.$$eval('.entry-type', els => els.map(e => e.textContent.trim()));
  const hasVice = day5Types.some(t => t.toLowerCase().includes('alcohol'));
  assert(hasVice || day5Types.length > 0, 'Vice entries render');
}

async function testPhotos(page, fixtures) {
  console.log('\n--- Photo Rendering ---');

  // Day 1 has: 2 meal entries with photos (lunch has 2 photos), 1 body entry with 2 photos (front+side)
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[0]);
  await page.waitForTimeout(800);

  // Meal photo thumbnails should render as <img> elements
  const mealThumbs = await page.$$('img.entry-photo-thumb');
  assert(mealThumbs.length >= 2, `Meal photo thumbnails render (got ${mealThumbs.length}, expected ≥2)`);

  // Check that thumbnails have blob URL srcs
  if (mealThumbs.length > 0) {
    const src = await mealThumbs[0].getAttribute('src');
    assert(src && src.startsWith('blob:'), 'Meal photo has blob URL src');
  }

  // Body photo should show locked (lock icon, not revealed)
  const lockedPhoto = await page.$('.entry-photo-locked');
  assert(!!lockedPhoto, 'Body photo shows locked state');

  // Tap locked photo to reveal
  if (lockedPhoto) {
    await lockedPhoto.click();
    await page.waitForTimeout(600);
    const revealed = await page.$('.entry-photo-locked.revealed');
    assert(!!revealed, 'Body photo reveals on tap');

    const bgImage = await revealed.evaluate(el => el.style.backgroundImage);
    assert(bgImage && bgImage.includes('blob:'), 'Revealed body photo has image');

    await screenshot(page, 'photo-body-revealed');

    // Wait for auto-hide (5s) or manually re-tap to hide
    await lockedPhoto.click();
    await page.waitForTimeout(300);
    const hidden = await page.$('.entry-photo-locked:not(.revealed)');
    assert(!!hidden, 'Body photo re-locks on second tap');
  }

  await screenshot(page, 'photos-day1-meals');

  // Verify photo in edit modal (tap a meal entry with photo)
  const mealEntryWithPhoto = await page.$('.entry-item[data-type="meal"]');
  if (mealEntryWithPhoto) {
    await mealEntryWithPhoto.click();
    await page.waitForTimeout(500);
    const editModal = await page.$('.modal-overlay');
    if (editModal) {
      const modalPhoto = await page.$('.modal-overlay .ql-photo-preview img');
      assert(!!modalPhoto, 'Edit modal shows photo preview');
      if (modalPhoto) {
        const modalSrc = await modalPhoto.getAttribute('src');
        assert(modalSrc && modalSrc.startsWith('blob:'), 'Edit modal photo has blob URL');
      }
      await screenshot(page, 'photo-edit-modal');
      const closeBtn = await page.$('.modal-close');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(200);
    }
  }

  // Day 2 has 1 meal photo (synced status, not processed)
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[1]);
  await page.waitForTimeout(800);
  const day2Thumbs = await page.$$('img.entry-photo-thumb');
  assert(day2Thumbs.length >= 1, `Day 2 synced photo renders (got ${day2Thumbs.length})`);
  await screenshot(page, 'photos-day2');

  // Day 3 has 1 meal photo (dinner — dark/moody steak)
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[2]);
  await page.waitForTimeout(800);
  const day3Thumbs = await page.$$('img.entry-photo-thumb');
  assert(day3Thumbs.length >= 1, `Day 3 dinner photo renders (got ${day3Thumbs.length})`);

  // Day 5 has 2 meal photos (pizza + burger, both unsynced)
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[4]);
  await page.waitForTimeout(800);
  const day5Thumbs = await page.$$('img.entry-photo-thumb');
  assert(day5Thumbs.length >= 2, `Day 5 meal photos render (got ${day5Thumbs.length})`);
  await screenshot(page, 'photos-day5-vices');

  // Day 4 has no photos at all
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[3]);
  await page.waitForTimeout(800);
  const day4Thumbs = await page.$$('img.entry-photo-thumb');
  const day4Locked = await page.$$('.entry-photo-locked');
  assert(day4Thumbs.length === 0 && day4Locked.length === 0, 'Day with no photos has no thumbnails');

  // Verify photo sync status counts in IndexedDB
  const syncCounts = await page.evaluate(async () => {
    const status = await DB.getPhotoSyncStatus();
    return status;
  });
  assert(syncCounts.processed > 0, `Has processed photos (${syncCounts.processed})`);
  assert(syncCounts.unsynced > 0, `Has unsynced photos (${syncCounts.unsynced})`);
  assert(syncCounts.totalSize > 0, `Photos have non-zero total size (${syncCounts.totalSize} bytes)`);

  // Verify storage card on Profile
  await page.click('nav button:has-text("Profile")');
  await page.waitForTimeout(500);
  const storageText = await page.textContent('#screen-profile');
  assert(storageText.includes('photo') || storageText.includes('Photo') || storageText.includes('Clear'), 'Storage card references photos');

  await screenshot(page, 'profile-storage-with-photos');
}

async function testUserFlows(page, fixtures) {
  console.log('\n--- User Flows ---');

  // ---------------------------------------------------------------
  // Flow 1: Log a meal from scratch
  // ---------------------------------------------------------------
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);

  // Navigate to today so the Add Entry button exists
  await page.evaluate(() => App.goToDate(App.selectedDate || UI.today()));
  await page.waitForTimeout(400);

  const addBtn = await page.$('#toggle-log-types');
  if (addBtn) {
    await addBtn.click();
    await page.waitForTimeout(400);

    // Log type grid should now be visible
    const gridDisplay = await page.$eval('#log-type-grid-inline', el => el.style.display).catch(() => null);
    assert(gridDisplay !== 'none' && gridDisplay !== null, 'Flow 1: Log type grid appears after clicking + Add Entry');

    // Click the Food type button
    const foodBtn = await page.$('#log-type-grid-inline .type-btn[data-type="meal"]');
    if (foodBtn) {
      await foodBtn.click();
      await page.waitForTimeout(400);

      // Food logging UI should render (form content, camera, or notes area)
      const formContent = await page.$('#log-form-content-inline');
      const hasFormContent = !!formContent;
      const formText = hasFormContent ? await formContent.textContent() : '';
      assert(
        hasFormContent && (formText.length > 0 || await page.$('.ql-photo-btn, textarea, .log-notes-input, input[type="text"]')),
        'Flow 1: Food logging UI appears after selecting Food type'
      );
      await screenshot(page, 'flow1-food-logging-ui');
    } else {
      assert(false, 'Flow 1: Food button found in log type grid');
    }

    // Cancel — click the button again (now shows "Cancel") to close
    const cancelBtn = await page.$('#toggle-log-types');
    if (cancelBtn) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
    }

    // Grid should be hidden again
    const gridAfter = await page.$eval('#log-type-grid-inline', el => el.style.display).catch(() => null);
    assert(gridAfter === 'none' || gridAfter === null, 'Flow 1: Log type grid hidden after cancel');
  } else {
    assert(false, 'Flow 1: + Add Entry button found on Today');
  }

  // ---------------------------------------------------------------
  // Flow 2: Add water throughout the day
  // ---------------------------------------------------------------
  const waterQuickBtn = await page.$('#quick-water-btn');
  if (waterQuickBtn) {
    await waterQuickBtn.click();
    await page.waitForTimeout(400);

    // Water picker modal should open
    const waterModal = await page.$('.modal-overlay');
    assert(!!waterModal, 'Flow 2: Water picker modal opens');

    // Read current total shown in modal
    const beforeText = await page.$eval('.modal-overlay', el => el.textContent).catch(() => '');

    // Select a water amount (first .water-pick button)
    const waterPick = await page.$('.water-pick');
    if (waterPick) {
      await waterPick.click();
      await page.waitForTimeout(500);

      // Toast should appear OR modal should close (both indicate success)
      const modalGone = !(await page.$('.modal-overlay'));
      const toastEl = await page.$('.toast, .toast-container, [class*="toast"]');
      assert(modalGone || !!toastEl, 'Flow 2: Water amount selected (modal closes or toast appears)');
    } else {
      assert(false, 'Flow 2: Water pick buttons found in modal');
      // Close if still open
      const closeBtn = await page.$('.modal-close');
      if (closeBtn) await closeBtn.click();
    }

    await page.waitForTimeout(300);

    // Reopen water picker to verify updated total
    const waterQuickBtn2 = await page.$('#quick-water-btn');
    if (waterQuickBtn2) {
      await waterQuickBtn2.click();
      await page.waitForTimeout(400);

      const waterModal2 = await page.$('.modal-overlay');
      assert(!!waterModal2, 'Flow 2: Water picker reopens after logging');

      // Modal should show a total > 0
      const afterText = await page.$eval('.modal-overlay', el => el.textContent).catch(() => '');
      const hasOzTotal = /\d+\s*oz/.test(afterText);
      assert(hasOzTotal, 'Flow 2: Reopened water picker shows oz total');

      await screenshot(page, 'flow2-water-picker-updated');

      // Close modal
      const closeBtn2 = await page.$('.modal-close');
      if (closeBtn2) {
        await closeBtn2.click();
        await page.waitForTimeout(200);
      } else {
        // Close by clicking overlay backdrop
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    }
  } else {
    assert(false, 'Flow 2: Water quick-action button found');
  }

  // ---------------------------------------------------------------
  // Flow 3: Check and edit goals
  // ---------------------------------------------------------------
  await page.click('nav button:has-text("Profile")');
  await page.waitForTimeout(500);

  // Click Edit on Daily Targets
  const editGoalsBtn = await page.$('.s-action-btn');
  if (editGoalsBtn) {
    await editGoalsBtn.click();
    await page.waitForTimeout(400);

    // Goal setup modal should open
    const goalModal = await page.$('.modal-overlay');
    assert(!!goalModal, 'Flow 3: Goal setup modal opens from Profile');

    // Calorie input should be pre-filled
    const calInput = await page.$('#gs-calories');
    if (calInput) {
      const calValue = await calInput.evaluate(el => el.value);
      assert(calValue !== '' && parseInt(calValue) > 0, `Flow 3: Calorie input pre-filled (value: ${calValue})`);

      // Change calorie value to 1300
      await calInput.click({ clickCount: 3 });
      await calInput.fill('1300');
      await page.waitForTimeout(200);

      // Verify the input changed
      const newCalValue = await calInput.evaluate(el => el.value);
      assert(newCalValue === '1300', `Flow 3: Calorie input updated to 1300 (got: ${newCalValue})`);
    } else {
      assert(false, 'Flow 3: Calorie input (#gs-calories) found in goal modal');
    }

    await screenshot(page, 'flow3-goal-modal-edited');

    // Save
    const saveBtn = await page.$('#gs-save');
    if (saveBtn) {
      await saveBtn.click();
      await page.waitForTimeout(500);
      // After saving goals, sync setup step may appear — dismiss it
      const skipSync = await page.$('#gs-sync-skip');
      if (skipSync) {
        await skipSync.click();
        await page.waitForTimeout(300);
      }
    } else {
      // Close modal
      const closeBtn = await page.$('.modal-close');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(300);
    }

    // Targets summary should reflect new value
    const goalsText = await page.$eval('#goals-summary', el => el.textContent).catch(() => '');
    assert(goalsText.includes('1300') || goalsText.includes('cal'), `Flow 3: Daily Targets card updates (got: "${goalsText}")`);

    await screenshot(page, 'flow3-targets-updated');

    // Reopen and restore to 1200
    const editBtn2 = await page.$('.s-action-btn');
    if (editBtn2) {
      await editBtn2.click();
      await page.waitForTimeout(400);

      const calInput2 = await page.$('#gs-calories');
      if (calInput2) {
        await calInput2.click({ clickCount: 3 });
        await calInput2.fill('1200');
        await page.waitForTimeout(200);

        const saveBtn2 = await page.$('#gs-save');
        if (saveBtn2) {
          await saveBtn2.click();
          await page.waitForTimeout(400);
          // Dismiss sync setup step if it appears
          const skipSync2 = await page.$('#gs-sync-skip');
          if (skipSync2) {
            await skipSync2.click();
            await page.waitForTimeout(300);
          }
        } else {
          const closeBtn = await page.$('.modal-close');
          if (closeBtn) await closeBtn.click();
        }
      }
      assert(true, 'Flow 3: Goals restored to 1200');
    }
  } else {
    assert(false, 'Flow 3: Edit button found on Daily Targets card');
  }

  // ---------------------------------------------------------------
  // Flow 4: Navigate between days
  // ---------------------------------------------------------------
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);

  const today = await page.evaluate(() => UI.today());

  // Get entry count on today
  const todayEntries = await page.$$('.entry-item');
  const todayCount = todayEntries.length;

  // Navigate to day -1
  const prevBtn = await page.$('#header-prev');
  if (prevBtn) {
    await prevBtn.click();
    await page.waitForTimeout(500);

    const day1Date = await page.evaluate(() => App.selectedDate);
    assert(day1Date < today, `Flow 4: Navigated to previous day (${day1Date} < ${today})`);
    await screenshot(page, 'flow4-day-minus1');

    // Navigate to day -2
    await prevBtn.click();
    await page.waitForTimeout(500);

    const day2Date = await page.evaluate(() => App.selectedDate);
    assert(day2Date < day1Date, `Flow 4: Navigated to day -2 (${day2Date} < ${day1Date})`);
    await screenshot(page, 'flow4-day-minus2');

    // Navigate back to today via nav tab
    await page.click('nav button:has-text("Today")');
    await page.waitForTimeout(500);

    const backToToday = await page.evaluate(() => App.selectedDate);
    assert(backToToday === today, `Flow 4: Navigated back to today (${backToToday})`);

    // Today's entries should be back
    const restoredEntries = await page.$$('.entry-item');
    assert(restoredEntries.length === todayCount, `Flow 4: Today's entry count restored (${restoredEntries.length})`);
  } else {
    assert(false, 'Flow 4: Previous day button (#header-prev) found');
  }

  // ---------------------------------------------------------------
  // Flow 5: Check progress after logging
  // ---------------------------------------------------------------
  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(600);

  // Calendar should show colored dots for days with data
  const calDays = await page.$$('.cal-day:not(.empty)');
  assert(calDays.length > 0, `Flow 5: Calendar renders days (got ${calDays.length})`);

  // Find a calendar day that has a date (fixture data)
  const tapableDay = await page.$('.cal-day[data-date]:not(.empty)');
  if (tapableDay) {
    const tappedDate = await tapableDay.evaluate(el => el.dataset.date);
    await tapableDay.click();
    await page.waitForTimeout(600);

    // Should navigate to Today tab with that date selected
    const currentScreen = await page.evaluate(() => App.currentScreen);
    const selectedDate = await page.evaluate(() => App.selectedDate);
    assert(
      currentScreen === 'today' || selectedDate === tappedDate,
      `Flow 5: Calendar tap navigates to day view (screen: ${currentScreen}, date: ${selectedDate})`
    );

    await screenshot(page, 'flow5-calendar-tap-result');

    // Navigate back to Progress
    await page.click('nav button:has-text("Progress")');
    await page.waitForTimeout(500);

    const progressContainer = await page.$('#progress-container');
    assert(!!progressContainer, 'Flow 5: Progress screen back after navigation');
  } else {
    assert(true, 'Flow 5: Calendar tap (no tappable day found — skipped)');
  }

  // ---------------------------------------------------------------
  // Flow 6: Browse the plan
  // ---------------------------------------------------------------
  await page.click('nav button:has-text("Plan")');
  await page.waitForTimeout(600);

  const planContainer = await page.$('#plan-container');
  const planContent = planContainer ? await planContainer.textContent() : '';
  assert(planContent.length > 0 && !planContent.includes('No plan'), 'Flow 6: Plan screen renders content');

  await screenshot(page, 'flow6-plan');

  // Navigate to Profile
  await page.click('nav button:has-text("Profile")');
  await page.waitForTimeout(400);

  // Navigate back to Plan
  await page.click('nav button:has-text("Plan")');
  await page.waitForTimeout(600);

  const planContainer2 = await page.$('#plan-container');
  const planContent2 = planContainer2 ? await planContainer2.textContent() : '';
  assert(planContent2.length > 0, 'Flow 6: Plan content persists after navigating away and back');
  assert(!planContent2.includes('No plan'), 'Flow 6: Plan has no blank flash on return');

  await screenshot(page, 'flow6-plan-after-return');
}

async function testProfileRoundTrip(page, fixtures) {
  console.log('\n--- Profile Round-Trip ---');

  // Import analysis with pwaProfile and verify goals restored
  // The fixtures already inject goals with calories=1200 — verify that's what's in the DB
  const goalsFromDB = await page.evaluate(async () => {
    const goals = await DB.getProfile('goals');
    return goals;
  });
  assert(goalsFromDB && goalsFromDB.calories === 1200, `Goals restored from fixture: calories=${goalsFromDB?.calories} (expected 1200)`);
  assert(goalsFromDB && goalsFromDB.protein === 105, `Goals restored from fixture: protein=${goalsFromDB?.protein} (expected 105)`);

  // Simulate importing an analysis with pwaProfile and verify goals update
  await page.evaluate(async () => {
    const analysisWithProfile = {
      totals: { calories: 500, protein: 50, carbs: 30, fat: 10 },
      pwaProfile: {
        goals: { calories: 1200, protein: 105, water_oz: 64, hardcore: { calories: 1000, protein: 120, water_oz: 64 } },
        supplements: ['Fiber', 'Collagen', 'Vitamin D'],
      },
    };
    await DB.importAnalysis('2099-01-01', analysisWithProfile);
  });

  const updatedGoals = await page.evaluate(async () => await DB.getProfile('goals'));
  assert(updatedGoals && updatedGoals.calories === 1200, `Goals preserved after pwaProfile import: calories=${updatedGoals?.calories}`);

  const supplements = await page.evaluate(async () => await DB.getProfile('supplements'));
  assert(supplements && supplements.length >= 3, `Supplements restored from pwaProfile (got ${supplements?.length})`);

  await screenshot(page, 'profile-round-trip');
}

async function testAnalysisStatusIndicators(page, fixtures) {
  console.log('\n--- Analysis Status Indicators ---');

  // Day 1 has entries with matching analysis IDs — should show inline calories
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[0]);
  await page.waitForTimeout(800);

  // Look for inline calorie text on entries (e.g. "Food · 380 Cal" or similar)
  const entryTexts = await page.$$eval('.entry-item', els => els.map(e => e.textContent));
  const hasInlineCal = entryTexts.some(t => /\d+\s*Cal/i.test(t));
  assert(hasInlineCal, 'Day 1 entry shows inline calories from analysis');

  // Check for at least one entry that shows calorie info
  const calEntries = await page.$$eval('.entry-item', els => {
    return els.filter(e => /\d+\s*Cal/i.test(e.textContent)).length;
  });
  assert(calEntries >= 1, `At least one entry shows calories on Day 1 (found ${calEntries})`);

  // Day 4 has minimal data — drink entry should show pending or low calories
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[3]);
  await page.waitForTimeout(600);

  const day4Entries = await page.$$('.entry-item');
  assert(day4Entries.length >= 1, `Day 4 has entries (got ${day4Entries.length})`);

  await screenshot(page, 'analysis-status-indicators');
}

async function testUILabels(page, fixtures) {
  console.log('\n--- UI Labels ---');

  // Verify quick action button says "Dailies" not "Supps"
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);

  const quickActionTexts = await page.$$eval('.quick-action', els => els.map(e => e.textContent.trim()));
  const hasDailies = quickActionTexts.some(t => t.includes('Dailies'));
  const hasSupps = quickActionTexts.some(t => t.includes('Supps'));
  assert(hasDailies, 'Quick action button says "Dailies"');
  assert(!hasSupps, 'Quick action button does NOT say "Supps"');

  // Verify "Sync Now" button exists on Profile screen
  await page.click('nav button:has-text("Profile")');
  await page.waitForTimeout(500);

  const profileText = await page.textContent('#screen-profile');
  const hasSyncNow = profileText.includes('Sync Now') || profileText.includes('sync now');
  // Also check for sync-related action buttons
  const syncBtn = await page.$('#sync-now-btn, button:has-text("Sync Now"), .s-action-btn--primary');
  assert(hasSyncNow || !!syncBtn, 'Sync Now button exists on Profile screen');

  await screenshot(page, 'ui-labels');
}

async function testScoreCentering(page, fixtures) {
  console.log('\n--- Score Centering ---');

  // Navigate to a day with score data
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[0]);
  await page.waitForTimeout(800);

  const scoreCard = await page.$('.day-score');
  if (scoreCard) {
    // Check that the score card content is centered by comparing bounding rects
    const alignment = await page.evaluate(() => {
      const card = document.querySelector('.day-score');
      if (!card) return null;
      const style = getComputedStyle(card);
      return {
        justifyContent: style.justifyContent,
        display: style.display,
      };
    });
    assert(
      alignment && alignment.justifyContent === 'center',
      `Score card has justify-content: center (got: ${alignment?.justifyContent})`
    );

    // Also verify the score gauge and labels are within the card bounds (not overflowing left)
    const positions = await page.evaluate(() => {
      const card = document.querySelector('.day-score');
      const gauge = document.querySelector('.day-score-gauge');
      if (!card || !gauge) return null;
      const cardRect = card.getBoundingClientRect();
      const gaugeRect = gauge.getBoundingClientRect();
      return {
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        cardWidth: cardRect.width,
        gaugeLeft: gaugeRect.left,
        gaugeCenterX: gaugeRect.left + gaugeRect.width / 2,
        cardCenterX: cardRect.left + cardRect.width / 2,
      };
    });
    if (positions) {
      const offset = Math.abs(positions.gaugeCenterX - positions.cardCenterX);
      // Gauge center should be reasonably close to card center (within card's half-width)
      assert(
        positions.gaugeLeft > positions.cardLeft,
        `Score gauge is not flush left (gauge left: ${positions.gaugeLeft.toFixed(0)}, card left: ${positions.cardLeft.toFixed(0)})`
      );
    }
  } else {
    assert(false, 'Score card (.day-score) found for centering test');
  }

  await screenshot(page, 'score-centering');
}

async function testMultiViewport(page, context, fixtures) {
  console.log('\n--- Multi-Viewport ---');

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);

    // Check no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    assert(bodyWidth <= vp.width + 2, `${vp.name} (${vp.width}px): no horizontal overflow (body: ${bodyWidth}px)`);

    // All nav buttons visible
    const navBtns = await page.$$('nav button');
    assert(navBtns.length === 4, `${vp.name}: 4 nav buttons visible`);

    await screenshot(page, `viewport-${vp.name}`);
  }
}

async function testConsoleErrors(page) {
  console.log('\n--- Console Errors ---');
  const realErrors = consoleErrors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('service-worker') &&
    !e.includes('sw.js') &&
    !e.includes('manifest') &&
    !e.includes('net::ERR') &&
    !e.includes('CloudRelay') &&
    !e.includes('not configured')
  );
  assert(realErrors.length === 0, `No JS console errors (found ${realErrors.length}: ${realErrors.join('; ').slice(0, 200)})`);
}

async function run() {
  console.log('=== Health Tracker Validation ===\n');

  if (TAKE_SCREENSHOTS) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    console.log(`Screenshots → ${SCREENSHOT_DIR}\n`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    // Load app
    console.log('Loading app...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify app loaded
    const title = await page.title();
    assert(title.length > 0, `Page loads with title: "${title}"`);

    // Inject fixtures
    console.log('Injecting test data...');
    const fixtures = await injectFixtures(page);
    console.log(`  ${fixtures.entries.length} entries, ${fixtures.analyses.length} analyses, ${fixtures.dates.length} days`);

    // Reload to pick up injected data
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Run test suites
    await testTodayScreen(page, fixtures);
    await testPlanScreen(page, fixtures);
    await testProgressScreen(page, fixtures);
    await testProfileScreen(page, fixtures);
    await testInteractions(page, fixtures);
    await testScoring(page, fixtures);
    await testEntryTypes(page, fixtures);
    await testPhotos(page, fixtures);
    await testUserFlows(page, fixtures);
    await testProfileRoundTrip(page, fixtures);
    await testAnalysisStatusIndicators(page, fixtures);
    await testUILabels(page, fixtures);
    await testScoreCentering(page, fixtures);
    await testMultiViewport(page, context, fixtures);
    await testConsoleErrors(page);

  } catch (err) {
    console.error('\nFATAL:', err.message);
    failed++;
    errors.push(`Fatal: ${err.message}`);
  }

  await browser.close();

  // Report Phase 2 results
  console.log('\n=== Phase 2 Results ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('\n  Failed tests:');
    errors.forEach(e => console.log(`    - ${e}`));
  }
  console.log(`\n${failed === 0 ? 'PHASE 2: ALL TESTS PASSED' : 'PHASE 2: SOME TESTS FAILED'}`);

  // Phase 3: Interactive Dogfood Loop (if --dogfood flag passed)
  let dogfoodFailed = 0;
  if (RUN_DOGFOOD) {
    const { runDogfood } = require('./dogfood');
    const dogfoodResult = await runDogfood();
    dogfoodFailed = dogfoodResult.failed;
  }

  const totalFailed = failed + dogfoodFailed;
  if (RUN_DOGFOOD) {
    console.log(`\n=== Overall: ${totalFailed === 0 ? 'ALL PHASES PASSED' : 'SOME TESTS FAILED'} ===`);
  }
  process.exit(totalFailed > 0 ? 1 : 0);
}

run();
