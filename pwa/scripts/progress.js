// progress.js — Progress tab: journey timeline, scores, calendar heatmap, streaks

const ProgressView = {
  async init() {
    const container = document.getElementById('progress-container');
    if (!container) return;

    const goals = await DB.getProfile('goals') || {};
    const activePlan = goals.activePlan || 'moderate';
    const timeline = goals.timeline || {};
    const startDate = timeline.start || '2026-03-10';
    const endDate = activePlan === 'hardcore'
      ? (timeline.hardcore_end || '2026-05-15')
      : (timeline.moderate_end || '2026-06-30');
    const today = UI.today();

    const analyses = await DB.getAnalysisRange(startDate, today);

    let html = '';

    // --- Fitness goals ---
    if (goals.fitnessGoals?.length) {
      html += ProgressView.renderFitnessGoals(goals.fitnessGoals);
    }

    // --- Timeline bar ---
    html += ProgressView.renderTimeline(startDate, endDate, today, timeline, activePlan);

    // --- Score sparkline ---
    if (analyses.length > 0) {
      html += ProgressView.renderScores(analyses, startDate, today, activePlan);
      html += ProgressView.renderAverages(analyses, activePlan);
    }

    // --- Compact calendar heatmap ---
    html += await ProgressView.renderCalendarHeatmap();

    // --- Streaks ---
    const latestAnalysis = analyses.length > 0 ? analyses[analyses.length - 1] : null;
    if (latestAnalysis?.streaks) {
      html += ProgressView.renderStreaks(latestAnalysis.streaks);
    }

    if (!html) {
      html = `<div class="card" style="text-align:center; padding:var(--space-lg);">
        <p style="color:var(--text-muted);">Start tracking to see your progress here.</p>
      </div>`;
    }

    container.innerHTML = html;

    // Wire calendar day taps
    container.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => {
        App.goToDate(el.dataset.date);
      });
    });
  },

  renderFitnessGoals(fitnessGoals) {
    let html = '<h2 class="section-header">Goals</h2><div class="card">';
    for (let i = 0; i < fitnessGoals.length; i++) {
      const g = fitnessGoals[i];
      const isLast = i === fitnessGoals.length - 1;
      const targetDate = new Date(g.target + 'T12:00:00');
      const now = new Date();
      const daysLeft = Math.max(0, Math.round((targetDate - now) / 86400000));

      html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; ${!isLast ? 'border-bottom:1px solid var(--border-color);' : ''}">
        <div>
          <div style="font-size:var(--text-sm); font-weight:500;">${UI.escapeHtml(g.name)}</div>
          <div style="font-size:var(--text-xs); color:var(--text-muted);">${daysLeft} days left</div>
        </div>
        <span style="font-size:var(--text-xs); color:var(--accent-blue);">${UI.formatDate(g.target)}</span>
      </div>`;
    }
    html += '</div>';
    return html;
  },

  renderTimeline(startDate, endDate, today, timeline, activePlan) {
    const startMs = new Date(startDate + 'T12:00:00').getTime();
    const endMs = new Date(endDate + 'T12:00:00').getTime();
    const todayMs = new Date(today + 'T12:00:00').getTime();
    const totalDays = Math.round((endMs - startMs) / 86400000);
    const elapsedDays = Math.round((todayMs - startMs) / 86400000);
    const pct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    let html = '<h2 class="section-header">Timeline</h2><div class="card">';
    html += `<div style="display:flex; justify-content:space-between; font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-xs);">
      <span>${UI.formatDate(startDate)}</span>
      <span style="color:var(--accent-green);">Day ${elapsedDays} of ${totalDays}</span>
      <span>${UI.formatDate(endDate)}</span>
    </div>`;
    html += `<div class="progress-bar" style="height:8px;">
      <div class="progress-fill" style="width:${pct}%; background:linear-gradient(90deg, var(--accent-blue), var(--accent-green));"></div>
    </div>`;

    // Milestone markers
    if (timeline.milestones?.length) {
      html += `<div style="margin-top:var(--space-sm);">`;
      for (const m of timeline.milestones) {
        const mMs = new Date(m.target + 'T12:00:00').getTime();
        const mDays = Math.max(0, Math.round((mMs - todayMs) / 86400000));
        const done = todayMs >= mMs;
        html += `<div style="display:flex; justify-content:space-between; font-size:var(--text-xs); padding:2px 0;">
          <span style="color:${done ? 'var(--accent-green)' : 'var(--text-secondary)'};">${done ? '&#10003; ' : ''}${UI.escapeHtml(m.name)}</span>
          <span style="color:var(--text-muted);">${done ? 'Done' : mDays + ' days'}</span>
        </div>`;
      }
      html += `</div>`;
    }

    html += '</div>';
    return html;
  },

  renderScores(analyses, startDate, today, activePlan) {
    let html = '<h2 class="section-header">Daily Scores</h2><div class="card">';

    const dayData = [];
    const analysisMap = {};
    for (const a of analyses) analysisMap[a.date] = a;

    const cursor = new Date(startDate + 'T12:00:00');
    const todayDate = new Date(today + 'T12:00:00');
    while (cursor <= todayDate) {
      const ds = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const a = analysisMap[ds];
      const score = a?.dayScore?.[activePlan]?.score ?? null;
      dayData.push({ date: ds, score });
      cursor.setDate(cursor.getDate() + 1);
    }

    // SVG sparkline
    const barWidth = Math.max(8, Math.min(28, Math.floor(280 / dayData.length)));
    const gap = 3;
    const svgWidth = dayData.length * (barWidth + gap);
    const svgHeight = 80;

    html += `<div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">`;
    html += `<svg viewBox="0 0 ${svgWidth} ${svgHeight + 20}" width="${svgWidth}" height="${svgHeight + 20}" style="display:block;">`;

    for (let i = 0; i < dayData.length; i++) {
      const d = dayData[i];
      const x = i * (barWidth + gap);
      const barH = d.score != null ? (d.score / 100) * svgHeight : 0;
      const y = svgHeight - barH;
      const color = d.score == null ? '#2a2a2a' :
                    d.score >= 75 ? '#3ecf6e' :
                    d.score >= 50 ? '#e09347' : '#e5534b';

      html += `<rect x="${x}" y="${d.score != null ? y : svgHeight - 4}" width="${barWidth}" height="${d.score != null ? barH : 4}" rx="3" fill="${color}" opacity="${d.score != null ? 0.85 : 0.3}"/>`;

      if (d.score != null) {
        html += `<text x="${x + barWidth / 2}" y="${y - 3}" text-anchor="middle" fill="#ececec" font-size="9" font-family="var(--font-sans)">${d.score}</text>`;
      }

      const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });
      html += `<text x="${x + barWidth / 2}" y="${svgHeight + 14}" text-anchor="middle" fill="#5a5a5d" font-size="9" font-family="var(--font-sans)">${dayLabel}</text>`;
    }

    html += `</svg></div>`;

    // Average
    const scored = dayData.filter(d => d.score != null);
    if (scored.length > 0) {
      const avg = Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length);
      html += `<div style="display:flex; justify-content:center; gap:var(--space-lg); margin-top:var(--space-sm); font-size:var(--text-sm);">
        <span>Avg: <strong style="color:${avg >= 75 ? 'var(--accent-green)' : avg >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${avg}</strong></span>
        <span style="color:var(--text-muted);">${scored.length} day${scored.length > 1 ? 's' : ''} tracked</span>
      </div>`;
    }

    html += '</div>';
    return html;
  },

  renderAverages(analyses, activePlan) {
    const avgCal = Math.round(analyses.reduce((s, a) => s + (a.totals?.calories || 0), 0) / analyses.length);
    const avgPro = Math.round(analyses.reduce((s, a) => s + (a.totals?.protein || 0), 0) / analyses.length);
    const workoutDays = analyses.filter(a =>
      a.fitness?.completed?.length > 0 || a.dayScore?.[activePlan]?.breakdown?.workout >= 20
    ).length;
    const waterHit = analyses.filter(a => a.goals?.water?.status === 'met' || a.goals?.water?.status === 'on_track').length;

    let html = '<h2 class="section-header">Averages</h2><div class="stats-row">';
    html += `<div class="stat-card">
      <div class="stat-value" style="color:${avgCal <= 1400 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${avgCal}</div>
      <div class="stat-label">Avg Cal</div>
    </div>`;
    html += `<div class="stat-card">
      <div class="stat-value" style="color:${avgPro >= 105 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${avgPro}g</div>
      <div class="stat-label">Avg Protein</div>
    </div>`;
    html += `<div class="stat-card">
      <div class="stat-value" style="color:var(--accent-blue);">${workoutDays}/${analyses.length}</div>
      <div class="stat-label">Workouts</div>
    </div>`;
    html += `<div class="stat-card">
      <div class="stat-value" style="color:var(--accent-cyan);">${waterHit}/${analyses.length}</div>
      <div class="stat-label">Water Goal</div>
    </div>`;
    html += '</div>';
    return html;
  },

  async renderCalendarHeatmap() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const today = UI.today();

    let html = `<h2 class="section-header">${monthName}</h2>`;
    html += `<div class="card"><div class="cal-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>`;
    html += `<div class="cal-grid">`;

    for (let i = 0; i < firstDay; i++) {
      html += `<div class="cal-day empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === today;
      const isSelected = dateStr === App.selectedDate;
      const cls = `cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`;
      html += `<div class="${cls}" data-date="${dateStr}"><span class="cal-day-num">${d}</span><span class="cal-day-dot" id="dot-${dateStr}"></span></div>`;
    }

    html += `</div></div>`;

    // Load data and color-code asynchronously after render
    setTimeout(() => ProgressView.colorCodeDays(year, month, daysInMonth), 0);

    return html;
  },

  async colorCodeDays(year, month, daysInMonth) {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const entries = await DB.getEntriesByDateRange(startDate, endDate);
    const analyses = await DB.getAnalysisRange(startDate, endDate);

    const entryDates = new Set();
    for (const e of entries) entryDates.add(e.date);
    const analysisMap = {};
    for (const a of analyses) analysisMap[a.date] = a;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dot = document.getElementById(`dot-${dateStr}`);
      if (!dot) continue;

      const analysis = analysisMap[dateStr];
      if (analysis) {
        // Use day score for color
        const score = analysis.dayScore?.moderate?.score ?? null;
        if (score != null) {
          dot.classList.add(score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red');
        } else {
          dot.classList.add('green');
        }
      } else if (entryDates.has(dateStr)) {
        dot.classList.add('yellow');
      }
    }
  },

  renderStreaks(streaks) {
    const icons = {
      logging: UI.svg.logging, tracking: UI.svg.logging,
      waterGoal: UI.svg.water, water_goal: UI.svg.water,
      workout: UI.svg.workout,
      proteinGoal: UI.svg.target, protein_goal: UI.svg.target,
      calorie_goal: UI.svg.flame,
    };
    const labels = {
      logging: 'Logging', tracking: 'Logging',
      waterGoal: 'Water Goal', water_goal: 'Water Goal',
      workout: 'Workout',
      proteinGoal: 'Protein Goal', protein_goal: 'Protein Goal',
      calorie_goal: 'Calorie Goal',
    };

    let html = '<h2 class="section-header">Streaks</h2><div class="stats-row">';
    for (const [key, val] of Object.entries(streaks)) {
      const icon = icons[key] || UI.svg.flame;
      const label = labels[key] || key;
      html += `<div class="stat-card">
        <div style="width:28px; height:28px; margin:0 auto;">${icon}</div>
        <div class="stat-value">${val}</div>
        <div class="stat-label">${label}</div>
      </div>`;
    }
    html += '</div>';
    return html;
  },
};
