// skincare.js — Skincare routine checklist (AM/PM)

// ── Skin concern options for onboarding ──
const SKIN_CONCERNS = [
  { key: 'acne', label: 'Acne / Breakouts' },
  { key: 'dryness', label: 'Dryness' },
  { key: 'oiliness', label: 'Oiliness' },
  { key: 'aging', label: 'Fine Lines / Aging' },
  { key: 'sensitivity', label: 'Sensitivity / Redness' },
  { key: 'hyperpigmentation', label: 'Dark Spots / Hyperpigmentation' },
  { key: 'pores', label: 'Visible Pores' },
  { key: 'dullness', label: 'Dullness / Uneven Tone' },
  { key: 'dark_circles', label: 'Dark Circles' },
  { key: 'texture', label: 'Rough Texture' },
];

const SKIN_TYPES = [
  { key: 'dry', label: 'Dry' },
  { key: 'oily', label: 'Oily' },
  { key: 'combination', label: 'Combination' },
  { key: 'normal', label: 'Normal' },
  { key: 'unsure', label: 'Not sure' },
];

// ── Skincare Onboarding Wizard ──
const SkincareOnboarding = {
  _state: {
    step: 0,
    skinType: null,
    concerns: [],
    productPhoto: null,
    facePhoto: null,
  },

  reset() {
    this._state = { step: 0, skinType: null, concerns: [], productPhoto: null, facePhoto: null };
  },

  async render(date) {
    const s = this._state;
    const steps = ['welcome', 'concerns', 'products', 'face', 'complete'];
    const stepName = steps[s.step] || 'welcome';

    let html = '<div class="skincare-onboarding">';

    // Progress dots
    html += '<div class="skincare-ob-progress">';
    for (let i = 0; i < steps.length; i++) {
      const cls = i === s.step ? 'active' : (i < s.step ? 'done' : '');
      html += `<div class="skincare-ob-dot ${cls}"></div>`;
    }
    html += '</div>';

    if (stepName === 'welcome') {
      html += SkincareOnboarding._renderWelcome();
    } else if (stepName === 'concerns') {
      html += SkincareOnboarding._renderConcerns(s);
    } else if (stepName === 'products') {
      html += SkincareOnboarding._renderProducts(s);
    } else if (stepName === 'face') {
      html += SkincareOnboarding._renderFace(s);
    } else if (stepName === 'complete') {
      html += await SkincareOnboarding._renderComplete(date);
    }

    html += '</div>';
    return html;
  },

  _renderWelcome() {
    return `
      <div class="skincare-ob-card">
        <div class="skincare-ob-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" width="40" height="40">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <h3 class="skincare-ob-title">Skincare Tracker</h3>
        <p class="skincare-ob-desc">
          Build a personalized skincare routine with AI coaching. We will collect a few things to get started:
        </p>
        <ul class="skincare-ob-list">
          <li>Your skin type and concerns</li>
          <li>A photo of your current products (optional)</li>
          <li>A face photo for skin analysis baseline (optional)</li>
        </ul>
        <p class="skincare-ob-desc" style="margin-top:var(--space-sm); font-size:var(--text-xs); color:var(--text-muted);">
          Your coach will analyze everything within 30 minutes and build a routine tailored to you. All photos stay private on your device and sync only to your personal relay.
        </p>
        <button class="btn btn-primary btn-block btn-lg skincare-ob-next" data-action="next">Get Started</button>
      </div>
    `;
  },

  _renderConcerns(state) {
    let html = `
      <div class="skincare-ob-card">
        <h3 class="skincare-ob-title">About Your Skin</h3>
        <p class="skincare-ob-desc">Select your skin type:</p>
        <div class="skincare-ob-type-grid">
    `;
    for (const t of SKIN_TYPES) {
      const sel = state.skinType === t.key ? ' selected' : '';
      html += `<button class="skincare-ob-type-btn${sel}" data-type="${t.key}">${UI.escapeHtml(t.label)}</button>`;
    }
    html += `</div>
        <p class="skincare-ob-desc" style="margin-top:var(--space-md);">Select your top concerns:</p>
        <div class="skincare-ob-concerns-grid">`;
    for (const c of SKIN_CONCERNS) {
      const sel = state.concerns.includes(c.key) ? ' selected' : '';
      html += `<button class="skincare-ob-concern-btn${sel}" data-concern="${c.key}">${UI.escapeHtml(c.label)}</button>`;
    }
    html += `</div>
        <div class="skincare-ob-actions">
          <button class="btn btn-ghost skincare-ob-back" data-action="back">Back</button>
          <button class="btn btn-primary skincare-ob-next" data-action="next">Continue</button>
        </div>
      </div>
    `;
    return html;
  },

  _renderProducts(state) {
    const hasPhoto = !!state.productPhoto;
    return `
      <div class="skincare-ob-card">
        <h3 class="skincare-ob-title">Your Current Products</h3>
        <p class="skincare-ob-desc">
          Lay out all your skincare products and take a photo. Your coach will identify each product and suggest how to use them.
        </p>
        <div class="skincare-ob-photo-area" id="skincare-ob-product-preview">
          ${hasPhoto
            ? `<img src="${state.productPhoto.url}" class="skincare-ob-photo-img" alt="Product shelf photo">
               <button class="skincare-ob-photo-remove" data-action="remove-product-photo" title="Remove">&times;</button>`
            : `<div class="skincare-ob-photo-placeholder" id="skincare-ob-product-capture">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                  <rect x="2" y="5" width="20" height="16" rx="2"/>
                  <circle cx="12" cy="13" r="4"/>
                  <path d="M8.5 5L9.5 3h5l1 2"/>
                </svg>
                <span>Tap to photograph your products</span>
              </div>`
          }
        </div>
        <div class="skincare-ob-actions">
          <button class="btn btn-ghost skincare-ob-back" data-action="back">Back</button>
          <button class="btn btn-${hasPhoto ? 'primary' : 'secondary'} skincare-ob-next" data-action="next">${hasPhoto ? 'Continue' : 'Skip for now'}</button>
        </div>
      </div>
    `;
  },

  _renderFace(state) {
    const hasPhoto = !!state.facePhoto;
    return `
      <div class="skincare-ob-card">
        <h3 class="skincare-ob-title">Face Photo Baseline</h3>
        <p class="skincare-ob-desc">
          Take a face photo in natural light with a neutral expression. Your coach will use this to assess your skin and track progress over time.
        </p>
        <div class="skincare-ob-photo-area" id="skincare-ob-face-preview">
          ${hasPhoto
            ? `<img src="${state.facePhoto.url}" class="skincare-ob-photo-img" alt="Face photo">
               <button class="skincare-ob-photo-remove" data-action="remove-face-photo" title="Remove">&times;</button>`
            : `<div class="skincare-ob-photo-placeholder" id="skincare-ob-face-capture">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                  <circle cx="12" cy="8" r="5"/>
                  <path d="M20 21a8 8 0 00-16 0"/>
                </svg>
                <span>Tap to take a face photo</span>
              </div>`
          }
        </div>
        <div class="skincare-ob-actions">
          <button class="btn btn-ghost skincare-ob-back" data-action="back">Back</button>
          <button class="btn btn-${hasPhoto ? 'primary' : 'secondary'} skincare-ob-next" data-action="next">${hasPhoto ? 'Finish Setup' : 'Skip for now'}</button>
        </div>
      </div>
    `;
  },

  async _renderComplete(date) {
    return `
      <div class="skincare-ob-card" style="text-align:center;">
        <div class="skincare-ob-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2" width="40" height="40">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h3 class="skincare-ob-title">Setup Complete</h3>
        <p class="skincare-ob-desc">
          Your coach will analyze your photos and skin profile within the next processing cycle (up to 30 minutes). Check back on the Coach tab for your personalized routine.
        </p>
        <div class="skincare-ob-waiting">
          <div class="skincare-ob-waiting-bar"></div>
          <span>Waiting for coach analysis...</span>
        </div>
        <button class="btn btn-primary btn-block btn-lg skincare-ob-next" data-action="done" style="margin-top:var(--space-md);">Got it</button>
      </div>
    `;
  },

  bindEvents(date, container) {
    const state = this._state;

    // Navigation: next / back / done
    container.querySelectorAll('[data-action="next"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (state.step === 1) {
          // Save concerns before advancing
          await SkincareOnboarding._saveSkinProfile(state);
        }
        if (state.step === 3) {
          // Completing the wizard — save everything
          await SkincareOnboarding._finishOnboarding(date, state);
        }
        if (state.step >= 4) {
          // Done — re-render the skincare panel to show waiting state
          SkincareOnboarding.reset();
          const el = container.closest('#today-skincare') || container;
          el.innerHTML = await SkinCareView.render(date);
          SkinCareView.bindEvents(date);
          return;
        }
        state.step++;
        SkincareOnboarding._rerender(date, container);
      });
    });

    container.querySelectorAll('[data-action="back"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.step > 0) state.step--;
        SkincareOnboarding._rerender(date, container);
      });
    });

    // Skin type selection
    container.querySelectorAll('.skincare-ob-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.skinType = btn.dataset.type;
        container.querySelectorAll('.skincare-ob-type-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    // Concern toggle
    container.querySelectorAll('.skincare-ob-concern-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.concern;
        const idx = state.concerns.indexOf(key);
        if (idx >= 0) {
          state.concerns.splice(idx, 1);
          btn.classList.remove('selected');
        } else {
          state.concerns.push(key);
          btn.classList.add('selected');
        }
      });
    });

    // Product photo capture
    const productCapture = container.querySelector('#skincare-ob-product-capture');
    if (productCapture) {
      productCapture.addEventListener('click', async () => {
        const photo = await Camera.capture('meal');
        if (!photo) return;
        state.productPhoto = photo;
        SkincareOnboarding._rerender(date, container);
      });
    }

    // Product photo remove
    container.querySelectorAll('[data-action="remove-product-photo"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.productPhoto) Camera.revokeURL(state.productPhoto.url);
        state.productPhoto = null;
        SkincareOnboarding._rerender(date, container);
      });
    });

    // Face photo capture
    const faceCapture = container.querySelector('#skincare-ob-face-capture');
    if (faceCapture) {
      faceCapture.addEventListener('click', async () => {
        const photo = await Camera.capture('body');
        if (!photo) return;
        state.facePhoto = photo;
        SkincareOnboarding._rerender(date, container);
      });
    }

    // Face photo remove
    container.querySelectorAll('[data-action="remove-face-photo"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.facePhoto) Camera.revokeURL(state.facePhoto.url);
        state.facePhoto = null;
        SkincareOnboarding._rerender(date, container);
      });
    });
  },

  async _rerender(date, container) {
    const el = container.closest('#today-skincare') || container;
    el.innerHTML = await SkincareOnboarding.render(date);
    SkincareOnboarding.bindEvents(date, el);
  },

  async _saveSkinProfile(state) {
    let profile = await DB.getSkincareRoutine();
    if (!profile) {
      profile = { weeklyTemplate: { default: { am: [], pm: [] }, overrides: {} }, rotations: [], products: [] };
    }
    profile.skinType = state.skinType;
    profile.concerns = [...state.concerns];
    profile.onboardingStarted = new Date().toISOString();
    await DB.setSkincareRoutine(profile);
  },

  async _finishOnboarding(date, state) {
    // 1. Save skin profile (concerns + type)
    await SkincareOnboarding._saveSkinProfile(state);

    // 2. Save product shelf photo as an entry for processing
    if (state.productPhoto) {
      const entry = {
        id: UI.generateId('skincareProducts'),
        type: 'skincareProducts',
        date: date,
        timestamp: new Date().toISOString(),
        notes: 'Skincare product shelf photo for coach analysis',
        photo: true,
      };
      await DB.addEntry(entry, state.productPhoto.blob);
    }

    // 3. Save face photo as body photo with face subtype
    if (state.facePhoto) {
      const entry = {
        id: UI.generateId('bodyPhoto_face'),
        type: 'bodyPhoto',
        subtype: 'face',
        date: date,
        timestamp: new Date().toISOString(),
        notes: 'Skincare onboarding face photo',
        photo: true,
        duration_minutes: null,
      };
      await DB.addEntry(entry, state.facePhoto.blob);
    }

    // 4. Mark onboarding complete
    let profile = await DB.getSkincareRoutine();
    if (!profile) profile = {};
    profile.onboardingComplete = true;
    profile.onboardingDate = new Date().toISOString();
    await DB.setSkincareRoutine(profile);

    // 5. Trigger sync
    if (typeof CloudRelay !== 'undefined' && await CloudRelay.isConfigured()) {
      CloudRelay.queueUpload(date);
    }

    // Clean up object URLs
    if (state.productPhoto) Camera.revokeURL(state.productPhoto.url);
    if (state.facePhoto) Camera.revokeURL(state.facePhoto.url);

    UI.toast('Skincare setup complete');
  },
};

