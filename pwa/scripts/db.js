// db.js — IndexedDB wrapper (view-agnostic data API)

const DB_NAME = 'health-tracker';
const DB_VERSION = 3;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Entries: meals, snacks, drinks, workouts
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('date', 'date', { unique: false });
        entries.createIndex('type', 'type', { unique: false });
        entries.createIndex('date_type', ['date', 'type'], { unique: false });
      }

      // Photos: linked to entries or body progress
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('entryId', 'entryId', { unique: false });
        photos.createIndex('date', 'date', { unique: false });
        photos.createIndex('category', 'category', { unique: false }); // 'meal' | 'body'
        photos.createIndex('syncStatus', 'syncStatus', { unique: false }); // 'unsynced' | 'synced' | 'processed'
      }

      // Daily summaries: water, weight, sleep, notes
      if (!db.objectStoreNames.contains('dailySummary')) {
        db.createObjectStore('dailySummary', { keyPath: 'date' });
      }

      // Analysis: Claude's output per day
      if (!db.objectStoreNames.contains('analysis')) {
        db.createObjectStore('analysis', { keyPath: 'date' });
      }

      // Profile: goals, regimen, preferences
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'key' });
      }

      // Meal plans
      if (!db.objectStoreNames.contains('mealPlan')) {
        db.createObjectStore('mealPlan', { keyPath: 'generatedDate' });
      }

      // Analysis history (v2) — archives old analysis before overwrite
      if (e.oldVersion < 2) {
        if (!db.objectStoreNames.contains('analysisHistory')) {
          const historyStore = db.createObjectStore('analysisHistory', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('date', 'date', { unique: false });
          historyStore.createIndex('importedAt', 'importedAt', { unique: false });
        }
      }

      // Skincare daily logs (v3)
      if (e.oldVersion < 3) {
        if (!db.objectStoreNames.contains('skincare')) {
          db.createObjectStore('skincare', { keyPath: 'date' });
        }
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// --- Entries ---

async function addEntry(entry, photoBlob) {
  const db = await openDB();
  const tx = db.transaction(['entries', 'photos'], 'readwrite');

  tx.objectStore('entries').put(entry);

  if (photoBlob) {
    const photoRecord = {
      id: `photo_${entry.id}`,
      entryId: entry.id,
      date: entry.date,
      category: entry.type === 'bodyPhoto' ? 'body' : 'meal',
      syncStatus: 'unsynced',
      blob: photoBlob,
      timestamp: entry.timestamp,
    };
    tx.objectStore('photos').put(photoRecord);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(entry);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getEntriesByDate(dateStr) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readonly');
  const index = tx.objectStore('entries').index('date');
  const request = index.getAll(dateStr);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getEntriesByDateRange(startDate, endDate) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readonly');
  const index = tx.objectStore('entries').index('date');
  const range = IDBKeyRange.bound(startDate, endDate);
  const request = index.getAll(range);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getEntriesByType(type, startDate, endDate) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readonly');
  const store = tx.objectStore('entries');

  if (startDate && endDate) {
    const index = store.index('date_type');
    const results = [];
    const range = IDBKeyRange.bound([startDate, type], [endDate, type]);
    const request = index.openCursor(range);
    return new Promise((resolve, reject) => {
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  const index = store.index('type');
  const request = index.getAll(type);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function hasAnyEntries() {
  const db = await openDB();
  const tx = db.transaction('entries', 'readonly');
  const request = tx.objectStore('entries').openCursor();
  return new Promise((resolve) => {
    request.onsuccess = (e) => resolve(!!e.target.result);
    request.onerror = () => resolve(false);
  });
}

async function updateEntry(entry) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').put(entry);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(entry);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function deleteEntry(id) {
  const db = await openDB();
  const tx = db.transaction(['entries', 'photos'], 'readwrite');
  tx.objectStore('entries').delete(id);
  // Also delete associated photo
  const photoStore = tx.objectStore('photos');
  const photoIndex = photoStore.index('entryId');
  const request = photoIndex.openCursor(id);
  request.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Daily Summary (water, weight, sleep, notes) ---

async function getDailySummary(dateStr) {
  const db = await openDB();
  const tx = db.transaction('dailySummary', 'readonly');
  const request = tx.objectStore('dailySummary').get(dateStr);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || { date: dateStr });
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getDailySummaryRange(startDate, endDate) {
  const db = await openDB();
  const tx = db.transaction('dailySummary', 'readonly');
  const range = IDBKeyRange.bound(startDate, endDate);
  const request = tx.objectStore('dailySummary').getAll(range);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function updateDailySummary(dateStr, updates) {
  const db = await openDB();
  const existing = await getDailySummary(dateStr);
  const merged = { ...existing, ...updates, date: dateStr };
  const tx = db.transaction('dailySummary', 'readwrite');
  tx.objectStore('dailySummary').put(merged);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(merged);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Photos ---

async function getPhotos(entryId) {
  const db = await openDB();
  const tx = db.transaction('photos', 'readonly');
  const index = tx.objectStore('photos').index('entryId');
  const request = index.getAll(entryId);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getBodyPhotos(dateStr) {
  const db = await openDB();
  const tx = db.transaction('photos', 'readonly');
  const index = tx.objectStore('photos').index('date');
  const request = index.getAll(dateStr);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const all = request.result;
      resolve(all.filter(p => p.category === 'body'));
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getPhotoSyncStatus() {
  const db = await openDB();
  const tx = db.transaction('photos', 'readonly');
  const store = tx.objectStore('photos');
  // Use cursor to count without loading all blobs into memory
  const request = store.openCursor();
  const counts = { unsynced: 0, synced: 0, processed: 0, totalSize: 0 };
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const p = cursor.value;
        counts[p.syncStatus] = (counts[p.syncStatus] || 0) + 1;
        if (p.blob) counts.totalSize += p.blob.size || 0;
        cursor.continue();
      } else {
        resolve(counts);
      }
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function clearProcessedPhotos() {
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  const index = tx.objectStore('photos').index('syncStatus');
  const request = index.openCursor('processed');
  let count = 0;
  return new Promise((resolve, reject) => {
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.category !== 'body') {
          cursor.delete();
          count++;
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(count);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Analysis ---

async function getAnalysis(dateStr) {
  const db = await openDB();
  const tx = db.transaction('analysis', 'readonly');
  const request = tx.objectStore('analysis').get(dateStr);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function importAnalysis(dateStr, data) {
  const db = await openDB();
  const stores = ['analysis', 'photos'];
  if (db.objectStoreNames.contains('analysisHistory')) stores.push('analysisHistory');
  if (data.mealPlan) stores.push('mealPlan');
  if (data.regimen || data.pwaProfile || data.supplementUpdates) stores.push('profile');
  const tx = db.transaction(stores, 'readwrite');

  // Extract and save bundled meal plan and regimen before storing analysis
  if (data.mealPlan) {
    const plan = { ...data.mealPlan };
    if (!plan.generatedDate) plan.generatedDate = plan.generated || dateStr;
    tx.objectStore('mealPlan').put(plan);
  }
  if (data.regimen) {
    tx.objectStore('profile').put({ key: 'regimen', value: data.regimen });
  }

  // Restore PWA profile (goals + dailies) — survives reinstalls/cache clears
  if (data.pwaProfile) {
    const profileStore = tx.objectStore('profile');
    if (data.pwaProfile.goals) {
      profileStore.put({ key: 'goals', value: data.pwaProfile.goals });
    }
    if (data.pwaProfile.supplements) {
      profileStore.put({ key: 'supplements', value: data.pwaProfile.supplements });
    }
    if (data.pwaProfile.bodyPhotoTypes) {
      profileStore.put({ key: 'bodyPhotoTypes', value: data.pwaProfile.bodyPhotoTypes });
    }
    if (data.pwaProfile.moreOptions) {
      profileStore.put({ key: 'moreOptions', value: data.pwaProfile.moreOptions });
    }
    if (data.pwaProfile.skincare) {
      profileStore.put({ key: 'skincare', value: data.pwaProfile.skincare });
    }
    if (data.pwaProfile.preferences) {
      profileStore.put({ key: 'preferences', value: data.pwaProfile.preferences });
    }
  }

  // Merge supplement updates from AI processing (photo → nutrition extraction)
  if (data.supplementUpdates && Array.isArray(data.supplementUpdates)) {
    const profileStore2 = stores.includes('profile') ? tx.objectStore('profile') : null;
    if (profileStore2) {
      const suppReq = profileStore2.get('supplements');
      suppReq.onsuccess = () => {
        const existing = suppReq.result?.value || [];
        for (const update of data.supplementUpdates) {
          const match = existing.find(s => s.key === update.key);
          if (match) {
            if (update.name) match.name = update.name;
            if (update.calories != null) match.calories = update.calories;
            if (update.protein != null) match.protein = update.protein;
            if (update.carbs != null) match.carbs = update.carbs;
            if (update.fat != null) match.fat = update.fat;
            match.pending = false;
            delete match.photo; // Photo served its purpose — free the space
          }
        }
        profileStore2.put({ key: 'supplements', value: existing });
      };
    }
  }

  // Archive existing analysis before overwriting (v2+), cap at 5 per date
  if (db.objectStoreNames.contains('analysisHistory')) {
    const histStore = tx.objectStore('analysisHistory');
    const existingReq = tx.objectStore('analysis').get(dateStr);
    existingReq.onsuccess = () => {
      try {
        const existing = existingReq.result;
        if (existing) {
          histStore.add({
            date: existing.date,
            importedAt: existing.importedAt || 0,
            data: existing,
          });
          // Cap history to 5 entries per date — delete oldest
          const idx = histStore.index('date');
          const countReq = idx.getAll(dateStr);
          countReq.onsuccess = () => {
            const all = countReq.result;
            if (all.length > 5) {
              all.sort((a, b) => (a.importedAt || 0) - (b.importedAt || 0));
              for (let i = 0; i < all.length - 5; i++) {
                histStore.delete(all[i].id);
              }
            }
          };
        }
      } catch (e) {
        console.warn('Failed to archive analysis history:', e);
      }
    };
  }

  // Store analysis without the bundled plan/regimen/profile (keep it lean)
  const { mealPlan, regimen, pwaProfile, ...analysisData } = data;
  tx.objectStore('analysis').put({ ...analysisData, date: dateStr, importedAt: Date.now() });

  // Mark meal photos for this date as processed
  const photoIndex = tx.objectStore('photos').index('date');
  const request = photoIndex.openCursor(dateStr);
  request.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      if (cursor.value.category === 'meal') {
        const updated = { ...cursor.value, syncStatus: 'processed' };
        cursor.update(updated);
      }
      cursor.continue();
    }
  };

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAnalysisRange(startDate, endDate) {
  const db = await openDB();
  const tx = db.transaction('analysis', 'readonly');
  const store = tx.objectStore('analysis');
  const range = IDBKeyRange.bound(startDate, endDate);
  const request = store.getAll(range);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// --- Profile ---

async function getProfile(key) {
  const db = await openDB();
  const tx = db.transaction('profile', 'readonly');
  const request = tx.objectStore('profile').get(key);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function setProfile(key, value) {
  const db = await openDB();
  const tx = db.transaction('profile', 'readwrite');
  tx.objectStore('profile').put({ key, value });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Meal Plan ---

async function getMealPlan() {
  const db = await openDB();
  const tx = db.transaction('mealPlan', 'readonly');
  const store = tx.objectStore('mealPlan');
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const plans = request.result;
      if (plans.length === 0) return resolve(null);
      // Return the most recent plan
      plans.sort((a, b) => (b.generatedDate || '').localeCompare(a.generatedDate || ''));
      resolve(plans[0]);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveMealPlan(plan) {
  const db = await openDB();
  const tx = db.transaction('mealPlan', 'readwrite');
  tx.objectStore('mealPlan').put(plan);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Regimen ---

async function getRegimen() {
  return getProfile('regimen');
}

async function saveRegimen(regimen) {
  return setProfile('regimen', regimen);
}

// --- Settings (conveniences for profile key-value storage) ---

async function getProfileSetting(key) {
  return getProfile(key);
}

async function setProfileSetting(key, value) {
  return setProfile(key, value);
}

// --- Export ---

async function exportDay(dateStr) {
  const entries = await getEntriesByDate(dateStr);
  const summary = await getDailySummary(dateStr);

  // Collect photos — skip body photos here (handled separately below)
  const photoFiles = [];
  for (const entry of entries) {
    if (entry.type === 'bodyPhoto') continue;
    const photos = await getPhotos(entry.id);
    for (const photo of photos) {
      if (photo.blob) {
        photoFiles.push({
          name: `photos/${entry.id}.jpg`,
          blob: photo.blob,
        });
      }
    }
  }

  // Body photos — stored under progress/ path, numbered by subtype
  const bodyPhotos = await getBodyPhotos(dateStr);
  const bpCounts = {};
  for (const bp of bodyPhotos) {
    if (bp.blob) {
      // Detect subtype from entry ID (e.g., bodyPhoto_face_123 or bodyPhoto_arms_123)
      const subtypeMatch = (bp.entryId || bp.id || '').match(/bodyPhoto_([^_]+)/);
      const subtype = subtypeMatch ? subtypeMatch[1] : 'body';
      bpCounts[subtype] = (bpCounts[subtype] || 0) + 1;
      const suffix = bpCounts[subtype] > 1 ? `_${bpCounts[subtype]}` : '';
      photoFiles.push({
        name: `body/${subtype}${suffix}.jpg`,
        blob: bp.blob,
      });
    }
  }

  // Include period state if this date falls within any period (active or historical)
  const periodState = await getProfile('period').catch(() => null);
  let periodInfo = null;
  if (periodState) {
    // Check active period
    if (periodState.active && periodState.startDate && dateStr >= periodState.startDate) {
      periodInfo = { day: Math.floor((new Date(dateStr + 'T12:00:00') - new Date(periodState.startDate + 'T12:00:00')) / 86400000) + 1 };
    }
    // Check history (for re-exports after period ended)
    if (!periodInfo && periodState.history) {
      for (const p of periodState.history) {
        if (dateStr >= p.start && dateStr <= p.end) {
          periodInfo = { day: Math.floor((new Date(dateStr + 'T12:00:00') - new Date(p.start + 'T12:00:00')) / 86400000) + 1 };
          break;
        }
      }
    }
  }

  const log = {
    date: dateStr,
    entries,
    sleep: summary.sleep || null,
    weight: summary.weight || null,
    water_oz: summary.water_oz || null,
    notes: summary.notes || null,
    coachChat: summary.coachChat || null,
    fitness_checked: summary.fitness_checked || null,
    fitness_notes: summary.fitness_notes || null,
    period: periodInfo,
  };

  return { log, photoFiles };
}

// Get all dates that have entries but no analysis, or entries newer than analysis
async function getDatesNeedingSync() {
  const db = await openDB();
  // Get all unique entry dates and their IDs
  const entryTx = db.transaction('entries', 'readonly');
  const entries = await new Promise((resolve, reject) => {
    const req = entryTx.objectStore('entries').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
  const entryDateInfo = {};
  for (const e of entries) {
    if (!e.date) continue;
    if (!entryDateInfo[e.date]) entryDateInfo[e.date] = { ids: new Set(), maxTs: 0 };
    entryDateInfo[e.date].ids.add(e.id);
    const ts = e.updatedAt ? new Date(e.updatedAt).getTime() : (e.timestamp ? new Date(e.timestamp).getTime() : 0);
    entryDateInfo[e.date].maxTs = Math.max(entryDateInfo[e.date].maxTs, ts);
  }

  // Check which dates have no analysis, stale analysis, or missing entries
  const needsSync = [];
  const analysisTx = db.transaction('analysis', 'readonly');
  for (const date of Object.keys(entryDateInfo)) {
    const analysis = await new Promise((resolve) => {
      const req = analysisTx.objectStore('analysis').get(date);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!analysis || !analysis.importedAt) {
      needsSync.push(date);
    } else if (entryDateInfo[date].maxTs > analysis.importedAt) {
      needsSync.push(date);
    } else {
      // Check if any local entry IDs are missing from analysis
      const analysisIds = new Set((analysis.entries || []).map(e => e.id));
      for (const id of entryDateInfo[date].ids) {
        if (!analysisIds.has(id)) { needsSync.push(date); break; }
      }
    }
  }
  return needsSync;
}

async function getAnalysisHistory(dateStr) {
  const db = await openDB();
  if (!db.objectStoreNames.contains('analysisHistory')) return [];
  const tx = db.transaction('analysisHistory', 'readonly');
  const index = tx.objectStore('analysisHistory').index('date');
  const request = index.getAll(dateStr);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

// --- Skincare Profile ---

async function getSkincareRoutine() {
  return getProfile('skincare');
}

async function setSkincareRoutine(data) {
  return setProfile('skincare', data);
}

async function getSkincareProducts() {
  const routine = await getProfile('skincare');
  return routine ? (routine.products || []) : [];
}

async function addSkincareProduct(product) {
  let routine = await getProfile('skincare');
  if (!routine) {
    routine = { weeklyTemplate: { default: { am: [], pm: [] }, overrides: {} }, rotations: [], products: [] };
  }
  if (!routine.products) routine.products = [];
  routine.products.push(product);
  return setProfile('skincare', routine);
}

// --- Skincare Daily Log ---

async function getSkincareLog(dateStr) {
  const db = await openDB();
  const tx = db.transaction('skincare', 'readonly');
  const request = tx.objectStore('skincare').get(dateStr);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function updateSkincareLog(dateStr, data) {
  const db = await openDB();
  const record = { ...data, date: dateStr };
  const tx = db.transaction('skincare', 'readwrite');
  tx.objectStore('skincare').put(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Skincare Rotation Resolver ---

function resolveRoutineForDate(skincareProfile, dateStr) {
  if (!skincareProfile || !skincareProfile.weeklyTemplate) {
    return { am: [], pm: [] };
  }

  const template = skincareProfile.weeklyTemplate;
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const date = new Date(dateStr + 'T00:00:00');
  const dayName = dayNames[date.getDay()];

  // Start with defaults
  let am = [...(template.default.am || [])];
  let pm = [...(template.default.pm || [])];

  // Apply day-specific overrides
  if (template.overrides && template.overrides[dayName]) {
    const override = template.overrides[dayName];
    if (override.am) am = [...override.am];
    if (override.pm) pm = [...override.pm];
  }

  // Apply rotations
  const rotations = skincareProfile.rotations || [];
  // Reference date for computing day index (epoch start)
  const refDate = new Date('2024-01-01T00:00:00');
  const msPerDay = 24 * 60 * 60 * 1000;
  const dayIndex = Math.floor((date.getTime() - refDate.getTime()) / msPerDay);

  for (const rotation of rotations) {
    const slot = rotation.slot; // 'am' or 'pm'
    const position = rotation.position;
    const items = rotation.items || [];
    if (items.length === 0) continue;

    let activeItem;
    if (rotation.pattern === 'alternate') {
      activeItem = items[((dayIndex % items.length) + items.length) % items.length];
    } else if (rotation.pattern === 'weekly') {
      // Items have day assignments: find which item is assigned to this day
      const match = items.find(item =>
        item.days && item.days.includes(dayName)
      );
      if (match) {
        activeItem = match.key || match.name;
      }
    }

    if (activeItem !== undefined) {
      const arr = slot === 'am' ? am : pm;
      if (position >= 0 && position < arr.length) {
        arr[position] = activeItem;
      }
    }
  }

  return { am, pm };
}

// Make functions available globally
window.DB = {
  openDB,
  addEntry,
  getEntriesByDate,
  getEntriesByDateRange,
  getEntriesByType,
  hasAnyEntries,
  updateEntry,
  deleteEntry,
  getDailySummary,
  getDailySummaryRange,
  updateDailySummary,
  getPhotos,
  getBodyPhotos,
  getPhotoSyncStatus,
  clearProcessedPhotos,
  getAnalysis,
  importAnalysis,
  getAnalysisRange,
  getAnalysisHistory,
  getDatesNeedingSync,
  getProfile,
  setProfile,
  getProfileSetting,
  setProfileSetting,
  getMealPlan,
  saveMealPlan,
  getRegimen,
  saveRegimen,
  exportDay,
  getSkincareRoutine,
  setSkincareRoutine,
  getSkincareProducts,
  addSkincareProduct,
  getSkincareLog,
  updateSkincareLog,
};

window.Skincare = {
  resolveRoutineForDate,
};
