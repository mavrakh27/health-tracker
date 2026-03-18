// progress.js -- Progress tab: Insights / Trends segments

const ProgressView = {
  _tab: 'insights',

  async init() {
    const container = document.getElementById('progress-container');
    if (!container) return;

    const activeTab = ProgressView._tab || 'insights';

    // Segment control (2 tabs)
    let html = `
      <div class="segment-control" style="margin-bottom:var(--space-md);">
        <button class="segment-btn${activeTab === 'insights' ? ' active' : ''}" data-ptab="insights">Insights</button>
        <button class="segment-btn${activeTab === 'trends' ? ' active' : ''}" data-ptab="trends">Trends</button>
      </div>
    `;

    if (activeTab === 'insights') {
      html += await ProgressView.renderInsights();
    } else if (activeTab === 'trends') {
      html += await ProgressView.renderTrends();
    }

    container.innerHTML = html;

    // Bind segment tabs
    container.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        ProgressView._tab = btn.dataset.ptab;
        ProgressView.init();
      });
    });

    // Wire calendar day taps (Trends tab)
    container.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => App.goToDate(el.dataset.date));
    });
  },

  // --- Insights ---
  async renderInsights() {
    const today = UI.today();
    const goals = await DB.getProfile('goals') || {};
    let analysis = await DB.getAnalysis(today);
    if (!analysis) analysis = await DB.getAnalysis(UI.yesterday(today));

    let html = '';

    // Weekly summary (this week vs last week)
    html += await ProgressView.renderWeeklySummary(goals);

    // Goal consistency (moved from Goals segment)
    const activePlan = goals.activePlan || 'moderate';
    const timeline = goals.timeline || {};
    const startDate = timeline.start || today;
    const analyses = await DB.getAnalysisRange(startDate, today);
    if (analyses.length > 0) {
      const calTarget = goals.calories || 1200;
      const proTarget = goals.protein || 105;
      const calHits = analyses.filter(a => (a.totals?.calories || 0) <= calTarget * 1.1).length;
      const proHits = analyses.filter(a => (a.totals?.protein || 0) >= proTarget * 0.85).length;
      const workoutDays = analyses.filter(a => (a.entries || []).some(e => e.type === 'workout')).length;

      html += '<h2 class="section-header">Goal Consistency</h2><div class="card">';
      html += `<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:var(--space-sm); text-align:center;">
        <div>
          <div style="font-size:var(--text-lg); font-weight:600; color:${calHits/analyses.length >= 0.7 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${calHits}/${analyses.length}</div>
          <div style="font-size:var(--text-xs); color:var(--text-muted);">Cal target</div>
        </div>
        <div>
          <div style="font-size:var(--text-lg); font-weight:600; color:${proHits/analyses.length >= 0.7 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${proHits}/${analyses.length}</div>
          <div style="font-size:var(--text-xs); color:var(--text-muted);">Protein target</div>
        </div>
        <div>
          <div style="font-size:var(--text-lg); font-weight:600; color:var(--accent-primary);">${workoutDays}/${analyses.length}</div>
          <div style="font-size:var(--text-xs); color:var(--text-muted);">Workouts</div>
        </div>
      </div>`;
      html += '</div>';
    }

    // Meal plan
    const mealPlan = await DB.getMealPlan();
    if (mealPlan?.days?.length) {
      html += '<h2 class="section-header">Meal Plan</h2>';
      for (const day of mealPlan.days) {
        html += `<div class="card" style="margin-bottom:var(--space-sm);">`;
        const dayLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        html += `<div style="font-weight:600; font-size:var(--text-sm); margin-bottom:var(--space-xs);">${dayLabel}</div>`;
        if (day.meals) {
          for (const m of day.meals) {
            html += `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:var(--text-sm);">
              <span>${UI.escapeHtml(m.name || m.meal)}</span>
              <span style="color:var(--text-muted); font-size:var(--text-xs);">${m.calories} cal - ${m.protein}g P</span>
            </div>`;
          }
        }
        if (day.day_totals) {
          html += `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-xs); padding-top:var(--space-xs); border-top:1px solid var(--border-color);">
            ~${day.day_totals.calories} cal - ${day.day_totals.protein}g P
          </div>`;
        }
        if (day.notes) {
          html += `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:4px;">${UI.escapeHtml(day.notes)}</div>`;
        }
        html += '</div>';
      }
    }

    // Highlights from recent analysis
    if (analysis?.highlights?.length) {
      html += '<h2 class="section-header">Highlights</h2><div class="card">';
      for (const h of analysis.highlights) {
        html += `<div style="font-size:var(--text-sm); color:var(--accent-green); margin-bottom:4px;">&#10003; ${UI.escapeHtml(h)}</div>`;
      }
      html += '</div>';
    }

    if (!html) {
      html = `<div class="card" style="text-align:center; padding:var(--space-lg); color:var(--text-muted);">
        <div style="font-size:var(--text-sm);">Log meals, water, and workouts to see insights here.</div>
      </div>`;
    }

    return html;
  },

  async renderWeeklySummary(goals) {
    const today = new Date(UI.today() + 'T12:00:00');
    // This week: Monday to today
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - mondayOffset);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);

    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const thisWeek = await DB.getAnalysisRange(fmt(thisMonday), fmt(today));
    const lastWeek = await DB.getAnalysisRange(fmt(lastMonday), fmt(lastSunday));

    if (thisWeek.length === 0 && lastWeek.length === 0) return '';

    const avg = (arr, fn) => arr.length ? Math.round(arr.reduce((s, a) => s + fn(a), 0) / arr.length) : 0;
    const thisAvgCal = avg(thisWeek, a => a.totals?.calories || 0);
    const lastAvgCal = avg(lastWeek, a => a.totals?.calories || 0);
    const thisAvgPro = avg(thisWeek, a => a.totals?.protein || 0);
    const lastAvgPro = avg(lastWeek, a => a.totals?.protein || 0);
    const thisWorkouts = thisWeek.filter(a => (a.entries || []).some(e => e.type === 'workout')).length;
    const lastWorkouts = lastWeek.filter(a => (a.entries || []).some(e => e.type === 'workout')).length;
    const waterTarget = goals.water_oz || 64;
    const thisWater = thisWeek.filter(a => (a.goals?.water?.actual_oz || 0) >= waterTarget).length;
    const lastWater = lastWeek.filter(a => (a.goals?.water?.actual_oz || 0) >= waterTarget).length;

    const arrow = (curr, prev, lowerBetter) => {
      if (prev === 0) return '';
      const better = lowerBetter ? curr < prev : curr > prev;
      const same = curr === prev;
      if (same) return '<span style="color:var(--text-muted);">--</span>';
      return better
        ? '<span style="color:var(--accent-green);">&#9650;</span>'
        : '<span style="color:var(--accent-red);">&#9660;</span>';
    };

    let html = '<h2 class="section-header">This Week</h2><div class="card">';
    html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-sm);">
      <div style="text-align:center;">
        <div style="font-size:var(--text-lg); font-weight:600;">${thisAvgCal}</div>
        <div style="font-size:var(--text-xs); color:var(--text-muted);">avg cal ${arrow(thisAvgCal, lastAvgCal, true)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:var(--text-lg); font-weight:600;">${thisAvgPro}g</div>
        <div style="font-size:var(--text-xs); color:var(--text-muted);">avg protein ${arrow(thisAvgPro, lastAvgPro, false)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:var(--text-lg); font-weight:600;">${thisWorkouts}</div>
        <div style="font-size:var(--text-xs); color:var(--text-muted);">workouts ${arrow(thisWorkouts, lastWorkouts, false)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:var(--text-lg); font-weight:600;">${thisWater}/${thisWeek.length || '-'}</div>
        <div style="font-size:var(--text-xs); color:var(--text-muted);">water goal ${arrow(thisWater, lastWater, false)}</div>
      </div>
    </div>`;
    html += '</div>';
    return html;
  },

  // --- Trends ---
  async renderTrends() {
    const goals = await DB.getProfile('goals') || {};
    const activePlan = goals.activePlan || 'moderate';
    const timeline = goals.timeline || {};
    const today = UI.today();

    // Show at least 14 days of history
    const minStart = (() => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 14); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    const startDate = timeline.start && timeline.start < minStart ? timeline.start : minStart;
    const defaultEnd = (() => { const d = new Date(startDate + 'T12:00:00'); d.setDate(d.getDate() + 90); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    const endDate = activePlan === 'hardcore'
      ? (timeline.hardcore_end || defaultEnd)
      : (timeline.moderate_end || defaultEnd);

    const analyses = await DB.getAnalysisRange(startDate, today);
    const regimen = await DB.getRegimen();

    let html = '';

    // Score sparkline
    if (analyses.length > 0) {
      html += ProgressView.renderScores(analyses, startDate, today, activePlan, goals, regimen);
      html += ProgressView.renderAverages(analyses, goals);
    }

    // Calendar heatmap
    html += await ProgressView.renderCalendarHeatmap();

    // Weight trend
    html += await ProgressView.renderWeightTrend();

    // Streaks
    const latestAnalysis = analyses.length > 0 ? analyses[analyses.length - 1] : null;
    if (latestAnalysis?.streaks) {
      html += ProgressView.renderStreaks(latestAnalysis.streaks);
    }

    if (!html) {
      html = `<div class="card" style="text-align:center; padding:var(--space-lg); color:var(--text-muted);">
        <div style="font-size:var(--text-sm);">Log meals and workouts to see trends here.</div>
      </div>`;
    }

    return html;
  },

  async renderWeightTrend() {
    // Get weight data from daily summaries (batch lookup, 90 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 90);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const startDate = fmt(thirtyDaysAgo);
    const endDate = fmt(today);

    const summaries = await DB.getDailySummaryRange(startDate, endDate);
    const points = [];
    for (const s of summaries) {
      if (s.weight?.value) {
        points.push({ date: s.date, weight: s.weight.value });
      }
    }

    if (points.length < 2) return '';

    const weights = points.map(p => p.weight);
    const minW = Math.min(...weights) - 1;
    const maxW = Math.max(...weights) + 1;
    const range = maxW - minW || 1;
    const svgW = 300;
    const svgH = 80;

    let pathD = '';
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * svgW;
      const y = svgH - ((points[i].weight - minW) / range) * svgH;
      pathD += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)}`;
    }

    const latest = points[points.length - 1];
    const first = points[0];
    const delta = (latest.weight - first.weight).toFixed(1);
    const deltaColor = delta <= 0 ? 'var(--accent-green)' : 'var(--accent-orange)';

    let html = '<h2 class="section-header">Weight</h2><div class="card">';
    html += `<div style="display:flex; justify-content:space-between; margin-bottom:var(--space-xs); font-size:var(--text-sm);">
      <span style="font-weight:600;">${latest.weight} lbs</span>
      <span style="color:${deltaColor};">${delta > 0 ? '+' : ''}${delta} lbs</span>
    </div>`;
    html += `<svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" preserveAspectRatio="none">
      <path d="${pathD}" fill="none" stroke="var(--accent-primary)" stroke-width="2"/>
    </svg>`;
    html += `<div style="display:flex; justify-content:space-between; font-size:var(--text-xs); color:var(--text-muted);">
      <span>${UI.formatDate(first.date)}</span><span>${UI.formatDate(latest.date)}</span>
    </div>`;
    html += '</div>';
    return html;
  },

  // --- Shared render methods ---

  renderFitnessGoals(fitnessGoals) {
    let html = '<h2 class="section-header">Fitness Goals</h2><div class="card">';
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
        <span style="font-size:var(--text-xs); color:var(--accent-primary);">${UI.formatDate(g.target)}</span>
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
      <div class="progress-fill" style="width:${pct}%; background:linear-gradient(90deg, var(--accent-primary), var(--accent-green));"></div>
    </div>`;

    if (timeline.milestones?.length) {
      html += '<div style="margin-top:var(--space-sm);">';
      for (const m of timeline.milestones) {
        const mMs = new Date(m.target + 'T12:00:00').getTime();
        const mDays = Math.max(0, Math.round((mMs - todayMs) / 86400000));
        const done = todayMs >= mMs;
        html += `<div style="display:flex; justify-content:space-between; font-size:var(--text-xs); padding:2px 0;">
          <span style="color:${done ? 'var(--accent-green)' : 'var(--text-secondary)'};">${done ? '&#10003; ' : ''}${UI.escapeHtml(m.name)}</span>
          <span style="color:var(--text-muted);">${done ? 'Done' : mDays + ' days'}</span>
        </div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  _scoreFromAnalysis(analysis, goals, regimen) {
    if (!analysis) return { moderate: null, hardcore: null };
    const totals = analysis.totals || {};
    const cal = totals.calories || 0;
    const pro = totals.protein || 0;
    const water = analysis.goals?.water?.actual_oz || 0;
    const hasWorkout = (analysis.entries || []).some(e => e.type === 'workout');
    const hasMeals = (analysis.entries || []).some(e => e.type === 'meal' || e.type === 'drink' || e.type === 'snack');
    const viceCount = (analysis.entries || []).filter(e => e.type === 'custom').reduce((s, e) => s + (e.quantity || 1), 0);

    const dayName = new Date(analysis.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayPlan = regimen?.weeklySchedule?.find(d => d.day === dayName);
    const isWorkoutDay = dayPlan && dayPlan.type !== 'rest';

    const calc = (target) => {
      let score = 0;
      if (cal > 0) {
        const diff = Math.abs(cal - target.calories);
        if (diff <= 150) score += 25;
        else if (diff <= 300) score += 15;
        else if (cal > target.calories + 300) score += 0;
        else score += 10;
      }
      if (pro > 0) score += Math.round(Math.min(1, pro / target.protein) * 25);
      if (isWorkoutDay) { if (hasWorkout) score += 25; }
      else score += 25;
      if (water >= target.water) score += 10;
      else if (water >= target.water * 0.5) score += 5;
      if (hasMeals) score += 15;
      if (viceCount > 0) score -= Math.min(30, viceCount * 10);
      return Math.max(0, Math.min(100, score));
    };

    return {
      moderate: calc({ calories: goals.calories || 2000, protein: goals.protein || 100, water: goals.water_oz || 64 }),
      hardcore: calc({ calories: goals.hardcore?.calories || 1500, protein: goals.hardcore?.protein || 130, water: goals.hardcore?.water_oz || 64 }),
    };
  },

  renderScores(analyses, startDate, today, activePlan, goals, regimen) {
    let html = '<h2 class="section-header">Daily Scores</h2><div class="card">';

    const dayData = [];
    const analysisMap = {};
    for (const a of analyses) analysisMap[a.date] = a;

    const cursor = new Date(startDate + 'T12:00:00');
    const todayDate = new Date(today + 'T12:00:00');
    while (cursor <= todayDate) {
      const ds = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const a = analysisMap[ds];
      const scores = ProgressView._scoreFromAnalysis(a, goals, regimen);
      dayData.push({ date: ds, moderate: scores.moderate, hardcore: scores.hardcore });
      cursor.setDate(cursor.getDate() + 1);
    }

    const barWidth = Math.max(10, Math.min(32, Math.floor(300 / dayData.length)));
    const gap = 4;
    const svgWidth = dayData.length * (barWidth + gap);
    const svgHeight = 80;

    html += '<div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">';
    html += `<svg viewBox="0 0 ${svgWidth} ${svgHeight + 20}" width="${svgWidth}" height="${svgHeight + 20}" style="display:block;">`;

    for (let i = 0; i < dayData.length; i++) {
      const d = dayData[i];
      const x = i * (barWidth + gap);
      const ms = d.moderate;
      const hs = d.hardcore;

      if (ms != null) {
        const barH = (ms / 100) * svgHeight;
        const y = svgHeight - barH;
        const color = ms >= 75 ? 'var(--accent-green)' : ms >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
        html += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="3" fill="${color}" opacity="0.85"/>`;
        if (hs != null) {
          const hcY = svgHeight - (hs / 100) * svgHeight;
          html += `<line x1="${x}" y1="${hcY}" x2="${x + barWidth}" y2="${hcY}" stroke="var(--accent-primary)" stroke-width="2" stroke-dasharray="3,2" opacity="0.7"/>`;
        }
        html += `<text x="${x + barWidth / 2}" y="${y - 3}" text-anchor="middle" fill="var(--text-primary)" font-size="9" font-family="var(--font-sans)">${ms}</text>`;
      } else {
        html += `<rect x="${x}" y="${svgHeight - 4}" width="${barWidth}" height="4" rx="2" fill="var(--border-color)" opacity="0.3"/>`;
      }

      const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });
      html += `<text x="${x + barWidth / 2}" y="${svgHeight + 14}" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-family="var(--font-sans)">${dayLabel}</text>`;
    }

    html += '</svg></div>';

    html += `<div style="display:flex; justify-content:center; gap:var(--space-md); margin-top:var(--space-sm); font-size:var(--text-xs); color:var(--text-muted);">
      <span>&#9632; Great</span>
      <span style="color:var(--accent-primary);">--- Crush It</span>
    </div>`;

    const scored = dayData.filter(d => d.moderate != null);
    if (scored.length > 0) {
      const avgMod = Math.round(scored.reduce((s, d) => s + d.moderate, 0) / scored.length);
      const hcScored = scored.filter(d => d.hardcore != null);
      const avgHc = hcScored.length ? Math.round(hcScored.reduce((s, d) => s + d.hardcore, 0) / hcScored.length) : 0;
      html += `<div style="display:flex; justify-content:center; gap:var(--space-lg); margin-top:var(--space-xs); font-size:var(--text-sm);">
        <span>Avg: <strong style="color:${avgMod >= 75 ? 'var(--accent-green)' : avgMod >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${avgMod}</strong></span>
        <span style="color:var(--accent-primary);">HC: <strong>${avgHc}</strong></span>
        <span style="color:var(--text-muted);">${scored.length} day${scored.length > 1 ? 's' : ''}</span>
      </div>`;
    }

    html += '</div>';
    return html;
  },

  renderAverages(analyses, goals) {
    const calTarget = goals.calories || 2000;
    const proTarget = goals.protein || 100;
    const waterTarget = goals.water_oz || 64;

    const avgCal = Math.round(analyses.reduce((s, a) => s + (a.totals?.calories || 0), 0) / analyses.length);
    const avgPro = Math.round(analyses.reduce((s, a) => s + (a.totals?.protein || 0), 0) / analyses.length);
    const workoutDays = analyses.filter(a => (a.entries || []).some(e => e.type === 'workout')).length;
    const waterHit = analyses.filter(a => (a.goals?.water?.actual_oz || 0) >= waterTarget).length;

    let html = '<h2 class="section-header">Averages</h2><div class="stats-row">';
    html += `<div class="stat-card"><div class="stat-value" style="color:${avgCal <= calTarget ? 'var(--accent-green)' : 'var(--accent-orange)'};">${avgCal}</div><div class="stat-label">Avg Cal</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:${avgPro >= proTarget ? 'var(--accent-green)' : 'var(--accent-orange)'};">${avgPro}g</div><div class="stat-label">Avg Protein</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-primary);">${workoutDays}/${analyses.length}</div><div class="stat-label">Workouts</div></div>`;
    html += `<div class="stat-card"><div class="stat-value" style="color:var(--accent-cyan);">${waterHit}/${analyses.length}</div><div class="stat-label">Water Goal</div></div>`;
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
    html += '<div class="card"><div class="cal-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>';
    html += '<div class="cal-grid">';

    for (let i = 0; i < firstDay; i++) {
      html += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === today;
      const isSelected = dateStr === App.selectedDate;
      const cls = `cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`;
      html += `<div class="${cls}" data-date="${dateStr}"><span class="cal-day-num">${d}</span><span class="cal-day-dot" id="dot-${dateStr}"></span></div>`;
    }

    html += '</div></div>';
    setTimeout(() => ProgressView.colorCodeDays(year, month, daysInMonth), 0);
    return html;
  },

  async colorCodeDays(year, month, daysInMonth) {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const entries = await DB.getEntriesByDateRange(startDate, endDate);
    const analyses = await DB.getAnalysisRange(startDate, endDate);
    const goals = await DB.getProfile('goals') || {};
    const regimen = await DB.getRegimen();

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
        const scores = ProgressView._scoreFromAnalysis(analysis, goals, regimen);
        const score = scores.moderate;
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
