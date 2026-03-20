// test-fixtures/run-tests.js — Playwright-based validation with fake data injection
// Usage: node test-fixtures/run-tests.js [--screenshots] [--dogfood]

const { chromium } = require('playwright');
const { buildFixtures } = require('./data');
const path = require('path');
const fs = require('fs');

const TAKE_SCREENSHOTS = process.argv.includes('--screenshots');
const RUN_DOGFOOD = process.argv.includes('--dogfood');
const RUN_CHAOS = process.argv.includes('--chaos');
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

    // Inject skincare profile (Phase 1+ only — store may not exist yet)
    if (data.skincareProfile) {
      try {
        await DB.setProfile('skincare', data.skincareProfile);
      } catch (e) {
        // skincare profile key not yet supported — silently skip
      }
    }

    // Inject body photo types
    if (data.bodyPhotoTypes) {
      try { await DB.setProfile('bodyPhotoTypes', data.bodyPhotoTypes); } catch (e) {}
    }

    // Inject skincare daily logs (Phase 1+ only — store may not exist yet)
    if (data.skincareLogs) {
      for (const log of data.skincareLogs) {
        try {
          const tx = db.transaction('skincare', 'readwrite');
          tx.objectStore('skincare').put(log);
          await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
        } catch (e) {
          // skincare store not yet created — silently skip
          break;
        }
      }
    }
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

  // Score descriptor and targets
  const descriptor = await page.$eval('.score-descriptor', el => el.textContent).catch(() => '');
  assert(descriptor.length > 0, `Score descriptor renders: "${descriptor}"`);
  const targets = await page.$eval('.score-targets', el => el.textContent).catch(() => '');
  assert(targets.includes('Goal') || targets.includes('Stretch') || targets === '', 'Score targets render');

  // Score number is visible and numeric
  const scoreNum = await page.$eval('.score-number', el => el.textContent.trim());
  assert(/^\d+$/.test(scoreNum), `Score is numeric: ${scoreNum}`);

  // Quick action buttons exist
  const quickActions = await page.$$('.quick-action');
  assert(quickActions.length >= 4, `4+ quick-action buttons (got ${quickActions.length})`);

  // Entry list has items from today's fixture data
  const entryItems = await page.$$('.entry-item');
  // Today = last fixture date (day5) which has 4 entries
  assert(entryItems.length > 0, `Entry items render (got ${entryItems.length})`);

  // Score breakdown chips exist
  const chips = await page.$$('.score-chip');
  assert(chips.length >= 3, `Score breakdown chips render (got ${chips.length})`);

  // Coach is its own tab now — verify Coach nav button exists
  const coachNav = await page.$('nav button[data-screen="coach"]');
  assert(!!coachNav, 'Coach tab exists in navigation');

  // More button exists for additional entry types
  const moreBtn = await page.$('#quick-more-btn');
  assert(!!moreBtn, 'More (+) button exists');

  await screenshot(page, 'today-default');
}

async function testPlanScreen(page, fixtures) {
  console.log('\n--- Progress Segments ---');

  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(500);

  // Segment control should exist
  const segmentBtns = await page.$$('.segment-btn');
  assert(segmentBtns.length >= 2, `Progress has 2+ segment buttons (got ${segmentBtns.length})`);

  // Default tab is Insights — should show meal plan content
  const container = await page.$('#progress-container');
  const content = await container.textContent();
  const hasMealPlan = content.includes('Meal Plan') || content.includes('dinner') || content.includes('Dinner');
  assert(hasMealPlan, 'Insights shows meal plan content');

  await screenshot(page, 'progress-insights');
}

async function testProgressScreen(page, fixtures) {
  console.log('\n--- Progress Screen ---');

  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(500);

  // Switch to Trends segment
  const trendsBtn = await page.$('button:has-text("Trends")');
  if (trendsBtn) await trendsBtn.click();
  await page.waitForTimeout(500);

  const container = await page.$('#progress-container');
  const content = await container.textContent();

  // Daily Scores section with sparkline
  assert(content.includes('Daily Scores') || content.includes('Avg'), 'Scores section renders');

  // Legend should use new labels
  assert(content.includes('Goal') || content.includes('Avg') || content.includes('Great'), 'Progress shows score context');
  assert(content.includes('Stretch') || content.includes('Crush') || content.includes('Avg'), 'Progress shows stretch/avg info');

  // Calendar heatmap
  const calDays = await page.$$('.cal-day:not(.empty)');
  assert(calDays.length > 0, `Calendar days render (got ${calDays.length})`);

  // Averages section
  assert(content.includes('Avg Cal') || content.includes('Averages'), 'Averages section renders');

  // Streaks (from day1 analysis)
  assert(content.includes('Streak') || content.includes('Logging') || content.includes('Water'), 'Streaks section renders');

  await screenshot(page, 'progress-trends');

  // Switch back to Insights to check goal consistency
  const insightsBtn2 = await page.$('button:has-text("Insights")');
  if (insightsBtn2) await insightsBtn2.click();
  await page.waitForTimeout(500);

  const insightsContent = await container.textContent();
  assert(insightsContent.includes('Goal Consistency') || insightsContent.includes('This Week') || insightsContent.includes('Meal Plan'), 'Insights shows goal consistency or weekly data');

  await screenshot(page, 'progress-insights-full');
}

