// sync.js — ZIP export + JSON import

const Sync = {
  // --- Export Day as ZIP ---
  async exportDay(dateStr) {
    const date = dateStr || App.selectedDate;

    const data = await DB.exportDay(date);
    if (!data.log.entries.length && !data.log.water_oz && !data.log.weight) {
      UI.toast('Nothing to export for this day', 'error');
      return;
    }

    UI.toast('Building export...');

    const files = [];

    // Add log.json
    const logJson = JSON.stringify(data.log, null, 2);
    files.push({ name: `daily/${date}/log.json`, data: new TextEncoder().encode(logJson) });

    // Add photos — route body photos to progress/, meal photos to daily/
    for (const photo of data.photoFiles) {
      const arrayBuf = await photo.blob.arrayBuffer();
      const isBodyPhoto = photo.name.startsWith('body/');
      const zipPath = isBodyPhoto
        ? `progress/${date}/${photo.name.replace('body/', '')}`
        : `daily/${date}/${photo.name}`;
      files.push({ name: zipPath, data: new Uint8Array(arrayBuf) });
    }

    // Build ZIP
    const zipBlob = Sync.buildZip(files);
    const fileName = `health-${date}.zip`;

    // Try Web Share API first (for iOS "Save to Files")
    if (navigator.canShare && navigator.canShare({ files: [new File([zipBlob], fileName)] })) {
      try {
        await navigator.share({
          files: [new File([zipBlob], fileName, { type: 'application/zip' })],
        });
        UI.toast('Exported! Save to iCloud Drive.');
        await Sync.markPhotosSynced(date);
        Settings?.loadStorageInfo?.();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled
        console.warn('Share failed, falling back to download:', err);
      }
    }

    // Fallback: download link
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Downloaded! Move to iCloud Drive.');
    await Sync.markPhotosSynced(date);
    Settings?.loadStorageInfo?.();
  },

  async markPhotosSynced(dateStr) {
    const db = await DB.openDB();
    const tx = db.transaction('photos', 'readwrite');
    const index = tx.objectStore('photos').index('date');
    const request = index.openCursor(dateStr);
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.syncStatus === 'unsynced') {
          cursor.update({ ...cursor.value, syncStatus: 'synced' });
        }
        cursor.continue();
      }
    };
  },

  // --- Import Analysis ---
  async importAnalysis() {
    const file = await Sync.pickFile('.json');
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.date) {
        UI.toast('Invalid analysis file — no date field', 'error');
        return;
      }

      await DB.importAnalysis(data.date, data);
      UI.toast(`Imported analysis for ${UI.formatDate(data.date)}`);

      // Refresh view if we're on that date
      if (data.date === App.selectedDate) {
        App.loadDayView();
      }
    } catch (err) {
      console.error('Import failed:', err);
      UI.toast('Failed to import — check file format', 'error');
    }
  },

  // --- Import Meal Plan ---
  async importMealPlan() {
    const file = await Sync.pickFile('.json');
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.days || (!data.generatedDate && !data.generated)) {
        UI.toast('Invalid meal plan file', 'error');
        return;
      }

      if (!data.generatedDate) data.generatedDate = data.generated;
      await DB.saveMealPlan(data);
      UI.toast('Meal plan imported');
    } catch (err) {
      console.error('Meal plan import failed:', err);
      UI.toast('Failed to import meal plan', 'error');
    }
  },

  // --- Restore from ZIP backup ---
  async restoreFromZip() {
    const file = await Sync.pickFile('.zip');
    if (!file) return;

    UI.toast('Restoring from backup...');
    const arrayBuf = await file.arrayBuffer();
    await Sync.restoreFromZipData(new Uint8Array(arrayBuf));
  },

  // --- Import All (multi-file, auto-detects type) ---
  async importAll() {
    const files = await Sync.pickFiles('.json,.zip');
    if (!files || files.length === 0) return;

    let analysisCount = 0, mealPlanCount = 0, zipCount = 0, errors = 0;

    for (const file of files) {
      try {
        if (file.name.endsWith('.zip')) {
          const arrayBuf = await file.arrayBuffer();
          await Sync.restoreFromZipData(new Uint8Array(arrayBuf));
          zipCount++;
        } else {
          const text = await file.text();
          const data = JSON.parse(text);

          if (data.date && data.entries) {
            await DB.importAnalysis(data.date, data);
            analysisCount++;
          } else if (data.days && (data.generated || data.generatedDate)) {
            if (!data.generatedDate) data.generatedDate = data.generated;
            await DB.saveMealPlan(data);
            mealPlanCount++;
          } else {
            console.warn('Skipped unrecognized file:', file.name);
            errors++;
          }
        }
      } catch (err) {
        console.error(`Failed to import ${file.name}:`, err);
        errors++;
      }
    }

    const parts = [];
    if (analysisCount) parts.push(`${analysisCount} analysis`);
    if (mealPlanCount) parts.push(`${mealPlanCount} meal plan`);
    if (zipCount) parts.push(`${zipCount} backup`);
    if (errors) parts.push(`${errors} skipped`);
    UI.toast(parts.length ? `Imported: ${parts.join(', ')}` : 'No files imported', parts.length ? 'success' : 'error');

    App.loadDayView();
  },

  async restoreFromZipData(zipBytes) {
    try {
      const files = Sync.readZip(zipBytes);
      const logFile = files.find(f => f.name.endsWith('log.json'));
      if (!logFile) { UI.toast('No log.json found in ZIP', 'error'); return; }

      const log = JSON.parse(new TextDecoder().decode(logFile.data));
      if (!log.date || !log.entries) { UI.toast('Invalid log format', 'error'); return; }

      const photoMap = {};
      for (const f of files) {
        if (f.name.endsWith('.jpg') || f.name.endsWith('.jpeg')) {
          photoMap[f.name] = new Blob([f.data], { type: 'image/jpeg' });
        }
      }

      let imported = 0;
      for (const entry of log.entries) {
        let photoBlob = null;
        if (entry.photo) {
          const dailyPath = `daily/${log.date}/photos/${entry.id}.jpg`;
          const progressFace = `progress/${log.date}/face.jpg`;
          const progressBody = `progress/${log.date}/body.jpg`;
          photoBlob = photoMap[dailyPath]
            || (entry.subtype === 'face' ? photoMap[progressFace] : null)
            || (entry.subtype === 'body' ? photoMap[progressBody] : null);
          if (!photoBlob) {
            const match = Object.keys(photoMap).find(k => k.includes(`/${entry.id}.`) || k.includes(`/${entry.id}/`));
            if (match) photoBlob = photoMap[match];
          }
        }
        await DB.addEntry(entry, photoBlob);
        imported++;
      }

      const summaryUpdates = {};
      if (log.water_oz != null) summaryUpdates.water_oz = log.water_oz;
      if (log.weight != null) summaryUpdates.weight = log.weight;
      if (log.sleep != null) summaryUpdates.sleep = log.sleep;
      if (Object.keys(summaryUpdates).length > 0) {
        await DB.updateDailySummary(log.date, summaryUpdates);
      }

      UI.toast(`Restored ${imported} entries for ${UI.formatDate(log.date)}`);
      if (log.date === App.selectedDate) App.loadDayView();
    } catch (err) {
      console.error('Restore failed:', err);
      UI.toast('Restore failed — check ZIP format', 'error');
    }
  },

  // --- Minimal ZIP Reader (for uncompressed/STORE ZIPs) ---
  readZip(zipBytes) {
    const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    const files = [];
    let offset = 0;

    while (offset < zipBytes.length - 4) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break; // Not a local file header

      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const nameBytes = zipBytes.slice(offset + 30, offset + 30 + nameLen);
      const name = new TextDecoder().decode(nameBytes);
      const dataStart = offset + 30 + nameLen + extraLen;
      if (dataStart + compressedSize > zipBytes.length) break; // Truncated ZIP
      const data = zipBytes.slice(dataStart, dataStart + compressedSize);

      if (!name.endsWith('/')) { // Skip directory entries
        files.push({ name, data });
      }

      offset = dataStart + compressedSize;
    }

    return files;
  },

  // --- File Picker Helpers ---
  pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '*';
      input.addEventListener('change', () => resolve(input.files[0] || null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  },

  pickFiles(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '*';
      input.multiple = true;
      input.addEventListener('change', () => resolve(Array.from(input.files)));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  },

  // --- Photo Cleanup ---
  async getStorageInfo() {
    const status = await DB.getPhotoSyncStatus();
    return {
      unsynced: status.unsynced || 0,
      synced: status.synced || 0,
      processed: status.processed || 0,
      totalSizeMB: ((status.totalSize || 0) / (1024 * 1024)).toFixed(1),
    };
  },

  async clearProcessedPhotos() {
    const count = await DB.clearProcessedPhotos();
    UI.toast(`Cleared ${count} processed photo${count !== 1 ? 's' : ''}`);
    return count;
  },

  // --- Minimal ZIP Builder (no dependencies) ---
  // Creates a valid ZIP file from an array of { name: string, data: Uint8Array }
  buildZip(files) {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const crc = Sync.crc32(file.data);
      const size = file.data.length;

      // Local file header (30 bytes + name + data)
      const local = new Uint8Array(30 + nameBytes.length + size);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   // signature
      lv.setUint16(4, 20, true);            // version needed
      lv.setUint16(6, 0, true);             // flags
      lv.setUint16(8, 0, true);             // compression (store)
      lv.setUint16(10, 0, true);            // mod time
      lv.setUint16(12, 0, true);            // mod date
      lv.setUint32(14, crc, true);          // crc32
      lv.setUint32(18, size, true);         // compressed size
      lv.setUint32(22, size, true);         // uncompressed size
      lv.setUint16(26, nameBytes.length, true); // name length
      lv.setUint16(28, 0, true);            // extra length
      local.set(nameBytes, 30);
      local.set(file.data, 30 + nameBytes.length);
      localHeaders.push(local);

      // Central directory header (46 bytes + name)
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);   // signature
      cv.setUint16(4, 20, true);            // version made by
      cv.setUint16(6, 20, true);            // version needed
      cv.setUint16(8, 0, true);             // flags
      cv.setUint16(10, 0, true);            // compression
      cv.setUint16(12, 0, true);            // mod time
      cv.setUint16(14, 0, true);            // mod date
      cv.setUint32(16, crc, true);          // crc32
      cv.setUint32(20, size, true);         // compressed size
      cv.setUint32(24, size, true);         // uncompressed size
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);            // extra length
      cv.setUint16(32, 0, true);            // comment length
      cv.setUint16(34, 0, true);            // disk start
      cv.setUint16(36, 0, true);            // internal attributes
      cv.setUint32(38, 0, true);            // external attributes
      cv.setUint32(42, offset, true);       // local header offset
      central.set(nameBytes, 46);
      centralHeaders.push(central);

      offset += local.length;
    }

    // End of central directory
    const centralDirOffset = offset;
    let centralDirSize = 0;
    for (const c of centralHeaders) centralDirSize += c.length;

    const endRecord = new Uint8Array(22);
    const ev = new DataView(endRecord.buffer);
    ev.setUint32(0, 0x06054b50, true);     // signature
    ev.setUint16(4, 0, true);               // disk number
    ev.setUint16(6, 0, true);               // central dir disk
    ev.setUint16(8, files.length, true);     // entries on disk
    ev.setUint16(10, files.length, true);    // total entries
    ev.setUint32(12, centralDirSize, true);  // central dir size
    ev.setUint32(16, centralDirOffset, true); // central dir offset
    ev.setUint16(20, 0, true);               // comment length

    // Combine all parts
    const totalSize = offset + centralDirSize + 22;
    const zip = new Uint8Array(totalSize);
    let pos = 0;
    for (const l of localHeaders) { zip.set(l, pos); pos += l.length; }
    for (const c of centralHeaders) { zip.set(c, pos); pos += c.length; }
    zip.set(endRecord, pos);

    return new Blob([zip], { type: 'application/zip' });
  },

  // CRC32 calculation
  _crc32Table: null,
  crc32(data) {
    if (!Sync._crc32Table) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
      }
      Sync._crc32Table = table;
    }

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = Sync._crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  },
};

