// app.js — Routing, init, navigation

// --- Daily Coach (suggestions based on yesterday's data + goals) ---
const Coach = {
  async getSuggestions(date) {
    // Only show coach for today — past dates don't need forward-looking tips
    if (date !== UI.today()) return [];

    const tips = [];
    const goals = await DB.getProfile('goals') || {};
    const yesterday = Coach._prevDate(date);
    const analysis = await DB.getAnalysis(yesterday);

    if (analysis) {
      const totals = analysis.totals || {};

      // Calorie gap
      if (goals.calories && totals.calories != null) {
        const gap = goals.calories - totals.calories;
        if (gap > 200) {
          tips.push({ icon: '\u{1F525}', text: `Yesterday: ${totals.calories} cal (${gap} under). Aim for ${goals.calories} today.`, highlight: true });
        } else if (gap < -200) {
          tips.push({ icon: '\u{2696}\uFE0F', text: `Yesterday: ${totals.calories} cal (${Math.abs(gap)} over). Lighter day today.` });
        } else {
          tips.push({ icon: '\u{2705}', text: `Yesterday: ${totals.calories} cal \u2014 right on target!`, highlight: true });
        }
      }

      // Protein gap
      if (goals.protein && totals.protein != null) {
        const gap = goals.protein - totals.protein;
        if (gap > 20) {
          const foods = Coach._proteinIdeas(yesterday);
          tips.push({ icon: '\u{1F4AA}', text: `Protein was ${totals.protein}g (goal: ${goals.protein}g). Try: ${foods}`, highlight: true });
        }
      }

      // Water gap — try analysis.goals.water first, fall back to daily summary
      if (goals.water_oz) {
        let waterActual = analysis.goals?.water?.actual_oz;
        if (waterActual == null) {
          const yesterdaySummary = await DB.getDailySummary(yesterday);
          waterActual = yesterdaySummary.water_oz || null;
        }
        if (waterActual != null && waterActual < goals.water_oz * 0.7) {
          tips.push({ icon: '\u{1F4A7}', text: `Only ${waterActual} oz water yesterday. Start sipping early \u2014 goal is ${goals.water_oz} oz.` });
        }
      }
    }

    // Workout suggestion from regimen
    const regimen = await DB.getRegimen();
    if (regimen?.weeklySchedule) {
      const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const todayPlan = regimen.weeklySchedule.find(d => d.day === dayName);
      if (todayPlan && todayPlan.type !== 'rest') {
        tips.push({ icon: '\u{1F3CB}\uFE0F', text: `${todayPlan.description}`, highlight: true });
      } else if (todayPlan?.type === 'rest') {
        tips.push({ icon: '\u{1F9D8}', text: 'Rest day \u2014 stretch, walk, recover.' });
      }
    }

    return tips;
  },

  _prevDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _proteinIdeas(dateSeed) {
    const foods = [
      'eggs (6g each)', 'Greek yogurt (15g)', 'chicken breast (25g/4oz)',
      'protein shake (25\u201330g)', 'cottage cheese (14g/cup)', 'tuna can (20g)',
      'edamame (17g/cup)', 'turkey slices (18g/4oz)',
    ];
    // Deterministic pick based on date
    const seed = parseInt(dateSeed.replace(/-/g, ''), 10);
    const picked = [];
    const copy = [...foods];
    for (let i = 0; i < 3 && copy.length; i++) {
      const idx = (seed + i * 7) % copy.length;
      picked.push(copy.splice(idx, 1)[0]);
    }
    return picked.join(', ');
  },

  render(tips) {
    if (!tips.length) return '';
    return `
      <div class="coach-card">
        <div class="coach-header">Daily Coach</div>
        ${tips.map(t => `
          <div class="coach-tip${t.highlight ? ' coach-tip--highlight' : ''}">
            <span class="coach-tip-icon">${t.icon}</span>
            <span class="coach-tip-text">${UI.escapeHtml(t.text)}</span>
          </div>
        `).join('')}
      </div>
    `;
  },
};

