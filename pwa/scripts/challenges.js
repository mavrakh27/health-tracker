// challenges.js -- Challenge system: templates, enrollment, auto-checks, rendering, sharing

const ChallengeTemplates = {
  '75hard': {
    id: '75hard',
    name: '75 Hard',
    description: '75 days of discipline. Two workouts, strict diet, water, reading, progress photo — every single day. Miss one and you restart.',
    durationDays: 75,
    restartOnMiss: true,
    tasks: [
      { id: 'water_gallon', label: 'Drink 1 gallon of water', autoCheck: { source: 'water', threshold: 128 } },
      { id: 'workout_1', label: 'Workout #1 (45+ min)', autoCheck: null },
      { id: 'workout_2', label: 'Workout #2 (45+ min, outdoor)', autoCheck: null },
      { id: 'diet', label: 'Follow your diet plan', autoCheck: null },
      { id: 'no_alcohol', label: 'No alcohol', autoCheck: null },
      { id: 'read', label: 'Read 10 pages', autoCheck: null },
      { id: 'progress_photo', label: 'Take a progress photo', autoCheck: { source: 'bodyPhotos', threshold: 1 } },
    ],
  },
  '7day_reset': {
    id: '7day_reset',
    name: '7-Day Reset',
    description: 'A short reset to build momentum. Hit your water, skip the drinks, get a workout in, and log every meal.',
    durationDays: 7,
    restartOnMiss: false,
    tasks: [
      { id: 'water', label: 'Hit water goal', autoCheck: { source: 'water', threshold: 64 } },
      { id: 'no_alcohol', label: 'No alcohol', autoCheck: null },
      { id: 'workout', label: 'Complete a workout', autoCheck: { source: 'workout', threshold: 1 } },
      { id: 'log_meals', label: 'Log all meals', autoCheck: { source: 'logging', threshold: 2 } },
    ],
  },
  '100day': {
    id: '100day',
    name: '100-Day Challenge',
    description: 'Build lasting habits over 100 days. Water, workouts, no alcohol, and hit your calorie goal daily.',
    durationDays: 100,
    restartOnMiss: false,
    tasks: [
      { id: 'water', label: 'Hit water goal', autoCheck: { source: 'water', threshold: 64 } },
      { id: 'workout', label: 'Complete a workout', autoCheck: { source: 'workout', threshold: 1 } },
      { id: 'no_alcohol', label: 'No alcohol', autoCheck: null },
      { id: 'calorie_goal', label: 'Stay under calorie goal', autoCheck: { source: 'calories', threshold: null } },
    ],
  },
};