// --- Cloud Relay Sync ---
// Zero-tap sync via Cloudflare Worker + R2
const CloudRelay = {
  _uploadTimer: null,
  _pendingDate: null,
  _log: [], // Recent sync events visible in settings

  log(msg, level = 'info') {
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    this._log.push({ time, msg, level });
    if (this._log.length > 20) this._log.shift();
    console[level === 'error' ? 'error' : 'log'](`CloudRelay: ${msg}`);
    // Update log display if visible
    const el = document.getElementById('cloud-sync-log');
    if (el) this._renderLog(el);
  },

  _renderLog(el) {
    const colors = { info: 'var(--text-muted)', error: 'var(--accent-red)', ok: 'var(--accent-green)' };
    el.innerHTML = this._log.slice().reverse().map(e =>
      `<div style="color: ${colors[e.level] || colors.info}"><span style="opacity: 0.6">${UI.escapeHtml(e.time)}</span> ${UI.escapeHtml(e.msg)}</div>`
    ).join('');
  },

  // Get relay config from IndexedDB
  async getConfig() {
    return await DB.getProfile('cloudRelay') || null;
  },

  async saveConfig(config) {
    await DB.setProfile('cloudRelay', config);
  },

  async isConfigured() {
    const config = await this.getConfig();
    return !!(config && config.workerUrl && config.syncKey);
  },

  // Queue a day for upload (debounced — batches saves within 3s)
  queueUpload(dateStr) {
    this._pendingDate = dateStr;
    this.log(`Queued ${dateStr} for upload (3s debounce)`);
    if (this._uploadTimer) clearTimeout(this._uploadTimer);
    this._uploadTimer = setTimeout(() => this._doUpload(), 3000);
  },

  async _doUpload() {
    const date = this._pendingDate;
    if (!date) return;
    this._pendingDate = null;

    const config = await this.getConfig();
    if (!config || !config.workerUrl || !config.syncKey) {
      this.log('Upload skipped — not configured', 'error');
      return;
    }

    try {
      CloudRelay.setSyncStatus('uploading');
      this.log(`Building ZIP for ${date}...`);
      const data = await DB.exportDay(date);
      if (!data.log.entries.length && !data.log.water_oz && !data.log.weight) {
        this.log(`No data for ${date}, skipping`);
        return;
      }

      const files = [];
      const logJson = JSON.stringify(data.log, null, 2);
      files.push({ name: `daily/${date}/log.json`, data: new TextEncoder().encode(logJson) });

      for (const photo of data.photoFiles) {
        const arrayBuf = await photo.blob.arrayBuffer();
        const isBodyPhoto = photo.name.startsWith('body/');
        const zipPath = isBodyPhoto
          ? `progress/${date}/${photo.name.replace('body/', '')}`
          : `daily/${date}/${photo.name}`;
        files.push({ name: zipPath, data: new Uint8Array(arrayBuf) });
      }

      this.log(`ZIP: ${files.length} file(s), uploading to relay...`);
      const zipBlob = Sync.buildZip(files);
      const arrayBuf = await zipBlob.arrayBuffer();
      this.log(`ZIP size: ${(arrayBuf.byteLength / 1024).toFixed(1)} KB`);

      const url = `${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/day/${date}`;
      this.log(`PUT ${url}`);
      const resp = await fetch(url, {
        method: 'PUT',
        body: arrayBuf,
      });

      if (resp.ok) {
        await Sync.markPhotosSynced(date);
        CloudRelay.setSyncStatus('synced');
        this.log(`Uploaded ${date} successfully`, 'ok');
      } else {
        const body = await resp.text().catch(() => '');
        this.log(`Upload failed: HTTP ${resp.status} ${body}`, 'error');
        CloudRelay.setSyncStatus('error');
      }
    } catch (err) {
      this.log(`Upload error: ${err.message}`, 'error');
      CloudRelay.setSyncStatus('error');
    }
  },

  // Check for new analysis results from the relay
  async checkForResults() {
    const config = await this.getConfig();
    if (!config || !config.workerUrl || !config.syncKey) {
      this.log('Results check skipped — not configured');
      return;
    }

    try {
      const resultsUrl = `${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/results/new`;
      this.log(`Checking: ${resultsUrl}`);
      const resp = await fetch(resultsUrl);
      if (!resp.ok) {
        this.log(`Results check failed: HTTP ${resp.status}`, 'error');
        return;
      }

      const { newResults } = await resp.json();
      if (!newResults || newResults.length === 0) {
        this.log('No new results available');
        return;
      }

      this.log(`Found ${newResults.length} result(s): ${newResults.join(', ')}`);

      for (const date of newResults) {
        try {
          const dlUrl = `${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/results/${date}`;
          this.log(`Downloading ${date}...`);
          const resultResp = await fetch(dlUrl);
          if (!resultResp.ok) {
            this.log(`Failed to download ${date}: HTTP ${resultResp.status}`, 'error');
            continue;
          }

          // Use text + JSON.parse for better error diagnostics than .json()
          const text = await resultResp.text();
          let analysis;
          try {
            analysis = JSON.parse(text);
          } catch (parseErr) {
            this.log(`Invalid JSON for ${date}: ${parseErr.message} (first 100 chars: ${text.slice(0, 100)})`, 'error');
            continue;
          }
          await DB.importAnalysis(date, analysis);
          this.log(`Imported ${date}`, 'ok');

          const ackUrl = `${config.workerUrl.trim()}/sync/${config.syncKey.trim()}/results/${date}/ack`;
          this.log(`Sending ack: ${ackUrl}`);
          await fetch(ackUrl, { method: 'POST' });
          this.log(`Ack sent for ${date}`, 'ok');

          UI.toast(`Analysis for ${UI.formatDate(date)} imported!`);
          if (date === App.selectedDate) App.loadDayView();
        } catch (innerErr) {
          this.log(`Error processing ${date}: ${innerErr.message}`, 'error');
        }
      }
    } catch (err) {
      this.log(`Results check error: ${err.message}`, 'error');
    }
  },

  // Sync status indicator in header
  setSyncStatus(status) {
    let indicator = document.getElementById('sync-status');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'sync-status';
      indicator.style.cssText = 'font-size: 12px; position: absolute; right: 8px; top: 50%; transform: translateY(-50%);';
      const header = document.querySelector('.app-header');
      if (header) {
        header.style.position = 'relative';
        header.appendChild(indicator);
      }
    }

    const icons = { uploading: '\u{2B06}\uFE0F', synced: '\u{2705}', error: '\u{26A0}\uFE0F', pending: '\u{1F504}' };
    indicator.textContent = icons[status] || '';
    if (status === 'synced') {
      setTimeout(() => { if (indicator.textContent === icons.synced) indicator.textContent = ''; }, 3000);
    }
  },

  // Show sync setup modal
  async showSetup() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const config = await this.getConfig() || {};

    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Cloud Sync Setup</span>
        <button class="modal-close" id="cs-close">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">Worker URL</label>
        <input type="url" class="form-input" id="cs-url" value="${UI.escapeHtml(config.workerUrl || '')}" placeholder="https://health-sync.your-account.workers.dev">
      </div>
      <div class="form-group">
        <label class="form-label">Sync Key</label>
        <input type="text" class="form-input" id="cs-key" value="${UI.escapeHtml(config.syncKey || '')}" placeholder="UUID sync key">
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="cs-save">Save</button>
      ${config.syncKey ? '<button class="btn btn-ghost btn-block" id="cs-test" style="margin-top: var(--space-sm);">Test Connection</button>' : ''}
      <button class="btn btn-secondary btn-block" id="cs-sync-now" style="margin-top: var(--space-sm);">Sync Now</button>
      <button class="btn btn-secondary btn-block" id="cs-check-results" style="margin-top: var(--space-xs);">Check for Results</button>
      <div style="margin-top: var(--space-md);">
        <label class="form-label">Sync Log</label>
        <div id="cloud-sync-log" style="font-size: var(--text-xs); font-family: monospace; max-height: 200px; overflow-y: auto; padding: var(--space-sm); background: var(--bg-secondary); border-radius: var(--radius-sm);"></div>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    document.getElementById('cs-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    document.getElementById('cs-save').addEventListener('click', async () => {
      const workerUrl = document.getElementById('cs-url')?.value?.trim().replace(/\/$/, '') || '';
      const syncKey = document.getElementById('cs-key')?.value?.trim() || '';
      if (!workerUrl || !syncKey) {
        UI.toast('Fill in both fields', 'error');
        return;
      }
      await CloudRelay.saveConfig({ workerUrl, syncKey });
      UI.toast('Cloud sync configured');
      closeModal();
      Settings.loadCloudSyncStatus();
    });

    // Render existing log entries
    const logEl = document.getElementById('cloud-sync-log');
    if (logEl) {
      if (CloudRelay._log.length === 0) {
        logEl.innerHTML = '<div style="color: var(--text-muted)">No sync activity yet</div>';
      } else {
        CloudRelay._renderLog(logEl);
      }
    }

    document.getElementById('cs-sync-now').addEventListener('click', async () => {
      const today = UI.today();
      clearTimeout(CloudRelay._uploadTimer);
      CloudRelay._uploadTimer = null;
      CloudRelay.log(`Manual sync triggered for ${today}`);
      CloudRelay._pendingDate = today;
      await CloudRelay._doUpload();
      await CloudRelay.checkForResults();
    });

    document.getElementById('cs-check-results').addEventListener('click', async () => {
      await CloudRelay.checkForResults();
    });

    document.getElementById('cs-test')?.addEventListener('click', async () => {
      const url = document.getElementById('cs-url')?.value?.trim().replace(/\/$/, '');
      const key = document.getElementById('cs-key')?.value?.trim();
      if (!url || !key) { UI.toast('Fill in both fields', 'error'); return; }
      try {
        const resp = await fetch(`${url}/sync/${key}/pending`);
        if (resp.ok) UI.toast('Connected!');
        else UI.toast(`Error: ${resp.status}`, 'error');
      } catch (err) {
        UI.toast('Connection failed', 'error');
      }
    });
  },
};

