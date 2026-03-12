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

  // --- Entry Icons & Labels ---
  entryIcon(type, subtype) {
    const icons = {
      meal: '\u{1F37D}\uFE0F',
      snack: '\u{1F37D}\uFE0F',
      drink: '\u{1F37D}\uFE0F',
      workout: { strength: '\u{1F4AA}', cardio: '\u{1F3C3}', flexibility: '\u{1F9D8}', default: '\u{1F3CB}\uFE0F' },
      water: '\u{1F4A7}',
      weight: '\u{2696}\uFE0F',
      bodyPhoto: '\u{1F4F7}',
      vice: '\u{1F37A}',
      sleep: '\u{1F634}',
    };
    const icon = icons[type];
    if (typeof icon === 'object') return icon[subtype] || icon.default;
    return icon || '\u{1F4CB}';
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
    };
    return labels[type] || type;
  },

  // --- Text Escaping ---
  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    icon.textContent = UI.entryIcon(entry.type, entry.subtype);

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
        lock.textContent = '\u{1F512}';
        let currentPhotoUrl = null;
        const hideLock = () => {
          lock.classList.remove('revealed');
          lock.textContent = '\u{1F512}';
          lock.style.backgroundImage = '';
          if (currentPhotoUrl) { URL.revokeObjectURL(currentPhotoUrl); currentPhotoUrl = null; }
        };
        lock.addEventListener('click', (e) => {
          e.stopPropagation();
          if (lock.classList.contains('revealed')) { hideLock(); return; }
          DB.getPhotos(entry.id).then(photos => {
            if (photos.length > 0 && photos[0].blob) {
              currentPhotoUrl = URL.createObjectURL(photos[0].blob);
              lock.textContent = '';
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
        <textarea class="form-input" id="edit-notes" placeholder="Add notes" rows="3">${UI.escapeHtml(entry.notes || '')}</textarea>
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
