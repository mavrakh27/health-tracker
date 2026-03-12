// goals.js — Goals, streaks, meal plan, workout plan display

const GoalsView = {
  _activeTab: 'diet',

  async init() {
    const container = document.getElementById('goals-container');
    if (!container) return;

    const date = App.selectedDate;
    const isToday = date === UI.today();
    let analysis = await DB.getAnalysis(date);

    // Fall back to yesterday's analysis if none for selected date
    let analysisLabel = '';
    if (!analysis) {
      const prev = new Date(date + 'T12:00:00');
      prev.setDate(prev.getDate() - 1);
      const prevDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
      analysis = await DB.getAnalysis(prevDate);
      if (analysis) analysisLabel = UI.formatRelativeDate(prevDate);
    }

    const mealPlan = await DB.getMealPlan();
    const regimen = await DB.getRegimen();

    let html = '';

    if (isToday) {
      // --- TODAY: Segment control ---
      const activeTab = GoalsView._activeTab || 'diet';
      html += `
        <div class="segment-control">
          <button class="segment-btn${activeTab === 'diet' ? ' active' : ''}" data-tab="diet">Diet</button>
          <button class="segment-btn${activeTab === 'fitness' ? ' active' : ''}" data-tab="fitness">Fitness</button>
          <button class="segment-btn${activeTab === 'journey' ? ' active' : ''}" data-tab="journey">Journey</button>
        </div>
      `;

      if (activeTab === 'diet') {
        // Remaining budget
        if (analysis) {
          html += GoalsView.renderRemainingBudget(analysis);
        }

        // Today's meal plan (what to eat next)
        if (mealPlan && mealPlan.days) {
          const todayPlan = mealPlan.days.find(d => d.date === date);
          if (todayPlan) {
            html += GoalsView.renderTodayPlan(todayPlan);
          } else {
            html += GoalsView.renderMealPlan(mealPlan);
          }
        }

        // Streaks
        if (analysis && analysis.streaks) {
          html += GoalsView.renderStreaks(analysis.streaks);
        }
      } else if (activeTab === 'fitness') {
        // Fitness tab — interactive workout checklist
        if (regimen) {
          html += await Fitness.render(regimen, date);
        } else {
          html += '<div class="card" style="text-align:center; padding:var(--space-lg);"><p style="color:var(--text-muted);">No workout plan yet. Sync to get your regimen.</p></div>';
        }
      } else if (activeTab === 'journey') {
        html += await GoalsView.renderJourney();
      }
    } else {
      // --- PAST DAYS: Summary log view ---
      if (analysis) {
        if (analysisLabel) {
          html += `<div style="font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-xs);">Showing analysis from ${analysisLabel}</div>`;
        }
        html += GoalsView.renderDayLog(analysis);
        html += GoalsView.renderAnalysisSummary(analysis);
      } else {
        html += `
          <div class="card" style="text-align:center; padding: var(--space-lg);">
            <p style="color: var(--text-muted); font-size: var(--text-sm);">No analysis for ${UI.formatRelativeDate(date)}.</p>
            <p style="color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--space-xs);">Log food and sync to get your analysis.</p>
          </div>
        `;
      }

      if (analysis && analysis.streaks) {
        html += GoalsView.renderStreaks(analysis.streaks);
      }
    }

    container.innerHTML = html;

    // Segment control switching
    container.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        GoalsView._activeTab = btn.dataset.tab;
        GoalsView.init();
      });
    });

    // Bind fitness events if on fitness tab
    if (isToday && GoalsView._activeTab === 'fitness') {
      Fitness.bindEvents(date);
    }
  },

  // --- Today: forward-looking views ---

  renderRemainingBudget(analysis) {
    const n = GoalsView._normalizeAnalysis(analysis);
    let html = '<h2 class="section-header">Remaining Today</h2><div class="card">';

    if (n.calIntake != null && n.calGoal) {
      const remaining = n.calGoal - n.calIntake;
      const pct = Math.min(100, Math.round((n.calIntake / n.calGoal) * 100));
      const color = remaining > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      html += `
        <div style="display:flex; justify-content:space-between; margin-bottom: var(--space-xs);">
          <span style="font-weight:600;">Calories</span>
          <span style="color:var(--text-secondary)">${remaining > 0 ? remaining + ' remaining' : Math.abs(remaining) + ' over'}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${color}"></div></div>
        <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">${n.calIntake} eaten of ${n.calGoal}</div>
      `;
    }

    // Macro remaining
    if (Object.keys(n.macros).length > 0) {
      html += '<div style="margin-top: var(--space-sm);">';
      for (const [name, m] of Object.entries(n.macros)) {
        if (!m.goal) continue;
        const remaining = m.goal - m.actual;
        html += `
          <div style="display:flex; justify-content:space-between; font-size:var(--text-sm); margin-bottom:4px;">
            <span style="text-transform:capitalize;">${name}</span>
            <span style="color:var(--text-secondary)">${remaining > 0 ? remaining + 'g left' : 'goal hit!'}</span>
          </div>
        `;
      }
      html += '</div>';
    }

    // Water remaining
    if (n.waterActual != null && n.waterGoal) {
      const remaining = n.waterGoal - n.waterActual;
      html += `
        <div style="display:flex; justify-content:space-between; font-size:var(--text-sm); margin-top:var(--space-sm);">
          <span>Water</span>
          <span style="color:var(--text-secondary)">${remaining > 0 ? remaining + ' oz left' : 'goal hit!'}</span>
        </div>
      `;
    }

    html += '</div>';

    // Forward-looking tips for rest of the day
    if (analysis.concerns?.length) {
      html += '<h2 class="section-header">Rest of Your Day</h2><div class="card">';
      for (const c of analysis.concerns) {
        html += `<div style="font-size:var(--text-sm); color:var(--text-secondary); margin-bottom:6px;">${UI.escapeHtml(c)}</div>`;
      }
      html += '</div>';
    }

    return html;
  },

  renderTodayPlan(todayPlan) {
    let html = '<h2 class="section-header">What to Eat</h2>';

    if (todayPlan.remaining_meal) {
      const rm = todayPlan.remaining_meal;
      html += `<div class="card" style="margin-bottom: var(--space-sm); border-left: 3px solid var(--accent-green);">
        <div style="font-weight:600; margin-bottom:4px;">${UI.escapeHtml(rm.name || 'Next Meal')}</div>
        ${rm.suggestion ? `<div style="font-size:var(--text-sm); color:var(--text-muted); margin-bottom:var(--space-xs);">${UI.escapeHtml(rm.suggestion)}</div>` : ''}
        <div style="font-size:var(--text-xs); color:var(--text-secondary);">${rm.calories || '?'} cal \u00B7 ${rm.protein || '?'}g protein</div>
      </div>`;
    }

    if (todayPlan.meals) {
      for (const meal of todayPlan.meals) {
        const mealLabel = meal.type || meal.meal || '';
        const isOption = mealLabel.toLowerCase().startsWith('option');
        const mealName = UI.escapeHtml(meal.suggestion || meal.name || meal.description || '');
        html += `
          <div class="card" style="margin-bottom:var(--space-sm);">
            ${isOption ? `<div style="font-size:var(--text-xs); color:var(--accent-green); text-transform:uppercase; font-weight:600; margin-bottom:4px;">${UI.escapeHtml(mealLabel)}</div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
              <span style="font-weight:500;">${mealName}</span>
              <span style="font-size:var(--text-xs); color:var(--text-muted); white-space:nowrap; margin-left:var(--space-sm);">${meal.calories || '?'} cal</span>
            </div>
            ${meal.description ? `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-xs);">${UI.escapeHtml(meal.description)}</div>` : ''}
            <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:2px;">${meal.protein || 0}g protein \u00B7 ${meal.prep_time || ''}</div>
          </div>
        `;
      }
      if (todayPlan.day_totals && todayPlan.day_totals.calories) {
        html += `<div style="font-size:var(--text-xs); color:var(--text-muted);">Day total: ~${todayPlan.day_totals.calories} cal, ~${todayPlan.day_totals.protein}g protein</div>`;
      }
    }

    return html;
  },

  renderTodayWorkout(regimen, date) {
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const todayPlan = regimen.weeklySchedule?.find(d => d.day === dayName);
    if (!todayPlan) return '';

    let html = `<h2 class="section-header">Today's Workout</h2>`;
    html += `<div class="card">`;

    const typeLabel = todayPlan.type || '';
    html += `<div style="display:flex; justify-content:space-between; margin-bottom:var(--space-xs);">
      <span style="font-weight:600; text-transform:capitalize;">${dayName}</span>
      <span style="font-size:var(--text-xs); color:var(--accent-green); text-transform:uppercase;">${UI.escapeHtml(typeLabel)}</span>
    </div>`;

    // Split description on | for readability
    const parts = todayPlan.description.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        html += `<div style="font-size:var(--text-sm); padding:3px 0; ${part.startsWith('Core:') || part.startsWith('Core ') ? 'margin-top:var(--space-xs); border-top:1px solid var(--border-color); padding-top:var(--space-xs);' : ''}">${UI.escapeHtml(part)}</div>`;
      }
    } else {
      html += `<div style="font-size:var(--text-sm);">${UI.escapeHtml(todayPlan.description)}</div>`;
    }

    html += '</div>';

    // Weekly review note if present
    if (regimen.weeklyReview) {
      html += `<div class="card" style="margin-top:var(--space-sm);">
        <div style="font-size:var(--text-xs); color:var(--text-muted);">${UI.escapeHtml(regimen.weeklyReview)}</div>
      </div>`;
    }

    return html;
  },

  // --- Past days: summary log view ---

  renderDayLog(analysis) {
    if (!analysis.entries || analysis.entries.length === 0) return '';

    let html = '<h2 class="section-header">What You Ate</h2><div class="card">';

    for (const entry of analysis.entries) {
      if (entry.type === 'bodyPhoto') continue;
      const cal = entry.type === 'workout' ? `${entry.calories_burned || '?'} cal burned` :
                  `${entry.calories || 0} cal`;
      const protein = entry.type !== 'workout' && entry.protein ? ` \u00B7 ${entry.protein}g protein` : '';

      html += `
        <div style="padding:var(--space-xs) 0; border-bottom:1px solid var(--border-color);">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <span style="font-size:var(--text-sm);">${UI.escapeHtml(entry.description || entry.notes || entry.type)}</span>
          </div>
          <div style="font-size:var(--text-xs); color:var(--text-muted);">${cal}${protein}${entry.confidence ? ' \u00B7 ' + entry.confidence + ' confidence' : ''}</div>
        </div>
      `;
    }

    // Totals row
    if (analysis.totals) {
      const t = analysis.totals;
      html += `
        <div style="padding-top:var(--space-sm); font-weight:600; font-size:var(--text-sm); display:flex; justify-content:space-between;">
          <span>Total</span>
          <span>${t.calories} cal \u00B7 ${t.protein}g protein \u00B7 ${t.carbs}g carbs \u00B7 ${t.fat}g fat</span>
        </div>
      `;
    }

    html += '</div>';

    // Highlights
    if (analysis.highlights?.length) {
      html += '<div class="card" style="margin-top: var(--space-sm);">';
      for (const h of analysis.highlights) {
        html += `<div style="font-size:var(--text-sm); color:var(--accent-green); margin-bottom:4px;">${UI.escapeHtml(h)}</div>`;
      }
      html += '</div>';
    }

    return html;
  },

  // Normalize analysis data to a consistent shape for rendering.
  // Handles both the old schema (a.calories.intake, a.macros.protein.grams) and
  // the actual processing schema (a.totals.calories, a.goals.calories.target).
  _normalizeAnalysis(a) {
    let calIntake = null, calGoal = null, calBurned = null, calNet = null;
    const macros = {}; // { protein: { actual, goal }, carbs: {...}, fat: {...} }
    let waterActual = null, waterGoal = null;

    // Calories
    if (a.calories) {
      calIntake = a.calories.intake; calGoal = a.calories.goal;
      calBurned = a.calories.burned; calNet = a.calories.net;
    } else if (a.totals && a.goals?.calories) {
      calIntake = a.totals.calories; calGoal = a.goals.calories.target;
    }

    // Macros
    if (a.macros) {
      for (const [name, m] of Object.entries(a.macros)) {
        macros[name] = { actual: m.grams, goal: m.goal };
      }
    } else if (a.totals) {
      for (const name of ['protein', 'carbs', 'fat']) {
        if (a.totals[name] != null) {
          macros[name] = {
            actual: a.totals[name],
            goal: a.goals?.[name]?.target || null,
          };
        }
      }
    }

    // Water
    if (a.water) {
      waterActual = a.water.total_oz; waterGoal = a.water.goal_oz;
    } else if (a.goals?.water) {
      waterActual = a.goals.water.actual_oz; waterGoal = a.goals.water.target_oz;
    }

    return { calIntake, calGoal, calBurned, calNet, macros, waterActual, waterGoal };
  },

  renderAnalysisSummary(a) {
    let html = '<h2 class="section-header">Daily Summary</h2>';
    const n = GoalsView._normalizeAnalysis(a);

    // Calorie bar
    if (n.calIntake != null) {
      const pct = n.calGoal ? Math.min(100, Math.round((n.calIntake / n.calGoal) * 100)) : 0;
      const overUnder = n.calGoal ? n.calIntake - n.calGoal : 0;
      const color = n.calGoal && Math.abs(overUnder) <= n.calGoal * 0.1 ? 'var(--accent-green)' :
                    overUnder > 0 ? 'var(--accent-red)' : 'var(--accent-orange)';

      html += `
        <div class="card">
          <div style="display:flex; justify-content:space-between; margin-bottom: var(--space-xs);">
            <span style="font-weight:600;">Calories</span>
            <span style="color:var(--text-secondary)">${n.calIntake} / ${n.calGoal || '?'}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${color}"></div></div>
          ${n.calBurned ? `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-xs);">Burned: ${n.calBurned} | Net: ${n.calNet}</div>` : ''}
        </div>
      `;
    }

    // Macro bars
    if (Object.keys(n.macros).length > 0) {
      html += '<div class="card" style="margin-top: var(--space-sm);">';
      for (const [name, m] of Object.entries(n.macros)) {
        const pct = m.goal ? Math.min(100, Math.round((m.actual / m.goal) * 100)) : 0;
        const color = m.goal && m.actual >= m.goal * 0.85 ? 'var(--accent-green)' : 'var(--accent-orange)';
        html += `
          <div style="margin-bottom: var(--space-sm);">
            <div style="display:flex; justify-content:space-between; font-size:var(--text-sm);">
              <span style="text-transform:capitalize;">${name}</span>
              <span style="color:var(--text-secondary)">${m.actual}g / ${m.goal || '?'}g</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${color}"></div></div>
          </div>
        `;
      }
      html += '</div>';
    }

    // Water
    if (n.waterActual != null && n.waterGoal) {
      const pct = Math.min(100, Math.round((n.waterActual / n.waterGoal) * 100));
      const color = n.waterActual >= n.waterGoal ? 'var(--accent-blue)' : 'var(--accent-orange)';
      html += `
        <div class="card" style="margin-top: var(--space-sm);">
          <div style="display:flex; justify-content:space-between; margin-bottom: var(--space-xs);">
            <span style="font-weight:600;">Water</span>
            <span style="color:var(--text-secondary)">${n.waterActual} / ${n.waterGoal} oz</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${color}"></div></div>
        </div>
      `;
    }

    // Highlights & Concerns
    if (a.highlights?.length || a.concerns?.length) {
      html += '<div class="card" style="margin-top: var(--space-sm);">';
      if (a.highlights?.length) {
        html += `<div style="margin-bottom: var(--space-sm);">`;
        for (const h of a.highlights) {
          html += `<div style="font-size:var(--text-sm); color:var(--accent-green); margin-bottom:2px;">\u2713 ${UI.escapeHtml(h)}</div>`;
        }
        html += '</div>';
      }
      if (a.concerns?.length) {
        for (const c of a.concerns) {
          html += `<div style="font-size:var(--text-sm); color:var(--accent-orange); margin-bottom:2px;">\u26A0 ${UI.escapeHtml(c)}</div>`;
        }
      }
      html += '</div>';
    }

    return html;
  },

  renderStreaks(streaks) {
    let html = '<h2 class="section-header">Streaks</h2><div class="stats-row">';
    const streakIcons = {
      logging: '\u{1F4CB}', tracking: '\u{1F4CB}',
      waterGoal: '\u{1F4A7}', water_goal: '\u{1F4A7}',
      workout: '\u{1F4AA}',
      proteinGoal: '\u{1F356}', protein_goal: '\u{1F356}',
      calorie_goal: '\u{1F525}',
    };
    const streakLabels = {
      logging: 'Logging', tracking: 'Logging',
      waterGoal: 'Water Goal', water_goal: 'Water Goal',
      workout: 'Workout',
      proteinGoal: 'Protein Goal', protein_goal: 'Protein Goal',
      calorie_goal: 'Calorie Goal',
    };

    for (const [key, val] of Object.entries(streaks)) {
      const icon = streakIcons[key] || '\u{1F525}';
      const label = streakLabels[key] || key;
      html += `
        <div class="stat-card">
          <div style="font-size:var(--text-xl);">${icon}</div>
          <div class="stat-value">${val}</div>
          <div class="stat-label">${label}</div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  },

  async renderJourney() {
    const goals = await DB.getProfile('goals') || {};
    const activePlan = goals.activePlan || 'moderate';

    // Timeline dates from goals profile
    const timeline = goals.timeline || {};
    const startDate = timeline.start || '2026-03-10';
    const endDate = activePlan === 'hardcore' ? (timeline.hardcore_end || '2026-05-15') : (timeline.moderate_end || '2026-06-30');
    const today = UI.today();

    // Load all analyses from start to today
    const analyses = await DB.getAnalysisRange(startDate, today);

    // Calculate timeline progress
    const startMs = new Date(startDate + 'T12:00:00').getTime();
    const endMs = new Date(endDate + 'T12:00:00').getTime();
    const todayMs = new Date(today + 'T12:00:00').getTime();
    const totalDays = Math.round((endMs - startMs) / 86400000);
    const elapsedDays = Math.round((todayMs - startMs) / 86400000);
    const pctComplete = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    let html = '';

    // --- Timeline bar ---
    html += `<h2 class="section-header">Your Journey</h2>`;
    html += `<div class="card">`;
    html += `<div style="display:flex; justify-content:space-between; font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-xs);">
      <span>${UI.formatDate(startDate)}</span>
      <span style="color:var(--accent-green);">Day ${elapsedDays} of ${totalDays}</span>
      <span>${UI.formatDate(endDate)}</span>
    </div>`;
    html += `<div class="progress-bar" style="height:8px; position:relative;">
      <div class="progress-fill" style="width:${pctComplete}%; background: linear-gradient(90deg, var(--accent-blue), var(--accent-green));"></div>
    </div>`;
    html += `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-xs); text-align:center;">
      ${timeline.goal || 'Visible abs'} — ${activePlan} plan — ${timeline.phase || ''}
    </div>`;
    html += `</div>`;

    // --- Score sparkline (last 14 days or all available) ---
    if (analyses.length > 0) {
      html += `<h2 class="section-header">Daily Scores</h2>`;
      html += `<div class="card">`;

      // Build day-by-day data from start to today
      const dayData = [];
      const analysisMap = {};
      for (const a of analyses) analysisMap[a.date] = a;

      const cursor = new Date(startDate + 'T12:00:00');
      const todayDate = new Date(today + 'T12:00:00');
      while (cursor <= todayDate) {
        const ds = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        const a = analysisMap[ds];
        const score = a?.dayScore?.[activePlan]?.score ?? null;
        dayData.push({ date: ds, score, hasData: !!a });
        cursor.setDate(cursor.getDate() + 1);
      }

      // SVG sparkline bars
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

        // Bar
        html += `<rect x="${x}" y="${d.score != null ? y : svgHeight - 4}" width="${barWidth}" height="${d.score != null ? barH : 4}" rx="3" fill="${color}" opacity="${d.score != null ? 0.85 : 0.3}"/>`;

        // Score text above bar
        if (d.score != null) {
          html += `<text x="${x + barWidth / 2}" y="${y - 3}" text-anchor="middle" fill="#ececec" font-size="9" font-family="var(--font-sans)">${d.score}</text>`;
        }

        // Day label below
        const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });
        html += `<text x="${x + barWidth / 2}" y="${svgHeight + 14}" text-anchor="middle" fill="#5a5a5d" font-size="9" font-family="var(--font-sans)">${dayLabel}</text>`;
      }

      html += `</svg></div>`;

      // Average score
      const scored = dayData.filter(d => d.score != null);
      if (scored.length > 0) {
        const avg = Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length);
        html += `<div style="display:flex; justify-content:center; gap:var(--space-lg); margin-top:var(--space-sm); font-size:var(--text-sm);">
          <span>Avg: <strong style="color:${avg >= 75 ? 'var(--accent-green)' : avg >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${avg}</strong></span>
          <span style="color:var(--text-muted);">${scored.length} day${scored.length > 1 ? 's' : ''} tracked</span>
        </div>`;
      }

      html += `</div>`;

      // --- Weekly averages ---
      const avgCal = Math.round(analyses.reduce((s, a) => s + (a.totals?.calories || 0), 0) / analyses.length);
      const avgPro = Math.round(analyses.reduce((s, a) => s + (a.totals?.protein || 0), 0) / analyses.length);
      const workoutDays = analyses.filter(a => a.fitness?.completed?.length > 0 || a.dayScore?.[activePlan]?.breakdown?.workout >= 20).length;
      const waterHit = analyses.filter(a => a.goals?.water?.status === 'met').length;

      html += `<h2 class="section-header">Averages</h2>`;
      html += `<div class="stats-row">`;
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
      html += `</div>`;
    } else {
      html += `<div class="card" style="text-align:center; padding:var(--space-lg);">
        <p style="color:var(--text-muted);">Track a few days and your progress will show here.</p>
      </div>`;
    }

    // --- Daily rhythm visual ---
    html += `<h2 class="section-header">Your Day</h2>`;
    html += `<div class="card">`;

    const rhythmItems = [
      { time: 'Morning', icon: '\u2615', label: 'Collagen + fiber', detail: '70 cal, 18g protein', color: 'var(--accent-purple)' },
      { time: 'Midday', icon: '\u{1F372}', label: 'Office: cafeteria / WFH: sipping broth', detail: 'Protein + greens, skip carbs', color: 'var(--accent-blue)' },
      { time: 'Afternoon', icon: '\u{1F4AA}', label: 'Workout (if scheduled)', detail: 'Strength, cardio, or dance class', color: 'var(--accent-orange)' },
      { time: 'Evening', icon: '\u{1F363}', label: 'Dinner: ribeye / sashimi / pho / bun bowl', detail: 'No carbs, high protein, low sodium', color: 'var(--accent-green)' },
      { time: 'Daily', icon: '\u{1F9D8}', label: 'Splits stretching (15-20 min)', detail: 'Best after workout when warm. Front + middle splits progression.', color: 'var(--accent-cyan)' },
      { time: 'Anytime', icon: '\u{1F95C}', label: 'Snack buffer: ~150-200 cal', detail: 'Almonds, edamame, coconut water', color: 'var(--text-muted)' },
    ];

    for (let i = 0; i < rhythmItems.length; i++) {
      const r = rhythmItems[i];
      const isLast = i === rhythmItems.length - 1;
      html += `<div style="display:flex; gap:var(--space-sm); ${!isLast ? 'margin-bottom:var(--space-sm); padding-bottom:var(--space-sm); border-bottom:1px solid var(--border-color);' : ''}">
        <div style="font-size:var(--text-lg); width:28px; text-align:center;">${r.icon}</div>
        <div style="flex:1;">
          <div style="font-size:var(--text-xs); color:${r.color}; text-transform:uppercase; font-weight:600;">${r.time}</div>
          <div style="font-size:var(--text-sm);">${r.label}</div>
          <div style="font-size:var(--text-xs); color:var(--text-muted);">${r.detail}</div>
        </div>
      </div>`;
    }

    html += `</div>`;

    return html;
  },

  renderMealPlan(plan) {
    let html = '<h2 class="section-header">Meal Plan</h2>';
    const genDate = plan.generatedDate || plan.generated;
    html += genDate ? `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-sm);">Generated ${UI.formatDate(genDate)}</div>` : '';

    for (const day of plan.days) {
      html += `<div class="card" style="margin-bottom: var(--space-sm);">`;
      html += `<div style="font-weight:600; margin-bottom:var(--space-sm);">${UI.formatDate(day.date)}</div>`;

      // Handle remaining_meal (single suggestion for current day)
      if (day.remaining_meal && !day.meals) {
        const rm = day.remaining_meal;
        html += `
          <div style="font-size:var(--text-sm); padding: 4px 0;">
            <div style="font-weight:500; margin-bottom:2px;">${UI.escapeHtml(rm.name || rm.suggestion || 'Suggestion')}</div>
            ${rm.note ? `<div style="color:var(--text-muted); font-size:var(--text-xs); margin-bottom:4px;">${UI.escapeHtml(rm.note)}</div>` : ''}
            <span style="color:var(--text-muted);">${rm.calories || rm.approxCalories || '?'} cal, ${rm.protein || '?'}g protein</span>
          </div>
        `;
      }

      // Handle meals array
      if (day.meals) {
        for (const meal of day.meals) {
          const mealType = UI.escapeHtml(meal.type || meal.meal || '');
          const mealName = UI.escapeHtml(meal.suggestion || meal.name || meal.description || '');
          const mealCal = meal.approxCalories || meal.calories || '?';
          html += `
            <div style="display:flex; justify-content:space-between; font-size:var(--text-sm); margin-bottom:var(--space-xs); padding: 4px 0; border-bottom: 1px solid var(--border-color);">
              <div>
                <span style="color:var(--text-muted); text-transform:capitalize; width:70px; display:inline-block;">${mealType}</span>
                ${mealName}
              </div>
              <span style="color:var(--text-muted); white-space:nowrap; margin-left:var(--space-sm);">${mealCal}cal</span>
            </div>
          `;
        }
      }

      const totalCal = day.totalCalories || day.day_totals?.calories || '';
      const totalPro = day.totalProtein || day.day_totals?.protein || '';
      if (totalCal || totalPro) {
        html += `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-xs);">Total: ~${totalCal} cal, ~${totalPro}g protein</div>`;
      }
      html += '</div>';
    }

    return html;
  },

  renderRegimen(regimen) {
    let html = '<h2 class="section-header">Workout Plan</h2>';

    if (regimen.description) {
      html += `<div class="card" style="margin-bottom: var(--space-sm);"><p style="font-size:var(--text-sm); color:var(--text-secondary);">${regimen.description}</p></div>`;
    }

    if (regimen.weeklySchedule) {
      html += '<div class="card">';
      const selectedDay = new Date(App.selectedDate + 'T12:00:00');
      const today = selectedDay.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      for (const day of regimen.weeklySchedule) {
        const isToday = day.day === today;
        html += `
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-color); ${isToday ? 'font-weight:600;' : ''}">
            <span style="text-transform:capitalize; width:90px; ${isToday ? 'color:var(--accent-green);' : ''}">${day.day}</span>
            <span style="color:var(--text-secondary); text-transform:capitalize;">${day.type}</span>
            <span style="font-size:var(--text-sm); color:var(--text-muted); flex:1; text-align:right;">${day.description}</span>
          </div>
        `;
      }
      html += '</div>';
    }

    if (regimen.weeklyReview) {
      html += `<div class="card" style="margin-top: var(--space-sm);">
        <div style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-xs);">Weekly Review</div>
        <p style="font-size:var(--text-sm);">${regimen.weeklyReview}</p>
      </div>`;
    }

    return html;
  },
};