// --- Quick Log (zero-friction logging from Today screen) ---
const QuickLog = {
  init() {
    document.getElementById('quick-photo-btn')?.addEventListener('click', () => QuickLog.snapFood());
    document.getElementById('quick-water-btn')?.addEventListener('click', () => QuickLog.showWaterPicker());
    document.getElementById('quick-weight-btn')?.addEventListener('click', () => QuickLog.showWeightEntry());
  },

  // --- Snap food → auto-save (zero taps after photo) ---
  async snapFood() {
    const photo = await Camera.capture('meal');
    if (!photo) return;

    const today = UI.today();
    const entry = {
      id: UI.generateId('meal'),
      type: 'meal',
      subtype: null,
      date: today,
      timestamp: new Date().toISOString(),
      notes: '',
      photo: true,
      duration_minutes: null,
    };

    try {
      await DB.addEntry(entry, photo.blob);
      UI.toast('Food logged');
      CloudRelay.queueUpload(today);
      if (App.selectedDate !== today) {
        App.selectedDate = today;
        App.updateHeaderDate();
      }
      App.loadDayView();
    } catch (err) {
      console.error('Quick save failed:', err);
      UI.toast('Failed to save', 'error');
      Camera.revokeURL(photo.url);
    }
  },

  // --- Visual water picker ---
  async showWaterPicker() {
    const today = UI.today();
    const summary = await DB.getDailySummary(today);
    const currentOz = summary.water_oz || 0;
    const goals = await DB.getProfile('goals') || {};
    const waterGoal = goals.water_oz || 96;

    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');

    const containers = [
      { label: 'Small cup', oz: 6, icon: '\u{1F964}', desc: 'Coffee cup, juice glass' },
      { label: 'Glass', oz: 10, icon: '\u{1FAD7}', desc: 'Standard drinking glass' },
      { label: 'Can / small bottle', oz: 12, icon: '\u{1F96B}', desc: 'Soda can, La Croix' },
      { label: 'Tall glass', oz: 16, icon: '\u{1F95B}', desc: 'Pint glass, tall tumbler' },
      { label: 'Water bottle', oz: 24, icon: '\u{1FAD9}', desc: 'Standard reusable bottle' },
      { label: 'Large bottle', oz: 32, icon: '\u{1F4A7}', desc: 'Nalgene, large tumbler' },
      { label: 'Big jug', oz: 40, icon: '\u{1FAD9}', desc: '40oz Stanley, Hydroflask' },
    ];

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Add Water</span>
        <button class="modal-close" id="wp-close">&times;</button>
      </div>
      <div style="text-align: center; margin-bottom: var(--space-md); color: var(--text-secondary); font-size: var(--text-sm);">
        Today: <strong style="color: var(--color-water)">${currentOz} oz</strong> of ${waterGoal} oz goal
      </div>
      <div class="water-picker-grid">
        ${containers.map(c => `
          <button class="water-pick" data-oz="${c.oz}">
            <div class="water-pick-icon">${c.icon}</div>
            <div class="water-pick-oz">${c.oz} oz</div>
            <div class="water-pick-label">${c.label}</div>
          </button>
        `).join('')}
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    document.getElementById('wp-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    sheet.querySelectorAll('.water-pick').forEach(btn => {
      btn.addEventListener('click', async () => {
        const oz = parseInt(btn.dataset.oz);
        try {
          const fresh = await DB.getDailySummary(today);
          const newTotal = (fresh.water_oz || 0) + oz;
          await DB.updateDailySummary(today, { water_oz: newTotal });
          UI.toast(`Water: ${newTotal} oz (+${oz})`);
          CloudRelay.queueUpload(today);
          closeModal();
          if (App.selectedDate === today) App.loadDayView();
        } catch (err) {
          console.error('Quick water failed:', err);
          UI.toast('Failed to save water', 'error');
        }
      });
    });
  },

  // --- Quick weight modal (always logs to today) ---
  showWeightEntry() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const today = UI.today();

    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '50dvh';
    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Log Weight</span>
        <button class="modal-close" id="qw-close">&times;</button>
      </div>
      <div class="form-group">
        <div class="number-input" style="justify-content:center;">
          <button class="btn btn-secondary" id="qw-minus">\u2212</button>
          <input type="number" class="form-input" id="qw-weight" placeholder="135.0" step="0.1" inputmode="decimal">
          <button class="btn btn-secondary" id="qw-plus">+</button>
        </div>
        <div style="text-align:center; color:var(--text-muted); font-size:var(--text-sm); margin-top:var(--space-xs);">lbs</div>
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="qw-save">Save Weight</button>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    // Pre-fill current weight and auto-focus
    DB.getDailySummary(today).then(summary => {
      const input = document.getElementById('qw-weight');
      if (summary.weight) input.value = summary.weight.value;
      input.focus();
    }).catch(() => {});

    // +/- buttons (prevent going below 0)
    document.getElementById('qw-minus')?.addEventListener('click', () => {
      const input = document.getElementById('qw-weight');
      input.value = Math.max(0, parseFloat(input.value || 0) - 0.1).toFixed(1);
    });
    document.getElementById('qw-plus')?.addEventListener('click', () => {
      const input = document.getElementById('qw-weight');
      input.value = (parseFloat(input.value || 0) + 0.1).toFixed(1);
    });

    const closeModal = () => overlay.remove();
    document.getElementById('qw-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    // Save
    document.getElementById('qw-save').addEventListener('click', async () => {
      const value = parseFloat(document.getElementById('qw-weight')?.value);
      if (isNaN(value) || value <= 0) {
        UI.toast('Enter a valid weight', 'error');
        return;
      }
      try {
        await DB.updateDailySummary(today, { weight: { value, unit: 'lbs' } });
        UI.toast(`Weight: ${value} lbs saved`);
        CloudRelay.queueUpload(today);
        overlay.remove();
        if (App.selectedDate === today) App.loadDayView();
      } catch (err) {
        console.error('Quick weight failed:', err);
        UI.toast('Failed to save weight', 'error');
      }
    });
  },
};