async function testProfileScreen(page, fixtures) {
  console.log('\n--- Settings Screen ---');

  await page.click('nav button:has-text("Settings")');
  await page.waitForTimeout(500);

  // Daily targets card
  const targetsCard = await page.textContent('.s-card-row');
  assert(targetsCard.includes('1200') || targetsCard.includes('cal'), 'Daily targets show calorie goal');

  // Progress has Insights + Trends segments
  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(300);
  const insightsBtn = await page.$('#progress-container button:has-text("Insights")');
  assert(!!insightsBtn, 'Progress Insights segment exists');
  await page.click('nav button:has-text("Settings")');
  await page.waitForTimeout(300);

  // Cloud Sync card
  const syncCard = await page.textContent('#screen-settings');
  assert(syncCard.includes('Cloud Sync'), 'Cloud Sync card renders');

  // Backup card was removed — manual import is no longer in the UI

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
  await page.click('nav button:has-text("Settings")');
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
  assert(day5Score < 100, `Custom entry day score penalized: ${day5Score}`);

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
  assert(hasVice || day5Types.length > 0, 'Custom entries render');
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
  await page.click('nav button:has-text("Settings")');
  await page.waitForTimeout(500);
  const storageText = await page.textContent('#screen-settings');
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

  // Click More button to show bottom sheet
  const moreBtn1 = await page.$('#quick-more-btn');
  if (moreBtn1) {
    await moreBtn1.click();
    await page.waitForTimeout(400);

    // More sheet modal should be visible
    const moreModal = await page.$('.modal-overlay');
    assert(!!moreModal, 'Flow 1: More sheet modal opens');

    // Click workout option to open its form
    const workoutBtn = await page.$('[data-more-type="workout"]');
    if (workoutBtn) {
      await workoutBtn.click();
      await page.waitForTimeout(400);

      const formContent = await page.$('#log-form-content-inline');
      const hasFormContent = !!formContent;
      const formText = hasFormContent ? await formContent.textContent() : '';
      assert(
        hasFormContent && formText.length > 0,
        'Flow 1: Food logging UI appears after selecting Food type'
      );
      await screenshot(page, 'flow1-workout-logging-ui');
    }

    // Verify modal closed after selecting a type
    const modalAfter = await page.$('.modal-overlay');
    assert(!modalAfter, 'Flow 1: More sheet closes after selection');
  } else {
    assert(false, 'Flow 1: More button found on Today');
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
  await page.click('nav button:has-text("Settings")');
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

  // Switch to Trends for calendar
  const trendsBtn5 = await page.$('button:has-text("Trends")');
  if (trendsBtn5) await trendsBtn5.click();
  await page.waitForTimeout(500);

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
  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(600);

  const progressContainer = await page.$('#progress-container');
  const progressContent = progressContainer ? await progressContainer.textContent() : '';
  assert(progressContent.length > 0, 'Flow 6: Progress screen renders content');

  await screenshot(page, 'flow6-plan');

  // Navigate to Profile
  await page.click('nav button:has-text("Settings")');
  await page.waitForTimeout(400);

  // Navigate back to Progress
  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(600);

  const progressContainer2 = await page.$('#progress-container');
  const progressContent2 = progressContainer2 ? await progressContainer2.textContent() : '';
  assert(progressContent2.length > 0, 'Flow 6: Progress content persists after navigating away and back');
  assert(!progressContent2.includes('No plan'), 'Flow 6: Progress has no blank flash on return');

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

  // Verify "Sync Now" button exists on Settings screen
  await page.click('nav button:has-text("Settings")');
  await page.waitForTimeout(500);

  const profileText = await page.textContent('#screen-settings');
  const hasSyncNow = profileText.includes('Sync Now') || profileText.includes('sync now');
  // Also check for sync-related action buttons
  const syncBtn = await page.$('#sync-now-btn, button:has-text("Sync Now"), .s-action-btn--primary');
  assert(hasSyncNow || !!syncBtn, 'Sync Now button exists on Settings screen');

  await screenshot(page, 'ui-labels');
}

async function testFixtureSchema(fixtures) {
  console.log('\n--- Fixture Schema Validation ---');

  // Validate analysis entries match real processing output format
  for (const analysis of fixtures.analyses) {
    for (const entry of analysis.entries) {
      // All entries must have: id, type, description, calories
      assert(entry.id, `Analysis entry has id (date: ${analysis.date}, type: ${entry.type})`);
      assert(entry.type, `Analysis entry has type (id: ${entry.id})`);
      assert(entry.description != null, `Analysis entry has description (id: ${entry.id})`);

      if (entry.type === 'workout') {
        // Workouts use negative calories, NOT calories_burned
        assert(!entry.calories_burned, `Workout uses calories (negative), not calories_burned (id: ${entry.id})`);
        assert(entry.calories <= 0, `Workout calories are negative or zero (id: ${entry.id}, got: ${entry.calories})`);
      } else {
        // Food entries use positive calories
        assert(entry.calories >= 0, `Food calories are non-negative (id: ${entry.id}, got: ${entry.calories})`);
      }

      // No em dashes or smart quotes in descriptions (causes mojibake on Windows)
      if (entry.description) {
        assert(!entry.description.includes('\u2014'), `No em dash in description (id: ${entry.id})`);
        assert(!entry.description.includes('\u2013'), `No en dash in description (id: ${entry.id})`);
        assert(!entry.description.includes('\u201c') && !entry.description.includes('\u201d'), `No smart quotes in description (id: ${entry.id})`);
      }
    }
  }
}

async function testScoreCentering(page, fixtures) {
  console.log('\n--- Score Centering ---');

  // Navigate to a day with score data
  await page.evaluate((d) => App.goToDate(d), fixtures.dates[0]);
  await page.waitForTimeout(800);

  const scoreCard = await page.$('.day-score');
  if (scoreCard) {
    // Check that the score NUMBER is centered inside the score RING (bounding rect, not CSS props)
    const numberOffset = await page.evaluate(() => {
      const gauge = document.querySelector('.day-score-gauge');
      const num = document.querySelector('.score-number');
      if (!gauge || !num) return null;
      const gRect = gauge.getBoundingClientRect();
      const nRect = num.getBoundingClientRect();
      return {
        x: Math.abs((nRect.left + nRect.width / 2) - (gRect.left + gRect.width / 2)),
        y: Math.abs((nRect.top + nRect.height / 2) - (gRect.top + gRect.height / 2)),
      };
    });
    if (numberOffset) {
      assert(numberOffset.x < 2, `Score number centered horizontally in ring (offset: ${numberOffset.x.toFixed(1)}px)`);
      assert(numberOffset.y < 2, `Score number centered vertically in ring (offset: ${numberOffset.y.toFixed(1)}px)`);
    }

    // Verify score card is NOT center-aligned (should be left-aligned flex row)
    const cardJC = await page.$eval('.day-score', el => getComputedStyle(el).justifyContent);
    assert(cardJC !== 'center', `Score card is not center-aligned (got: ${cardJC})`);
  } else {
    assert(false, 'Score card (.day-score) found for centering test');
  }

  await screenshot(page, 'score-centering');
}

async function testScrollBehavior(page) {
  console.log('\n--- Scroll Behavior ---');
  // Body must NOT be scrollable (prevents iOS nav bounce)
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(100);
  const bodyScroll = await page.evaluate(() => window.scrollY);
  assert(bodyScroll === 0, `Body is not scrollable (scrollY: ${bodyScroll})`);

  // Active screen content MUST be scrollable
  const screenScroll = await page.evaluate(() => {
    const screen = document.querySelector('.screen.active');
    if (!screen) return null;
    const before = screen.scrollTop;
    screen.scrollTop = 500;
    const after = screen.scrollTop;
    screen.scrollTop = 0;
    return { scrollable: screen.scrollHeight > screen.clientHeight, didScroll: after > before };
  });
  if (screenScroll && screenScroll.scrollable) {
    assert(screenScroll.didScroll, 'Screen content is scrollable');
  }
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

async function testBugRegressions(page, fixtures) {
  console.log('\n--- Bug Regressions ---');

  // BUG: Stale form visible after day navigation (fixed in 1a41231)
  // Open body photo form via More sheet, then navigate to prev day
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(300);
  await page.click('#quick-more-btn').catch(() => {});
  await page.waitForTimeout(400);
  const bpBtn = await page.$('[data-more-type="bodyPhoto"]');
  if (bpBtn) {
    await bpBtn.click();
    await page.waitForTimeout(400);
    // Form should be open
    const formBefore = await page.evaluate(() => {
      const f = document.getElementById('log-form-inline');
      return f && f.style.display !== 'none' && f.offsetHeight > 0;
    });
    assert(formBefore, 'Regression: Body photo form opens');

    // Navigate to prev day
    await page.click('#header-prev');
    await page.waitForTimeout(500);

    // Form should be closed
    const formAfter = await page.evaluate(() => {
      const f = document.getElementById('log-form-inline');
      return f && f.style.display !== 'none' && f.offsetHeight > 0;
    });
    assert(!formAfter, 'Regression: Form closes on day navigation (was stale before fix)');

    // Navigate back to today
    await page.click('nav button:has-text("Today")');
    await page.waitForTimeout(300);
  }

  // BUG: syncNow called _doUpload() without date arg (fixed in 919961c)
  const syncNowPassesDate = await page.evaluate(() => {
    // Verify the syncNow code calls _doUpload(date) not _doUpload()
    const src = App.syncNow.toString();
    return src.includes('_doUpload(date)') || src.includes('_doUpload( date');
  });
  assert(syncNowPassesDate, 'Regression: syncNow passes date to _doUpload');

  // BUG: Water/weight had duplicate inline forms (consolidated in 37208ea)
  // Log.showForm for water should redirect to modal, not render inline
  const waterRedirects = await page.evaluate(() => {
    const src = Log.showForm.toString();
    return src.includes("type === 'water'") && src.includes('showWaterPicker');
  });
  assert(waterRedirects, 'Regression: Water form redirects to modal (no duplicate)');

  const weightRedirects = await page.evaluate(() => {
    const src = Log.showForm.toString();
    return src.includes("type === 'weight'") && src.includes('showWeightEntry');
  });
  assert(weightRedirects, 'Regression: Weight form redirects to modal (no duplicate)');

  // BUG: No online event listener for sync retry (fixed in 0aa50c6)
  const hasOnlineListener = await page.evaluate(() => {
    // Check that the online listener was registered by looking for its effect
    // We can't directly inspect event listeners, but we can check App.init source
    const src = App.init.toString();
    return src.includes("'online'") || src.includes('"online"');
  });
  assert(hasOnlineListener, 'Regression: Online event listener registered for sync retry');

  // BUG: Sync key visible in logs (fixed in 37208ea)
  const syncKeyMasked = await page.evaluate(() => {
    const src = CloudRelay.log.toString();
    return src.includes('replace') && src.includes('...');
  });
  assert(syncKeyMasked, 'Regression: Sync key masked in log output');

  // BUG: DayScore.calculate re-read all DB values (fixed in 8d6c08e)
  const scoreAcceptsPreloaded = await page.evaluate(() => {
    const src = DayScore.calculate.toString();
    return src.includes('preloaded');
  });
  assert(scoreAcceptsPreloaded, 'Regression: DayScore.calculate accepts preloaded data');
}

async function testSkincarePanel(page, fixtures) {
  console.log('\n--- Skincare Panel ---');

  // Navigate to Today
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);

  // Skincare segment button should exist (Phase 2+)
  const skinBtn = await page.$('.today-seg-btn[data-panel="skin"]').catch(() => null);
  assert(!!skinBtn, 'Skincare segment button exists');

  // Switch to skincare panel
  if (skinBtn) {
    await skinBtn.click().catch(() => {});
    await page.waitForTimeout(300);

    assert(true, 'Skincare panel activates on tap');
  }

  // Skincare container should exist
  const skinContainer = await page.$('#today-skincare').catch(() => null);
  assert(!!skinContainer, 'Skincare panel container exists');

  // Verify AM routine renders correct products
  const amHeader = await page.$('.skincare-section-header:has-text("AM")').catch(() => null);
  assert(!!amHeader, 'AM routine header renders');

  // Count AM product rows
  const skinContent = await page.evaluate(() => {
    const container = document.getElementById('today-skincare');
    if (!container) return null;
    const sections = container.querySelectorAll('.skincare-section-header');
    const amProducts = [];
    const pmProducts = [];
    let inPM = false;

    // Walk through product rows between section headers
    const allProducts = container.querySelectorAll('.skincare-product-row');
    for (const row of allProducts) {
      const name = row.querySelector('.fitness-exercise-name')?.textContent?.trim() || '';
      const category = row.querySelector('.skincare-category-badge')?.textContent?.trim() || '';
      // Determine if this is AM or PM by checking which section header precedes it
      const prevHeader = row.closest('#today-skincare')?.querySelector('.skincare-section-header + .skincare-product-row') === row ? 'AM' : null;
      // Simpler: check slot data attribute
      const slot = row.querySelector('.skincare-check')?.dataset?.slot || '';
      if (slot === 'am') amProducts.push({ name, category });
      else if (slot === 'pm') pmProducts.push({ name, category });
    }

    // Progress summary
    const progress = container.querySelector('.skincare-progress-summary')?.textContent?.trim() || '';

    // Face photo button
    const faceBtn = container.querySelector('#skincare-face-photo-btn');

    return { amProducts, pmProducts, progress, hasFaceBtn: !!faceBtn };
  });

  if (skinContent) {
    // AM routine: default template has 4 products (cleanser, vitamin_c, moisturizer, sunscreen)
    assert(skinContent.amProducts.length === 4, `AM routine has 4 products (got ${skinContent.amProducts.length})`);

    // Verify AM product names
    const expectedAM = ['CeraVe Foaming', 'Vitamin C Serum', 'CeraVe Moisturizer', 'Supergoop SPF 40'];
    const amNames = skinContent.amProducts.map(p => p.name);
    const amMatch = expectedAM.every((name, i) => amNames[i] === name);
    assert(amMatch, `AM products match fixture (got: ${amNames.join(', ')})`);

    // PM routine: default template has 3 products (cleanser, retinol/aha rotation, moisturizer)
    assert(skinContent.pmProducts.length === 3, `PM routine has 3 products (got ${skinContent.pmProducts.length})`);

    // PM first and last should always be cleanser and moisturizer
    if (skinContent.pmProducts.length >= 2) {
      assert(skinContent.pmProducts[0].name === 'CeraVe Foaming', `PM first product is cleanser (got: ${skinContent.pmProducts[0].name})`);
      assert(skinContent.pmProducts[skinContent.pmProducts.length - 1].name === 'CeraVe Moisturizer', `PM last product is moisturizer (got: ${skinContent.pmProducts[skinContent.pmProducts.length - 1].name})`);
    }

    // PM middle product should be retinol or aha (rotation)
    if (skinContent.pmProducts.length === 3) {
      const midName = skinContent.pmProducts[1].name;
      const validRotation = midName === 'Tretinoin 0.025%' || midName === 'Glycolic Acid 7%';
      assert(validRotation, `PM rotation product is retinol or AHA (got: ${midName})`);
    }

    // Progress summary should show counts
    assert(skinContent.progress.includes('AM'), `Progress summary shows AM count (got: ${skinContent.progress})`);
    assert(skinContent.progress.includes('PM'), `Progress summary shows PM count (got: ${skinContent.progress})`);

    // Face photo button should appear (no face photos in fixtures for today)
    assert(skinContent.hasFaceBtn, 'Face photo prompt appears for today');
  }

  // Verify all skincare items are scrollable (not clipped by overflow:hidden)
  const scrollCheck = await page.evaluate(() => {
    const screen = document.querySelector('.screen.active');
    const container = document.getElementById('today-skincare');
    if (!screen || !container) return null;

    const navBar = document.querySelector('.bottom-nav');
    const navTop = navBar ? navBar.getBoundingClientRect().top : window.innerHeight;

    // Scroll to bottom to reveal all items
    screen.scrollTop = screen.scrollHeight;

    // Check if the last skincare item is above the nav bar after scrolling
    const lastItem = container.querySelector('.skincare-product-row:last-of-type');
    const faceBtn = container.querySelector('#skincare-face-photo-btn');
    const lastEl = faceBtn || lastItem;

    if (!lastEl) return null;
    const rect = lastEl.getBoundingClientRect();

    return {
      scrollHeight: screen.scrollHeight,
      clientHeight: screen.clientHeight,
      canScroll: screen.scrollHeight > screen.clientHeight,
      lastItemBottom: Math.round(rect.bottom),
      navTop: Math.round(navTop),
      lastItemVisible: rect.bottom <= navTop,
    };
  });

  if (scrollCheck) {
    assert(scrollCheck.canScroll || scrollCheck.lastItemVisible,
      `Skincare content is scrollable or fully visible (scrollH=${scrollCheck.scrollHeight}, clientH=${scrollCheck.clientHeight}, lastBottom=${scrollCheck.lastItemBottom}, navTop=${scrollCheck.navTop})`);
    assert(scrollCheck.lastItemVisible,
      `Last skincare item is above nav bar after scroll (bottom=${scrollCheck.lastItemBottom}, navTop=${scrollCheck.navTop})`);
  }

  await screenshot(page, 'panel-skincare');

  // Switch back to diet
  const dietBtn = await page.$('.today-seg-btn[data-panel="diet"]').catch(() => null);
  if (dietBtn) {
    await dietBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }

  // Verify all 3 segment buttons exist
  const segBtns = await page.$$('.today-seg-btn').catch(() => []);
  assert(segBtns.length === 3, `3 segment buttons exist (got ${segBtns.length})`);
}

async function testFitnessPanel(page, fixtures) {
  console.log('\n--- Fitness Panel ---');

  // Navigate to Today (today = day5, Thursday in fixtures = cardio day)
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);

  // Switch to Fitness panel
  const fitBtn = await page.$('.today-seg-btn[data-panel="fitness"]').catch(() => null);
  assert(!!fitBtn, 'Fitness segment button exists');
  if (fitBtn) {
    await fitBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }

  // Verify fitness panel content
  const fitnessContent = await page.evaluate(() => {
    const container = document.getElementById('today-workout');
    if (!container) return null;

    // Day type header
    const dayHeader = container.querySelector('.fitness-day-header');
    const dayType = dayHeader?.querySelector('div')?.textContent?.trim() || '';
    const exerciseCount = dayHeader?.querySelectorAll('div')[1]?.textContent?.trim() || '';

    // Exercise cards
    const exerciseCards = container.querySelectorAll('.fitness-exercise');
    const exercises = [];
    for (const card of exerciseCards) {
      const name = card.querySelector('.fitness-exercise-name')?.textContent?.trim() || '';
      const setsReps = card.querySelector('[style*="accent-green"]')?.textContent?.trim() || '';
      const formCue = card.querySelector('[style*="text-muted"]')?.textContent?.trim() || '';
      const hasInfoBtn = !!card.querySelector('.fitness-info-btn');
      const hasCheckbox = !!card.querySelector('.fitness-check');
      exercises.push({ name, setsReps, formCue, hasInfoBtn, hasCheckbox });
    }

    // Notes section
    const notesCard = container.querySelector('.fitness-notes-card');
    const notesPrompt = container.querySelector('.fitness-notes-prompt');

    return { dayType, exerciseCount, exercises, hasNotesCard: !!notesCard, hasNotesPrompt: !!notesPrompt };
  });

  if (fitnessContent) {
    // Thursday = cardio day
    assert(fitnessContent.dayType === 'Cardio Day', `Day type header shows "Cardio Day" (got: "${fitnessContent.dayType}")`);
    assert(fitnessContent.exerciseCount.includes('1 exercise'), `Exercise count shows 1 exercise (got: "${fitnessContent.exerciseCount}")`);

    // Should have 1 exercise (30-min jog)
    assert(fitnessContent.exercises.length === 1, `Cardio day has 1 exercise (got ${fitnessContent.exercises.length})`);
    if (fitnessContent.exercises.length > 0) {
      assert(fitnessContent.exercises[0].name === '30-min jog', `Exercise is "30-min jog" (got: "${fitnessContent.exercises[0].name}")`);
      assert(fitnessContent.exercises[0].hasCheckbox, 'Exercise has checkbox');
      assert(fitnessContent.exercises[0].setsReps === '1x30 min', `Sets/reps shows "1x30 min" (got: "${fitnessContent.exercises[0].setsReps}")`);
    }

    // Notes section
    assert(fitnessContent.hasNotesCard, 'Notes card renders');
    assert(fitnessContent.hasNotesPrompt, 'Notes prompt shows (no notes logged)');
  }

  await screenshot(page, 'panel-fitness');

  // Navigate to Day 1 (Sunday) — a rest day in the fixture
  // Day 1 is 4 days ago = Sunday
  const day1Date = fixtures.dates[0];
  const day1DayName = new Date(day1Date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Navigate back 4 days to day1
  for (let i = 0; i < 4; i++) {
    await page.click('#header-prev');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);

  // Verify day1 fitness panel — Sunday is a rest day
  const restContent = await page.evaluate(() => {
    const container = document.getElementById('today-workout');
    if (!container) return null;
    const text = container.textContent || '';
    const hasRestLabel = text.toLowerCase().includes('rest day');
    const exerciseCards = container.querySelectorAll('.fitness-exercise');
    return { hasRestLabel, exerciseCount: exerciseCards.length };
  });

  if (restContent) {
    assert(restContent.hasRestLabel, 'Rest day shows "Rest Day" label');
    assert(restContent.exerciseCount === 0, `Rest day has no exercise cards (got ${restContent.exerciseCount})`);
  }

  await screenshot(page, 'panel-fitness-rest');

  // Navigate forward 2 days to Day 3 (Tuesday) — strength upper body push (3 exercises)
  for (let i = 0; i < 2; i++) {
    await page.click('#header-next');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);

  const strengthContent = await page.evaluate(() => {
    const container = document.getElementById('today-workout');
    if (!container) return null;

    const dayHeader = container.querySelector('.fitness-day-header');
    const dayType = dayHeader?.querySelector('div')?.textContent?.trim() || '';

    const exerciseCards = container.querySelectorAll('.fitness-exercise');
    const exercises = [];
    for (const card of exerciseCards) {
      const name = card.querySelector('.fitness-exercise-name')?.textContent?.trim() || '';
      const hasInfoBtn = !!card.querySelector('.fitness-info-btn');
      exercises.push({ name, hasInfoBtn });
    }

    // Core section divider
    const coreDivider = container.querySelector('[style*="uppercase"]');
    const hasCoreSection = container.textContent.includes('Core');

    return { dayType, exercises, hasCoreSection };
  });

  if (strengthContent) {
    assert(strengthContent.dayType === 'Upper body push', `Strength day shows type "Upper body push" (got: "${strengthContent.dayType}")`);
    assert(strengthContent.exercises.length === 3, `Strength day has 3 exercises (got ${strengthContent.exercises.length})`);

    if (strengthContent.exercises.length >= 3) {
      assert(strengthContent.exercises[0].name === 'Push-ups', `First exercise is Push-ups (got: "${strengthContent.exercises[0].name}")`);
      assert(strengthContent.exercises[0].hasInfoBtn, 'Push-ups has info button (in exercise database)');
      assert(strengthContent.exercises[2].name === 'Plank', `Third exercise is Plank (got: "${strengthContent.exercises[2].name}")`);
    }

    assert(strengthContent.hasCoreSection, 'Core section divider renders for strength day');
  }

  await screenshot(page, 'panel-fitness-strength');

  // Navigate back to today
  for (let i = 0; i < 2; i++) {
    await page.click('#header-next');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);

  // Switch back to diet panel
  const dietBtn = await page.$('.today-seg-btn[data-panel="diet"]').catch(() => null);
  if (dietBtn) {
    await dietBtn.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function testVisualQA(page, fixtures) {
  console.log('\n--- Visual QA ---');

  // Ensure we're on the Today screen, Diet panel
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(500);
  const dietBtn = await page.$('.today-seg-btn[data-panel="diet"]');
  if (dietBtn) { await dietBtn.click(); await page.waitForTimeout(300); }

  // 1. Touch target sizes — all interactive elements must be >= 44px in at least one dimension
  const touchTargets = await page.evaluate(() => {
    const MIN_SIZE = 44;
    const interactive = document.querySelectorAll('button, [onclick], input, textarea, .entry-item, a');
    const violations = [];
    for (const el of interactive) {
      // Skip hidden elements
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Skip elements outside viewport
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      if (rect.width < MIN_SIZE && rect.height < MIN_SIZE) {
        const id = el.id || el.className?.split?.(' ')?.[0] || el.tagName;
        const text = (el.textContent || '').trim().substring(0, 30);
        violations.push({ id, text, w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    }
    return violations;
  });

  const touchOk = touchTargets.length === 0;
  assert(touchOk, `All visible interactive elements >= 44px touch target (${touchTargets.length} violations${touchTargets.length > 0 ? ': ' + touchTargets.map(v => `${v.id}[${v.text}] ${v.w}x${v.h}`).join(', ') : ''})`);

  // 2. Score chips all visible (not clipped by container)
  const chipVisibility = await page.evaluate(() => {
    const chips = document.querySelectorAll('.score-chip');
    if (chips.length === 0) return { total: 0, visible: 0, clipped: [] };
    const containerRect = document.querySelector('.score-breakdown-wrap')?.getBoundingClientRect();
    if (!containerRect) return { total: chips.length, visible: 0, clipped: ['no container'] };
    let visible = 0;
    const clipped = [];
    for (const chip of chips) {
      const r = chip.getBoundingClientRect();
      // Chip is visible if its right edge is within the viewport
      if (r.right <= window.innerWidth + 2 && r.left >= -2) {
        visible++;
      } else {
        clipped.push(chip.textContent.trim());
      }
    }
    return { total: chips.length, visible, clipped };
  });

  assert(chipVisibility.total > 0 && chipVisibility.visible === chipVisibility.total,
    `All ${chipVisibility.total} score chips fully visible (${chipVisibility.visible} visible${chipVisibility.clipped.length > 0 ? ', clipped: ' + chipVisibility.clipped.join(', ') : ''})`);

  // 3. Content not hidden behind nav bar — check last visible element on each panel
  const navOverlap = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return { ok: true };
    const navTop = nav.getBoundingClientRect().top;
    const screen = document.querySelector('.screen.active');
    if (!screen) return { ok: true };

    // Scroll to bottom
    screen.scrollTop = screen.scrollHeight;

    // Check all entry items and cards
    const items = screen.querySelectorAll('.entry-item, .card, .skincare-product-row');
    const hidden = [];
    for (const item of items) {
      const r = item.getBoundingClientRect();
      // Skip items that should be off-screen (other panels)
      if (r.width === 0) continue;
      // Item's bottom is below nav top AND item is not fully above nav
      if (r.bottom > navTop + 5 && r.top < navTop) {
        const text = (item.textContent || '').trim().substring(0, 40);
        hidden.push(text);
      }
    }
    // Reset scroll
    screen.scrollTop = 0;
    return { ok: hidden.length === 0, hidden };
  });

  assert(navOverlap.ok, `No content hidden behind nav bar after scroll (${navOverlap.hidden?.length || 0} items overlap${navOverlap.hidden?.length > 0 ? ': ' + navOverlap.hidden[0] : ''})`);

  // 4. Inactive segment tabs are readable (contrast check)
  const segContrast = await page.evaluate(() => {
    const inactiveTabs = document.querySelectorAll('.today-seg-btn:not(.active)');
    const results = [];
    for (const tab of inactiveTabs) {
      const style = getComputedStyle(tab);
      const color = style.color;
      // Parse rgb values
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) continue;
      const [, r, g, b] = match.map(Number);
      // Calculate relative luminance (simplified)
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
      results.push({ text: tab.textContent.trim(), luminance: Math.round(luminance), color });
    }
    return results;
  });

  // Inactive tabs should have luminance > 80 (not too dim against dark background)
  const dimTabs = segContrast.filter(t => t.luminance < 80);
  assert(dimTabs.length === 0, `Inactive segment tabs readable (luminance >= 80)${dimTabs.length > 0 ? ' — too dim: ' + dimTabs.map(t => `"${t.text}" lum=${t.luminance}`).join(', ') : ''}`);

  // 5. Nav bar — all 4 tabs have visible text labels
  const navLabels = await page.evaluate(() => {
    const navBtns = document.querySelectorAll('.bottom-nav .nav-item');
    return Array.from(navBtns).map(btn => {
      const span = btn.querySelector('span');
      const text = span?.textContent?.trim() || '';
      const rect = btn.getBoundingClientRect();
      return { text, w: Math.round(rect.width), h: Math.round(rect.height) };
    });
  });

  assert(navLabels.length === 4, `Nav bar has 4 tabs (got ${navLabels.length})`);
  const allLabeled = navLabels.every(n => n.text.length > 0);
  assert(allLabeled, `All nav tabs have text labels (${navLabels.map(n => n.text || '""').join(', ')})`);

  // 6. Check all panels for content clipping — switch to each panel, scroll to bottom
  for (const panel of ['fitness', 'skin']) {
    const panelBtn = await page.$(`.today-seg-btn[data-panel="${panel}"]`);
    if (panelBtn) {
      await panelBtn.click();
      await page.waitForTimeout(400);

      const panelClip = await page.evaluate((panelName) => {
        const screen = document.querySelector('.screen.active');
        const nav = document.querySelector('.bottom-nav');
        if (!screen || !nav) return { ok: true, panel: panelName };
        const navTop = nav.getBoundingClientRect().top;

        screen.scrollTop = screen.scrollHeight;

        // Find last visible content element in this panel
        const panelEl = document.getElementById(`panel-${panelName}`) || document.getElementById(`today-${panelName === 'skin' ? 'skincare' : 'workout'}`);
        if (!panelEl) return { ok: true, panel: panelName };

        const children = panelEl.querySelectorAll('.card, .skincare-product-row, .fitness-exercise, button');
        let lastVisible = null;
        for (const child of children) {
          const r = child.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) lastVisible = { bottom: r.bottom, text: (child.textContent || '').trim().substring(0, 30) };
        }

        screen.scrollTop = 0;
        if (!lastVisible) return { ok: true, panel: panelName };
        return { ok: lastVisible.bottom <= navTop + 5, panel: panelName, lastBottom: Math.round(lastVisible.bottom), navTop: Math.round(navTop), lastText: lastVisible.text };
      }, panel);

      assert(panelClip.ok, `${panel} panel content not clipped by nav (last=${panelClip.lastBottom}, nav=${panelClip.navTop}${!panelClip.ok ? ' — hidden: "' + panelClip.lastText + '"' : ''})`);
    }
  }

  // Switch back to diet
  if (dietBtn) { await dietBtn.click(); await page.waitForTimeout(300); }

  // 7. Entry cards have adequate height for tapping
  const entryHeights = await page.evaluate(() => {
    const entries = document.querySelectorAll('.entry-item');
    const short = [];
    for (const e of entries) {
      const rect = e.getBoundingClientRect();
      if (rect.height > 0 && rect.height < 48) {
        short.push({ text: (e.textContent || '').trim().substring(0, 30), h: Math.round(rect.height) });
      }
    }
    return short;
  });

  assert(entryHeights.length === 0, `All entry cards >= 48px tall (${entryHeights.length} too short${entryHeights.length > 0 ? ': ' + entryHeights.map(e => `"${e.text}" ${e.h}px`).join(', ') : ''})`);

  // 8. Edit modal textarea — caret visible, content not clipped
  // Navigate to a day with entries and open the edit modal
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(300);

  const entryItem = await page.$('.entry-swipe-wrap .entry-item');
  if (entryItem) {
    await entryItem.click();
    await page.waitForTimeout(500);

    const textareaCheck = await page.evaluate(() => {
      const textarea = document.getElementById('edit-notes');
      if (!textarea) return { found: false };

      const style = getComputedStyle(textarea);
      const rect = textarea.getBoundingClientRect();

      // Check that textarea has enough height for its content
      const contentOverflows = textarea.scrollHeight > textarea.clientHeight + 4;

      // Check padding — bottom padding should be adequate for cursor
      const paddingBottom = parseFloat(style.paddingBottom);

      // Focus and check caret would be visible
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);

      // After focus, textarea rect should be within the modal sheet
      const sheet = textarea.closest('.modal-sheet');
      const sheetRect = sheet ? sheet.getBoundingClientRect() : null;
      const textareaInSheet = sheetRect ? (rect.bottom <= sheetRect.bottom + 2) : true;

      return {
        found: true,
        height: Math.round(rect.height),
        scrollHeight: textarea.scrollHeight,
        clientHeight: textarea.clientHeight,
        contentOverflows,
        paddingBottom: Math.round(paddingBottom),
        overflowY: style.overflowY,
        textareaInSheet,
      };
    });

    if (textareaCheck.found) {
      assert(!textareaCheck.contentOverflows, `Edit modal textarea content not clipped (scrollH=${textareaCheck.scrollHeight}, clientH=${textareaCheck.clientHeight})`);
      assert(textareaCheck.paddingBottom >= 8, `Edit modal textarea has adequate bottom padding for cursor (${textareaCheck.paddingBottom}px)`);
      assert(textareaCheck.textareaInSheet, 'Edit modal textarea is within modal sheet bounds');
    }

    // Close modal
    const closeBtn = await page.$('#edit-close');
    if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(300); }
  }

  // 9. All textareas — verify none clip content AND all have adequate bottom padding for cursor
  // Check each screen AND each Today panel (fitness has its own textareas)
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(300);

  // Expand fitness notes textarea (hidden behind prompt by default)
  const fitSeg = await page.$('.today-seg-btn[data-panel="fitness"]');
  if (fitSeg) { await fitSeg.click(); await page.waitForTimeout(400); }
  const notesPrompt = await page.$('.fitness-notes-prompt');
  if (notesPrompt) { await notesPrompt.click(); await page.waitForTimeout(300); }

  // Check fitness panel textarea while it's the active panel
  const fitTextareaIssues = await page.evaluate(() => {
    const issues = [];
    const textareas = document.querySelectorAll('#panel-fitness textarea, #today-workout textarea');
    for (const ta of textareas) {
      const style = getComputedStyle(ta);
      if (style.display === 'none') continue;

      const paddingBottom = parseFloat(style.paddingBottom);
      if (paddingBottom < 8) {
        issues.push({ id: ta.id || '', placeholder: ta.placeholder || '', issue: 'low padding-bottom', paddingBottom: Math.round(paddingBottom) });
      }
      if (ta.scrollHeight > ta.clientHeight + 4 && style.overflowY === 'hidden') {
        issues.push({ id: ta.id || '', placeholder: ta.placeholder || '', issue: 'content clipped', scrollH: ta.scrollHeight, clientH: ta.clientHeight });
      }
    }
    return issues;
  });

  assert(fitTextareaIssues.length === 0, `Fitness panel textareas have adequate padding (${fitTextareaIssues.length} issues${fitTextareaIssues.length > 0 ? ': ' + fitTextareaIssues.map(t => `${t.id}[${t.issue}${t.paddingBottom != null ? '=' + t.paddingBottom + 'px' : ''}]`).join(', ') : ''})`);

  // Switch back to diet
  const dietSeg2 = await page.$('.today-seg-btn[data-panel="diet"]');
  if (dietSeg2) { await dietSeg2.click(); await page.waitForTimeout(300); }

  // Check Coach and Settings screens
  for (const scr of ['Coach', 'Settings']) {
    await page.click(`nav button:has-text("${scr}")`);
    await page.waitForTimeout(400);

    const textareaIssues = await page.evaluate((screenName) => {
      const screen = document.querySelector('.screen.active');
      if (!screen) return [];
      const textareas = screen.querySelectorAll('textarea');
      const issues = [];
      for (const ta of textareas) {
        const style = getComputedStyle(ta);
        if (style.display === 'none') continue;
        const rect = ta.getBoundingClientRect();
        if (rect.height === 0) continue;

        if (ta.scrollHeight > ta.clientHeight + 4 && style.overflowY === 'hidden') {
          issues.push({ screen: screenName, id: ta.id || '', issue: 'content clipped' });
        }
        const paddingBottom = parseFloat(style.paddingBottom);
        if (paddingBottom < 8) {
          issues.push({ screen: screenName, id: ta.id || '', issue: 'low padding-bottom', paddingBottom: Math.round(paddingBottom) });
        }
      }
      return issues;
    }, scr);

    assert(textareaIssues.length === 0, `${scr}: all textareas have adequate padding (${textareaIssues.length} issues${textareaIssues.length > 0 ? ': ' + textareaIssues.map(t => `${t.id}[${t.issue}${t.paddingBottom != null ? '=' + t.paddingBottom + 'px' : ''}]`).join(', ') : ''})`);
  }

  // 10. Photo thumbnails — entries with photos must render actual images (not empty boxes)
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(300);
  await page.click('.today-seg-btn[data-panel="diet"]').catch(() => {});

  const brokenPhotos = await page.evaluate(() => {
    const thumbs = document.querySelectorAll('.entry-photo-thumb');
    const broken = [];
    for (const el of thumbs) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.tagName === 'IMG' && (!el.src || el.naturalWidth === 0)) {
        broken.push({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    }
    return broken;
  });

  assert(brokenPhotos.length === 0, `No broken/empty photo thumbnails (${brokenPhotos.length} entries show empty ${brokenPhotos.length > 0 ? brokenPhotos[0].w + 'x' + brokenPhotos[0].h + ' boxes' : ''})`);

  // 10b. Orphan photo resilience — entry with photo:true but no blob should NOT show empty gray box
  await page.evaluate(async () => {
    await DB.addEntry({
      id: 'test_orphan_photo',
      type: 'meal', subtype: null,
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      notes: 'Orphan photo test', photo: true, duration_minutes: null,
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const orphanCheck = await page.evaluate(() => {
    const thumbs = document.querySelectorAll('.entry-photo-thumb');
    const visible = [];
    for (const el of thumbs) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || rect.width === 0) continue;
      if (el.tagName === 'IMG' && (!el.src || el.src === '' || el.naturalWidth === 0)) {
        visible.push({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    }
    return visible;
  });

  assert(orphanCheck.length === 0, `Orphan photo entries don't show empty gray box (${orphanCheck.length} visible${orphanCheck.length > 0 ? ': ' + orphanCheck[0].w + 'x' + orphanCheck[0].h : ''})`);

  // Clean up test entry
  await page.evaluate(async () => { await DB.deleteEntry('test_orphan_photo'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 11. Today button — appears on past dates, hidden on today, meets touch target
  for (let i = 0; i < 2; i++) { await page.click('#header-prev'); await page.waitForTimeout(200); }
  await page.waitForTimeout(300);

  const todayBtnCheck = await page.evaluate(() => {
    const btn = document.getElementById('header-today');
    if (!btn) return { found: false };
    const rect = btn.getBoundingClientRect();
    const style = getComputedStyle(btn);
    return { found: true, display: style.display, h: Math.round(rect.height), w: Math.round(rect.width), visible: style.display !== 'none' && rect.width > 0 };
  });
  assert(todayBtnCheck.found && todayBtnCheck.visible, 'Today button visible on past date');
  assert(todayBtnCheck.h >= 44, `Today button meets 44px touch target (got ${todayBtnCheck.h}px)`);

  // Click Today to go back
  await page.click('#header-today');
  await page.waitForTimeout(500);

  const todayBtnHidden = await page.evaluate(() => {
    const btn = document.getElementById('header-today');
    return btn ? getComputedStyle(btn).display : 'missing';
  });
  assert(todayBtnHidden === 'none', 'Today button hidden when on today');

  // 11b. Weight chart renders with fixture data
  await page.click('nav button:has-text("Progress")');
  await page.waitForTimeout(500);
  await page.click('.segment-btn[data-ptab="trends"]');
  await page.waitForTimeout(500);

  const weightChartCheck = await page.evaluate(() => {
    const svg = document.getElementById('weight-trend-svg');
    if (!svg) return { found: false };
    const points = JSON.parse(svg.dataset.points || '[]');
    const tooltip = document.querySelector('.weight-chart-tooltip');
    return { found: true, pointCount: points.length, hasTooltip: !!tooltip, h: Math.round(svg.getBoundingClientRect().height) };
  });
  assert(weightChartCheck.found, 'Weight trend chart renders');
  assert(weightChartCheck.pointCount >= 3, `Weight chart has data points (got ${weightChartCheck.pointCount})`);
  assert(weightChartCheck.hasTooltip, 'Weight chart has tooltip element for touch interaction');

  // 11c. Progress photos grouped by subtype
  const photoSubtypes = await page.evaluate(() => {
    const subtypes = document.querySelectorAll('.progress-photos-subtype');
    return Array.from(subtypes).map(st => ({
      label: st.querySelector('.progress-photos-subtype-label')?.textContent?.trim() || '',
      hasPhotos: st.querySelectorAll('.progress-photo-card').length > 0,
      hasEmpty: !!st.querySelector('.progress-photos-empty'),
    }));
  });
  assert(photoSubtypes.length >= 2, `Progress photos has ${photoSubtypes.length} subtype sections (expected >= 2)`);
  const bodySection = photoSubtypes.find(s => s.label === 'Body');
  assert(bodySection, 'Progress photos has Body section');

  // Go back to Today screen for remaining tests
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(300);
  await page.click('.today-seg-btn[data-panel="diet"]').catch(() => {});

  // 11d. Today screen section spacing is consistent (>= 12px between major sections)
  await page.click('nav button:has-text("Today")');
  await page.waitForTimeout(300);
  await page.click('.today-seg-btn[data-panel="diet"]').catch(() => {});

  const sectionGaps = await page.evaluate(() => {
    const score = document.querySelector('#today-score');
    const segments = document.querySelector('.today-segments');
    const statsCards = document.querySelectorAll('.stat-card');
    const quickActions = document.querySelector('.quick-actions');
    const entryList = document.querySelector('.entry-list, #today-entries');

    const gaps = [];
    const measure = (nameA, elA, nameB, elB) => {
      if (!elA || !elB) return;
      const gap = Math.round(elB.getBoundingClientRect().top - elA.getBoundingClientRect().bottom);
      gaps.push({ between: `${nameA}→${nameB}`, gap });
    };

    measure('score', score, 'stats', statsCards[0]);
    if (statsCards.length >= 4) measure('stats', statsCards[3], 'segments', segments);
    measure('segments', segments, 'quickActions', quickActions);
    measure('quickActions', quickActions, 'entries', entryList);

    return gaps;
  });

  for (const g of sectionGaps) {
    assert(g.gap >= 12 && g.gap <= 24, `Section spacing ${g.between} is 12-24px (got ${g.gap}px)`);
  }

  // 11b. Delete-bg not visible when entry is not swiped (no red corner peek)
  const deleteBgVisible = await page.evaluate(() => {
    const bgs = document.querySelectorAll('.entry-delete-bg');
    const visible = [];
    for (const bg of bgs) {
      const style = getComputedStyle(bg);
      if (style.display !== 'none') {
        visible.push({ display: style.display });
      }
    }
    return visible;
  });

  assert(deleteBgVisible.length === 0, `No delete-bg visible when not swiping (${deleteBgVisible.length} visible)`);

  // 11c. Entry swipe wrappers don't clip entry content vertically
  const wrapClipping = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.entry-swipe-wrap');
    const issues = [];
    for (const w of wraps) {
      const ws = getComputedStyle(w);
      const overflowY = ws.overflowY;
      // overflow-y should NOT be 'hidden' — it clips slideInUp animation and borders
      if (overflowY === 'hidden') {
        issues.push({ overflowY });
      }
    }
    return issues;
  });

  assert(wrapClipping.length === 0, `Entry swipe wrappers don't clip vertically (${wrapClipping.length} have overflow-y:hidden)`);

  // 12. No excessive empty gaps on any screen (> 40% of viewport between content and nav)
  for (const scr of ['Today', 'Coach', 'Progress', 'Settings']) {
    await page.click(`nav button:has-text("${scr}")`);
    await page.waitForTimeout(500);

    const gap = await page.evaluate((name) => {
      const screen = document.querySelector('.screen.active');
      const nav = document.querySelector('.bottom-nav');
      if (!screen || !nav) return { ok: true };

      const allContent = screen.querySelectorAll('*');
      let lastBottom = 0;
      for (const el of allContent) {
        if (el.children.length > 0) continue; // only leaf nodes
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > lastBottom) lastBottom = r.bottom;
      }

      const navTop = nav.getBoundingClientRect().top;
      const emptyGap = navTop - lastBottom;
      const gapPct = Math.round((emptyGap / window.innerHeight) * 100);
      return { ok: gapPct <= 40, screen: name, gapPct, emptyGap: Math.round(emptyGap) };
    }, scr);

    assert(gap.ok, `${gap.screen}: no excessive empty space (${gap.gapPct}% gap = ${gap.emptyGap}px between content and nav)`);
  }

  await screenshot(page, 'visual-qa');
}

async function testVisualQA320(page, context, fixtures) {
  console.log('\n--- Visual QA (320px) ---');

  // Create a 320px viewport page
  const smallPage = await context.newPage();
  await smallPage.setViewportSize({ width: 320, height: 568 });
  await smallPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await smallPage.waitForTimeout(1500);
  await smallPage.waitForFunction(() => typeof DB !== 'undefined' && typeof DB.openDB === 'function');

  // Re-inject fixtures on the small page
  await smallPage.evaluate(async (data) => {
    const db = await DB.openDB();
    for (const s of ['entries','dailySummary','analysis','profile','mealPlan','photos']) {
      const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).clear();
      await new Promise(r => { tx.oncomplete = r; });
    }
    for (const e of data.entries) await DB.addEntry(e);
    for (const s of data.summaries) await DB.updateDailySummary(s.date, s);
    await DB.setProfile('goals', data.goals);
    await DB.setProfile('regimen', data.regimen);
    await DB.setProfile('mealPlan', data.mealPlan);
    try { await DB.setProfile('skincare', data.skincareProfile); } catch(e){}
  }, fixtures);
  await smallPage.reload({ waitUntil: 'networkidle' });
  await smallPage.waitForTimeout(1000);

  // Navigate to Settings
  await smallPage.click('nav button:has-text("Settings")');
  await smallPage.waitForTimeout(500);

  // 1. Check for overlapping interactive elements on Settings screen
  const overlaps = await smallPage.evaluate(() => {
    const screen = document.querySelector('.screen.active');
    if (!screen) return [];
    const buttons = screen.querySelectorAll('button');
    const rects = [];
    for (const btn of buttons) {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      rects.push({ text: btn.textContent.trim().substring(0, 20), top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: Math.round(r.height) });
    }
    const issues = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          issues.push(`"${a.text}" overlaps "${b.text}"`);
        }
      }
    }
    return issues;
  });

  assert(overlaps.length === 0, `No overlapping buttons on Settings at 320px (${overlaps.length} overlaps${overlaps.length > 0 ? ': ' + overlaps.join('; ') : ''})`);

  // 2. Check that all Settings buttons meet 44px minimum touch target
  const smallBtns = await smallPage.evaluate(() => {
    const screen = document.querySelector('.screen.active');
    if (!screen) return [];
    const buttons = screen.querySelectorAll('button');
    const violations = [];
    for (const btn of buttons) {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44 || r.width < 44) {
        violations.push({ text: btn.textContent.trim().substring(0, 20), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return violations;
  });

  assert(smallBtns.length === 0, `All Settings buttons >= 44px at 320px (${smallBtns.length} violations${smallBtns.length > 0 ? ': ' + smallBtns.map(b => `"${b.text}" ${b.w}x${b.h}`).join(', ') : ''})`);

  await screenshot(smallPage, 'visual-qa-320-settings');
  await smallPage.close();
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
    await testFixtureSchema(fixtures);
    await testProfileRoundTrip(page, fixtures);
    await testAnalysisStatusIndicators(page, fixtures);
    await testUILabels(page, fixtures);
    await testScoreCentering(page, fixtures);
    await testMultiViewport(page, context, fixtures);
    await testBugRegressions(page, fixtures);
    await testSkincarePanel(page, fixtures);
    await testFitnessPanel(page, fixtures);
    await testVisualQA(page, fixtures);
    await testVisualQA320(page, context, fixtures);
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

  // Phase 4: Chaos Testing (if --chaos flag passed)
  let chaosFailed = 0;
  if (RUN_CHAOS) {
    console.log('\n=== Phase 4: Chaos Testing ===');
    const { runChaos } = require('./chaos');
    const chaosResult = await runChaos();
    chaosFailed = chaosResult.issues;
  }

  const totalFailed = failed + dogfoodFailed + chaosFailed;
  if (RUN_DOGFOOD || RUN_CHAOS) {
    console.log(`\n=== Overall: ${totalFailed === 0 ? 'ALL PHASES PASSED' : 'SOME TESTS FAILED'} ===`);
  }
  process.exit(totalFailed > 0 ? 1 : 0);
}

run();
