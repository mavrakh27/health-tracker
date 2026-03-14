// ui.js — Shared UI utilities

const UI = {
  // --- Date Helpers ---
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },

  formatTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },

  yesterday(dateStr) {
    const d = new Date((dateStr || UI.today()) + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  formatRelativeDate(dateStr) {
    const today = UI.today();
    if (dateStr === today) return 'Today';
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    if (dateStr === yesterday) return 'Yesterday';
    return UI.formatDate(dateStr);
  },

  // --- ID Generation ---
  generateId(prefix) {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 6);
    return `${prefix}_${ts}_${rand}`;
  },

  // --- Toast Notifications ---
  toast(message, type = 'success', duration = 2500) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // Limit to 3 visible toasts — remove oldest
    while (container.children.length >= 3) {
      container.firstChild.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('leaving');
      // Fallback removal if animationend doesn't fire (backgrounded tab, iOS quirks)
      const fallback = setTimeout(() => toast.remove(), 500);
      toast.addEventListener('animationend', () => {
        clearTimeout(fallback);
        toast.remove();
      });
    }, duration);
  },

  // --- SVG Icon Library ---
  // Minimal inline SVGs: viewBox 0 0 24 24, stroke-based, use currentColor or theme vars.
  svg: {
    meal: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-meal)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14" rx="9" ry="5"/><path d="M3 14c0-4 4-9 9-9s9 5 9 9"/></svg>`,
    workout: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-workout)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5L4 4M17.5 6.5L20 4"/><rect x="7" y="9" width="2" height="10" rx="1"/><rect x="15" y="9" width="2" height="10" rx="1"/><path d="M9 14h6"/><path d="M5 11v6M19 11v6"/></svg>`,
    strength: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-workout)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="9" width="2" height="10" rx="1"/><rect x="15" y="9" width="2" height="10" rx="1"/><path d="M9 14h6"/><path d="M5 11v6M19 11v6"/></svg>`,
    cardio: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-workout)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M15 22l-3-8-3 4-3-3"/><path d="M9 14l3-4 4 2"/></svg>`,
    flexibility: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-workout)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M8 22l4-10 4 10"/><path d="M6 12c2-2 4-2 6-2s4 0 6 2"/></svg>`,
    water: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-water)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-6 7-6 12a6 6 0 0012 0c0-5-6-12-6-12z"/></svg>`,
    weight: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-weight)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="10" rx="2"/><path d="M8 10V8a4 4 0 018 0v2"/><circle cx="12" cy="15" r="1.5"/></svg>`,
    bodyPhoto: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-body-photo)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="16" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8.5 5L9.5 3h5l1 2"/></svg>`,
    vice: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M12 18v4"/><path d="M5 2l2 8c0 3.3 2.2 6 5 6s5-2.7 5-6l2-8"/></svg>`,
    sleep: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-sleep)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    supplement: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="6"/><line x1="6" y1="12" x2="18" y2="12"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>`,
    logging: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><polyline points="9 12 11 14 15 10"/></svg>`,
    target: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    flame: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4 0-7-3-7-7 0-3 2-5 4-7 1-1 2-2 2-4 1 2 3 3 4 5 .5-1 1-2 1-3 2 2 3 4 3 6 0 4-3 10-7 10z"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="16" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8.5 5L9.5 3h5l1 2"/></svg>`,
    gallery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>`,
  },

  // --- Entry Icons & Labels ---
  entryIcon(type, subtype) {
    if (type === 'workout' && subtype) {
      return UI.svg[subtype] || UI.svg.workout;
    }
    return UI.svg[type] || UI.svg.clipboard;
  },

  entryLabel(type, subtype) {
    // Workout subtypes still display as their subtype name
    if (type === 'workout' && subtype) {
      return subtype.charAt(0).toUpperCase() + subtype.slice(1);
    }
    const labels = {
      meal: 'Food', snack: 'Food', drink: 'Food',
      workout: 'Workout', water: 'Water', weight: 'Weight',
      bodyPhoto: 'Body Photo', vice: 'Alcohol', sleep: 'Sleep',
      supplement: 'Supplement',
    };
    return labels[type] || type;
  },

  // --- Text Escaping ---
  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // --- Auto-resize textarea to fit content ---
  autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  },

  // --- DOM Helpers ---
  $(selector) {
    return document.querySelector(selector);
  },

  $$(selector) {
    return document.querySelectorAll(selector);
  },

  createElement(tag, className, innerHTML) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  },

  clearChildren(el) {
    // Revoke any object URLs in child images to prevent memory leaks
    el.querySelectorAll?.('img[src^="blob:"]')?.forEach(img => URL.revokeObjectURL(img.src));
    while (el.firstChild) el.removeChild(el.firstChild);
  },

  // --- Render an entry item ---
  renderEntryItem(entry) {
    const div = UI.createElement('div', 'entry-item');
    div.dataset.type = entry.type;

    const icon = UI.createElement('div', 'entry-icon');
    icon.innerHTML = UI.entryIcon(entry.type, entry.subtype);

    const body = UI.createElement('div', 'entry-body');

    const typeLabel = UI.createElement('div', 'entry-type');
    typeLabel.textContent = UI.entryLabel(entry.type, entry.subtype);

    body.appendChild(typeLabel);

    if (entry.notes) {
      const notes = UI.createElement('div', 'entry-notes');
      notes.textContent = entry.notes;
      body.appendChild(notes);
    }

    if (entry.type === 'workout' && entry.duration_minutes) {
      const dur = UI.createElement('div', 'entry-notes');
      dur.textContent = `${entry.duration_minutes} min`;
      dur.style.color = 'var(--text-muted)';
      body.appendChild(dur);
    }

    const time = UI.createElement('div', 'entry-time');
    time.textContent = UI.formatTime(entry.timestamp);
    body.appendChild(time);

    div.appendChild(icon);
    div.appendChild(body);

    // Tap entry to open edit modal
    div.addEventListener('click', () => UI.showEditModal(entry));

    // Load photo thumbnail if entry has a photo
    if (entry.photo) {
      if (entry.type === 'bodyPhoto') {
        // Body photos are private — show lock icon, tap to reveal
        const lock = UI.createElement('div', 'entry-photo-thumb entry-photo-locked');
        lock.innerHTML = UI.svg.lock;
        let currentPhotoUrl = null;
        const hideLock = () => {
          lock.classList.remove('revealed');
          lock.innerHTML = UI.svg.lock;
          lock.style.backgroundImage = '';
          if (currentPhotoUrl) { URL.revokeObjectURL(currentPhotoUrl); currentPhotoUrl = null; }
        };
        lock.addEventListener('click', (e) => {
          e.stopPropagation();
          if (lock.classList.contains('revealed')) { hideLock(); return; }
          DB.getPhotos(entry.id).then(photos => {
            if (photos.length > 0 && photos[0].blob) {
              currentPhotoUrl = URL.createObjectURL(photos[0].blob);
              lock.innerHTML = '';
              lock.style.backgroundImage = `url(${currentPhotoUrl})`;
              lock.style.backgroundSize = 'cover';
              lock.style.backgroundPosition = 'center';
              lock.classList.add('revealed');
              setTimeout(() => { if (lock.classList.contains('revealed')) hideLock(); }, 5000);
            }
          });
        });
        div.appendChild(lock);
      } else {
        const thumb = UI.createElement('img', 'entry-photo-thumb');
        thumb.alt = '';
        thumb.loading = 'lazy';
        DB.getPhotos(entry.id).then(photos => {
          if (photos.length > 0 && photos[0].blob) {
            const blobUrl = URL.createObjectURL(photos[0].blob);
            if (!thumb.isConnected) {
              URL.revokeObjectURL(blobUrl);
              return;
            }
            thumb.src = blobUrl;
          }
        });
        div.appendChild(thumb);
      }
    }

    return div;
  },

  // Render an entry from analysis data (read-only, used when IndexedDB entries are missing)
  renderAnalysisEntry(ae) {
    const div = UI.createElement('div', 'entry-item');
    div.dataset.type = ae.type;

    const icon = UI.createElement('div', 'entry-icon');
    icon.innerHTML = UI.entryIcon(ae.type, ae.subtype);

    const body = UI.createElement('div', 'entry-body');

    const typeLabel = UI.createElement('div', 'entry-type');
    const cal = ae.type === 'workout' ? (ae.calories_burned ? `${ae.calories_burned} cal burned` : '') : (ae.calories ? `${ae.calories} cal` : '');
    typeLabel.textContent = UI.entryLabel(ae.type, ae.subtype) + (cal ? ` · ${cal}` : '');

    body.appendChild(typeLabel);

    if (ae.description) {
      const desc = UI.createElement('div', 'entry-notes');
      desc.textContent = ae.description;
      body.appendChild(desc);
    }

    if (ae.type === 'workout' && ae.duration_minutes) {
      const dur = UI.createElement('div', 'entry-notes');
      dur.textContent = `${ae.duration_minutes} min`;
      dur.style.color = 'var(--text-muted)';
      body.appendChild(dur);
    }

    div.appendChild(icon);
    div.appendChild(body);

    return div;
  },

  // --- Edit Entry Modal ---
  async showEditModal(entry) {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');

    // Load photo if exists
    let photoUrl = null;
    if (entry.photo) {
      const photos = await DB.getPhotos(entry.id);
      if (photos.length > 0 && photos[0].blob) {
        photoUrl = URL.createObjectURL(photos[0].blob);
      }
    }

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Edit ${UI.entryLabel(entry.type, entry.subtype)}</span>
        <button class="modal-close" id="edit-close">&times;</button>
      </div>
      ${photoUrl ? `<div class="ql-photo-preview"><img src="${photoUrl}" alt=""></div>` : ''}
      <div style="font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-md);">
        ${UI.formatTime(entry.timestamp)} &mdash; ${UI.formatDate(entry.date)}
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-input" id="edit-notes" placeholder="Add notes" rows="1">${UI.escapeHtml(entry.notes || '')}</textarea>
      </div>
      ${entry.type === 'workout' ? `
        <div class="form-group">
          <label class="form-label">Duration (minutes)</label>
          <input type="number" class="form-input" id="edit-duration" value="${entry.duration_minutes || ''}" placeholder="30" inputmode="numeric">
        </div>
      ` : ''}
      <button class="btn btn-primary btn-block btn-lg" id="edit-save">Save Changes</button>
      <button class="btn btn-ghost btn-block" id="edit-delete" style="margin-top: var(--space-sm); color: var(--accent-red);">Delete Entry</button>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const closeModal = () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      overlay.remove();
    };

    document.getElementById('edit-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    const editNotes = document.getElementById('edit-notes');
    if (editNotes) { UI.autoResize(editNotes); editNotes.addEventListener('input', () => UI.autoResize(editNotes)); }

    // Save
    document.getElementById('edit-save').addEventListener('click', async () => {
      const notes = document.getElementById('edit-notes')?.value?.trim() || '';
      const updated = { ...entry, notes };
      if (entry.type === 'workout') {
        const dur = document.getElementById('edit-duration')?.value;
        updated.duration_minutes = dur ? parseInt(dur) : null;
      }
      try {
        await DB.updateEntry(updated);
        UI.toast('Entry updated');
        closeModal();
        App.loadDayView();
      } catch (err) {
        console.error('Update failed:', err);
        UI.toast('Failed to update', 'error');
      }
    });

    // Delete
    document.getElementById('edit-delete').addEventListener('click', async () => {
      if (!confirm(`Delete this ${UI.entryLabel(entry.type, entry.subtype).toLowerCase()} entry?`)) return;
      try {
        await DB.deleteEntry(entry.id);
        UI.toast('Entry deleted');
        closeModal();
        App.loadDayView();
      } catch (err) {
        console.error('Delete failed:', err);
        UI.toast('Failed to delete', 'error');
      }
    });
  },
};
