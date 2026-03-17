// app.js — Routing, init, navigation

// --- Quick Log (zero-friction logging from Today screen) ---
const QuickLog = {
  init() {
    document.getElementById('quick-photo-btn')?.addEventListener('click', () => QuickLog.snapFood());
    document.getElementById('quick-water-btn')?.addEventListener('click', () => QuickLog.showWaterPicker());
    document.getElementById('quick-supplement-btn')?.addEventListener('click', () => QuickLog.showSupplementPicker());
    document.getElementById('quick-more-btn')?.addEventListener('click', () => QuickLog.showMoreSheet());
  },

  async showMoreSheet() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '50dvh';

    // Built-in options (universal)
    const builtIn = [
      { type: 'workout', icon: UI.svg.workout, label: 'Workout', color: 'var(--color-workout)', desc: 'Log a gym session' },
      { type: 'weight', icon: UI.svg.weight, label: 'Weight', color: 'var(--color-weight)', desc: 'Record today\'s weight' },
      { type: 'bodyPhoto', icon: UI.svg.bodyPhoto, label: 'Body Photo', color: 'var(--color-body-photo, var(--accent-primary))', desc: 'Progress photos' },
    ];

    // User-specific options (added by relay/coach processing)
    const custom = await DB.getProfile('moreOptions') || [];
    const options = [...builtIn, ...custom.map(o => ({
      ...o,
      icon: (o.icon && UI.svg[o.icon]) ? UI.svg[o.icon] : UI.svg.meal,
    }))];

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Log Entry</span>
        <button class="modal-close" id="more-close">&times;</button>
      </div>
      <div class="more-sheet-options">
        ${options.map(o => `
          <button class="more-sheet-option" data-more-type="${UI.escapeHtml(o.type)}" ${o.subtype ? `data-more-subtype="${UI.escapeHtml(o.subtype)}"` : ''}>
            <span class="more-sheet-icon" style="color: ${UI.escapeHtml(o.color || 'var(--text-secondary)')}">${o.icon}</span>
            <div class="more-sheet-text">
              <span class="more-sheet-label">${UI.escapeHtml(o.label)}</span>
              <span class="more-sheet-desc">${UI.escapeHtml(o.desc || '')}</span>
            </div>
          </button>
        `).join('')}
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    document.getElementById('more-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    sheet.querySelectorAll('[data-more-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.moreType;
        closeModal();
        if (type === 'weight') {
          QuickLog.showWeightEntry();
        } else {
          // Show inline form for this type
          const logGrid = document.getElementById('log-type-grid-inline');
          if (logGrid) logGrid.style.display = 'none';
          Log._gridId = 'log-type-grid-inline';
          Log._formId = null;
          Log._formContentId = 'log-form-content-inline';
          Log.selectType(type);
        }
      });
    });
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
  async showWeightEntry() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const today = UI.today();
    const prefs = await DB.getProfile('preferences') || {};
    const weightUnit = prefs.weightUnit || 'lbs';

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
          <input type="number" class="form-input" id="qw-weight" placeholder="${weightUnit === 'kg' ? '60.0' : '135.0'}" step="0.1" inputmode="decimal">
          <button class="btn btn-secondary" id="qw-plus">+</button>
        </div>
        <div style="text-align:center; color:var(--text-muted); font-size:var(--text-sm); margin-top:var(--space-xs);">${weightUnit}</div>
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="qw-save">Save Weight</button>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    // Pre-fill current weight (or last known weight) and auto-focus
    DB.getDailySummary(today).then(async summary => {
      const input = document.getElementById('qw-weight');
      if (summary.weight) {
        input.value = summary.weight.value;
      } else {
        // Check yesterday for a recent weight to pre-fill
        const yesterday = UI.yesterday(today);
        const yesterdaySummary = await DB.getDailySummary(yesterday);
        if (yesterdaySummary.weight) {
          input.value = yesterdaySummary.weight.value;
        }
      }
      input.focus();
      input.select();
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
        await DB.updateDailySummary(today, { weight: { value, unit: weightUnit } });
        UI.toast(`Weight: ${value} ${weightUnit} saved`);
        CloudRelay.queueUpload(today);
        overlay.remove();
        if (App.selectedDate === today) App.loadDayView();
      } catch (err) {
        console.error('Quick weight failed:', err);
        UI.toast('Failed to save weight', 'error');
      }
    });
  },

  // --- Dailies (user-configurable supplements/items) ---
  _supplements: [],

  async loadSupplements() {
    const profile = await DB.getProfile('supplements');
    QuickLog._supplements = profile && profile.length > 0 ? profile : [];
  },

  async showSupplementPicker() {
    await QuickLog.loadSupplements();
    const supplements = QuickLog._supplements;
    const selected = new Set();

    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '60dvh';

    const renderList = () => {
      if (supplements.length === 0) {
        return `<div style="text-align:center; padding:var(--space-lg); color:var(--text-muted);">
          <p style="margin-bottom:var(--space-md);">No dailies configured yet.</p>
          <button class="btn btn-primary" id="sp-add-first">Add Your First Daily</button>
        </div>`;
      }
      return `
        <div class="supplement-grid">
          ${supplements.map(s => `
            <button class="supplement-pick${selected.has(s.key) ? ' selected' : ''}" data-key="${UI.escapeHtml(s.key)}">
              ${s.photo ? `<img src="${s.photo}" class="supplement-pick-photo" alt="">` : ''}
              <div style="font-weight:500;">${UI.escapeHtml(s.name)}</div>
              ${s.calories ? `<div style="font-size:var(--text-xs); color:var(--text-muted);">${s.calories} cal${s.protein ? ` · ${s.protein}g protein` : ''}</div>` : ''}
            </button>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-block btn-lg${selected.size === 0 ? ' disabled' : ''}" id="sp-log-btn" style="margin-top:var(--space-md);"${selected.size === 0 ? ' disabled' : ''}>Log Selected (${selected.size})</button>
        <button class="btn btn-ghost btn-block" id="sp-manage" style="margin-top:var(--space-sm); font-size:var(--text-xs);">Manage Dailies</button>
      `;
    };

    const render = () => {
      sheet.innerHTML = `
        <div class="modal-header">
          <span class="modal-title">Dailies</span>
          <button class="modal-close" id="sp-close">&times;</button>
        </div>
        ${renderList()}
      `;
      bindEvents();
    };

    const closeModal = () => overlay.remove();

    const bindEvents = () => {
      document.getElementById('sp-close').addEventListener('click', closeModal);
      document.getElementById('sp-add-first')?.addEventListener('click', () => {
        closeModal();
        QuickLog.showDailiesManager();
      });
      document.getElementById('sp-manage')?.addEventListener('click', () => {
        closeModal();
        QuickLog.showDailiesManager();
      });

      sheet.querySelectorAll('.supplement-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.key;
          if (selected.has(key)) selected.delete(key);
          else selected.add(key);
          render();
        });
      });

      document.getElementById('sp-log-btn')?.addEventListener('click', async () => {
        if (selected.size === 0) return;
        const today = UI.today();
        const logged = [];
        for (const key of selected) {
          const supp = supplements.find(s => s.key === key);
          if (!supp) continue;
          const entry = {
            id: UI.generateId('supplement'),
            type: 'supplement',
            subtype: supp.key,
            date: today,
            timestamp: new Date().toISOString(),
            notes: supp.notes || supp.name,
            photo: null,
            duration_minutes: null,
          };
          try {
            await DB.addEntry(entry);
            logged.push(supp.name);
          } catch (err) {
            console.error(`Supplement log failed for ${supp.name}:`, err);
          }
        }
        if (logged.length > 0) {
          UI.toast(`${logged.join(', ')} logged`);
          CloudRelay.queueUpload(today);
        }
        closeModal();
        if (App.selectedDate === today) App.loadDayView();
      });
    };

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    render();
  },

  // --- Dailies Manager (add/remove/edit daily items) ---
  async showDailiesManager() {
    await QuickLog.loadSupplements();
    let items = [...QuickLog._supplements];
    let pendingPhoto = null; // { blob, url, dataURL } for new item

    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '80dvh';

    const renderItems = () => {
      if (items.length === 0) {
        return `<div style="text-align:center; padding:var(--space-md); color:var(--text-muted); font-size:var(--text-sm);">
          No dailies yet. Add items you take or do every day.
        </div>`;
      }
      return items.map((item, i) => `
        <div class="dailies-item" data-index="${i}">
          ${item.photo ? `<img src="${item.photo}" class="dailies-item-photo" alt="">` : ''}
          <div class="dailies-item-body">
            <div style="font-weight:500; font-size:var(--text-sm);">${UI.escapeHtml(item.name)}</div>
            ${item.calories ? `<div style="font-size:var(--text-xs); color:var(--text-muted);">${item.calories} cal${item.protein ? ` · ${item.protein}g protein` : ''}</div>` : ''}
          </div>
          <button class="dailies-remove" data-index="${i}" title="Remove">&times;</button>
        </div>
      `).join('');
    };

    const render = () => {
      sheet.innerHTML = `
        <div class="modal-header">
          <span class="modal-title">Manage Dailies</span>
          <button class="modal-close" id="dm-close">&times;</button>
        </div>
        <div id="dm-list">${renderItems()}</div>
        <div class="dailies-add-form" id="dm-add-form">
          <div id="dm-photo-area" style="margin-bottom:var(--space-sm);"></div>
          <div style="display:flex; gap:var(--space-sm); margin-bottom:var(--space-sm);">
            <button class="btn btn-ghost" id="dm-camera-btn" style="flex:0 0 auto; padding:var(--space-xs) var(--space-sm);" title="Add photo">${UI.svg.camera || '📷'}</button>
            <input type="text" class="form-input" id="dm-name" placeholder="Item name (e.g. Creatine)" maxlength="50" style="flex:1;">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-sm); margin-bottom:var(--space-sm);">
            <input type="number" class="form-input" id="dm-cal" placeholder="Calories" inputmode="numeric">
            <input type="number" class="form-input" id="dm-protein" placeholder="Protein (g)" inputmode="numeric">
          </div>
          <button class="btn btn-primary btn-block" id="dm-add-btn">Add Daily</button>
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="dm-done" style="margin-top:var(--space-md);">Done</button>
      `;

      // Bind events
      document.getElementById('dm-close').addEventListener('click', closeModal);
      document.getElementById('dm-done').addEventListener('click', closeModal);

      document.getElementById('dm-camera-btn').addEventListener('click', async () => {
        const result = await Camera.capture('meal');
        if (!result) return;
        pendingPhoto = result;
        // Convert to data URL for storage
        const reader = new FileReader();
        reader.onload = () => {
          pendingPhoto.dataURL = reader.result;
          const area = document.getElementById('dm-photo-area');
          area.innerHTML = '';
          area.appendChild(Camera.createPreview(result.url, () => {
            Camera.revokeURL(pendingPhoto.url);
            pendingPhoto = null;
            area.innerHTML = '';
          }));
        };
        reader.readAsDataURL(result.blob);
      });

      document.getElementById('dm-add-btn').addEventListener('click', () => {
        const name = document.getElementById('dm-name')?.value?.trim();
        if (!name) { UI.toast('Enter a name', 'error'); return; }
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (items.some(it => it.key === key)) { UI.toast('Already exists', 'error'); return; }
        const cal = parseInt(document.getElementById('dm-cal')?.value) || 0;
        const protein = parseInt(document.getElementById('dm-protein')?.value) || 0;
        const item = { key, name, notes: name, calories: cal, protein, carbs: 0, fat: 0 };
        if (pendingPhoto?.dataURL) item.photo = pendingPhoto.dataURL;
        items.push(item);
        if (pendingPhoto) { Camera.revokeURL(pendingPhoto.url); pendingPhoto = null; }
        saveAndRender();
      });

      sheet.querySelectorAll('.dailies-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.index);
          items.splice(idx, 1);
          saveAndRender();
        });
      });
    };

    let saving = false;
    const saveAndRender = async () => {
      if (saving) return;
      saving = true;
      QuickLog._supplements = items;
      await DB.setProfile('supplements', items);
      saving = false;
      render();
    };

    const closeModal = () => {
      if (pendingPhoto) { Camera.revokeURL(pendingPhoto.url); pendingPhoto = null; }
      overlay.remove();
    };

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    render();
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
    UI.initKeyboardScroll();
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
    '#coach': 'coach',
    '#progress': 'progress',
    '#settings': 'settings',
    // Legacy routes
    '#plan': 'progress',
    '#profile': 'settings',
    '#log': 'today',
    '#calendar': 'progress',
    '#goals': 'progress',
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
    if (screenId === 'coach') App.loadCoachView();
    if (screenId === 'progress') ProgressView.init();
    if (screenId === 'settings') {
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
    if (App.currentScreen === 'coach') App.loadCoachView();
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

    // Close any open inline forms (prevents stale form after day navigation)
    const logGrid = document.getElementById('log-type-grid-inline');
    const logForm = document.getElementById('log-form-inline');
    if (logGrid) logGrid.style.display = 'none';
    if (logForm) logForm.style.display = 'none';

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
      // Load analysis to merge AI results into entry cards
      let analysisMap = {};
      try {
        const analysis = await DB.getAnalysis(date);
        if (analysis && analysis.entries) {
          const importedAt = analysis.importedAt || 0;
          for (const ae of analysis.entries) {
            if (ae.id) analysisMap[ae.id] = { ...ae, _importedAt: importedAt };
          }
        }
      } catch (err) {
        console.warn('Failed to load analysis:', err);
      }

      // Sort by timestamp
      entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      entries.forEach(entry => {
        const ae = analysisMap[entry.id] || null;
        entryList.appendChild(UI.renderEntryItem(entry, ae));
      });
    }

    // Load daily summary stats
    const summary = await DB.getDailySummary(date);
    await App.renderDayStats(summary, entries, date);

    // Day Score (above coach)
    const scoreEl = document.getElementById('today-score');
    if (scoreEl) {
      try {
        const scoreResult = await DayScore.calculate(date);
        scoreEl.innerHTML = DayScore.render(scoreResult);
      } catch (e) { console.warn('Score error:', e); scoreEl.innerHTML = ''; }
    }

    // Workout exercises (individual cards, no collapsible wrapper)
    const workoutEl = document.getElementById('today-workout');
    if (workoutEl) {
      try {
        const regimen = await DB.getRegimen();
        if (regimen?.weeklySchedule) {
          const fitnessHtml = await Fitness.render(regimen, date);
          workoutEl.innerHTML = fitnessHtml;
          Fitness.bindEvents(date, workoutEl);
        } else {
          workoutEl.innerHTML = '';
        }
      } catch (e) { console.warn('Workout render error:', e); workoutEl.innerHTML = ''; }
    }

    // Meal suggestion card (collapsible)
    const mealSuggEl = document.getElementById('today-meal-suggestion');
    if (mealSuggEl) {
      try {
        const mealPlan = await DB.getMealPlan();
        if (mealPlan?.days) {
          const todayPlan = mealPlan.days.find(d => d.date === date);
          const dinner = todayPlan?.meals?.find(m => (m.meal || '').toLowerCase().includes('dinner')) || todayPlan?.meals?.[todayPlan.meals.length - 1];
          if (dinner) {
            const allMealsHtml = todayPlan.meals.map(m => `
              <div style="padding:var(--space-sm) 0; border-bottom:1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between;">
                  <span style="font-weight:500; font-size:var(--text-sm); text-transform:capitalize;">${UI.escapeHtml(m.meal || m.name)}</span>
                  <span style="font-size:var(--text-xs); color:var(--text-muted);">${m.calories} cal - ${m.protein}g P</span>
                </div>
                <div style="font-size:var(--text-xs); color:var(--text-secondary);">${UI.escapeHtml(m.name || '')}</div>
              </div>
            `).join('');
            mealSuggEl.innerHTML = `
              <div class="collapsible-section" style="margin-top:var(--space-sm);">
                <div class="collapsible-header" id="meal-collapse-header">
                  <div style="display:flex; align-items:center; gap:var(--space-sm);">
                    <span style="font-weight:600;">Tonight</span>
                    <span style="font-size:var(--text-sm); color:var(--text-secondary);">${UI.escapeHtml(dinner.name)}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:var(--space-sm);">
                    <span style="font-size:var(--text-xs); color:var(--text-muted);">${dinner.calories} cal</span>
                    <span class="collapsible-chevron">&#9660;</span>
                  </div>
                </div>
                <div class="collapsible-body collapsed" id="meal-collapse-body">
                  ${allMealsHtml}
                  ${todayPlan.notes ? `<div style="font-size:var(--text-xs); color:var(--text-muted); padding-top:var(--space-sm);">${UI.escapeHtml(todayPlan.notes)}</div>` : ''}
                </div>
              </div>
            `;
            document.getElementById('meal-collapse-header')?.addEventListener('click', () => {
              const body = document.getElementById('meal-collapse-body');
              const chevron = mealSuggEl.querySelector('.collapsible-chevron');
              if (body) { body.classList.toggle('collapsed'); chevron?.classList.toggle('open'); }
            });
          } else { mealSuggEl.innerHTML = ''; }
        } else { mealSuggEl.innerHTML = ''; }
      } catch (e) { mealSuggEl.innerHTML = ''; }
    }

  },

  async loadCoachView() {
    const date = App.selectedDate;

    // Coach inbox (full view, not collapsible)
    const inboxEl = document.getElementById('coach-inbox');
    if (inboxEl) {
      try {
        const savedText = document.getElementById('coach-input')?.value || '';
        const coachHtml = await CoachChat.render(date);
        inboxEl.innerHTML = `<h2 class="section-header">Inbox</h2>${coachHtml}`;
        CoachChat.bindEvents(date);
        if (savedText) { const inp = document.getElementById('coach-input'); if (inp) inp.value = savedText; }
      } catch (e) { inboxEl.innerHTML = ''; }
    }

    // In-depth analysis + versioning
    const analysisEl = document.getElementById('coach-analysis');
    if (analysisEl) {
      const analysis = await DB.getAnalysis(date);
      if (analysis) {
        const goals = await DB.getProfile('goals') || {};
        let analysisHtml = GoalsView.renderRemainingBudget(analysis, goals) +
          GoalsView.renderAnalysisSummary(analysis, goals);

        // Analysis version history
        try {
          const history = await DB.getAnalysisHistory(date);
          if (history.length > 0) {
            analysisHtml += '<h2 class="section-header">Previous Analyses</h2>';
            for (const h of history.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0))) {
              const time = h.importedAt ? new Date(h.importedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown';
              const d = h.data || {};
              const cal = d.totals?.calories || '?';
              const pro = d.totals?.protein || '?';
              analysisHtml += `<div class="card" style="margin-bottom:var(--space-xs); opacity:0.7;">
                <div style="display:flex; justify-content:space-between; font-size:var(--text-sm);">
                  <span style="color:var(--text-muted);">${time}</span>
                  <span>${cal} cal - ${pro}g P</span>
                </div>
              </div>`;
            }
          }
        } catch (e) { /* no history store yet */ }

        analysisEl.innerHTML = analysisHtml;
      } else {
        analysisEl.innerHTML = `<div class="card" style="text-align:center; padding:var(--space-lg); color:var(--text-muted);">
          <div style="font-size:var(--text-sm);">No analysis for ${UI.formatDate(date)} yet.</div>
          <div style="font-size:var(--text-xs); margin-top:var(--space-xs);">Log meals and sync to get your coach's breakdown.</div>
        </div>`;
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

  // Profile-level sync actions (called from index.html buttons)
  async syncNow() {
    const configured = await CloudRelay.isConfigured();
    if (!configured) { UI.toast('Set up Cloud Sync first', 'error'); return; }
    UI.toast('Syncing...');
    // Find all dates that need sync (no analysis or entries newer than analysis)
    const dates = await DB.getDatesNeedingSync();
    if (dates.length === 0) {
      // Nothing unprocessed — just check for results
      CloudRelay._gotResults = false;
      await CloudRelay.checkForResults();
      if (CloudRelay._gotResults) {
        App.loadDayView();
      } else {
        UI.toast('Everything is up to date');
      }
      return;
    }
    UI.toast(`Uploading ${dates.length} day(s)...`);
    for (const date of dates) {
      CloudRelay._pendingDate = date;
      await CloudRelay._doUpload();
    }
    CloudRelay._gotResults = false;
    await CloudRelay.checkForResults();
    if (CloudRelay._gotResults) {
      App.loadDayView();
    } else {
      UI.toast(`Uploaded ${dates.length} day(s) -- processing soon`);
    }
  },

  async checkResults() {
    const configured = await CloudRelay.isConfigured();
    if (!configured) { UI.toast('Set up Cloud Sync first', 'error'); return; }
    UI.toast('Checking for results...');
    CloudRelay._gotResults = false;
    await CloudRelay.checkForResults();
    if (CloudRelay._gotResults) {
      App.loadDayView();
    } else {
      UI.toast('No new results on relay');
    }
  },

  async ensureDefaultGoals() {
    const existing = await DB.getProfile('goals');
    if (!existing) {
      await DB.setProfile('goals', {
        calories: 2000, protein: 100, water_oz: 64,
        hardcore: { calories: 1500, protein: 130, water_oz: 64 },
      });
    } else {
      let changed = false;
      if (!existing.hardcore) {
        existing.hardcore = { calories: 1500, protein: 130, water_oz: 64 };
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
          <input type="number" class="form-input" id="gs-calories" value="${Number(goals.calories) || ''}" placeholder="2000" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Calories (crush it)</label>
          <input type="number" class="form-input" id="gs-hc-calories" value="${Number(hc.calories) || ''}" placeholder="1500" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Protein (great)</label>
          <input type="number" class="form-input" id="gs-protein" value="${Number(goals.protein) || ''}" placeholder="100" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Protein (crush it)</label>
          <input type="number" class="form-input" id="gs-hc-protein" value="${Number(hc.protein) || ''}" placeholder="130" inputmode="numeric">
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

      // If first-run (no sync configured), offer Cloud Sync setup
      const syncConfigured = await CloudRelay.isConfigured();
      if (!syncConfigured) {
        App._showSyncSetupStep(overlay);
      } else {
        overlay.remove();
        App.loadDayView();
      }
    });
  },

  _showSyncSetupStep(overlay) {
    const sheet = overlay.querySelector('.modal-sheet');
    if (!sheet) { overlay.remove(); App.loadDayView(); return; }

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Cloud Sync</span>
        <button class="modal-close" id="gs-sync-close">&times;</button>
      </div>
      <div style="text-align:center; margin-bottom:var(--space-md);">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" width="40" height="40" style="margin-bottom:var(--space-sm);">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
        </svg>
        <p style="font-size:var(--text-sm); color:var(--text-secondary); line-height:1.6;">
          Cloud Sync enables AI-powered photo analysis, meal plans, and coach responses.<br>
          You can set this up later in Profile &gt; Cloud Sync.
        </p>
      </div>
      <div class="form-group">
        <label class="form-label">Worker URL</label>
        <input type="url" class="form-input" id="gs-sync-url" placeholder="https://your-worker.workers.dev">
      </div>
      <div class="form-group">
        <label class="form-label">Sync Key</label>
        <input type="text" class="form-input" id="gs-sync-key" placeholder="UUID (e.g. from crypto.randomUUID())">
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="gs-sync-save">Connect</button>
      <button class="btn btn-ghost btn-block" id="gs-sync-skip" style="margin-top:var(--space-sm);">Skip for now</button>
    `;

    const closeAndLoad = () => { overlay.remove(); App.loadDayView(); };
    document.getElementById('gs-sync-close').addEventListener('click', closeAndLoad);
    document.getElementById('gs-sync-skip').addEventListener('click', closeAndLoad);

    document.getElementById('gs-sync-save').addEventListener('click', async () => {
      const url = document.getElementById('gs-sync-url')?.value?.trim();
      const key = document.getElementById('gs-sync-key')?.value?.trim();
      if (!url || !key) {
        UI.toast('Enter both URL and key', 'error');
        return;
      }
      await DB.setProfile('cloudRelay', { workerUrl: url, syncKey: key });
      localStorage.setItem('cloudRelay_backup', JSON.stringify({ workerUrl: url, syncKey: key }));
      UI.toast('Cloud Sync configured!');
      closeAndLoad();
    });
  },

  async renderDayStats(summary, entries, date) {
    const statsEl = document.getElementById('today-stats');
    if (!statsEl) return;

    let foodCount = entries.filter(e => ['meal', 'snack', 'drink'].includes(e.type)).length;
    let waterOz = summary.water_oz || 0;
    let weightVal = summary.weight ? summary.weight.value : null;
    let weightUnit = summary.weight ? summary.weight.unit : '';

    // Workout progress from regimen + checked exercises
    let workoutDone = 0;
    let workoutTotal = 0;
    let workoutLabel = 'Workout';
    try {
      const regimen = await DB.getRegimen();
      if (regimen?.weeklySchedule) {
        const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const todayPlan = regimen.weeklySchedule?.find(d => d.day === dayName);
        const isRest = !todayPlan || todayPlan.type === 'rest' || todayPlan.type === 'active_rest' || todayPlan.type === 'active_recovery';
        if (isRest) {
          workoutLabel = 'Rest Day';
        } else {
          const checked = await Fitness.getCheckedExercises(date);
          const exercises = Fitness.getExerciseList(todayPlan);
          workoutTotal = exercises.length;
          workoutDone = exercises.filter(e => checked.has(e.name)).length;
        }
      }
    } catch (e) { /* no regimen */ }

    // Fall back to analysis data when entries are empty (e.g. after reinstall)
    if (entries.length === 0 && date) {
      const analysis = await DB.getAnalysis(date);
      if (analysis) {
        const aEntries = analysis.entries || [];
        foodCount = aEntries.filter(e => ['meal', 'snack', 'drink'].includes(e.type)).length;
        waterOz = analysis.water_oz || waterOz;
        if (analysis.weight) { weightVal = analysis.weight.value || analysis.weight; weightUnit = analysis.weight.unit || 'lbs'; }
      }
    }

    const zc = (val) => val === 0 || val === null ? ' stat-value--zero' : '';
    const workoutDisplay = workoutTotal > 0 ? `${workoutDone}/${workoutTotal}` : (workoutLabel === 'Rest Day' ? 'Rest' : '--');
    const workoutZero = workoutTotal === 0 && workoutLabel !== 'Rest Day';
    statsEl.innerHTML = `
      <div class="stat-card stat-card--tap" data-stat-action="water">
        <div class="stat-value${zc(waterOz)}" style="color: var(--color-water)">${waterOz}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> oz</span></div>
        <div class="stat-label">Water</div>
      </div>
      <div class="stat-card stat-card--tap" data-stat-action="food">
        <div class="stat-value${zc(foodCount)}" style="color: var(--color-meal)">${foodCount}</div>
        <div class="stat-label">Food logged</div>
      </div>
      <div class="stat-card stat-card--tap" data-stat-action="workout">
        <div class="stat-value${workoutZero ? ' stat-value--zero' : ''}" style="color: var(--color-workout)">${workoutDisplay}</div>
        <div class="stat-label">${UI.escapeHtml(workoutLabel)}</div>
      </div>
      <div class="stat-card stat-card--tap" data-stat-action="weight">
        <div class="stat-value${zc(weightVal)}" style="color: var(--color-weight)">${weightVal || '--'}<span class="unit" style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary)"> ${weightVal ? weightUnit : ''}</span></div>
        <div class="stat-label">Weight</div>
      </div>
    `;

    // Make stat cards tappable
    statsEl.querySelectorAll('[data-stat-action]').forEach(card => {
      card.addEventListener('click', () => {
        const action = card.dataset.statAction;
        if (action === 'water') QuickLog.showWaterPicker();
        else if (action === 'food') QuickLog.snapFood();
        else if (action === 'weight') QuickLog.showWeightEntry();
        else if (action === 'workout') {
          const el = document.getElementById('today-workout');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
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
    if (!configured) {
      el.textContent = 'Not configured';
      return;
    }
    // Show last analysis date for processing status
    try {
      const today = UI.today();
      const analyses = await DB.getAnalysisRange('2020-01-01', today);
      if (analyses.length > 0) {
        const latest = analyses[analyses.length - 1];
        el.textContent = `Connected — last analysis: ${UI.formatDate(latest.date)}`;
      } else {
        el.textContent = 'Connected — no analysis received yet';
      }
    } catch {
      el.textContent = 'Connected — syncing automatically';
    }
  },

  async loadVersion() {
    const el = document.getElementById('app-version');
    if (!el) return;
    try {
      const keys = await caches.keys();
      const current = keys.find(k => k.startsWith('coach-v'));
      if (current) {
        el.textContent = current.replace('coach-', '');
      }
      // If no cache found (e.g. mid-update), leave the element empty — don't show stale version
    } catch { /* leave empty */ }
  },

  _updateBound: false,
  initUpdateButton() {
    if (Settings._updateBound) return;
    Settings._updateBound = true;
    document.getElementById('update-app-btn')?.addEventListener('click', async () => {
      // Clear version text immediately to prevent stale version flash on reload
      const versionEl = document.getElementById('app-version');
      if (versionEl) versionEl.textContent = '';
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
