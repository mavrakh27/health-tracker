// skincare.js — Skincare routine checklist (AM/PM)

const SkinCareView = {
  async render(date) {
    // 1. Load skincare profile
    const profile = await DB.getSkincareRoutine();
    if (!profile || !profile.products || profile.products.length === 0) {
      return `<div class="card" style="text-align:center; padding:var(--space-lg);">
        <p style="font-weight:600; margin-bottom:var(--space-xs);">Set up your skincare routine</p>
        <p style="font-size:var(--text-sm); color:var(--text-muted); margin-bottom:var(--space-md);">Talk to your coach to create a personalized routine.</p>
        <button class="btn btn-primary" onclick="App.showCoachSetup()">Set Up with Coach</button>
      </div>`;
    }

    // 2. Resolve today's routine (applies template + rotations for this day)
    const routine = Skincare.resolveRoutineForDate(profile, date);

    // 3. Load today's log (checked items)
    const log = await DB.getSkincareLog(date);
    const amLog = log?.am || [];
    const pmLog = log?.pm || [];

    // Build product lookup map
    const productMap = {};
    for (const p of profile.products) {
      productMap[p.key] = p;
    }

    // Count completions
    const amChecked = amLog.filter(item => item.checked).length;
    const pmChecked = pmLog.filter(item => item.checked).length;
    const amTotal = routine.am.length;
    const pmTotal = routine.pm.length;

    // Check for face photo today
    const entries = await DB.getEntriesByDate(date);
    const hasFacePhoto = entries.some(e => e.type === 'bodyPhoto' && e.subtype === 'face');

    let html = '';

    // Progress indicator
    html += `<div class="skincare-progress-summary" id="skincare-progress">AM ${amChecked}/${amTotal} &middot; PM ${pmChecked}/${pmTotal}</div>`;

    // AM Section
    html += SkinCareView._renderSection('AM', 'am', routine.am, amLog, productMap, amChecked, amTotal);

    // PM Section
    html += SkinCareView._renderSection('PM', 'pm', routine.pm, pmLog, productMap, pmChecked, pmTotal);

    // Face photo prompt
    if (!hasFacePhoto) {
      html += `
        <div class="card" style="text-align:center; padding:var(--space-md); margin-top:var(--space-sm);">
          <button class="btn btn-ghost" id="skincare-face-photo-btn" style="width:100%; display:flex; align-items:center; justify-content:center; gap:var(--space-xs);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Take today's face photo
          </button>
        </div>
      `;
    } else {
      html += `
        <div class="card" style="text-align:center; padding:var(--space-sm); margin-top:var(--space-sm);">
          <div style="font-size:var(--text-xs); color:var(--text-muted);">Face photo taken today</div>
        </div>
      `;
    }

    return html;
  },

  _renderSection(label, slot, productKeys, logItems, productMap, checkedCount, total) {
    // Build a map from log items for quick lookup
    const logMap = {};
    for (const item of logItems) {
      logMap[item.key] = item;
    }

    let html = `
      <div class="skincare-section-header">
        <span>${label} Routine</span>
        <span class="skincare-completion-badge" id="skincare-badge-${slot}">${checkedCount}/${total}</span>
      </div>
    `;

    for (const key of productKeys) {
      const product = productMap[key];
      const name = product ? product.name : key;
      const category = product ? product.category : '';
      const photoUrl = product?.photo || null;
      const logEntry = logMap[key];
      const isChecked = logEntry?.checked || false;

      html += `
        <div class="card skincare-product-row${isChecked ? ' skincare-done' : ''}" style="margin-bottom:var(--space-xs);">
          <div class="fitness-exercise-row">
            <button class="fitness-check skincare-check${isChecked ? ' checked' : ''}" data-slot="${slot}" data-key="${UI.escapeHtml(key)}">
              ${isChecked ? '&#x2713;' : ''}
            </button>
            <div style="flex:1; min-width:0; display:flex; align-items:center; gap:var(--space-sm);">
              ${photoUrl ? `<img src="${UI.escapeHtml(photoUrl)}" alt="" style="width:24px; height:24px; border-radius:var(--radius-sm); object-fit:cover;">` : ''}
              <div style="flex:1; min-width:0;">
                <span class="fitness-exercise-name${isChecked ? ' fitness-strikethrough' : ''}">${UI.escapeHtml(name)}</span>
              </div>
              ${category ? `<span class="skincare-category-badge">${UI.escapeHtml(category)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    return html;
  },

  async bindEvents(date) {
    // Checkbox toggle
    document.querySelectorAll('.skincare-check').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const slot = btn.dataset.slot; // 'am' or 'pm'
        const key = btn.dataset.key;

        // Read current log
        let log = await DB.getSkincareLog(date);
        if (!log) log = { am: [], pm: [] };
        if (!log.am) log.am = [];
        if (!log.pm) log.pm = [];

        const slotLog = log[slot];
        const existing = slotLog.find(item => item.key === key);
        const productRow = btn.closest('.skincare-product-row');

        if (existing) {
          existing.checked = !existing.checked;
          existing.timestamp = new Date().toISOString();
        } else {
          slotLog.push({ key, checked: true, timestamp: new Date().toISOString() });
        }

        const isNowChecked = existing ? existing.checked : true;

        // Update UI
        if (isNowChecked) {
          btn.classList.add('checked');
          btn.innerHTML = '&#x2713;';
          productRow?.classList.add('skincare-done');
          productRow?.querySelector('.fitness-exercise-name')?.classList.add('fitness-strikethrough');
        } else {
          btn.classList.remove('checked');
          btn.innerHTML = '';
          productRow?.classList.remove('skincare-done');
          productRow?.querySelector('.fitness-exercise-name')?.classList.remove('fitness-strikethrough');
        }

        // Save
        await DB.updateSkincareLog(date, log);

        // Update badges
        SkinCareView._updateBadges(log, date);

        // Sync
        if (typeof CloudRelay !== 'undefined' && await CloudRelay.isConfigured()) {
          CloudRelay.queueUpload(date);
        }
      });
    });

    // Face photo button
    const faceBtn = document.getElementById('skincare-face-photo-btn');
    if (faceBtn) {
      faceBtn.addEventListener('click', async () => {
        const photo = await Camera.capture('body');
        if (!photo) return;

        const entry = {
          id: UI.generateId('bodyPhoto_face'),
          type: 'bodyPhoto',
          subtype: 'face',
          date: date,
          timestamp: new Date().toISOString(),
          notes: '',
          photo: true,
          duration_minutes: null,
        };
        await DB.addEntry(entry, photo.blob);
        UI.toast('Face photo saved');

        if (typeof CloudRelay !== 'undefined' && await CloudRelay.isConfigured()) {
          CloudRelay.queueUpload(date);
        }

        // Re-render skincare panel to show "photo taken" state
        const skincareEl = document.getElementById('today-skincare');
        if (skincareEl) {
          skincareEl.innerHTML = await SkinCareView.render(date);
          SkinCareView.bindEvents(date);
        }
      });
    }
  },

  _updateBadges(log, date) {
    // Recount from the log data
    // We need the routine to know totals — get from DOM badges
    const amBadge = document.getElementById('skincare-badge-am');
    const pmBadge = document.getElementById('skincare-badge-pm');

    if (amBadge) {
      const amTotal = parseInt(amBadge.textContent.split('/')[1]) || 0;
      const amChecked = (log.am || []).filter(item => item.checked).length;
      amBadge.textContent = `${amChecked}/${amTotal}`;
    }
    if (pmBadge) {
      const pmTotal = parseInt(pmBadge.textContent.split('/')[1]) || 0;
      const pmChecked = (log.pm || []).filter(item => item.checked).length;
      pmBadge.textContent = `${pmChecked}/${pmTotal}`;
    }

    // Update top progress summary
    const progressEl = document.getElementById('skincare-progress');
    if (progressEl && amBadge && pmBadge) {
      progressEl.textContent = `AM ${amBadge.textContent} \u00b7 PM ${pmBadge.textContent}`;
    }
  },
};
