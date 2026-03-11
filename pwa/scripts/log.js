// log.js — Entry logging UI

const Log = {
  selectedType: null,
  selectedSubtype: null,
  pendingPhoto: null, // { blob, url } from Camera

  init() {
    Log.selectedType = null;
    Log.selectedSubtype = null;
    Log.clearPendingPhoto();
    Log.renderTypeSelector();
    Log.hideForm();
  },

  clearPendingPhoto() {
    if (Log.pendingPhoto) {
      Camera.revokeURL(Log.pendingPhoto.url);
      Log.pendingPhoto = null;
    }
  },

  // --- Type Selection ---
  renderTypeSelector() {
    const grid = document.getElementById('log-type-grid');
    if (!grid) return;

    const types = [
      { type: 'meal', icon: '\u{1F37D}\uFE0F', label: 'Food', color: 'var(--color-meal)' },
      { type: 'workout', icon: '\u{1F4AA}', label: 'Workout', color: 'var(--color-workout)' },
      { type: 'water', icon: '\u{1F4A7}', label: 'Water', color: 'var(--color-water)' },
      { type: 'weight', icon: '\u{2696}\uFE0F', label: 'Weight', color: 'var(--color-weight)' },
      { type: 'bodyPhoto', icon: '\u{1F4F7}', label: 'Body Photo', color: 'var(--color-body-photo)' },
    ];

    grid.innerHTML = types.map(t => `
      <button class="type-btn" data-type="${t.type}" style="--type-color: ${t.color}">
        <span class="type-icon">${t.icon}</span>
        <span class="type-label">${t.label}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        Log.selectType(type);
      });
    });
  },

  selectType(type) {
    Log.selectedType = type;
    Log.selectedSubtype = null;
    Log.clearPendingPhoto();
    // Also clear body photo previews
    if (Log._pendingFacePhoto) { Camera.revokeURL(Log._pendingFacePhoto.url); Log._pendingFacePhoto = null; }
    if (Log._pendingBodyPhoto) { Camera.revokeURL(Log._pendingBodyPhoto.url); Log._pendingBodyPhoto = null; }

    // Highlight selected
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === type);
    });

    Log.showForm(type);
  },

  // --- Form Rendering ---
  showForm(type) {
    const form = document.getElementById('log-form');
    if (!form) return;
    form.style.display = 'block';

    const formContent = document.getElementById('log-form-content');
    UI.clearChildren(formContent);

    switch (type) {
      case 'meal':
        formContent.appendChild(Log.buildFoodForm());
        break;
      case 'workout':
        formContent.appendChild(Log.buildWorkoutForm());
        break;
      case 'water':
        formContent.appendChild(Log.buildWaterForm());
        break;
      case 'weight':
        formContent.appendChild(Log.buildWeightForm());
        break;
      case 'bodyPhoto':
        formContent.appendChild(Log.buildBodyPhotoForm());
        break;
    }
  },

  hideForm() {
    const form = document.getElementById('log-form');
    if (form) form.style.display = 'none';
  },

  // --- Photo Button (shared by meal/snack/drink/workout forms) ---
  buildPhotoButton(preset = 'meal') {
    const group = UI.createElement('div', 'form-group');
    group.innerHTML = `
      <div class="photo-actions">
        <button class="btn btn-secondary" id="log-photo-capture">\u{1F4F7} Take Photo</button>
        <button class="btn btn-ghost" id="log-photo-pick">\u{1F5BC}\uFE0F Choose from Library</button>
      </div>
      <div id="log-photo-preview-area"></div>
    `;

    requestAnimationFrame(() => {
      const captureBtn = document.getElementById('log-photo-capture');
      const pickBtn = document.getElementById('log-photo-pick');

      if (captureBtn) {
        captureBtn.addEventListener('click', () => Log.handlePhotoCapture(preset));
      }
      if (pickBtn) {
        pickBtn.addEventListener('click', () => Log.handlePhotoPick(preset));
      }
    });

    return group;
  },

  async handlePhotoCapture(preset) {
    const result = await Camera.capture(preset);
    if (result) Log.setPhotoPreview(result);
  },

  async handlePhotoPick(preset) {
    const result = await Camera.pick(preset);
    if (result) Log.setPhotoPreview(result);
  },

  setPhotoPreview(photo) {
    Log.clearPendingPhoto();
    Log.pendingPhoto = photo;

    const area = document.getElementById('log-photo-preview-area');
    if (!area) return;
    UI.clearChildren(area);

    const preview = Camera.createPreview(photo.url, () => {
      Log.clearPendingPhoto();
    });
    area.appendChild(preview);
  },

  // --- Food Form (no subtype needed) ---
  buildFoodForm() {
    const frag = document.createDocumentFragment();

    // Photo
    frag.appendChild(Log.buildPhotoButton('meal'));

    // Notes
    frag.appendChild(Log.buildNotesField('What did you eat or drink?'));

    // Save button
    frag.appendChild(Log.buildSaveButton());

    return frag;
  },

  // --- Workout Form ---
  buildWorkoutForm() {
    const frag = document.createDocumentFragment();

    // Subtype
    const subtypeRow = UI.createElement('div', 'subtype-row');
    ['strength', 'cardio', 'flexibility'].forEach(sub => {
      const chip = UI.createElement('button', 'subtype-chip');
      chip.textContent = sub.charAt(0).toUpperCase() + sub.slice(1);
      chip.addEventListener('click', () => {
        Log.selectedSubtype = sub;
        subtypeRow.querySelectorAll('.subtype-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
      subtypeRow.appendChild(chip);
    });
    frag.appendChild(subtypeRow);

    // Photo (gym screen, etc.)
    frag.appendChild(Log.buildPhotoButton('meal'));

    // Duration
    const durGroup = UI.createElement('div', 'form-group');
    durGroup.innerHTML = `
      <label class="form-label">Duration</label>
      <div class="duration-input">
        <input type="number" class="form-input" id="log-duration" placeholder="30" min="1" max="300" inputmode="numeric">
        <span class="unit-label">minutes</span>
      </div>
    `;
    frag.appendChild(durGroup);

    // Notes
    frag.appendChild(Log.buildNotesField('What did you do?'));

    // Save
    frag.appendChild(Log.buildSaveButton());
    return frag;
  },

  // --- Body Photo Form ---
  buildBodyPhotoForm() {
    const frag = document.createDocumentFragment();

    const info = UI.createElement('p', '', 'Take a face photo and a body photo for your progress timeline.');
    info.style.cssText = 'font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-md);';
    frag.appendChild(info);

    // Face photo
    const faceGroup = UI.createElement('div', 'form-group');
    faceGroup.innerHTML = `
      <label class="form-label">Face Photo</label>
      <div class="photo-actions">
        <button class="btn btn-secondary" id="log-face-capture">\u{1F4F7} Take Photo</button>
        <button class="btn btn-ghost" id="log-face-pick">\u{1F5BC}\uFE0F Library</button>
      </div>
      <div id="log-face-preview-area"></div>
    `;
    frag.appendChild(faceGroup);

    // Body photo
    const bodyGroup = UI.createElement('div', 'form-group');
    bodyGroup.innerHTML = `
      <label class="form-label">Body Photo</label>
      <div class="photo-actions">
        <button class="btn btn-secondary" id="log-body-capture">\u{1F4F7} Take Photo</button>
        <button class="btn btn-ghost" id="log-body-pick">\u{1F5BC}\uFE0F Library</button>
      </div>
      <div id="log-body-preview-area"></div>
    `;
    frag.appendChild(bodyGroup);

    // Notes
    frag.appendChild(Log.buildNotesField('Any notes about today?'));

    // Save
    const saveGroup = UI.createElement('div', 'form-group');
    saveGroup.style.marginTop = 'var(--space-md)';
    const saveBtn = UI.createElement('button', 'btn btn-primary btn-block btn-lg');
    saveBtn.textContent = 'Save Progress Photos';
    saveBtn.addEventListener('click', () => Log.saveBodyPhotos());
    saveGroup.appendChild(saveBtn);
    frag.appendChild(saveGroup);

    // Wire up buttons after DOM render
    requestAnimationFrame(() => {
      document.getElementById('log-face-capture')?.addEventListener('click', async () => {
        const result = await Camera.capture('body');
        if (result) Log.setBodyPhotoPreview('face', result);
      });
      document.getElementById('log-face-pick')?.addEventListener('click', async () => {
        const result = await Camera.pick('body');
        if (result) Log.setBodyPhotoPreview('face', result);
      });
      document.getElementById('log-body-capture')?.addEventListener('click', async () => {
        const result = await Camera.capture('body');
        if (result) Log.setBodyPhotoPreview('body', result);
      });
      document.getElementById('log-body-pick')?.addEventListener('click', async () => {
        const result = await Camera.pick('body');
        if (result) Log.setBodyPhotoPreview('body', result);
      });
    });

    return frag;
  },

  _pendingFacePhoto: null,
  _pendingBodyPhoto: null,

  setBodyPhotoPreview(which, photo) {
    const areaId = which === 'face' ? 'log-face-preview-area' : 'log-body-preview-area';
    const area = document.getElementById(areaId);
    if (!area) return;
    UI.clearChildren(area);

    // Clean up old
    if (which === 'face' && Log._pendingFacePhoto) Camera.revokeURL(Log._pendingFacePhoto.url);
    if (which === 'body' && Log._pendingBodyPhoto) Camera.revokeURL(Log._pendingBodyPhoto.url);

    if (which === 'face') Log._pendingFacePhoto = photo;
    else Log._pendingBodyPhoto = photo;

    const preview = Camera.createPreview(photo.url, () => {
      if (which === 'face') { Camera.revokeURL(Log._pendingFacePhoto?.url); Log._pendingFacePhoto = null; }
      else { Camera.revokeURL(Log._pendingBodyPhoto?.url); Log._pendingBodyPhoto = null; }
    });
    area.appendChild(preview);
  },

  // --- Water Form (visual container picker) ---
  buildWaterForm() {
    const wrapper = UI.createElement('div');

    const containers = [
      { label: 'Small cup', oz: 6, icon: '\u{1F964}', desc: 'Coffee cup, juice glass' },
      { label: 'Glass', oz: 10, icon: '\u{1FAD7}', desc: 'Standard drinking glass' },
      { label: 'Can / small bottle', oz: 12, icon: '\u{1F96B}', desc: 'Soda can, La Croix' },
      { label: 'Tall glass', oz: 16, icon: '\u{1F95B}', desc: 'Pint glass, tall tumbler' },
      { label: 'Water bottle', oz: 24, icon: '\u{1FAD9}', desc: 'Standard reusable bottle' },
      { label: 'Large bottle', oz: 32, icon: '\u{1F4A7}', desc: 'Nalgene, large tumbler' },
      { label: 'Big jug', oz: 40, icon: '\u{1FAD9}', desc: '40oz Stanley, Hydroflask' },
    ];

    DB.getDailySummary(App.selectedDate).then(summary => {
      const currentOz = summary.water_oz || 0;

      const status = UI.createElement('div');
      status.style.cssText = 'text-align: center; margin-bottom: var(--space-md); font-size: var(--text-sm);';
      status.innerHTML = `Today: <strong id="water-total" style="color: var(--color-water)">${currentOz} oz</strong> of 96 oz goal`;
      wrapper.appendChild(status);

      const grid = UI.createElement('div', 'water-picker-grid');
      containers.forEach(c => {
        const btn = UI.createElement('button', 'water-pick');
        btn.dataset.oz = c.oz;
        btn.innerHTML = `
          <div class="water-pick-icon">${c.icon}</div>
          <div class="water-pick-oz">${c.oz} oz</div>
          <div class="water-pick-label">${c.label}</div>
        `;
        btn.addEventListener('click', async () => {
          try {
            const fresh = await DB.getDailySummary(App.selectedDate);
            const newTotal = (fresh.water_oz || 0) + c.oz;
            await DB.updateDailySummary(App.selectedDate, { water_oz: newTotal });
            const totalEl = document.getElementById('water-total');
            if (totalEl) totalEl.textContent = `${newTotal} oz`;
            UI.toast(`Water: ${newTotal} oz (+${c.oz})`);
            CloudRelay.queueUpload(App.selectedDate);
          } catch (err) {
            console.error('Save water failed:', err);
            UI.toast('Failed to save', 'error');
          }
        });
        grid.appendChild(btn);
      });
      wrapper.appendChild(grid);
    });

    return wrapper;
  },

  // --- Weight Form ---
  buildWeightForm() {
    // Use a persistent div (not DocumentFragment) so async content appends work
    const wrapper = UI.createElement('div');

    DB.getDailySummary(App.selectedDate).then(summary => {
      const currentWeight = summary.weight ? summary.weight.value : '';

      const group = UI.createElement('div', 'form-group');
      group.innerHTML = `
        <label class="form-label">Today's Weight</label>
        <div class="number-input" style="justify-content:center;">
          <button class="btn btn-secondary" id="weight-minus">\u2212</button>
          <input type="number" class="form-input" id="log-weight" value="${currentWeight}" placeholder="135.0" step="0.1" inputmode="decimal">
          <button class="btn btn-secondary" id="weight-plus">+</button>
        </div>
        <div style="text-align:center; color:var(--text-muted); font-size:var(--text-sm); margin-top:var(--space-xs);">lbs</div>
      `;
      wrapper.appendChild(group);

      const saveArea = UI.createElement('div', 'form-group');
      saveArea.style.marginTop = 'var(--space-lg)';
      const saveBtn = UI.createElement('button', 'btn btn-primary btn-block btn-lg');
      saveBtn.textContent = 'Save Weight';
      saveBtn.addEventListener('click', () => Log.saveWeight());
      saveArea.appendChild(saveBtn);
      wrapper.appendChild(saveArea);

      // Attach +/- buttons (elements are in the DOM now via wrapper)
      const input = document.getElementById('log-weight');
      const minus = document.getElementById('weight-minus');
      const plus = document.getElementById('weight-plus');
      if (minus) minus.addEventListener('click', () => {
        input.value = Math.max(0, parseFloat(input.value || 0) - 0.1).toFixed(1);
      });
      if (plus) plus.addEventListener('click', () => {
        input.value = (parseFloat(input.value || 0) + 0.1).toFixed(1);
      });
    });

    return wrapper;
  },

  // --- Shared Form Pieces ---
  buildNotesField(placeholder) {
    const group = UI.createElement('div', 'form-group');
    group.innerHTML = `
      <label class="form-label">Notes</label>
      <textarea class="form-input" id="log-notes" placeholder="${placeholder}" rows="3"></textarea>
    `;
    return group;
  },

  buildSaveButton() {
    const group = UI.createElement('div', 'form-group');
    group.style.marginTop = 'var(--space-md)';

    const btn = UI.createElement('button', 'btn btn-primary btn-block btn-lg');
    btn.textContent = 'Save Entry';
    btn.addEventListener('click', () => Log.saveEntry());
    group.appendChild(btn);

    const btn2 = UI.createElement('button', 'btn btn-ghost btn-block');
    btn2.textContent = 'Save & Log Another';
    btn2.style.marginTop = 'var(--space-sm)';
    btn2.addEventListener('click', () => Log.saveEntry(true));
    group.appendChild(btn2);

    return group;
  },

  // Use photo timestamp only if it falls on the selected date; otherwise use now
  _getEntryTimestamp() {
    const takenAt = Log.pendingPhoto?.takenAt;
    if (takenAt && takenAt.startsWith(App.selectedDate)) return takenAt;
    return new Date().toISOString();
  },

  // --- Save Handlers ---
  _saveBusy: false,
  async saveEntry(stayOnLog = false) {
    if (!Log.selectedType || Log._saveBusy) return;

    const notes = document.getElementById('log-notes')?.value?.trim() || '';

    const entry = {
      id: UI.generateId(Log.selectedType),
      type: Log.selectedType,
      subtype: Log.selectedSubtype || null,
      date: App.selectedDate,
      timestamp: Log._getEntryTimestamp(),
      notes,
      photo: Log.pendingPhoto ? true : null,
      duration_minutes: null,
    };

    if (Log.selectedType === 'workout') {
      const dur = document.getElementById('log-duration')?.value;
      entry.duration_minutes = dur ? parseInt(dur) : null;
      if (!Log.selectedSubtype) {
        UI.toast('Pick a workout type', 'error');
        return;
      }
    }

    Log._saveBusy = true;
    try {
      const photoBlob = Log.pendingPhoto ? Log.pendingPhoto.blob : null;
      await DB.addEntry(entry, photoBlob);
      UI.toast(`${UI.entryLabel(entry.type, entry.subtype)} logged`);
      CloudRelay.queueUpload(entry.date);
      Log.pendingPhoto = null; // Don't revoke — blob is now in DB

      if (stayOnLog) {
        // Reset form but stay on log screen with same type selected
        const prevType = Log.selectedType;
        Log.init();
        Log.selectType(prevType);
      } else {
        Log.init();
        window.location.hash = '';
      }
    } catch (err) {
      console.error('Save failed:', err);
      UI.toast('Failed to save', 'error');
    } finally {
      Log._saveBusy = false;
    }
  },

  async saveBodyPhotos() {
    const facePhoto = Log._pendingFacePhoto;
    const bodyPhoto = Log._pendingBodyPhoto;

    if (!facePhoto && !bodyPhoto) {
      UI.toast('Take at least one photo', 'error');
      return;
    }

    const notes = document.getElementById('log-notes')?.value?.trim() || '';
    const date = App.selectedDate;
    const candidateTs = facePhoto?.takenAt || bodyPhoto?.takenAt;
    const timestamp = (candidateTs && candidateTs.startsWith(App.selectedDate)) ? candidateTs : new Date().toISOString();

    try {
      // Save face photo as its own entry
      if (facePhoto) {
        const faceEntry = {
          id: UI.generateId('bodyPhoto_face'),
          type: 'bodyPhoto',
          subtype: 'face',
          date,
          timestamp,
          notes,
          photo: true,
          duration_minutes: null,
        };
        await DB.addEntry(faceEntry, facePhoto.blob);
      }

      // Save body photo as its own entry
      if (bodyPhoto) {
        const bodyEntry = {
          id: UI.generateId('bodyPhoto_body'),
          type: 'bodyPhoto',
          subtype: 'body',
          date,
          timestamp,
          notes: facePhoto ? '' : notes, // Only put notes on one entry
          photo: true,
          duration_minutes: null,
        };
        await DB.addEntry(bodyEntry, bodyPhoto.blob);
      }

      UI.toast('Progress photos saved');
      CloudRelay.queueUpload(date);
      Log._pendingFacePhoto = null;
      Log._pendingBodyPhoto = null;
      Log.init();
      window.location.hash = '';
    } catch (err) {
      console.error('Save body photos failed:', err);
      UI.toast('Failed to save', 'error');
    }
  },

  async saveWeight() {
    const input = document.getElementById('log-weight');
    if (!input || !input.value) {
      UI.toast('Enter a weight', 'error');
      return;
    }

    const value = parseFloat(input.value);
    if (isNaN(value) || value <= 0) {
      UI.toast('Enter a valid weight', 'error');
      return;
    }

    try {
      await DB.updateDailySummary(App.selectedDate, {
        weight: { value, unit: 'lbs' },
      });
      UI.toast(`Weight: ${value} lbs saved`);
      CloudRelay.queueUpload(App.selectedDate);
      window.location.hash = '';
    } catch (err) {
      console.error('Save weight failed:', err);
      UI.toast('Failed to save', 'error');
    }
  },
};
