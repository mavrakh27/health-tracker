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
        <div class="challenge-empty">
          <div class="challenge-empty-icon">${UI.svg.target || UI.svg.clipboard}</div>
          <div class="challenge-empty-title">No challenges yet</div>
          <div class="challenge-empty-desc">Pick a challenge to build streaks, track daily tasks, and stay accountable.</div>
          <button class="btn btn-primary" id="chal-start-first">Start a Challenge</button>
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

    html += `<button class="challenge-add-btn" id="chal-add-more">+ Start Another Challenge</button>`;

    // Completed / abandoned history
    if (completed.length > 0 || abandoned.length > 0) {
      html += '<div class="challenge-history-label">History</div>';
      for (const chal of [...completed, ...abandoned]) {
        const allProgress = await DB.getChallengeProgressRange(chal.id, chal.startDate, chal.endDate);
        const completedDays = allProgress.filter(p => p.allComplete).length;
        const pct = Math.round((completedDays / chal.durationDays) * 100);
        const statusClass = chal.status === 'completed' ? 'completed' : 'abandoned';
        html += `
          <div class="challenge-card challenge-card--${statusClass}">
            <div class="challenge-header">
              <div>
                <div class="challenge-name">${UI.escapeHtml(chal.name)}</div>
                <div class="challenge-meta">${completedDays}/${chal.durationDays} days completed</div>
              </div>
              <span class="challenge-status-badge challenge-status-badge--${statusClass}">${chal.status === 'completed' ? 'Done' : 'Quit'}</span>
            </div>
            <div class="challenge-progress-bar"><div class="challenge-progress-fill" style="width:${pct}%;${chal.status === 'abandoned' ? 'background:var(--text-muted);' : ''}"></div></div>
          </div>
        `;
      }
    }

    return html;
  },

  _renderChallengeCard(chal, progress, streak, dayNum, allProgress, showActions) {
    const pct = Math.round((dayNum / chal.durationDays) * 100);
    const checked = progress?.checked || [];
    const checkedCount = checked.length;
    const totalTasks = chal.tasks.length;

    // SVG ring constants
    const ringR = 17;
    const ringC = Math.round(2 * Math.PI * ringR);
    const ringOffset = Math.round(ringC * (1 - Math.min(pct, 100) / 100));

    let html = `<div class="challenge-card" data-challenge-id="${UI.escapeHtml(chal.id)}">`;

    // Header: name + ring
    html += `<div class="challenge-header">`;
    html += `<div>`;
    html += `<div class="challenge-name">${UI.escapeHtml(chal.name)}</div>`;
    html += `<div class="challenge-meta">Day ${dayNum} of ${chal.durationDays}`;
    if (chal.restartCount > 0) html += ` (restart #${chal.restartCount})`;
    html += `</div>`;
    html += `</div>`;
    html += `<div class="challenge-ring">`;
    html += `<svg viewBox="0 0 40 40"><circle class="challenge-ring-bg" cx="20" cy="20" r="${ringR}"/><circle class="challenge-ring-fill" cx="20" cy="20" r="${ringR}" stroke-dasharray="${ringC}" stroke-dashoffset="${ringOffset}"/></svg>`;
    html += `<div class="challenge-ring-label">${pct}%</div>`;
    html += `</div>`;
    html += `</div>`;

    // Progress bar with labels
    html += `<div class="challenge-progress-label">`;
    html += `<span class="challenge-progress-pct">${checkedCount}/${totalTasks} today</span>`;
    if (streak > 0) {
      html += `<span class="challenge-streak"><span class="challenge-streak-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4 0-7-3-7-7 0-3 2-5 4-7 1-1 2-2 2-4 1 2 3 3 4 5 .5-1 1-2 1-3 2 2 3 4 3 6 0 4-3 10-7 10z"/></svg></span>${streak}d streak</span>`;
    } else {
      html += `<span class="challenge-progress-day">${Math.min(pct, 100)}% complete</span>`;
    }
    html += `</div>`;
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
      } else {
        cls += ' incomplete';
      }
      html += `<div class="${cls}" title="Day ${i + 1}"></div>`;
    }
    html += '</div>';
    return html;
  },

  // --- Difficulty labels for templates ---
  _templateDifficulty(t) {
    if (t.restartOnMiss && t.durationDays >= 75) return { label: 'Extreme', cls: 'extreme' };
    if (t.durationDays >= 100) return { label: 'Hard', cls: 'hard' };
    if (t.durationDays >= 30) return { label: 'Moderate', cls: 'moderate' };
    return { label: 'Beginner', cls: 'beginner' };
  },

  _templateIcon(id) {
    const icons = {
      '75hard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4 0-7-3-7-7 0-3 2-5 4-7 1-1 2-2 2-4 1 2 3 3 4 5 .5-1 1-2 1-3 2 2 3 4 3 6 0 4-3 10-7 10z"/></svg>',
      '7day_reset': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-11.36L1 10"/></svg>',
      '100day': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      'custom': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    };
    return icons[id] || icons['custom'];
  },

  _templateAccent(id) {
    const accents = {
      '75hard': 'var(--accent-red)',
      '7day_reset': 'var(--accent-blue)',
      '100day': 'var(--accent-orange)',
      'custom': 'var(--accent-purple)',
    };
    return accents[id] || 'var(--accent-primary)';
  },

  // --- Template picker ---
  renderTemplatePicker() {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '85dvh';

    const templates = Object.values(ChallengeTemplates);

    sheet.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Start a Challenge</span>
        <button class="modal-close" id="chal-picker-close" aria-label="Close">&times;</button>
      </div>
      <div class="chal-picker-list">
        ${templates.map(t => {
          const diff = Challenges._templateDifficulty(t);
          const icon = Challenges._templateIcon(t.id);
          const accent = Challenges._templateAccent(t.id);
          const autoCount = t.tasks.filter(tk => tk.autoCheck).length;
          return `
          <div class="challenge-template-card chal-tpl-enhanced" data-template-id="${UI.escapeHtml(t.id)}">
            <div class="chal-tpl-icon-row">
              <div class="chal-tpl-icon" style="color:${accent}; background:color-mix(in srgb, ${accent} 12%, transparent);">${icon}</div>
              <span class="chal-tpl-difficulty chal-tpl-difficulty--${diff.cls}">${diff.label}</span>
            </div>
            <div class="challenge-template-name">${UI.escapeHtml(t.name)}</div>
            <div class="challenge-template-desc">${UI.escapeHtml(t.description)}</div>
            <div class="chal-tpl-tags">
              <span class="chal-tpl-tag">${t.durationDays} days</span>
              <span class="chal-tpl-tag">${t.tasks.length} daily tasks</span>
              ${autoCount > 0 ? `<span class="chal-tpl-tag chal-tpl-tag--auto">${autoCount} auto-tracked</span>` : ''}
              ${t.restartOnMiss ? '<span class="chal-tpl-tag chal-tpl-tag--restart">restarts on miss</span>' : ''}
            </div>
            <div class="chal-tpl-task-preview">
              ${t.tasks.slice(0, 3).map(tk => `<span class="chal-tpl-task-pill">${UI.escapeHtml(tk.label)}</span>`).join('')}
              ${t.tasks.length > 3 ? `<span class="chal-tpl-task-pill chal-tpl-task-more">+${t.tasks.length - 3} more</span>` : ''}
            </div>
          </div>
        `}).join('')}
        <div class="challenge-template-card chal-tpl-enhanced" data-template-id="custom">
          <div class="chal-tpl-icon-row">
            <div class="chal-tpl-icon" style="color:var(--accent-purple); background:color-mix(in srgb, var(--accent-purple) 12%, transparent);">${Challenges._templateIcon('custom')}</div>
          </div>
          <div class="challenge-template-name">Custom Challenge</div>
          <div class="challenge-template-desc">Design your own challenge with custom tasks, duration, and rules.</div>
          <div class="chal-tpl-tags">
            <span class="chal-tpl-tag">You choose</span>
          </div>
        </div>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('chal-picker-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    sheet.querySelectorAll('.challenge-template-card').forEach(card => {
      card.addEventListener('click', () => {
        const tid = card.dataset.templateId;
        close();
        if (tid === 'custom') {
          Challenges.showCustomBuilder();
        } else {
          Challenges.showConfirmation(tid);
        }
      });
    });
  },

  // --- Confirmation / customization step ---
  showConfirmation(templateId, customTemplate) {
    const template = customTemplate || ChallengeTemplates[templateId];
    if (!template) return;

    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '90dvh';

    const diff = Challenges._templateDifficulty(template);
    const icon = Challenges._templateIcon(template.id);
    const accent = Challenges._templateAccent(template.id);
    const autoCount = template.tasks.filter(t => t.autoCheck).length;

    // We'll track editable tasks state
    let editableTasks = template.tasks.map((t, i) => ({ ...t, _idx: i }));

    const renderTaskList = () => {
      return editableTasks.map((t, i) => `
        <div class="chal-confirm-task" data-idx="${i}">
          <div class="chal-confirm-task-main">
            <span class="chal-confirm-task-label">${UI.escapeHtml(t.label)}</span>
            ${t.autoCheck ? '<span class="challenge-auto-label">auto</span>' : ''}
          </div>
          <button class="chal-confirm-task-remove" data-idx="${i}" aria-label="Remove task">&times;</button>
        </div>
      `).join('');
    };

    const renderSheet = () => {
      const startDate = App.selectedDate;
      const endObj = new Date(startDate + 'T12:00:00');
      endObj.setDate(endObj.getDate() + template.durationDays - 1);
      const endDate = UI.formatDate(Challenges._fmt(endObj));

      sheet.innerHTML = `
        <div class="modal-header">
          <button class="chal-confirm-back" id="chal-confirm-back" aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="modal-title">Review</span>
          <button class="modal-close" id="chal-confirm-close" aria-label="Close">&times;</button>
        </div>

        <div class="chal-confirm-hero">
          <div class="chal-confirm-icon" style="color:${accent}; background:color-mix(in srgb, ${accent} 15%, transparent);">${icon}</div>
          <div class="chal-confirm-name">${UI.escapeHtml(template.name)}</div>
          <div class="chal-confirm-desc">${UI.escapeHtml(template.description)}</div>
        </div>

        <div class="chal-confirm-stats">
          <div class="chal-confirm-stat">
            <div class="chal-confirm-stat-value">${template.durationDays}</div>
            <div class="chal-confirm-stat-label">Days</div>
          </div>
          <div class="chal-confirm-stat">
            <div class="chal-confirm-stat-value">${editableTasks.length}</div>
            <div class="chal-confirm-stat-label">Daily Tasks</div>
          </div>
          <div class="chal-confirm-stat">
            <div class="chal-confirm-stat-value">${template.restartOnMiss ? 'Yes' : 'No'}</div>
            <div class="chal-confirm-stat-label">Restart</div>
          </div>
        </div>

        <div class="chal-confirm-date-row">
          <span>${UI.formatDate(startDate)}</span>
          <span class="chal-confirm-arrow">--&gt;</span>
          <span>${endDate}</span>
        </div>

        <div class="chal-confirm-section-label">Daily Tasks</div>
        <div class="chal-confirm-section-hint">Tap x to remove, or add your own tasks below</div>
        <div class="chal-confirm-tasks" id="chal-confirm-task-list">
          ${renderTaskList()}
        </div>

        <div class="chal-confirm-add-row">
          <input type="text" class="input-field chal-confirm-add-input" id="chal-confirm-add-input" placeholder="Add a task..." maxlength="100">
          <button class="btn btn-ghost chal-confirm-add-btn" id="chal-confirm-add-btn">Add</button>
        </div>

        ${template.restartOnMiss ? '<div class="chal-confirm-warning">Miss a day and you restart from Day 1. No exceptions.</div>' : ''}

        <button class="btn btn-primary btn-block chal-confirm-begin" id="chal-confirm-begin">Begin Challenge</button>
      `;
    };

    renderSheet();
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    const bindConfirmEvents = () => {
      document.getElementById('chal-confirm-close').addEventListener('click', close);
      document.getElementById('chal-confirm-back').addEventListener('click', () => {
        close();
        if (customTemplate) {
          Challenges.showCustomBuilder(customTemplate);
        } else {
          Challenges.renderTemplatePicker();
        }
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      // Remove task buttons
      sheet.querySelectorAll('.chal-confirm-task-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx);
          if (editableTasks.length <= 1) {
            UI.toast('Need at least one task');
            return;
          }
          editableTasks.splice(idx, 1);
          renderSheet();
          bindConfirmEvents();
        });
      });

      // Add task
      const addInput = document.getElementById('chal-confirm-add-input');
      const addBtn = document.getElementById('chal-confirm-add-btn');
      const doAdd = () => {
        const val = addInput.value.trim();
        if (!val) return;
        editableTasks.push({ id: 'custom_' + Date.now(), label: val, autoCheck: null });
        addInput.value = '';
        renderSheet();
        bindConfirmEvents();
      };
      addBtn.addEventListener('click', doAdd);
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

      // Begin challenge
      document.getElementById('chal-confirm-begin').addEventListener('click', async () => {
        if (editableTasks.length === 0) {
          UI.toast('Add at least one task');
          return;
        }
        const chalData = customTemplate ? {
          name: template.name,
          description: template.description || '',
          durationDays: template.durationDays,
          restartOnMiss: template.restartOnMiss,
          tasks: editableTasks.map(t => ({ label: t.label, autoCheck: t.autoCheck || null })),
        } : undefined;

        let challenge;
        if (customTemplate) {
          challenge = await Challenges.enroll('custom', chalData);
        } else {
          // If tasks were modified from the original, enroll as custom with template name
          const origTasks = template.tasks.map(t => t.label).join('|');
          const newTasks = editableTasks.map(t => t.label).join('|');
          if (origTasks !== newTasks) {
            challenge = await Challenges.enroll('custom', {
              name: template.name,
              description: template.description,
              durationDays: template.durationDays,
              restartOnMiss: template.restartOnMiss,
              tasks: editableTasks.map(t => ({ label: t.label, autoCheck: t.autoCheck || null })),
            });
          } else {
            challenge = await Challenges.enroll(templateId);
          }
        }
        close();
        Challenges.showOnboarding(challenge);
      });
    };

    bindConfirmEvents();
  },

  // --- Post-enrollment onboarding ---
  showOnboarding(challenge) {
    if (!challenge) {
      if (App.currentScreen === 'progress') ProgressView.init();
      if (App.currentScreen === 'today') App.loadDayView();
      return;
    }

    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '85dvh';

    const accent = Challenges._templateAccent(challenge.templateId);
    const icon = Challenges._templateIcon(challenge.templateId);
    const autoTasks = challenge.tasks.filter(t => t.autoCheck);
    const manualTasks = challenge.tasks.filter(t => !t.autoCheck);

    let tipsHtml = '';

    if (autoTasks.length > 0) {
      tipsHtml += `
        <div class="chal-onboard-tip">
          <div class="chal-onboard-tip-icon" style="color:var(--accent-blue);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="chal-onboard-tip-text">
            <strong>${autoTasks.length} task${autoTasks.length > 1 ? 's' : ''} auto-track</strong> based on your logged data (water, workouts, meals, photos). Just log normally and they check themselves.
          </div>
        </div>
      `;
    }

    if (manualTasks.length > 0) {
      tipsHtml += `
        <div class="chal-onboard-tip">
          <div class="chal-onboard-tip-icon" style="color:var(--accent-primary);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div class="chal-onboard-tip-text">
            <strong>${manualTasks.length} task${manualTasks.length > 1 ? 's' : ''} need manual check-off</strong> each day. Tap the checkbox when you complete them.
          </div>
        </div>
      `;
    }

    if (challenge.restartOnMiss) {
      tipsHtml += `
        <div class="chal-onboard-tip">
          <div class="chal-onboard-tip-icon" style="color:var(--accent-red);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div class="chal-onboard-tip-text">
            <strong>Restart on miss is ON.</strong> If you don't complete all tasks in a day, the challenge resets to Day 1. Stay sharp.
          </div>
        </div>
      `;
    } else {
      tipsHtml += `
        <div class="chal-onboard-tip">
          <div class="chal-onboard-tip-icon" style="color:var(--accent-green);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div class="chal-onboard-tip-text">
            <strong>No restarts.</strong> If you miss a day, you just keep going. Progress counts, not perfection.
          </div>
        </div>
      `;
    }

    sheet.innerHTML = `
      <div class="chal-onboard-hero" style="background:color-mix(in srgb, ${accent} 8%, transparent);">
        <div class="chal-onboard-icon" style="color:${accent}; background:color-mix(in srgb, ${accent} 15%, transparent);">${icon}</div>
        <div class="chal-onboard-heading">You're in.</div>
        <div class="chal-onboard-name">${UI.escapeHtml(challenge.name)}</div>
        <div class="chal-onboard-subtitle">${challenge.durationDays} days starting today</div>
      </div>
      <div class="chal-onboard-body">
        <div class="chal-onboard-section-label">What to expect</div>
        ${tipsHtml}
        <div class="chal-onboard-section-label" style="margin-top:var(--space-lg);">Your daily checklist appears on the Today tab and Progress tab. Complete all tasks each day to build your streak.</div>
        <button class="btn btn-primary btn-block chal-onboard-go" id="chal-onboard-go">Let's go</button>
      </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => {
      overlay.remove();
      if (App.currentScreen === 'progress') ProgressView.init();
      if (App.currentScreen === 'today') App.loadDayView();
    };

    document.getElementById('chal-onboard-go').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  },

  // --- Custom challenge builder ---
  showCustomBuilder(prefill) {
    const overlay = UI.createElement('div', 'modal-overlay');
    const sheet = UI.createElement('div', 'modal-sheet');
    sheet.style.maxHeight = '90dvh';

    let tasks = prefill ? prefill.tasks.map((t, i) => ({ id: 'custom_' + i, label: typeof t === 'string' ? t : (t.label || ''), autoCheck: null })) : [];

    const renderTasks = () => {
      if (tasks.length === 0) {
        return '<div class="chal-builder-empty">No tasks yet. Add your first daily task below.</div>';
      }
      return tasks.map((t, i) => `
        <div class="chal-builder-task" data-idx="${i}">
          <span class="chal-builder-task-handle" aria-label="Drag to reorder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
          </span>
          <span class="chal-builder-task-label">${UI.escapeHtml(t.label)}</span>
          <div class="chal-builder-task-actions">
            ${i > 0 ? `<button class="chal-builder-task-move" data-idx="${i}" data-dir="up" aria-label="Move up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
            ${i < tasks.length - 1 ? `<button class="chal-builder-task-move" data-idx="${i}" data-dir="down" aria-label="Move down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
            <button class="chal-builder-task-del" data-idx="${i}" aria-label="Remove">&times;</button>
          </div>
        </div>
      `).join('');
    };

    const render = () => {
      sheet.innerHTML = `
        <div class="modal-header">
          <button class="chal-confirm-back" id="chal-builder-back" aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="modal-title">Build Your Challenge</span>
          <button class="modal-close" id="chal-builder-close" aria-label="Close">&times;</button>
        </div>
        <div class="chal-builder-body">
          <div class="chal-builder-field">
            <label class="input-label">Name</label>
            <input type="text" id="chal-builder-name" class="input-field" placeholder="e.g. 30-Day Clean Eating" maxlength="60" value="${UI.escapeHtml((prefill && prefill.name) || '')}">
          </div>
          <div class="chal-builder-row">
            <div class="chal-builder-field" style="flex:1;">
              <label class="input-label">Duration</label>
              <div class="chal-builder-duration-row">
                <input type="number" id="chal-builder-days" class="input-field" value="${(prefill && prefill.durationDays) || 30}" min="1" max="365">
                <span class="chal-builder-duration-unit">days</span>
              </div>
            </div>
            <div class="chal-builder-field" style="flex:1;">
              <label class="input-label">On miss</label>
              <select id="chal-builder-restart" class="input-field">
                <option value="no"${prefill && prefill.restartOnMiss ? '' : ' selected'}>Continue</option>
                <option value="yes"${prefill && prefill.restartOnMiss ? ' selected' : ''}>Restart Day 1</option>
              </select>
            </div>
          </div>

          <div class="chal-builder-section-label">Daily Tasks (${tasks.length})</div>
          <div class="chal-builder-task-list" id="chal-builder-task-list">
            ${renderTasks()}
          </div>

          <div class="chal-builder-add-row">
            <input type="text" class="input-field chal-builder-add-input" id="chal-builder-add-input" placeholder="Add a task..." maxlength="100">
            <button class="btn btn-ghost chal-builder-add-btn" id="chal-builder-add-btn">Add</button>
          </div>

          <button class="btn btn-primary btn-block" id="chal-builder-next" style="margin-top:var(--space-lg);">Review Challenge</button>
        </div>
      `;
    };

    render();
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    const bindBuilderEvents = () => {
      document.getElementById('chal-builder-close').addEventListener('click', close);
      document.getElementById('chal-builder-back').addEventListener('click', () => {
        close();
        Challenges.renderTemplatePicker();
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      // Add task
      const addInput = document.getElementById('chal-builder-add-input');
      const addBtn = document.getElementById('chal-builder-add-btn');
      const doAdd = () => {
        const val = addInput.value.trim();
        if (!val) return;
        tasks.push({ id: 'custom_' + Date.now(), label: val, autoCheck: null });
        render();
        bindBuilderEvents();
        // Focus the add input again
        document.getElementById('chal-builder-add-input').focus();
      };
      addBtn.addEventListener('click', doAdd);
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

      // Delete task
      sheet.querySelectorAll('.chal-builder-task-del').forEach(btn => {
        btn.addEventListener('click', () => {
          tasks.splice(parseInt(btn.dataset.idx), 1);
          render();
          bindBuilderEvents();
        });
      });

      // Move task
      sheet.querySelectorAll('.chal-builder-task-move').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const dir = btn.dataset.dir;
          const target = dir === 'up' ? idx - 1 : idx + 1;
          if (target < 0 || target >= tasks.length) return;
          [tasks[idx], tasks[target]] = [tasks[target], tasks[idx]];
          render();
          bindBuilderEvents();
        });
      });

      // Next -> confirmation
      document.getElementById('chal-builder-next').addEventListener('click', () => {
        const name = document.getElementById('chal-builder-name').value.trim();
        const days = parseInt(document.getElementById('chal-builder-days').value) || 30;
        const restart = document.getElementById('chal-builder-restart').value === 'yes';

        if (!name) { UI.toast('Enter a challenge name'); return; }
        if (tasks.length === 0) { UI.toast('Add at least one task'); return; }

        close();
        Challenges.showConfirmation('custom', {
          id: 'custom',
          name,
          description: '',
          durationDays: days,
          restartOnMiss: restart,
          tasks: tasks.map(t => ({ ...t })),
        });
      });
    };

    bindBuilderEvents();
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
          <button class="modal-close" id="chal-import-close" aria-label="Close">&times;</button>
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
        <button class="modal-close" id="share-menu-close" aria-label="Close">&times;</button>
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
