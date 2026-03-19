// progress.js -- Progress tab: Insights / Trends segments

const ProgressView = {
  _tab: 'insights',

  async init() {
    const container = document.getElementById('progress-container');
    if (!container) return;

    const activeTab = ProgressView._tab || 'insights';

    // Segment control (3 tabs)
    let html = `
      <div class="segment-control" style="margin-bottom:var(--space-md);">
        <button class="segment-btn${activeTab === 'insights' ? ' active' : ''}" data-ptab="insights">Insights</button>
        <button class="segment-btn${activeTab === 'trends' ? ' active' : ''}" data-ptab="trends">Trends</button>
        <button class="segment-btn${activeTab === 'skin' ? ' active' : ''}" data-ptab="skin">Skin</button>
      </div>
    `;

    if (activeTab === 'insights') {
      html += await ProgressView.renderInsights();
    } else if (activeTab === 'trends') {
      html += await ProgressView.renderTrends();
    } else if (activeTab === 'skin') {
      html += await ProgressView.renderSkin();
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

    // Progress photos
    html += await ProgressView.renderProgressPhotos();

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
    // Collect all timestamped measurements for AM/PM analysis
    const allMeasurements = [];
    for (const s of summaries) {
      if (s.weightLog && s.weightLog.length > 0) {
        // Use the first measurement of the day (most consistent for trend)
        const sorted = s.weightLog.slice().sort((a, b) => a.timestamp - b.timestamp);
        points.push({ date: s.date, weight: sorted[0].value });
        for (const entry of s.weightLog) {
          if (entry.timestamp) allMeasurements.push(entry);
        }
      } else if (s.weight?.value) {
        points.push({ date: s.date, weight: s.weight.value });
        // If there's a timestamp on the weight object, include it for AM/PM
        if (s.weight.timestamp) allMeasurements.push(s.weight);
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

    const pointsJson = JSON.stringify(points.map(p => ({ date: p.date, weight: p.weight })));

    let html = '<h2 class="section-header">Weight</h2><div class="card" id="weight-trend-card">';
    html += `<div style="display:flex; justify-content:space-between; margin-bottom:var(--space-xs); font-size:var(--text-sm);">
      <span style="font-weight:600;">${latest.weight} lbs</span>
      <span style="color:${deltaColor};">${delta > 0 ? '+' : ''}${delta} lbs</span>
    </div>`;
    html += `<div style="position:relative; touch-action:pan-y;">
      <svg id="weight-trend-svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" preserveAspectRatio="none"
           data-points='${pointsJson.replace(/'/g, '&apos;')}' data-minw="${minW}" data-maxw="${maxW}" data-svgw="${svgW}" data-svgh="${svgH}" style="display:block; overflow:visible;">
        <path d="${pathD}" fill="none" stroke="var(--accent-primary)" stroke-width="2"/>
      </svg>
    </div>`;
    html += `<div style="display:flex; justify-content:space-between; font-size:var(--text-xs); color:var(--text-muted);">
      <span>${UI.formatDate(first.date)}</span><span>${UI.formatDate(latest.date)}</span>
    </div>`;
    html += '</div>';

    // Wire touch interaction after DOM paint
    setTimeout(() => ProgressView._initWeightChartTouch(), 0);

    // AM vs PM pattern — only show when there are enough timestamped measurements
    if (allMeasurements.length >= 5) {
      const amMeasurements = allMeasurements.filter(m => new Date(m.timestamp).getHours() < 12);
      const pmMeasurements = allMeasurements.filter(m => new Date(m.timestamp).getHours() >= 12);
      if (amMeasurements.length > 0 && pmMeasurements.length > 0) {
        const avg = arr => (arr.reduce((s, m) => s + m.value, 0) / arr.length).toFixed(1);
        const amAvg = avg(amMeasurements);
        const pmAvg = avg(pmMeasurements);
        html += '<h2 class="section-header" style="margin-top:var(--space-md);">Weight by Time of Day</h2>';
        html += '<div class="stats-row">';
        html += `<div class="stat-card"><div class="stat-value">${amAvg}</div><div class="stat-label">AM avg</div></div>`;
        html += `<div class="stat-card"><div class="stat-value">${pmAvg}</div><div class="stat-label">PM avg</div></div>`;
        html += '</div>';
      }
    }

    return html;
  },

  _initWeightChartTouch() {
    const svg = document.getElementById('weight-trend-svg');
    if (!svg) return;

    const points = JSON.parse(svg.dataset.points || '[]');
    if (points.length < 2) return;

    const svgW = parseFloat(svg.dataset.svgw);
    const svgH = parseFloat(svg.dataset.svgh);
    const minW = parseFloat(svg.dataset.minw);
    const maxW = parseFloat(svg.dataset.maxw);
    const range = maxW - minW || 1;

    // Create indicator elements inside the SVG
    const ns = 'http://www.w3.org/2000/svg';

    const indicator = document.createElementNS(ns, 'line');
    indicator.setAttribute('x1', '0');
    indicator.setAttribute('x2', '0');
    indicator.setAttribute('y1', '0');
    indicator.setAttribute('y2', svgH);
    indicator.setAttribute('stroke', 'var(--accent-primary)');
    indicator.setAttribute('stroke-width', '1.5');
    indicator.setAttribute('stroke-dasharray', '3,2');
    indicator.setAttribute('opacity', '0');
    indicator.setAttribute('pointer-events', 'none');
    svg.appendChild(indicator);

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', 'var(--accent-primary)');
    dot.setAttribute('stroke', 'var(--bg-primary)');
    dot.setAttribute('stroke-width', '2');
    dot.setAttribute('opacity', '0');
    dot.setAttribute('pointer-events', 'none');
    svg.appendChild(dot);

    // Tooltip — rendered as a foreign element approach would be complex in SVG;
    // use a regular HTML element absolutely positioned over the chart wrapper
    const wrapper = svg.parentElement;
    wrapper.style.position = 'relative';

    const tooltip = document.createElement('div');
    tooltip.className = 'weight-chart-tooltip';
    tooltip.style.display = 'none';
    wrapper.appendChild(tooltip);

    let hideTimer = null;

    const showPoint = (touch) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;

      // Map touch X to SVG coordinate space
      const touchX = touch.clientX - rect.left;
      const svgX = (touchX / rect.width) * svgW;

      // Find nearest data point by X position
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const px = (i / (points.length - 1)) * svgW;
        const dist = Math.abs(px - svgX);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }

      const pt = points[bestIdx];
      const px = (bestIdx / (points.length - 1)) * svgW;
      const py = svgH - ((pt.weight - minW) / range) * svgH;

      // Position indicator line
      indicator.setAttribute('x1', px);
      indicator.setAttribute('x2', px);
      indicator.setAttribute('opacity', '0.7');

      // Position dot
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', py);
      dot.setAttribute('opacity', '1');

      // Tooltip content
      const dateLabel = new Date(pt.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      tooltip.textContent = `${pt.weight} lbs · ${dateLabel}`;
      tooltip.style.display = 'block';

      // Position tooltip: center on the touch X, keep within wrapper
      const tooltipW = tooltip.offsetWidth || 110;
      const wrapperW = wrapper.offsetWidth || rect.width;
      let tipLeft = touchX - tooltipW / 2;
      tipLeft = Math.max(0, Math.min(wrapperW - tooltipW, tipLeft));
      tooltip.style.left = tipLeft + 'px';

      // Place above the dot if room, else below
      const dotScreenY = (py / svgH) * rect.height;
      tooltip.style.top = dotScreenY > 28 ? (dotScreenY - 28) + 'px' : (dotScreenY + 8) + 'px';
    };

    const hideAll = (delay = 300) => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        indicator.setAttribute('opacity', '0');
        dot.setAttribute('opacity', '0');
        tooltip.style.display = 'none';
        hideTimer = null;
      }, delay);
    };

    let touchStartX = null;
    let touchStartY = null;
    let tracking = false;

    svg.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      tracking = false;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }, { passive: true });

    svg.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);

      // Only activate on primarily horizontal movement
      if (!tracking && dy > dx && dy > 6) return; // vertical scroll — stay out of the way
      if (!tracking && dx > 4) tracking = true;

      if (tracking) {
        e.preventDefault(); // prevent scroll only when we're handling it
        showPoint(e.touches[0]);
      }
    }, { passive: false });

    svg.addEventListener('touchend', () => {
      tracking = false;
      hideAll(300);
    }, { passive: true });

    svg.addEventListener('touchcancel', () => {
      tracking = false;
      hideAll(0);
    }, { passive: true });
  },

  async renderProgressPhotos() {
    // Limit to last 30 days
    const today = UI.today();
    const thirtyDaysAgo = new Date(today + 'T12:00:00');
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const startDate = fmt(thirtyDaysAgo);

    // Load entries and user's subtype config in parallel
    const [entries, rawTypes] = await Promise.all([
      DB.getEntriesByType('bodyPhoto', startDate, today),
      DB.getProfile('bodyPhotoTypes'),
    ]);

    // Determine which subtypes to display (fall back to just 'body')
    const types = rawTypes && rawTypes.length
      ? rawTypes
      : [{ key: 'body', name: 'Body' }];

    // Build map: subtype key → { date → entry } (first entry per date wins)
    const byTypeDate = {};
    for (const t of types) byTypeDate[t.key] = {};

    for (const e of (entries || [])) {
      const key = e.subtype || 'body';
      if (!byTypeDate[key]) byTypeDate[key] = {};  // handle unknown subtypes gracefully
      if (!byTypeDate[key][e.date]) byTypeDate[key][e.date] = e;
    }

    // Only render section when at least one subtype has photos
    const anyPhotos = types.some(t => Object.keys(byTypeDate[t.key] || {}).length > 0);
    if (!anyPhotos) return '';

    let html = '<h2 class="section-header">Progress Photos</h2>';
    html += '<div class="card" style="padding:var(--space-sm) var(--space-md);">';

    const scrollIds = [];

    for (const type of types) {
      const dateMap = byTypeDate[type.key] || {};
      const dates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));

      html += '<div class="progress-photos-subtype">';
      html += `<div class="progress-photos-subtype-label">${UI.escapeHtml(type.name)}</div>`;

      if (dates.length === 0) {
        html += `<div class="progress-photos-empty">No ${UI.escapeHtml(type.name.toLowerCase())} photos yet</div>`;
      } else {
        const scrollId = `pp-scroll-${type.key}`;
        scrollIds.push(scrollId);
        html += `<div class="progress-photos-scroll" id="${scrollId}">`;
        for (const date of dates) {
          const entry = dateMap[date];
          const d = new Date(date + 'T12:00:00');
          const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          html += `<div class="progress-photo-card" data-entry-id="${UI.escapeHtml(entry.id)}" data-date="${date}">
            <div class="progress-photo-thumb entry-photo-locked">
              ${UI.svg.lock}
            </div>
            <div class="progress-photo-label">${label}</div>
          </div>`;
        }
        html += '</div>';
      }

      html += '</div>'; // .progress-photos-subtype
    }

    html += '</div>'; // .card

    // Wire tap-to-reveal for all scroll rows after paint
    setTimeout(() => {
      for (const id of scrollIds) {
        const el = document.getElementById(id);
        if (el) ProgressView._wirePhotoScroll(el);
      }
    }, 0);

    return html;
  },

  // Shared tap-to-reveal wiring for a .progress-photos-scroll element
  _wirePhotoScroll(scrollEl) {
    scrollEl.querySelectorAll('.progress-photo-card').forEach(card => {
      const thumb = card.querySelector('.progress-photo-thumb');
      if (!thumb) return;
      let currentUrl = null;
      let hideTimer = null;
      const hide = () => {
        thumb.classList.remove('revealed');
        thumb.innerHTML = UI.svg.lock;
        thumb.style.backgroundImage = '';
        if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      };
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        if (thumb.classList.contains('revealed')) { hide(); return; }
        const entryId = card.dataset.entryId;
        DB.getPhotos(entryId).then(photos => {
          if (photos.length > 0 && photos[0].blob) {
            currentUrl = URL.createObjectURL(photos[0].blob);
            thumb.innerHTML = '';
            thumb.style.backgroundImage = `url(${currentUrl})`;
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
            thumb.classList.add('revealed');
            hideTimer = setTimeout(() => { if (thumb.classList.contains('revealed')) hide(); }, 5000);
          }
        });
      });
    });
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

  // --- Skin segment ---

  async renderSkin() {
    const routine = await DB.getSkincareRoutine();

    // Empty state: no routine configured
    if (!routine || !routine.weeklyTemplate) {
      return `<div class="card" style="text-align:center; padding:var(--space-lg); color:var(--text-muted);">
        <div style="font-size:var(--text-sm);">Set up your skincare routine on the Coach tab to start tracking.</div>
      </div>`;
    }

    const today = UI.today();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // Build date list for last 14 days (adherence chart)
    const dates14 = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - i);
      dates14.push(fmt(d));
    }

    // Load skincare logs for all 14 days in parallel
    const logs14 = await Promise.all(dates14.map(date => DB.getSkincareLog(date)));

    // Compute adherence per day
    const adherence = dates14.map((date, idx) => {
      const log = logs14[idx];
      if (!log) return { date, pct: null };

      const resolved = window.Skincare ? window.Skincare.resolveRoutineForDate(routine, date) : { am: [], pm: [] };
      const totalItems = (resolved.am || []).length + (resolved.pm || []).length;
      if (totalItems === 0) return { date, pct: null };

      const amChecked = (log.am || []).filter(item => item.checked).length;
      const pmChecked = (log.pm || []).filter(item => item.checked).length;
      const checkedItems = amChecked + pmChecked;
      return { date, pct: Math.round((checkedItems / totalItems) * 100) };
    });

    // Compute streak: consecutive days (ending today or yesterday) with 100% completion
    const streak = ProgressView._computeSkincareStreak(adherence);

    let html = '';

    // 1. Routine Adherence bar chart
    html += ProgressView._renderAdherenceChart(adherence);

    // 2. Skincare Streak
    html += ProgressView._renderSkincareStreak(streak);

    // 3. Face Photo Timeline
    const facePhotosHtml = await ProgressView.renderFacePhotos();
    html += facePhotosHtml;

    // 4. Product Usage (last 30 days)
    html += await ProgressView._renderProductUsage(routine, today);

    if (!html) {
      html = `<div class="card" style="text-align:center; padding:var(--space-lg); color:var(--text-muted);">
        <div style="font-size:var(--text-sm);">Complete your skincare routine to see stats here.</div>
      </div>`;
    }

    return html;
  },

  _computeSkincareStreak(adherence) {
    // Walk backwards from most recent day, count consecutive 100% days
    let streak = 0;
    for (let i = adherence.length - 1; i >= 0; i--) {
      const { pct } = adherence[i];
      if (pct === 100) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  },

  _renderAdherenceChart(adherence) {
    const barWidth = 16;
    const gap = 4;
    const svgWidth = adherence.length * (barWidth + gap);
    const svgHeight = 60;

    let html = '<h2 class="section-header">14-Day Adherence</h2><div class="card">';
    html += '<div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">';
    html += `<svg viewBox="0 0 ${svgWidth} ${svgHeight + 20}" width="${svgWidth}" height="${svgHeight + 20}" style="display:block;">`;

    for (let i = 0; i < adherence.length; i++) {
      const { date, pct } = adherence[i];
      const x = i * (barWidth + gap);
      const dayNum = new Date(date + 'T12:00:00').getDate();

      if (pct !== null) {
        const barH = Math.max(3, (pct / 100) * svgHeight);
        const y = svgHeight - barH;
        let color;
        if (pct > 80) color = 'var(--accent-green)';
        else if (pct >= 40) color = 'var(--accent-orange)';
        else color = 'var(--accent-red)';

        html += `<rect x="${x}" y="${y.toFixed(1)}" width="${barWidth}" height="${barH.toFixed(1)}" rx="3" fill="${color}" opacity="0.85"/>`;
        if (pct > 0) {
          html += `<text x="${x + barWidth / 2}" y="${(y - 3).toFixed(1)}" text-anchor="middle" fill="var(--text-primary)" font-size="8" font-family="var(--font-sans)">${pct}%</text>`;
        }
      } else {
        // No data — grey stub
        html += `<rect x="${x}" y="${svgHeight - 4}" width="${barWidth}" height="4" rx="2" fill="var(--border-color)" opacity="0.4"/>`;
      }

      html += `<text x="${x + barWidth / 2}" y="${svgHeight + 14}" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-family="var(--font-sans)">${dayNum}</text>`;
    }

    html += '</svg></div>';

    // Legend
    html += `<div style="display:flex; gap:var(--space-md); margin-top:var(--space-sm); font-size:var(--text-xs); color:var(--text-muted); flex-wrap:wrap;">
      <span style="color:var(--accent-green);">&#9632; &gt;80%</span>
      <span style="color:var(--accent-orange);">&#9632; 40-80%</span>
      <span style="color:var(--accent-red);">&#9632; &lt;40%</span>
    </div>`;

    html += '</div>';
    return html;
  },

  _renderSkincareStreak(streak) {
    let html = '<h2 class="section-header">Streak</h2><div class="card" style="text-align:center; padding:var(--space-md);">';
    if (streak > 0) {
      html += `<div style="font-size:var(--text-xl); font-weight:700; margin-bottom:4px;">&#128293; ${streak} day${streak !== 1 ? 's' : ''}</div>`;
      html += `<div style="font-size:var(--text-xs); color:var(--text-muted);">consecutive days with full AM+PM routine</div>`;
    } else {
      html += `<div style="font-size:var(--text-sm); color:var(--text-muted);">Start your streak by completing today's routine</div>`;
    }
    html += '</div>';
    return html;
  },

  async renderFacePhotos() {
    // Like renderProgressPhotos() but filtered to subtype 'face'
    const today = UI.today();
    const thirtyDaysAgo = new Date(today + 'T12:00:00');
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const startDate = fmt(thirtyDaysAgo);

    const entries = await DB.getEntriesByType('bodyPhoto', startDate, today);
    if (!entries || entries.length === 0) return '';

    // Filter to face subtype only
    const faceEntries = entries.filter(e => e.subtype === 'face');
    if (faceEntries.length === 0) return '';

    // Group by date — one photo per date, newest-first
    const byDate = {};
    for (const e of faceEntries) {
      if (!byDate[e.date]) byDate[e.date] = e;
    }
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) return '';

    let html = '<h2 class="section-header">Face Photos</h2>';
    html += '<div class="progress-photos-scroll" id="face-photos-scroll">';

    for (const date of dates) {
      const entry = byDate[date];
      const d = new Date(date + 'T12:00:00');
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      html += `<div class="progress-photo-card" data-entry-id="${UI.escapeHtml(entry.id)}" data-date="${date}">
        <div class="progress-photo-thumb entry-photo-locked">
          ${UI.svg.lock}
        </div>
        <div class="progress-photo-label">${label}</div>
      </div>`;
    }

    html += '</div>';

    // Wire up tap-to-reveal after DOM is painted
    setTimeout(() => {
      const scroll = document.getElementById('face-photos-scroll');
      if (scroll) ProgressView._wirePhotoScroll(scroll);
    }, 0);

    return html;
  },

  async _renderProductUsage(routine, today) {
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // Collect last 30 days of logs
    const dates30 = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - i);
      dates30.push(fmt(d));
    }

    const logs = await Promise.all(dates30.map(date => DB.getSkincareLog(date)));

    // Build product name lookup from routine
    const products = routine.products || [];
    const nameMap = {};
    for (const p of products) {
      nameMap[p.key] = p.name || p.key;
    }

    // Count checked usage per product key
    const usageCounts = {};
    for (const log of logs) {
      if (!log) continue;
      for (const item of (log.am || [])) {
        if (item.checked && item.key) {
          usageCounts[item.key] = (usageCounts[item.key] || 0) + 1;
        }
      }
      for (const item of (log.pm || [])) {
        if (item.checked && item.key) {
          usageCounts[item.key] = (usageCounts[item.key] || 0) + 1;
        }
      }
    }

    const entries = Object.entries(usageCounts);
    if (entries.length === 0) return '';

    // Sort by count descending, take top 5
    entries.sort((a, b) => b[1] - a[1]);
    const top5 = entries.slice(0, 5);

    let html = '<h2 class="section-header">Top Products (30 days)</h2><div class="card">';
    for (let i = 0; i < top5.length; i++) {
      const [key, count] = top5[i];
      const name = nameMap[key] || key;
      const isLast = i === top5.length - 1;
      html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0;${!isLast ? ' border-bottom:1px solid var(--border-color);' : ''}">
        <span style="font-size:var(--text-sm);">${UI.escapeHtml(name)}</span>
        <span style="font-size:var(--text-xs); color:var(--text-muted);">${count}x</span>
      </div>`;
    }
    html += '</div>';
    return html;
  },
};