const App = {
  currentScreen: null,
  selectedDate: null,

  init() {
    App.selectedDate = UI.today();
    App.updateHeaderDate();
    App.setupNavigation();
    App.setupDateNav();
    QuickLog.init();
    window.addEventListener('hashchange', () => App.handleRoute());

    // Initialize DB, then load the initial route
    DB.openDB().then(() => {
      console.log('DB ready');
      // Initialize auto-sync (runs backup if needed)
      AutoSync.init().catch(err => console.warn('AutoSync init failed:', err));
      // Check for cloud relay results
      CloudRelay.checkForResults().catch(err => console.warn('CloudRelay check failed:', err));
      App.handleRoute();
    }).catch(err => {
      console.error('DB init failed:', err);
      UI.toast('Database error', 'error');
    });
  },

  // --- Routing ---
  routes: {
    '': 'today',
    '#today': 'today',
    '#log': 'log',
    '#calendar': 'calendar',
    '#goals': 'goals',
    '#settings': 'settings',
  },

  handleRoute() {
    const hash = window.location.hash || '';
    const screenId = App.routes[hash] || 'today';
    App.showScreen(screenId);
  },

  showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    // Show target
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
      target.classList.add('active');
      App.currentScreen = screenId;
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.screen === screenId);
    });

    // Screen-specific init
    if (screenId === 'today') App.loadDayView();
    if (screenId === 'log') Log.init();
    if (screenId === 'calendar') Calendar.init();
    if (screenId === 'goals') GoalsView.init();
    if (screenId === 'settings') {
      Settings.loadGoalsSummary();
      Settings.loadStorageInfo();
      Settings.loadCloudSyncStatus();
      Settings.initAutoSyncToggle();
      Settings.initUpdateButton();
      Settings.loadVersion();
    }
  },

  // --- Navigation ---
  setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const screen = item.dataset.screen;
        if (screen === 'today') {
          App.selectedDate = UI.today();
          App.updateHeaderDate();
          if (window.location.hash === '' || window.location.hash === '#today') {
            App.showScreen('today');
          } else {
            window.location.hash = '';
          }
        } else {
          window.location.hash = screen;
        }
      });
    });
  },

  // --- Date Navigation ---
  setupDateNav() {
    document.getElementById('header-prev')?.addEventListener('click', () => App.navigateDay(-1));
    document.getElementById('header-next')?.addEventListener('click', () => App.navigateDay(1));
  },

  navigateDay(offset) {
    const d = new Date(App.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Don't navigate into the future
    if (newDate > UI.today()) return;
    App.selectedDate = newDate;
    App.updateHeaderDate();
    if (App.currentScreen === 'today') App.loadDayView();
  },

  // --- Header ---
  updateHeaderDate() {
    const el = document.querySelector('.header-date');
    if (el) el.textContent = UI.formatRelativeDate(App.selectedDate);
    // Hide next button if already on today
    const nextBtn = document.getElementById('header-next');
    if (nextBtn) nextBtn.style.visibility = App.selectedDate >= UI.today() ? 'hidden' : 'visible';
  },

  // --- Today/Day View ---
  async loadDayView() {
    const date = App.selectedDate;
    App.updateHeaderDate();

    // Load entries
    const entries = await DB.getEntriesByDate(date);
    const entryList = document.getElementById('today-entries');
    if (!entryList) return;

    UI.clearChildren(entryList);

    // Show/hide export button based on entries
    const exportDiv = document.getElementById('today-export');
    if (exportDiv) exportDiv.style.display = entries.length > 0 ? 'block' : 'none';

    if (entries.length === 0) {
      const isToday = date === UI.today();
      // Check if this is a brand new user (no entries anywhere)
      const hasAnyEntries = isToday ? await DB.hasAnyEntries() : true;
      if (isToday && !hasAnyEntries) {
        // Pre-populate goals for new users
        App.ensureDefaultGoals();
        entryList.innerHTML = App.renderWelcomeCard();
      } else {
        const dateLabel = isToday ? 'today' : `for ${UI.formatDate(date)}`;
        const hint = isToday ? 'Use the buttons above to start logging.' : '';
        entryList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">\u{1F4CB}</div>
            <p>No entries ${dateLabel}.${hint ? '<br>' + hint : ''}</p>
          </div>
        `;
      }
    } else {
      // Sort by timestamp
      entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      entries.forEach(entry => {
        entryList.appendChild(UI.renderEntryItem(entry));
      });
    }

    // Load daily summary stats
    const summary = await DB.getDailySummary(date);
    App.renderDayStats(summary, entries);

    // Coach suggestions
    const coachEl = document.getElementById('today-coach');
    if (coachEl) {
      try {
        const tips = await Coach.getSuggestions(date);
        coachEl.innerHTML = Coach.render(tips);
      } catch (e) { console.warn('Coach error:', e); coachEl.innerHTML = ''; }
    }

    // Load analysis if available
    const analysis = await DB.getAnalysis(date);
    const analysisEl = document.getElementById('today-analysis');
    if (analysisEl) {
      if (analysis) {
        // renderAnalysisSummary already includes its own header
        analysisEl.innerHTML = `<div style="margin-top: var(--space-lg);">` +
          GoalsView.renderAnalysisSummary(analysis) + `</div>`;
      } else {
        analysisEl.innerHTML = '';
      }
    }
  },

  renderWelcomeCard() {
    return `
      <div class="card" style="text-align:center; padding: var(--space-lg);">
        <div style="font-size: 40px; margin-bottom: var(--space-md);">\u{1F44B}</div>
        <h2 style="font-size: var(--text-lg); margin-bottom: var(--space-sm);">Welcome to Health Tracker</h2>
        <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-lg); line-height: 1.6;">
          Log meals, water, workouts, and weight throughout the day.<br>
          Snap photos of your food and Claude will analyze everything nightly.
        </p>
        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
          <button class="btn btn-primary btn-block btn-lg" onclick="App.showGoalSetup()">Set Your Goals</button>
          <button class="btn btn-secondary btn-block" onclick="window.location.hash='log'">Start Logging</button>
        </div>
        <p style="color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--space-lg);">
          Set up Cloud Sync in Settings for automatic nightly analysis.
        </p>
      </div>
    `;
  },

  async ensureDefaultGoals() {
    const existing = await DB.getProfile('goals');
    if (!existing) {
      await DB.setProfile('goals', { calories: 1350, protein: 105, water_oz: 96 });
    }
  },

  async showGoalSetup() {
    const overlay = UI.createElement('div', 'modal-overlay');

    // Load existing goals
    const goals = await DB.getProfile('goals') || {};

    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Set Your Goals</span>
        <button class="modal-close" id="gs-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Daily Calories</label>
        <input type="number" class="form-input" id="gs-calories" value="${UI.escapeHtml(String(goals.calories || ''))}" placeholder="1800" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">Protein Goal (grams)</label>
        <input type="number" class="form-input" id="gs-protein" value="${UI.escapeHtml(String(goals.protein || ''))}" placeholder="130" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">Water Goal (oz)</label>
        <input type="number" class="form-input" id="gs-water" value="${UI.escapeHtml(String(goals.water_oz || ''))}" placeholder="96" inputmode="numeric">
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="gs-save">Save Goals</button>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    document.getElementById('gs-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    document.getElementById('gs-save').addEventListener('click', async () => {
      const calories = parseInt(document.getElementById('gs-calories')?.value) || null;
      const protein = parseInt(document.getElementById('gs-protein')?.value) || null;
      const water_oz = parseInt(document.getElementById('gs-water')?.value) || null;

      const newGoals = { calories, protein, water_oz };
      await DB.setProfile('goals', newGoals);
      UI.toast('Goals saved');
      overlay.remove();
      App.loadDayView();
    });
  },

  renderDayStats(summary, entries) {
    const statsEl = document.getElementById('today-stats');
    if (!statsEl) return;

    const foodCount = entries.filter(e => ['meal', 'snack', 'drink'].includes(e.type)).length;
    const workouts = entries.filter(e => e.type === 'workout');
    const workoutMin = workouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0);

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-value" style="color: var(--color-water)">${summary.water_oz || 0}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> oz</span></div>
        <div class="stat-label">Water</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--color-meal)">${foodCount}</div>
        <div class="stat-label">Food logged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--color-workout)">${workoutMin}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> min</span></div>
        <div class="stat-label">Exercise</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--color-weight)">${summary.weight ? summary.weight.value : '--'}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> ${summary.weight ? summary.weight.unit : ''}</span></div>
        <div class="stat-label">Weight</div>
      </div>
    `;
  },
};

// Settings helper
const Settings = {
  async loadGoalsSummary() {
    const el = document.getElementById('goals-summary');
    if (!el) return;
    const goals = await DB.getProfile('goals');
    if (goals) {
      const parts = [];
      if (goals.calories) parts.push(`${goals.calories} cal`);
      if (goals.protein) parts.push(`${goals.protein}g protein`);
      if (goals.water_oz) parts.push(`${goals.water_oz} oz water`);
      el.textContent = parts.join(' \u00B7 ') || 'Not set';
    } else {
      el.textContent = 'Not set \u2014 tap Edit to configure';
    }
  },

  async loadStorageInfo() {
    const el = document.getElementById('storage-info');
    if (!el) return;

    const info = await Sync.getStorageInfo();
    const parts = [];
    if (info.unsynced > 0) parts.push(`${info.unsynced} unsynced`);
    if (info.synced > 0) parts.push(`${info.synced} synced`);
    if (info.processed > 0) parts.push(`${info.processed} processed`);

    if (parts.length === 0) {
      el.textContent = 'No photos stored.';
    } else {
      el.textContent = `${parts.join(', ')} — ${info.totalSizeMB} MB total`;
    }
  },

  async clearPhotos() {
    if (!confirm('Delete all processed meal photos? Body photos are kept.')) return;
    await Sync.clearProcessedPhotos();
    Settings.loadStorageInfo();
  },

  async loadCloudSyncStatus() {
    const el = document.getElementById('cloud-sync-status');
    if (!el) return;
    const configured = await CloudRelay.isConfigured();
    el.textContent = configured ? 'Connected — syncing automatically' : 'Not configured';
  },

  _autoSyncBound: false,
  async initAutoSyncToggle() {
    const toggle = document.getElementById('autosync-toggle');
    if (!toggle) return;

    const status = await AutoSync.getStatus();
    toggle.checked = status.enabled;
    if (!Settings._autoSyncBound) {
      Settings._autoSyncBound = true;
      toggle.addEventListener('change', async () => {
        await AutoSync.toggle(toggle.checked);
        UI.toast(toggle.checked ? 'Auto-backup enabled' : 'Auto-backup disabled');
      });
    }
  },

  async loadVersion() {
    const el = document.getElementById('app-version');
    if (!el) return;
    try {
      const keys = await caches.keys();
      const current = keys.find(k => k.startsWith('health-tracker-v'));
      el.textContent = current ? current.replace('health-tracker-', '') : 'unknown';
    } catch { el.textContent = 'unknown'; }
  },

  _updateBound: false,
  initUpdateButton() {
    if (Settings._updateBound) return;
    Settings._updateBound = true;
    document.getElementById('update-app-btn')?.addEventListener('click', async () => {
      UI.toast('Updating...');
      try {
        // Clear all SW caches
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        // Unregister SW so it re-installs fresh
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        // Reload the page
        window.location.reload();
      } catch (err) {
        console.error('Update failed:', err);
        UI.toast('Update failed — try reloading manually', 'error');
      }
    });
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
