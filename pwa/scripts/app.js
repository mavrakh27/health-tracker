// app.js — Routing, init, navigation

// --- Quick Log (zero-friction logging from Today screen) ---
const QuickLog = {
  init() {
    document.getElementById('quick-photo-btn')?.addEventListener('click', () => QuickLog.snapFood());
    document.getElementById('quick-water-btn')?.addEventListener('click', () => QuickLog.showWaterPicker());
    document.getElementById('quick-weight-btn')?.addEventListener('click', () => QuickLog.showWeightEntry());
    document.getElementById('quick-supplement-btn')?.addEventListener('click', () => QuickLog.showSupplementPicker());
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
    const waterGoal = goals.water_oz || 64;

    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');

    const containers = [
      { label: 'Small cup', oz: 6 },
      { label: 'Glass', oz: 10 },
      { label: 'Can', oz: 12 },
      { label: 'Tall glass', oz: 16 },
      { label: 'Bottle', oz: 24 },
      { label: 'Large bottle', oz: 32 },
      { label: 'Big jug', oz: 40 },
      { label: 'XL jug', oz: 64 },
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

    let waterSaving = false;
    sheet.querySelectorAll('.water-pick').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (waterSaving) return;
        waterSaving = true;
        const oz = parseInt(btn.dataset.oz);
        btn.classList.add('water-pick-saved');
        try {
          const fresh = await DB.getDailySummary(today);
          const newTotal = (fresh.water_oz || 0) + oz;
          await DB.updateDailySummary(today, { water_oz: newTotal });
          UI.toast(`+${oz} oz — ${newTotal} oz total`);
          CloudRelay.queueUpload(today);
          setTimeout(() => {
            closeModal();
            if (App.selectedDate === today) App.loadDayView();
          }, 300);
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

  // --- Supplement picker ---
  _supplements: [
    { key: 'fiber', name: 'Fiber', notes: 'Psyllium husk fiber powder', calories: 30, protein: 0, carbs: 10, fat: 0 },
    { key: 'collagen', name: 'Collagen', notes: 'Vital Proteins collagen peptides', calories: 70, protein: 18, carbs: 0, fat: 0 },
  ],

  showSupplementPicker() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '50dvh';

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Log Supplement</span>
        <button class="modal-close" id="sp-close">&times;</button>
      </div>
      <div class="supplement-grid">
        ${QuickLog._supplements.map(s => `
          <button class="supplement-pick" data-key="${s.key}">
            <div style="font-weight:500;">${s.name}</div>
            <div style="font-size:var(--text-xs); color:var(--text-muted);">${s.calories} cal · ${s.protein}g protein</div>
          </button>
        `).join('')}
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    document.getElementById('sp-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    sheet.querySelectorAll('.supplement-pick').forEach(btn => {
      btn.addEventListener('click', async () => {
        const supp = QuickLog._supplements.find(s => s.key === btn.dataset.key);
        if (!supp) return;
        const today = UI.today();
        const entry = {
          id: UI.generateId('supplement'),
          type: 'supplement',
          subtype: supp.key,
          date: today,
          timestamp: new Date().toISOString(),
          notes: supp.notes,
          photo: null,
          duration_minutes: null,
        };
        try {
          await DB.addEntry(entry);
          UI.toast(`${supp.name} logged`);
          CloudRelay.queueUpload(today);
          closeModal();
          if (App.selectedDate === today) App.loadDayView();
        } catch (err) {
          console.error('Supplement log failed:', err);
          UI.toast('Failed to log', 'error');
        }
      });
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
    DB.openDB().then(async () => {
      console.log('DB ready');

      // Check for fresh install (empty DB) and attempt restore from cloud
      const hasData = await DB.hasAnyEntries();
      const hasProfile = await DB.getProfile('goals');
      if (!hasData && !hasProfile) {
        const restored = await App.attemptRestore();
        if (restored) {
          App.handleRoute();
          return;
        }
      }

      // Run goal migrations on every init (fixes water_oz 96→64, adds hardcore)
      await App.ensureDefaultGoals();
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
    '#plan': 'plan',
    '#progress': 'progress',
    '#profile': 'profile',
    // Legacy routes redirect to new tabs
    '#log': 'today',
    '#calendar': 'progress',
    '#goals': 'plan',
    '#settings': 'profile',
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
    if (screenId === 'plan') PlanView.init();
    if (screenId === 'progress') ProgressView.init();
    if (screenId === 'profile') {
      ProfileView.init();
      Settings.loadGoalsSummary();
      Settings.loadStorageInfo();
      Settings.loadCloudSyncStatus();
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
    if (App.currentScreen === 'plan') PlanView.init();
  },

  goToDate(dateStr) {
    App.selectedDate = dateStr;
    App.updateHeaderDate();
    window.location.hash = '';
    App.showScreen('today');
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

    if (entries.length === 0) {
      const isToday = date === UI.today();
      // Check if this is a brand new user (no entries anywhere)
      const hasAnyEntries = isToday ? await DB.hasAnyEntries() : true;
      if (isToday && !hasAnyEntries) {
        // Pre-populate goals for new users
        await App.ensureDefaultGoals();
        entryList.innerHTML = App.renderWelcomeCard();
      } else {
        // Try to show entries from analysis data (recovery after reinstall)
        const analysis = await DB.getAnalysis(date);
        if (analysis && analysis.entries && analysis.entries.length > 0) {
          analysis.entries.forEach(ae => {
            entryList.appendChild(UI.renderAnalysisEntry(ae));
          });
        } else {
          if (isToday) {
            entryList.innerHTML = App.renderEmptyDay();
          } else {
            entryList.innerHTML = `
              <div class="empty-state">
                <div class="empty-icon">${UI.svg.clipboard}</div>
                <p>Nothing logged on ${UI.formatDate(date)}.</p>
              </div>
            `;
          }
        }
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
    App.renderDayStats(summary, entries, date);

    // Day Score (above coach)
    const scoreEl = document.getElementById('today-score');
    if (scoreEl) {
      try {
        const scoreResult = await DayScore.calculate(date);
        scoreEl.innerHTML = DayScore.render(scoreResult);
      } catch (e) { console.warn('Score error:', e); scoreEl.innerHTML = ''; }
    }

    // Coach chat — only on Profile tab, not duplicated on Today
    const coachEl = document.getElementById('today-coach');
    if (coachEl) coachEl.innerHTML = '';

    // Add Entry button — skip if welcome card is showing (it has its own CTA)
    const logGrid = document.getElementById('log-type-grid-inline');
    const isWelcome = entryList?.querySelector?.('.welcome-card');
    if (entryList && logGrid && !isWelcome) {
      const addBtn = document.createElement('button');
      addBtn.id = 'toggle-log-types';
      addBtn.className = 'btn btn-secondary btn-block';
      addBtn.style.cssText = 'margin-bottom: var(--space-sm); border-radius: var(--radius-md); padding: var(--space-sm); border-style: dashed;';
      addBtn.textContent = '+ Add Entry';
      entryList.insertBefore(addBtn, entryList.firstChild);

      addBtn.onclick = () => {
        const showing = logGrid.style.display !== 'none';
        logGrid.style.display = showing ? 'none' : 'grid';
        addBtn.textContent = showing ? '+ Add Entry' : 'Cancel';
        if (showing) {
          addBtn.className = 'btn btn-secondary btn-block';
          addBtn.style.borderStyle = 'dashed';
        } else {
          addBtn.className = 'btn btn-ghost btn-block';
          addBtn.style.borderStyle = 'solid';
          Log.init('log-type-grid-inline', 'log-form-content-inline');
          logGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
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

  _getGreeting() {
    const h = new Date().getHours();
    if (h < 6) return { text: 'Burning the midnight oil', sub: 'Log a late snack or get some rest.' };
    if (h < 12) return { text: 'Good morning', sub: 'Start your day right — snap your breakfast.' };
    if (h < 14) return { text: 'Afternoon check-in', sub: 'How\'s the day going? Log your lunch.' };
    if (h < 18) return { text: 'Keep it going', sub: 'You\'re doing great. Stay on track.' };
    if (h < 22) return { text: 'Evening wind-down', sub: 'Log dinner and wrap up your day.' };
    return { text: 'Almost bedtime', sub: 'Finish logging and rest up.' };
  },

  renderEmptyDay() {
    const g = App._getGreeting();
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <p style="color: var(--text-secondary); font-weight: 500; font-size: var(--text-base); margin-bottom: 4px;">${g.text}</p>
        <p>${g.sub}</p>
      </div>
    `;
  },

  renderWelcomeCard() {
    return `
      <div class="card welcome-card" style="text-align:center; padding: var(--space-xl) var(--space-lg);">
        <div style="margin-bottom: var(--space-md); display:flex; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="1.5" fill="var(--accent-primary)"/>
          </svg>
        </div>
        <h2 style="font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-xs);">Welcome to Coach</h2>
        <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-lg); line-height: 1.6;">
          Track meals, water, workouts, and weight.<br>
          Snap a photo and your AI coach handles the rest.
        </p>
        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
          <button class="btn btn-primary btn-block btn-lg" onclick="App.showGoalSetup()">Set Your Goals</button>
          <button class="btn btn-secondary btn-block" onclick="App._openLogGrid()">Start Logging</button>
        </div>
      </div>
    `;
  },

  _openLogGrid() {
    const logGrid = document.getElementById('log-type-grid-inline');
    if (logGrid) {
      logGrid.style.display = 'grid';
      Log.init('log-type-grid-inline', 'log-form-content-inline');
      logGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  async ensureDefaultGoals() {
    const existing = await DB.getProfile('goals');
    if (!existing) {
      await DB.setProfile('goals', {
        calories: 1200, protein: 105, water_oz: 64,
        hardcore: { calories: 1000, protein: 120, water_oz: 64 },
      });
    } else {
      let changed = false;
      if (!existing.hardcore) {
        existing.hardcore = { calories: 1000, protein: 120, water_oz: 64 };
        changed = true;
      }
      if (existing.water_oz === 96) {
        existing.water_oz = 64;
        changed = true;
      }
      if (changed) await DB.setProfile('goals', existing);
    }
  },

  // Attempt to restore data on fresh install using localStorage relay config backup
  async attemptRestore() {
    try {
      const backup = localStorage.getItem('cloudRelay_backup');
      if (!backup) return false;

      const config = JSON.parse(backup);
      if (!config.workerUrl || !config.syncKey) return false;

      console.log('AutoRestore: found relay config backup, restoring...');
      UI.toast('Restoring your data...');

      await DB.setProfile('cloudRelay', config);

      let resultCount = 0;
      const isValidDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d);

      // Pull pending analysis results
      try {
        const resp = await fetch(`${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/results/new`);
        if (resp.ok) {
          const { newResults } = await resp.json();
          for (const date of (newResults || []).filter(isValidDate)) {
            try {
              const r = await fetch(`${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/results/${date}`);
              if (r.ok) {
                const analysis = JSON.parse(await r.text());
                await DB.importAnalysis(date, analysis);
                await fetch(`${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/results/${date}/ack`, { method: 'POST' });
                resultCount++;
              }
            } catch (e) { console.warn(`AutoRestore: result ${date}:`, e); }
          }
        }
      } catch (e) { console.warn('AutoRestore: results check failed:', e); }

      // Download pending day ZIPs
      try {
        const resp = await fetch(`${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/pending`);
        if (resp.ok) {
          const { pending } = await resp.json();
          for (const date of (pending || []).filter(isValidDate)) {
            try {
              const r = await fetch(`${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/day/${date}`);
              if (r.ok) {
                await Sync.restoreFromZipData(new Uint8Array(await r.arrayBuffer()));
                resultCount++;
              }
            } catch (e) { console.warn(`AutoRestore: day ${date}:`, e); }
          }
        }
      } catch (e) { console.warn('AutoRestore: pending check failed:', e); }

      await App.ensureDefaultGoals();
      UI.toast(resultCount > 0 ? 'Data restored!' : 'Sync reconnected');
      return true;
    } catch (e) {
      console.warn('AutoRestore: failed:', e);
      return false;
    }
  },

  async showGoalSetup() {
    const overlay = UI.createElement('div', 'modal-overlay');

    // Load existing goals
    const goals = await DB.getProfile('goals') || {};

    const sheet = UI.createElement('div', 'modal-sheet');
    const hc = goals.hardcore || {};
    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Set Your Goals</span>
        <button class="modal-close" id="gs-close">&times;</button>
      </div>
      <div style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-md);">Great = active plan. Crush It = stretch target shown for reference.</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-sm);">
        <div class="form-group">
          <label class="form-label">Calories (great)</label>
          <input type="number" class="form-input" id="gs-calories" value="${Number(goals.calories) || ''}" placeholder="1200" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Calories (crush it)</label>
          <input type="number" class="form-input" id="gs-hc-calories" value="${Number(hc.calories) || ''}" placeholder="1000" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Protein (great)</label>
          <input type="number" class="form-input" id="gs-protein" value="${Number(goals.protein) || ''}" placeholder="105" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Protein (crush it)</label>
          <input type="number" class="form-input" id="gs-hc-protein" value="${Number(hc.protein) || ''}" placeholder="120" inputmode="numeric">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Water Goal (oz)</label>
        <input type="number" class="form-input" id="gs-water" value="${Number(goals.water_oz) || ''}" placeholder="64" inputmode="numeric">
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
      const hcCalories = parseInt(document.getElementById('gs-hc-calories')?.value) || null;
      const hcProtein = parseInt(document.getElementById('gs-hc-protein')?.value) || null;

      const newGoals = {
        calories, protein, water_oz,
        hardcore: { calories: hcCalories, protein: hcProtein, water_oz },
      };
      await DB.setProfile('goals', newGoals);
      UI.toast('Goals saved');
      overlay.remove();
      App.loadDayView();
    });
  },

  async renderDayStats(summary, entries, date) {
    const statsEl = document.getElementById('today-stats');
    if (!statsEl) return;

    let foodCount = entries.filter(e => ['meal', 'snack', 'drink'].includes(e.type)).length;
    let workoutMin = entries.filter(e => e.type === 'workout').reduce((sum, w) => sum + (w.duration_minutes || 0), 0);
    let waterOz = summary.water_oz || 0;
    let weightVal = summary.weight ? summary.weight.value : null;
    let weightUnit = summary.weight ? summary.weight.unit : '';

    // Fall back to analysis data when entries are empty (e.g. after reinstall)
    if (entries.length === 0 && date) {
      const analysis = await DB.getAnalysis(date);
      if (analysis) {
        const aEntries = analysis.entries || [];
        foodCount = aEntries.filter(e => ['meal', 'snack', 'drink'].includes(e.type)).length;
        workoutMin = aEntries.filter(e => e.type === 'workout').reduce((sum, w) => sum + (w.duration_minutes || 0), 0);
        waterOz = analysis.water_oz || waterOz;
        if (analysis.weight) { weightVal = analysis.weight.value || analysis.weight; weightUnit = analysis.weight.unit || 'lbs'; }
      }
    }

    const zc = (val) => val === 0 || val === null ? ' stat-value--zero' : '';
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-value${zc(waterOz)}" style="color: var(--color-water)">${waterOz}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> oz</span></div>
        <div class="stat-label">Water</div>
      </div>
      <div class="stat-card">
        <div class="stat-value${zc(foodCount)}" style="color: var(--color-meal)">${foodCount}</div>
        <div class="stat-label">Food logged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value${zc(workoutMin)}" style="color: var(--color-workout)">${workoutMin}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> min</span></div>
        <div class="stat-label">Exercise</div>
      </div>
      <div class="stat-card">
        <div class="stat-value${zc(weightVal)}" style="color: var(--color-weight)">${weightVal || '--'}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> ${weightVal ? weightUnit : ''}</span></div>
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

    const clearBtn = document.getElementById('clear-photos-btn');
    if (parts.length === 0) {
      el.textContent = 'No photos stored.';
      if (clearBtn) clearBtn.style.display = 'none';
    } else {
      el.textContent = `${parts.join(', ')} — ${info.totalSizeMB} MB total`;
      if (clearBtn) clearBtn.style.display = '';
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

  async loadVersion() {
    const el = document.getElementById('app-version');
    if (!el) return;
    try {
      const keys = await caches.keys();
      const current = keys.find(k => k.startsWith('coach-v'));
      el.textContent = current ? current.replace('coach-', '') : 'v74';
    } catch { el.textContent = 'v74'; }
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
