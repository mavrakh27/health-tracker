// goals.js — Analysis rendering utilities (shared by app.js, profile views)

const GoalsView = {
  // Normalize analysis data to a consistent shape for rendering.
  // Handles both the old schema (a.calories.intake, a.macros.protein.grams) and
  // the actual processing schema (a.totals.calories, a.goals.calories.target).
  // profileGoals (optional): user's current profile goals — overrides stale analysis targets.
  _normalizeAnalysis(a, profileGoals) {
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

    // Override with current profile goals (analysis may have stale targets)
    if (profileGoals) {
      if (profileGoals.calories) calGoal = profileGoals.calories;
      if (profileGoals.protein && macros.protein) macros.protein.goal = profileGoals.protein;
      if (profileGoals.water_oz) waterGoal = profileGoals.water_oz;
    }

    return { calIntake, calGoal, calBurned, calNet, macros, waterActual, waterGoal };
  },

  renderRemainingBudget(analysis, profileGoals) {
    const n = GoalsView._normalizeAnalysis(analysis, profileGoals);
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

  renderDayLog(analysis) {
    if (!analysis.entries || analysis.entries.length === 0) return '';

    let html = '<h2 class="section-header">What You Ate</h2><div class="card">';

    for (const entry of analysis.entries) {
      if (entry.type === 'bodyPhoto') continue;
      const cal = entry.type === 'workout' ? `${entry.calories_burned || (entry.calories ? Math.abs(entry.calories) : '?')} cal burned` :
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

  renderAnalysisSummary(a, profileGoals) {
    const dateLabel = a.date ? UI.formatDate(a.date) : 'Daily Summary';
    let html = `<h2 class="section-header">${UI.escapeHtml(dateLabel)} Analysis</h2>`;
    const n = GoalsView._normalizeAnalysis(a, profileGoals);

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
        const hasGoal = m.goal && m.goal > 0;
        const pct = hasGoal ? Math.min(100, Math.round((m.actual / m.goal) * 100)) : 0;
        const color = hasGoal && m.actual >= m.goal * 0.85 ? 'var(--accent-green)' : 'var(--accent-orange)';
        html += `
          <div style="margin-bottom: var(--space-sm);">
            <div style="display:flex; justify-content:space-between; font-size:var(--text-sm);">
              <span style="text-transform:capitalize;">${name}</span>
              <span style="color:var(--text-secondary)">${m.actual}g${hasGoal ? ' / ' + m.goal + 'g' : ''}</span>
            </div>
            ${hasGoal ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${color}"></div></div>` : ''}
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

    // Entry breakdown (per-item calories)
    if (a.entries?.length) {
      html += '<div class="card" style="margin-top: var(--space-sm);">';
      html += '<div style="font-weight:600; margin-bottom:var(--space-xs);">Breakdown</div>';
      for (const entry of a.entries) {
        if (entry.type === 'bodyPhoto') continue;
        const isWorkout = entry.type === 'workout';
        const calText = isWorkout ? `${entry.calories_burned || (entry.calories ? Math.abs(entry.calories) : '?')} burned` : `${entry.calories || 0} cal`;
        const proteinText = !isWorkout && entry.protein ? ` \u00B7 ${entry.protein}g P` : '';
        const icon = isWorkout ? '\u{1F3CB}' : (entry.type === 'drink' ? '\u{1F375}' : '\u{1F374}');
        const desc = entry.description || entry.notes || entry.type;
        html += `
          <div style="padding:6px 0; border-bottom:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
              <span style="font-size:var(--text-sm); font-weight:500;">${icon} ${calText}${proteinText}</span>
            </div>
            <div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:2px;">${UI.escapeHtml(desc)}</div>
          </div>
        `;
      }
      if (a.totals) {
        html += `<div style="display:flex; justify-content:space-between; padding-top:var(--space-xs); font-weight:600; font-size:var(--text-xs);">
          <span>Total</span><span>${a.totals.calories} cal \u00B7 ${a.totals.protein}g P</span>
        </div>`;
      }
      html += '</div>';
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
};