const Challenges = {
  // --- Enrollment ---
  async enroll(templateId, customOptions) {
    let template;
    if (templateId === 'custom') {
      template = {
        id: 'custom',
        name: customOptions.name || 'Custom Challenge',
        description: customOptions.description || '',
        durationDays: customOptions.durationDays || 30,
        restartOnMiss: customOptions.restartOnMiss || false,
        tasks: (customOptions.tasks || []).map((t, i) => ({
          id: 'custom_' + i,
          label: t.label || t,
          autoCheck: null,
        })),
      };
    } else {
      template = ChallengeTemplates[templateId];
      if (!template) return null;
    }

    const today = App.selectedDate;
    const startDate = today;
    const endObj = new Date(startDate + 'T12:00:00');
    endObj.setDate(endObj.getDate() + template.durationDays - 1);
    const endDate = Challenges._fmt(endObj);

    const challenge = {
      id: 'chal_' + template.id + '_' + Date.now(),
      templateId: template.id,
      name: template.name,
      description: template.description,
      durationDays: template.durationDays,
      startDate,
      endDate,
      status: 'active',
      restartOnMiss: template.restartOnMiss,
      completedDate: null,
      restartCount: 0,
      tasks: template.tasks.map(t => ({ ...t })),
    };

    await DB.saveChallenge(challenge);
    UI.toast('Challenge started: ' + challenge.name);
    return challenge;
  },

  async abandon(challengeId) {
    const challenge = await DB.getChallenge(challengeId);
    if (!challenge) return;
    challenge.status = 'abandoned';
    challenge.completedDate = App.selectedDate;
    await DB.saveChallenge(challenge);
    UI.toast('Challenge abandoned');
  },

  // --- Auto-check evaluation ---
  async evaluateAutoChecks(challenge, date) {
    const autoChecked = [];
    const [summary, entries, photos, analysis] = await Promise.all([
      DB.getDailySummary(date),
      DB.getEntriesByDate(date),
      DB.getBodyPhotos(date),
      DB.getAnalysis(date).catch(() => null),
    ]);

    // Load calorie goal if needed
    let calorieTarget = null;
    const needsCal = challenge.tasks.some(t => t.autoCheck?.source === 'calories');
    if (needsCal) {
      const goals = await DB.getProfile('goals') || {};
      calorieTarget = goals.calories || 2000;
    }

    for (const task of challenge.tasks) {
      if (!task.autoCheck) continue;
      const src = task.autoCheck.source;
      const threshold = task.autoCheck.threshold;

      let passes = false;
      if (src === 'water') {
        passes = (summary?.water_oz || 0) >= threshold;
      } else if (src === 'bodyPhotos') {
        passes = (photos || []).length >= threshold;
      } else if (src === 'workout') {
        const workouts = entries.filter(e => e.type === 'workout');
        passes = workouts.length >= threshold;
      } else if (src === 'logging') {
        const meals = entries.filter(e => e.type === 'meal');
        passes = meals.length >= threshold;
      } else if (src === 'calories') {
        const target = calorieTarget || 2000;
        const total = analysis?.totals?.calories || 0;
        // Only auto-check if we have analysis data to compare
        if (analysis && analysis.totals) {
          passes = total <= target * 1.1; // 10% tolerance
        }
      }

      if (passes) autoChecked.push(task.id);
    }
    return autoChecked;
  },

  async applyAutoChecks(challenge, date) {
    const progressId = challenge.id + '_' + date;
    let progress = await DB.getChallengeProgress(challenge.id, date);
    const dayNum = Challenges.getDayNumber(challenge, date);
    if (dayNum < 1 || dayNum > challenge.durationDays) return progress;

    if (!progress) {
      progress = {
        id: progressId,
        challengeId: challenge.id,
        date,
        checked: [],
        autoChecked: [],
        manualOverrides: [],
        dayNumber: dayNum,
        allComplete: false,
      };
    }

    const autoResults = await Challenges.evaluateAutoChecks(challenge, date);
    const previousAuto = progress.autoChecked || [];

    // Remove previously auto-checked tasks that no longer pass and weren't manually overridden
    progress.checked = progress.checked.filter(taskId => {
      if (previousAuto.includes(taskId) && !autoResults.includes(taskId) && !progress.manualOverrides.includes(taskId)) {
        return false;
      }
      return true;
    });

    progress.autoChecked = autoResults;

    // Add auto-checked tasks that are not manually overridden
    for (const taskId of autoResults) {
      if (!progress.manualOverrides.includes(taskId) && !progress.checked.includes(taskId)) {
        progress.checked.push(taskId);
      }
    }

    progress.allComplete = progress.checked.length === challenge.tasks.length;
    await DB.saveChallengeProgress(progress);
    return progress;
  },

  // --- Streak calculation ---
  getStreak(progressRecords) {
    if (!progressRecords || progressRecords.length === 0) return 0;
    // Sort by date descending
    const sorted = [...progressRecords].sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;
    for (const rec of sorted) {
      if (rec.allComplete) streak++;
      else break;
    }
    return streak;
  },

  getDayNumber(challenge, date) {
    const start = new Date(challenge.startDate + 'T12:00:00');
    const curr = new Date(date + 'T12:00:00');
    return Math.floor((curr - start) / 86400000) + 1;
  },

  _fmt(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // --- Check for restart / completion ---
  async checkStatus(challenge, date) {
    const dayNum = Challenges.getDayNumber(challenge, date);
    if (dayNum > challenge.durationDays) {
      // Check if last day was complete
      const lastDate = challenge.endDate;
      const lastProgress = await DB.getChallengeProgress(challenge.id, lastDate);
      if (lastProgress?.allComplete) {
        challenge.status = 'completed';
        challenge.completedDate = date;
        await DB.saveChallenge(challenge);
      }
      return;
    }

    if (!challenge.restartOnMiss || dayNum <= 1) return;

    // Check yesterday — if incomplete and restartOnMiss, restart
    const yesterday = new Date(date + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = Challenges._fmt(yesterday);
    if (yDate < challenge.startDate) return;

    const yProgress = await DB.getChallengeProgress(challenge.id, yDate);
    if (yProgress && !yProgress.allComplete) {
      // Restart the challenge
      challenge.startDate = date;
      const endObj = new Date(date + 'T12:00:00');
      endObj.setDate(endObj.getDate() + challenge.durationDays - 1);
      challenge.endDate = Challenges._fmt(endObj);
      challenge.restartCount++;
      await DB.saveChallenge(challenge);
      UI.toast(challenge.name + ' restarted — Day 1');
    }
  },

  // --- Rendering: Active challenges (Progress tab) ---
  async renderActive(container, date) {
    const challenges = await DB.getChallenges();
    const active = challenges.filter(c => c.status === 'active');
    const completed = challenges.filter(c => c.status === 'completed');
    const abandoned = challenges.filter(c => c.status === 'abandoned');

    let html = '';

    if (active.length === 0 && completed.length === 0 && abandoned.length === 0) {
      html += `
        <div class="empty-state" style="margin-top:var(--space-xl);">
          <div class="empty-icon">${UI.svg.target || UI.svg.clipboard}</div>
          <p>No challenges yet.</p>
          <button class="btn btn-primary" id="chal-start-first" style="margin-top:var(--space-md);">Start a Challenge</button>
        </div>
      `;
      return html;
    }

    // Active challenges
    for (const chal of active) {
      await Challenges.checkStatus(chal, date);
      if (chal.status !== 'active') continue; // may have changed
      const progress = await Challenges.applyAutoChecks(chal, date);
      const allProgress = await DB.getChallengeProgressRange(chal.id, chal.startDate, chal.endDate);
      const streak = Challenges.getStreak(allProgress);
      const dayNum = Challenges.getDayNumber(chal, date);

      html += Challenges._renderChallengeCard(chal, progress, streak, dayNum, allProgress, true);
    }

    html += `<button class="btn btn-ghost" id="chal-add-more" style="width:100%;margin-top:var(--space-md);">+ Start Another Challenge</button>`;

    // Completed / abandoned history
    if (completed.length > 0 || abandoned.length > 0) {
      html += '<h2 class="section-header" style="margin-top:var(--space-lg);">History</h2>';
      for (const chal of [...completed, ...abandoned]) {
        const allProgress = await DB.getChallengeProgressRange(chal.id, chal.startDate, chal.endDate);
        const completedDays = allProgress.filter(p => p.allComplete).length;
        html += `
          <div class="challenge-card challenge-card--${chal.status}" style="margin-bottom:var(--space-sm);">
            <div class="challenge-header">
              <div>
                <div class="challenge-name">${UI.escapeHtml(chal.name)}</div>
                <div class="challenge-meta">${chal.status === 'completed' ? 'Completed' : 'Abandoned'} -- ${completedDays}/${chal.durationDays} days</div>
              </div>
            </div>
          </div>
        `;
      }
    }

    return html;
  },

  _renderChallengeCard(chal, progress, streak, dayNum, allProgress, showActions) {
    const pct = Math.round((dayNum / chal.durationDays) * 100);
    const checked = progress?.checked || [];

    let html = `<div class="challenge-card" data-challenge-id="${UI.escapeHtml(chal.id)}">`;
    html += `<div class="challenge-header">`;
    html += `<div>`;
    html += `<div class="challenge-name">${UI.escapeHtml(chal.name)}</div>`;
    html += `<div class="challenge-meta">Day ${dayNum} of ${chal.durationDays}`;
    if (chal.restartCount > 0) html += ` (restart #${chal.restartCount})`;
    html += `</div>`;
    html += `</div>`;
    html += `<div class="challenge-streak"><span class="challenge-streak-icon">/</span>${streak}d</div>`;
    html += `</div>`;

    // Progress bar
    html += `<div class="challenge-progress-bar"><div class="challenge-progress-fill" style="width:${Math.min(pct, 100)}%;"></div></div>`;

    // Task checklist
    html += `<div class="challenge-tasks">`;
    for (const task of chal.tasks) {
      const isChecked = checked.includes(task.id);
      const isAuto = progress?.autoChecked?.includes(task.id) && isChecked;
      html += `
        <label class="challenge-task${isAuto ? ' auto-checked' : ''}" data-task-id="${UI.escapeHtml(task.id)}" data-challenge-id="${UI.escapeHtml(chal.id)}">
          <button class="challenge-check${isChecked ? ' checked' : ''}" data-task-id="${UI.escapeHtml(task.id)}" data-challenge-id="${UI.escapeHtml(chal.id)}" aria-label="Toggle ${UI.escapeHtml(task.label)}">${isChecked ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</button>
          <span class="challenge-task-label">${UI.escapeHtml(task.label)}</span>
          ${isAuto ? '<span class="challenge-auto-label">auto</span>' : ''}
        </label>
      `;
    }
    html += `</div>`;

    // Calendar
    if (allProgress && allProgress.length > 0) {
      html += Challenges.renderCalendar(allProgress, chal);
    }

    // Actions
    if (showActions) {
      html += `<div class="challenge-actions">`;
      html += `<button class="btn btn-ghost challenge-share-btn" data-challenge-id="${UI.escapeHtml(chal.id)}">Share</button>`;
      html += `<button class="btn btn-ghost challenge-link-btn" data-challenge-id="${UI.escapeHtml(chal.id)}">Copy Link</button>`;
      html += `<button class="btn btn-ghost challenge-abandon-btn" data-challenge-id="${UI.escapeHtml(chal.id)}" style="color:var(--accent-red);">Abandon</button>`;
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  },

  // --- Day checklist widget for Today tab ---
  async renderDayChecklist(challenge, date) {
    const dayNum = Challenges.getDayNumber(challenge, date);
    if (dayNum < 1 || dayNum > challenge.durationDays) return '';

    const progress = await Challenges.applyAutoChecks(challenge, date);
    const allProgress = await DB.getChallengeProgressRange(challenge.id, challenge.startDate, challenge.endDate);
    const streak = Challenges.getStreak(allProgress);
    const checked = progress?.checked || [];
    const totalTasks = challenge.tasks.length;
    const checkedCount = checked.length;

    let html = `<div class="challenge-widget" data-challenge-id="${UI.escapeHtml(challenge.id)}">`;
    html += `<div class="challenge-widget-header" data-nav-challenge="${UI.escapeHtml(challenge.id)}">`;
    html += `<div class="challenge-widget-title">${UI.escapeHtml(challenge.name)}</div>`;
    html += `<div class="challenge-widget-meta">Day ${dayNum} -- ${checkedCount}/${totalTasks}${streak > 0 ? ' -- ' + streak + 'd streak' : ''}</div>`;
    html += `</div>`;
    html += `<div class="challenge-tasks">`;

    for (const task of challenge.tasks) {
      const isChecked = checked.includes(task.id);
      const isAuto = progress?.autoChecked?.includes(task.id) && isChecked;
      html += `
        <label class="challenge-task${isAuto ? ' auto-checked' : ''}" data-task-id="${UI.escapeHtml(task.id)}" data-challenge-id="${UI.escapeHtml(challenge.id)}">
          <button class="challenge-check${isChecked ? ' checked' : ''}" data-task-id="${UI.escapeHtml(task.id)}" data-challenge-id="${UI.escapeHtml(challenge.id)}" aria-label="Toggle ${UI.escapeHtml(task.label)}">${isChecked ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</button>
          <span class="challenge-task-label">${UI.escapeHtml(task.label)}</span>
          ${isAuto ? '<span class="challenge-auto-label">auto</span>' : ''}
        </label>
      `;
    }

    html += `</div></div>`;
    return html;
  },

  // --- Calendar dot grid ---
  renderCalendar(progressRecords, challenge) {
    const byDate = {};
    for (const p of progressRecords) byDate[p.date] = p;

    const today = UI.today();
    const start = new Date(challenge.startDate + 'T12:00:00');
    const totalDays = challenge.durationDays;

    let html = '<div class="challenge-calendar">';
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = Challenges._fmt(d);
      const rec = byDate[dateStr];
      let cls = 'challenge-dot';
      if (dateStr > today) {
        cls += ' future';
      } else if (rec?.allComplete) {
        cls += ' complete';
      } else if (dateStr <= today) {
        cls += ' incomplete';
      }
      html += `<div class="${cls}" title="Day ${i + 1}"></div>`;
    }
    html += '</div>';
    return html;
  },

  // --- Template picker ---
  renderTemplatePicker() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '80dvh';

    const templates = Object.values(ChallengeTemplates);

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Start a Challenge</span>
        <button class="modal-close" id="chal-picker-close">&times;</button>
      </div>
      <div style="overflow-y:auto; padding:var(--space-md);">
        ${templates.map(t => `
          <div class="challenge-template-card" data-template-id="${UI.escapeHtml(t.id)}">
            <div class="challenge-template-name">${UI.escapeHtml(t.name)}</div>
            <div class="challenge-template-desc">${UI.escapeHtml(t.description)}</div>
            <div class="challenge-template-meta">${t.durationDays} days -- ${t.tasks.length} tasks${t.restartOnMiss ? ' -- restarts on miss' : ''}</div>
          </div>
        `).join('')}
        <div class="challenge-template-card" data-template-id="custom">
          <div class="challenge-template-name">Custom Challenge</div>
          <div class="challenge-template-desc">Create your own challenge with custom duration and tasks.</div>
          <div class="challenge-template-meta">You choose</div>
        </div>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('chal-picker-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    sheet.querySelectorAll('.challenge-template-card').forEach(card => {
      card.addEventListener('click', async () => {
        const tid = card.dataset.templateId;
        if (tid === 'custom') {
          close();
          Challenges.showCustomBuilder();
          return;
        }
        await Challenges.enroll(tid);
        close();
        if (App.currentScreen === 'progress') ProgressView.init();
        if (App.currentScreen === 'today') App.loadDayView();
      });
    });
  },

  showCustomBuilder() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '80dvh';

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Custom Challenge</span>
        <button class="modal-close" id="custom-chal-close">&times;</button>
      </div>
      <div style="padding:var(--space-md); overflow-y:auto;">
        <div style="margin-bottom:var(--space-md);">
          <label class="input-label">Challenge Name</label>
          <input type="text" id="custom-chal-name" class="input-field" placeholder="My Challenge" style="width:100%;">
        </div>
        <div style="margin-bottom:var(--space-md);">
          <label class="input-label">Duration (days)</label>
          <input type="number" id="custom-chal-days" class="input-field" value="30" min="1" max="365" style="width:100%;">
        </div>
        <div style="margin-bottom:var(--space-md);">
          <label class="input-label">Restart on missed day?</label>
          <select id="custom-chal-restart" class="input-field" style="width:100%;">
            <option value="no">No — just continue</option>
            <option value="yes">Yes — restart from Day 1</option>
          </select>
        </div>
        <div style="margin-bottom:var(--space-md);">
          <label class="input-label">Daily Tasks (one per line)</label>
          <textarea id="custom-chal-tasks" class="input-field" rows="5" placeholder="Drink 8 glasses of water\nWorkout for 30 minutes\nNo sugar" style="width:100%; resize:vertical;"></textarea>
        </div>
        <button class="btn btn-primary btn-block" id="custom-chal-start">Start Challenge</button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('custom-chal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('custom-chal-start').addEventListener('click', async () => {
      const name = document.getElementById('custom-chal-name').value.trim();
      const days = parseInt(document.getElementById('custom-chal-days').value) || 30;
      const restart = document.getElementById('custom-chal-restart').value === 'yes';
      const tasksRaw = document.getElementById('custom-chal-tasks').value.trim();
      const taskLines = tasksRaw.split('\n').map(l => l.trim()).filter(l => l);

      if (!name) { UI.toast('Enter a challenge name'); return; }
      if (taskLines.length === 0) { UI.toast('Add at least one task'); return; }

      await Challenges.enroll('custom', {
        name,
        durationDays: days,
        restartOnMiss: restart,
        tasks: taskLines.map(l => ({ label: l })),
      });
      close();
      if (App.currentScreen === 'progress') ProgressView.init();
      if (App.currentScreen === 'today') App.loadDayView();
    });
  },

  // --- Event binding ---
  bindEvents(container) {
    // Checkbox toggles
    container.querySelectorAll('.challenge-check').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const taskId = btn.dataset.taskId;
        const chalId = btn.dataset.challengeId;
        const date = App.selectedDate;
        const challenge = await DB.getChallenge(chalId);
        if (!challenge) return;

        let progress = await DB.getChallengeProgress(chalId, date);
        const dayNum = Challenges.getDayNumber(challenge, date);
        if (!progress) {
          progress = {
            id: chalId + '_' + date,
            challengeId: chalId,
            date,
            checked: [],
            autoChecked: [],
            manualOverrides: [],
            dayNumber: dayNum,
            allComplete: false,
          };
        }

        const idx = progress.checked.indexOf(taskId);
        if (idx >= 0) {
          // Unchecking
          progress.checked.splice(idx, 1);
          // If this was auto-checked, mark as manual override
          if (progress.autoChecked.includes(taskId)) {
            if (!progress.manualOverrides.includes(taskId)) {
              progress.manualOverrides.push(taskId);
            }
          }
        } else {
          // Checking
          progress.checked.push(taskId);
          // Remove from manual overrides if re-checking
          const ovIdx = progress.manualOverrides.indexOf(taskId);
          if (ovIdx >= 0) progress.manualOverrides.splice(ovIdx, 1);
        }

        progress.allComplete = progress.checked.length === challenge.tasks.length;
        await DB.saveChallengeProgress(progress);

        // Queue sync
        if (typeof CloudRelay !== 'undefined') CloudRelay.queueUpload(date);

        // Re-render
        if (App.currentScreen === 'progress') ProgressView.init();
        else if (App.currentScreen === 'today') App.loadDayView();
      });
    });

    // Abandon buttons
    container.querySelectorAll('.challenge-abandon-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chalId = btn.dataset.challengeId;
        if (!confirm('Abandon this challenge? This cannot be undone.')) return;
        await Challenges.abandon(chalId);
        if (App.currentScreen === 'progress') ProgressView.init();
        else if (App.currentScreen === 'today') App.loadDayView();
      });
    });

    // Start challenge buttons
    const startFirst = container.querySelector('#chal-start-first');
    if (startFirst) startFirst.addEventListener('click', () => Challenges.renderTemplatePicker());
    const addMore = container.querySelector('#chal-add-more');
    if (addMore) addMore.addEventListener('click', () => Challenges.renderTemplatePicker());

    // Share buttons
    container.querySelectorAll('.challenge-share-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chalId = btn.dataset.challengeId;
        const challenge = await DB.getChallenge(chalId);
        if (!challenge) return;
        const allProgress = await DB.getChallengeProgressRange(challenge.id, challenge.startDate, challenge.endDate);
        await Challenges.shareMenu(challenge, allProgress);
      });
    });

    // Copy link buttons
    container.querySelectorAll('.challenge-link-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chalId = btn.dataset.challengeId;
        const challenge = await DB.getChallenge(chalId);
        if (!challenge) return;
        const url = Challenges.exportTemplate(challenge);
        try {
          await navigator.clipboard.writeText(url);
          UI.toast('Link copied');
        } catch (_) {
          UI.toast('Could not copy link');
        }
      });
    });

    // Today widget header taps -> navigate to Progress challenges
    container.querySelectorAll('[data-nav-challenge]').forEach(el => {
      el.addEventListener('click', () => {
        ProgressView._tab = 'challenges';
        App.showScreen('progress');
      });
    });
  },

  // --- Sharing: URL fragment ---
  exportTemplate(challenge) {
    const payload = {
      name: challenge.name,
      duration: challenge.durationDays,
      restart: challenge.restartOnMiss,
      tasks: challenge.tasks.map(t => ({
        label: t.label,
        auto: t.autoCheck || null,
      })),
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const base = location.origin + location.pathname;
    return base + '#challenge=' + b64;
  },

  importFromURL() {
    const hash = location.hash;
    if (!hash.startsWith('#challenge=')) return;

    try {
      const b64 = hash.slice('#challenge='.length);
      const json = decodeURIComponent(escape(atob(b64)));
      const payload = JSON.parse(json);

      // Show import modal
      const overlay = UI.createElement('div', 'modal-overlay');
      const sheet = UI.createElement('div', 'modal-sheet');
      sheet.innerHTML = `
        <div class="modal-header">
          <span class="modal-title">Import Challenge</span>
          <button class="modal-close" id="chal-import-close">&times;</button>
        </div>
        <div style="padding:var(--space-md);">
          <div class="challenge-template-card" style="pointer-events:none;">
            <div class="challenge-template-name">${UI.escapeHtml(payload.name)}</div>
            <div class="challenge-template-meta">${UI.escapeHtml(String(payload.duration))} days -- ${UI.escapeHtml(String(payload.tasks.length))} tasks${payload.restart ? ' -- restarts on miss' : ''}</div>
          </div>
          <div style="display:flex; gap:var(--space-sm); margin-top:var(--space-md);">
            <button class="btn btn-primary" id="chal-import-start" style="flex:1;">Start Challenge</button>
            <button class="btn btn-ghost" id="chal-import-cancel" style="flex:1;">Cancel</button>
          </div>
        </div>
      `;

      overlay.appendChild(sheet);
      document.body.appendChild(overlay);

      const close = () => {
        overlay.remove();
        history.replaceState(null, '', location.pathname);
      };

      document.getElementById('chal-import-close').addEventListener('click', close);
      document.getElementById('chal-import-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      document.getElementById('chal-import-start').addEventListener('click', async () => {
        await Challenges.enroll('custom', {
          name: payload.name,
          durationDays: payload.duration,
          restartOnMiss: payload.restart,
          tasks: payload.tasks.map(t => ({
            label: t.label,
            autoCheck: null,
          })),
        });
        close();
        if (App.currentScreen === 'progress') ProgressView.init();
        if (App.currentScreen === 'today') App.loadDayView();
      });
    } catch (e) {
      console.warn('Failed to import challenge from URL:', e);
    }
  },

  // --- Share menu ---
  async shareMenu(challenge, progressRecords) {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Share</span>
        <button class="modal-close" id="share-menu-close">&times;</button>
      </div>
      <div class="more-sheet-options">
        <button class="more-sheet-option" id="share-image-btn">
          <span class="more-sheet-icon" style="color:var(--accent-primary);">${UI.svg.bodyPhoto || UI.svg.clipboard}</span>
          <div class="more-sheet-text">
            <span class="more-sheet-label">Share as Image</span>
            <span class="more-sheet-desc">Generate a share card</span>
          </div>
        </button>
        <button class="more-sheet-option" id="share-text-btn">
          <span class="more-sheet-icon" style="color:var(--accent-primary);">${UI.svg.clipboard || ''}</span>
          <div class="more-sheet-text">
            <span class="more-sheet-label">Copy as Text</span>
            <span class="more-sheet-desc">Copy progress text to clipboard</span>
          </div>
        </button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('share-menu-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('share-image-btn').addEventListener('click', async () => {
      close();
      await Challenges.generateShareCard(challenge, progressRecords);
    });

    document.getElementById('share-text-btn').addEventListener('click', async () => {
      close();
      const text = Challenges.generateShareText(challenge, progressRecords);
      try {
        await navigator.clipboard.writeText(text);
        UI.toast('Copied to clipboard');
      } catch (_) {
        UI.toast('Could not copy text');
      }
    });
  },

  // --- Canvas share card ---
  async generateShareCard(challenge, progressRecords) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    const dayNum = Challenges.getDayNumber(challenge, App.selectedDate);
    const streak = Challenges.getStreak(progressRecords);
    const completedDays = progressRecords.filter(p => p.allComplete).length;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 640, 480);

    // Top accent bar
    ctx.fillStyle = '#58a6ff';
    ctx.fillRect(0, 0, 640, 6);

    // Challenge name
    ctx.fillStyle = '#0d1117';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(challenge.name, 320, 60);

    // Day counter (large)
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#58a6ff';
    ctx.fillText('Day ' + dayNum, 320, 160);

    // of total
    ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#7d8590';
    ctx.fillText('of ' + challenge.durationDays, 320, 190);

    // Streak
    if (streak > 0) {
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#e3b341';
      ctx.fillText('/ ' + streak + '-day streak', 320, 230);
    }

    // Completion arc
    const centerX = 320;
    const centerY = 340;
    const radius = 60;
    const pct = completedDays / challenge.durationDays;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e6edf3';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct));
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#0d1117';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pct * 100) + '%', centerX, centerY);

    // Footer
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#7d8590';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Coach', 320, 460);

    // Export
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'challenge.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: challenge.name,
            text: Challenges.generateShareText(challenge, progressRecords),
          });
        } catch (_) {
          // User cancelled or share failed — download instead
          Challenges._downloadBlob(blob, 'challenge.png');
        }
      } else {
        Challenges._downloadBlob(blob, 'challenge.png');
      }
    }, 'image/png');
  },

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('Image downloaded');
  },

  // --- Text share ---
  generateShareText(challenge, progressRecords) {
    const dayNum = Challenges.getDayNumber(challenge, App.selectedDate);
    const streak = Challenges.getStreak(progressRecords);
    const today = App.selectedDate;
    const todayProgress = progressRecords.find(p => p.date === today);
    const checked = todayProgress?.checked || [];

    let lines = [];
    lines.push('Day ' + dayNum + '/' + challenge.durationDays + ' of ' + challenge.name);
    if (streak > 0) lines.push(streak + '-day streak');
    lines.push('');
    for (const task of challenge.tasks) {
      const done = checked.includes(task.id);
      lines.push((done ? '[x] ' : '[ ] ') + task.label);
    }
    lines.push('');
    lines.push('#' + challenge.name.replace(/\s+/g, '') + ' #Coach');
    return lines.join('\n');
  },
};

window.Challenges = Challenges;
window.ChallengeTemplates = ChallengeTemplates;