// --- Auto-Sync Module ---
// Automatic periodic backups without user intervention
const AutoSync = {
  // Settings stored in IndexedDB profile
  SETTING_KEY: 'autoSync_enabled',
  LAST_BACKUP_KEY: 'autoSync_lastBackupDate',
  BACKUP_DAYS: 30, // Keep last 30 days of backups

  // Initialize auto-sync on app startup
  async init() {
    const enabled = await DB.getProfileSetting(this.SETTING_KEY);
    if (enabled === false) {
      console.log('AutoSync: disabled by user');
      return;
    }

    // Enable by default for new users
    if (enabled == null) {
      await DB.setProfileSetting(this.SETTING_KEY, true);
    }

    // Check if we've already backed up today
    const today = UI.today();
    const lastBackup = await DB.getProfileSetting(this.LAST_BACKUP_KEY);

    if (lastBackup === today) {
      console.log('AutoSync: already backed up today');
      return;
    }

    // Perform backup
    console.log('AutoSync: starting backup for', today);
    await this.backupDay(today);
  },

  // Create and download a backup for a specific day
  async backupDay(dateStr) {
    try {
      const data = await DB.exportDay(dateStr);

      // Skip empty days
      if (!data.log.entries.length && !data.log.water_oz && !data.log.weight) {
        console.log(`AutoSync: no data for ${dateStr}, skipping`);
        return;
      }

      const files = [];

      // Add log.json
      const logJson = JSON.stringify(data.log, null, 2);
      files.push({ name: `daily/${dateStr}/log.json`, data: new TextEncoder().encode(logJson) });

      // Add photos
      for (const photo of data.photoFiles) {
        const arrayBuf = await photo.blob.arrayBuffer();
        const isBodyPhoto = photo.name.startsWith('body/');
        const zipPath = isBodyPhoto
          ? `progress/${dateStr}/${photo.name.replace('body/', '')}`
          : `daily/${dateStr}/${photo.name}`;
        files.push({ name: zipPath, data: new Uint8Array(arrayBuf) });
      }

      // Build and download ZIP
      const zipBlob = Sync.buildZip(files);
      const fileName = `health-${dateStr}.zip`;

      // Trigger download (headless, no user UI)
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark as backed up
      await DB.setProfileSetting(this.LAST_BACKUP_KEY, dateStr);

      console.log(`AutoSync: backup completed for ${dateStr} → ${fileName}`);
    } catch (err) {
      console.error('AutoSync: backup failed', err);
    }
  },

  // Toggle auto-sync setting
  async toggle(enabled) {
    await DB.setProfileSetting(this.SETTING_KEY, enabled);
    console.log(`AutoSync: ${enabled ? 'enabled' : 'disabled'}`);
  },

  // Get current status
  async getStatus() {
    const enabled = await DB.getProfileSetting(this.SETTING_KEY);
    const lastBackup = await DB.getProfileSetting(this.LAST_BACKUP_KEY);
    return {
      enabled: enabled !== false,
      lastBackupDate: lastBackup || null,
    };
  },
};