const SkinCareView = {
  async render(date) {
    // 1. Load skincare profile
    const profile = await DB.getSkincareRoutine();

    // No routine yet — check if onboarding was completed (waiting for analysis) or show onboarding
    if (!profile || !profile.products || profile.products.length === 0) {
      if (profile?.onboardingComplete) {
        // Onboarding done, waiting for coach to build routine
        return `<div class="skincare-ob-card" style="text-align:center;">
          <div class="skincare-ob-waiting">
            <div class="skincare-ob-waiting-bar"></div>
            <span>Waiting for coach to build your routine...</span>
          </div>
          <p style="font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-sm);">
            Your coach processes data every 30 minutes. Check the Coach tab for updates.
          </p>
        </div>`;
      }
      // Show onboarding wizard
      return await SkincareOnboarding.render(date);
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
    // If onboarding wizard is active, delegate to it
    const obContainer = document.querySelector('.skincare-onboarding');
    if (obContainer) {
      SkincareOnboarding.bindEvents(date, obContainer);
      return;
    }

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

// ── SkincareCoach — Coach tab skincare routine planning ──

const SKINCARE_CATEGORIES = ['cleanser', 'toner', 'serum', 'active', 'moisturizer', 'spf', 'mask', 'tool', 'other'];
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SkincareCoach = {
  renderSection(profile) {
    let html = '<div class="coach-analysis-section"><p class="coach-section-label">Skincare Routine</p>';

    if (!profile || !profile.products || profile.products.length === 0) {
      if (profile?.onboardingComplete) {
        // Onboarding done, waiting for coach to build routine
        html += `
          <div class="card" style="text-align:center; padding:var(--space-lg);">
            <div class="skincare-ob-waiting" style="margin-bottom:var(--space-sm);">
              <div class="skincare-ob-waiting-bar"></div>
              <span>Waiting for coach to build your routine...</span>
            </div>
            <p style="font-size:var(--text-xs); color:var(--text-muted);">
              Your skin profile${profile.concerns?.length ? ' (' + profile.concerns.join(', ') + ')' : ''} has been submitted. Your coach will analyze your photos and create a personalized routine.
            </p>
            <div style="margin-top:var(--space-md); display:flex; gap:var(--space-sm); justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="sc-manage-products-btn">Add Products Manually</button>
            </div>
          </div>`;
      } else {
        html += `
          <div class="card" style="text-align:center; padding:var(--space-lg);">
            <p style="font-weight:600; margin-bottom:var(--space-xs);">No skincare routine yet</p>
            <p style="font-size:var(--text-sm); color:var(--text-muted); margin-bottom:var(--space-md);">
              Start the skincare onboarding on the Today tab (Skin panel), or add products manually.
            </p>
            <div style="display:flex; gap:var(--space-sm); justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-primary" id="sc-manage-products-btn">Manage Products</button>
            </div>
          </div>`;
      }
      html += '</div>';
      return html;
    }

    // Weekly template grid
    html += '<div class="sc-weekly-grid">';
    const productMap = {};
    for (const p of profile.products) {
      productMap[p.key] = p;
    }

    for (let i = 0; i < 7; i++) {
      const dayName = DAY_NAMES[i];
      const dayLabel = DAY_LABELS[i];
      // Resolve what products appear on this day
      // Use a monday-based dateStr for resolution
      const refDate = SkincareCoach._getDateForDay(dayName);
      const routine = Skincare.resolveRoutineForDate(profile, refDate);

      const hasOverride = profile.weeklyTemplate?.overrides?.[dayName];
      html += `
        <div class="sc-day-card${hasOverride ? ' sc-day-override' : ''}">
          <div class="sc-day-label">${dayLabel}</div>
          <div class="sc-day-slot">
            <span class="sc-slot-label">AM</span>
            <span class="sc-slot-count">${routine.am.length}</span>
          </div>
          <div class="sc-day-slot">
            <span class="sc-slot-label">PM</span>
            <span class="sc-slot-count">${routine.pm.length}</span>
          </div>
        </div>`;
    }
    html += '</div>';

    // Action buttons
    html += `
      <div style="display:flex; gap:var(--space-sm); margin-top:var(--space-sm);">
        <button class="btn btn-secondary" id="sc-edit-routine-btn" style="flex:1;">Edit Routine</button>
        <button class="btn btn-ghost" id="sc-manage-products-btn" style="flex:1;">Manage Products</button>
      </div>`;

    html += '</div>';
    return html;
  },

  // Get a date string for a given day name (for resolving routines)
  _getDateForDay(dayName) {
    // Find the next occurrence of this day from a known Monday
    const dayIndex = DAY_NAMES.indexOf(dayName);
    // 2024-01-01 is a Monday
    const base = new Date('2024-01-01T00:00:00');
    base.setDate(base.getDate() + dayIndex);
    return base.toISOString().split('T')[0];
  },

  bindEvents(container, profile) {
    const editBtn = container.querySelector('#sc-edit-routine-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => SkincareCoach.showRoutineEditor(profile));
    }
    const productsBtn = container.querySelector('#sc-manage-products-btn');
    if (productsBtn) {
      productsBtn.addEventListener('click', () => SkincareCoach.showProductCatalog(profile));
    }
  },

  // ── Routine Editor Modal ──
  async showRoutineEditor(profile) {
    if (!profile) {
      profile = await DB.getSkincareRoutine();
    }
    if (!profile) {
      profile = { weeklyTemplate: { default: { am: [], pm: [] }, overrides: {} }, rotations: [], products: [] };
    }

    let selectedDay = 'default';
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '85dvh';

    const productMap = {};
    for (const p of (profile.products || [])) {
      productMap[p.key] = p;
    }

    const getSlotProducts = (day, slot) => {
      if (day === 'default') {
        return [...(profile.weeklyTemplate?.default?.[slot] || [])];
      }
      const override = profile.weeklyTemplate?.overrides?.[day];
      if (override && override[slot]) {
        return [...override[slot]];
      }
      // Fall back to default
      return [...(profile.weeklyTemplate?.default?.[slot] || [])];
    };

    const setSlotProducts = (day, slot, keys) => {
      if (!profile.weeklyTemplate) profile.weeklyTemplate = { default: { am: [], pm: [] }, overrides: {} };
      if (day === 'default') {
        profile.weeklyTemplate.default[slot] = keys;
      } else {
        if (!profile.weeklyTemplate.overrides) profile.weeklyTemplate.overrides = {};
        if (!profile.weeklyTemplate.overrides[day]) {
          // Copy defaults as starting point for override
          profile.weeklyTemplate.overrides[day] = {
            am: [...(profile.weeklyTemplate.default.am || [])],
            pm: [...(profile.weeklyTemplate.default.pm || [])],
          };
        }
        profile.weeklyTemplate.overrides[day][slot] = keys;
      }
    };

    const render = () => {
      const amProducts = getSlotProducts(selectedDay, 'am');
      const pmProducts = getSlotProducts(selectedDay, 'pm');
      const isOverride = selectedDay !== 'default' && profile.weeklyTemplate?.overrides?.[selectedDay];

      sheet.innerHTML = `
        <div class="modal-header">
          <span class="modal-title">Edit Routine</span>
          <button class="modal-close" id="sc-re-close" aria-label="Close">&times;</button>
        </div>
        <div class="sc-day-selector">
          <button class="sc-day-sel-btn${selectedDay === 'default' ? ' active' : ''}" data-day="default">Default</button>
          ${DAY_NAMES.map((d, i) => {
            const hasOvr = profile.weeklyTemplate?.overrides?.[d];
            return `<button class="sc-day-sel-btn${selectedDay === d ? ' active' : ''}${hasOvr ? ' sc-has-override' : ''}" data-day="${d}">${DAY_LABELS[i]}</button>`;
          }).join('')}
        </div>
        ${isOverride ? `<div style="display:flex; justify-content:flex-end; margin-bottom:var(--space-xs);">
          <button class="btn btn-ghost" id="sc-re-clear-override" style="font-size:var(--text-xs); color:var(--text-muted);">Clear override (use default)</button>
        </div>` : ''}
        <div class="sc-slot-section">
          <div class="sc-slot-header">
            <span>AM Routine</span>
            <button class="btn btn-ghost sc-add-product-btn" data-slot="am" style="font-size:var(--text-xs);">+ Add</button>
          </div>
          ${SkincareCoach._renderProductList(amProducts, productMap, 'am')}
        </div>
        <div class="sc-slot-section">
          <div class="sc-slot-header">
            <span>PM Routine</span>
            <button class="btn btn-ghost sc-add-product-btn" data-slot="pm" style="font-size:var(--text-xs);">+ Add</button>
          </div>
          ${SkincareCoach._renderProductList(pmProducts, productMap, 'pm')}
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="sc-re-done" style="margin-top:var(--space-md);">Done</button>
      `;

      // Bind day selector
      sheet.querySelectorAll('.sc-day-sel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedDay = btn.dataset.day;
          render();
        });
      });

      // Bind close/done
      sheet.querySelector('#sc-re-close').addEventListener('click', closeModal);
      sheet.querySelector('#sc-re-done').addEventListener('click', closeModal);

      // Bind clear override
      const clearBtn = sheet.querySelector('#sc-re-clear-override');
      if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
          if (profile.weeklyTemplate?.overrides?.[selectedDay]) {
            delete profile.weeklyTemplate.overrides[selectedDay];
            await saveRoutine();
            render();
          }
        });
      }

      // Bind add product buttons
      sheet.querySelectorAll('.sc-add-product-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          SkincareCoach._showProductPicker(profile, selectedDay, btn.dataset.slot, async (key) => {
            const current = getSlotProducts(selectedDay, btn.dataset.slot);
            if (!current.includes(key)) {
              current.push(key);
              setSlotProducts(selectedDay, btn.dataset.slot, current);
              await saveRoutine();
              render();
            }
          });
        });
      });

      // Bind remove buttons
      sheet.querySelectorAll('.sc-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const slot = btn.dataset.slot;
          const key = btn.dataset.key;
          const current = getSlotProducts(selectedDay, slot);
          const idx = current.indexOf(key);
          if (idx >= 0) {
            current.splice(idx, 1);
            setSlotProducts(selectedDay, slot, current);
            await saveRoutine();
            render();
          }
        });
      });
    };

    const saveRoutine = async () => {
      await DB.setSkincareRoutine(profile);
      UI.toast('Routine saved');
      // Re-render skincare on Today tab if visible
      SkincareCoach._refreshTodayPanel();
    };

    const closeModal = async () => {
      overlay.remove();
      // Refresh coach skincare section
      const skincareEl = document.getElementById('coach-skincare');
      if (skincareEl) {
        const refreshed = await DB.getSkincareRoutine();
        skincareEl.innerHTML = SkincareCoach.renderSection(refreshed);
        SkincareCoach.bindEvents(skincareEl, refreshed);
      }
    };

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    render();
  },

  _renderProductList(keys, productMap, slot) {
    if (keys.length === 0) {
      return `<div style="padding:var(--space-sm); text-align:center; color:var(--text-muted); font-size:var(--text-sm);">No products</div>`;
    }
    return keys.map((key, i) => {
      const product = productMap[key];
      const name = product ? product.name : key;
      const category = product ? product.category : '';
      const photo = product?.photo || null;
      return `
        <div class="sc-routine-product">
          <span class="sc-routine-order">${i + 1}</span>
          ${photo ? `<img src="${UI.escapeHtml(photo)}" alt="" class="sc-routine-photo">` : ''}
          <div class="sc-routine-product-info">
            <span class="sc-routine-product-name">${UI.escapeHtml(name)}</span>
            ${category ? `<span class="skincare-category-badge">${UI.escapeHtml(category)}</span>` : ''}
          </div>
          <button class="btn btn-ghost sc-remove-btn" data-slot="${slot}" data-key="${UI.escapeHtml(key)}" style="padding:var(--space-xs); color:var(--text-muted);">&times;</button>
        </div>`;
    }).join('');
  },

  _showProductPicker(profile, day, slot, onSelect) {
    const products = profile.products || [];
    if (products.length === 0) {
      UI.toast('Add products first', 'error');
      return;
    }

    const pickerOverlay = UI.createElement('div', 'modal-overlay');
    pickerOverlay.style.zIndex = '1001';
    const pickerSheet = UI.createElement('div', 'modal-sheet');
    pickerSheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Add Product</span>
        <button class="modal-close" id="sc-picker-close" aria-label="Close">&times;</button>
      </div>
      <div class="sc-product-picker-list">
        ${products.map(p => `
          <button class="sc-product-picker-item" data-key="${UI.escapeHtml(p.key)}">
            ${p.photo ? `<img src="${UI.escapeHtml(p.photo)}" alt="" class="sc-picker-photo">` : '<div class="sc-picker-photo-placeholder"></div>'}
            <div style="flex:1; min-width:0;">
              <div style="font-weight:500; font-size:var(--text-sm);">${UI.escapeHtml(p.name)}</div>
              ${p.category ? `<div style="font-size:var(--text-xs); color:var(--text-muted);">${UI.escapeHtml(p.category)}</div>` : ''}
            </div>
          </button>
        `).join('')}
      </div>
    `;

    pickerOverlay.appendChild(pickerSheet);
    document.body.appendChild(pickerOverlay);

    const closePicker = () => pickerOverlay.remove();
    pickerSheet.querySelector('#sc-picker-close').addEventListener('click', closePicker);
    pickerOverlay.addEventListener('click', (e) => { if (e.target === pickerOverlay) closePicker(); });

    pickerSheet.querySelectorAll('.sc-product-picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.key);
        closePicker();
      });
    });
  },

  // ── Product Catalog Modal ──
  async showProductCatalog(profile) {
    if (!profile) {
      profile = await DB.getSkincareRoutine();
    }
    if (!profile) {
      profile = { weeklyTemplate: { default: { am: [], pm: [] }, overrides: {} }, rotations: [], products: [] };
    }

    let pendingPhoto = null;
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '85dvh';

    const render = () => {
      const products = profile.products || [];
      sheet.innerHTML = `
        <div class="modal-header">
          <span class="modal-title">Manage Products</span>
          <button class="modal-close" id="sc-pc-close" aria-label="Close">&times;</button>
        </div>
        <div id="sc-pc-list">
          ${products.length === 0 ? `<div style="text-align:center; padding:var(--space-md); color:var(--text-muted); font-size:var(--text-sm);">
            No products yet. Add your skincare products below.
          </div>` : products.map((p, i) => `
            <div class="sc-catalog-item">
              ${p.photo ? `<img src="${UI.escapeHtml(p.photo)}" alt="" class="sc-catalog-photo">` : '<div class="sc-catalog-photo-placeholder"></div>'}
              <div class="sc-catalog-item-body">
                <div style="font-weight:500; font-size:var(--text-sm);">${UI.escapeHtml(p.name)}</div>
                ${p.category ? `<div style="font-size:var(--text-xs); color:var(--text-muted);">${UI.escapeHtml(p.category)}</div>` : ''}
              </div>
              <button class="sc-catalog-remove" data-index="${i}" title="Remove">&times;</button>
            </div>
          `).join('')}
        </div>
        <div class="sc-add-form">
          <div id="sc-pc-photo-area" style="margin-bottom:var(--space-sm);"></div>
          <div style="display:flex; gap:var(--space-sm); margin-bottom:var(--space-sm);">
            <button class="btn btn-ghost" id="sc-pc-camera-btn" style="flex:0 0 auto; padding:var(--space-xs) var(--space-sm);" title="Add photo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="2" y="5" width="20" height="16" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8.5 5L9.5 3h5l1 2"/></svg>
            </button>
            <input type="text" class="form-input" id="sc-pc-name" placeholder="Product name" maxlength="80" style="flex:1;">
          </div>
          <div style="margin-bottom:var(--space-sm);">
            <select class="form-input" id="sc-pc-category" style="width:100%;">
              <option value="">Select category...</option>
              ${SKINCARE_CATEGORIES.map(c => `<option value="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary btn-block" id="sc-pc-add-btn">Add Product</button>
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="sc-pc-done" style="margin-top:var(--space-md);">Done</button>
      `;

      // Bind events
      sheet.querySelector('#sc-pc-close').addEventListener('click', closeModal);
      sheet.querySelector('#sc-pc-done').addEventListener('click', closeModal);

      // Camera
      sheet.querySelector('#sc-pc-camera-btn').addEventListener('click', async () => {
        const result = await Camera.capture('meal');
        if (!result) return;
        pendingPhoto = result;
        const reader = new FileReader();
        reader.onload = () => {
          pendingPhoto.dataURL = reader.result;
          const area = document.getElementById('sc-pc-photo-area');
          if (area) {
            area.innerHTML = '';
            area.appendChild(Camera.createPreview(result.url, () => {
              Camera.revokeURL(pendingPhoto.url);
              pendingPhoto = null;
              area.innerHTML = '';
            }));
          }
        };
        reader.readAsDataURL(result.blob);
      });

      // Add product
      sheet.querySelector('#sc-pc-add-btn').addEventListener('click', async () => {
        const name = document.getElementById('sc-pc-name')?.value?.trim();
        if (!name) { UI.toast('Enter a product name', 'error'); return; }
        const category = document.getElementById('sc-pc-category')?.value || '';
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

        if (!profile.products) profile.products = [];
        if (profile.products.some(p => p.key === key)) {
          UI.toast('Product already exists', 'error');
          return;
        }

        const product = { key, name, category, photo: null };
        if (pendingPhoto?.dataURL) product.photo = pendingPhoto.dataURL;
        profile.products.push(product);

        if (pendingPhoto) { Camera.revokeURL(pendingPhoto.url); pendingPhoto = null; }
        await saveProducts();
        render();
      });

      // Remove products
      sheet.querySelectorAll('.sc-catalog-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.index);
          const product = profile.products[idx];
          if (!product) return;

          // Confirm deletion
          if (!confirm(`Remove "${product.name}"? This will also remove it from your routine.`)) return;

          const key = product.key;
          profile.products.splice(idx, 1);

          // Also remove from template
          SkincareCoach._removeProductFromTemplate(profile, key);

          await saveProducts();
          render();
        });
      });
    };

    const saveProducts = async () => {
      await DB.setSkincareRoutine(profile);
      UI.toast('Products saved');
      SkincareCoach._refreshTodayPanel();
    };

    const closeModal = async () => {
      if (pendingPhoto) { Camera.revokeURL(pendingPhoto.url); pendingPhoto = null; }
      overlay.remove();
      // Refresh coach skincare section
      const skincareEl = document.getElementById('coach-skincare');
      if (skincareEl) {
        const refreshed = await DB.getSkincareRoutine();
        skincareEl.innerHTML = SkincareCoach.renderSection(refreshed);
        SkincareCoach.bindEvents(skincareEl, refreshed);
      }
    };

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    render();
  },

  _removeProductFromTemplate(profile, key) {
    if (!profile.weeklyTemplate) return;
    const def = profile.weeklyTemplate.default;
    if (def) {
      if (def.am) def.am = def.am.filter(k => k !== key);
      if (def.pm) def.pm = def.pm.filter(k => k !== key);
    }
    const overrides = profile.weeklyTemplate.overrides;
    if (overrides) {
      for (const day of Object.keys(overrides)) {
        const o = overrides[day];
        if (o.am) o.am = o.am.filter(k => k !== key);
        if (o.pm) o.pm = o.pm.filter(k => k !== key);
      }
    }
  },

  async _refreshTodayPanel() {
    const skincarePanel = document.getElementById('today-skincare');
    if (skincarePanel && typeof App !== 'undefined') {
      const date = App.selectedDate || UI.today();
      skincarePanel.innerHTML = await SkinCareView.render(date);
      SkinCareView.bindEvents(date);
    }
  },
};
