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
      } else {
        // Fitness tab — interactive workout checklist
        if (regimen) {
          html += await Fitness.render(regimen, date);
        } else {
          html += '<div class="card" style="text-align:center; padding:var(--space-lg);"><p style="color:var(--text-muted);">No workout plan yet. Sync to get your regimen.</p></div>';
        }
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

    // Highlights/concerns as forward-looking tips
    if (analysis.concerns?.length) {
      html += '<div class="card" style="margin-top: var(--space-sm);">';
      for (const c of analysis.concerns) {
        html += `<div style="font-size:var(--text-sm); color:var(--accent-orange); margin-bottom:4px;">\u26A0 ${UI.escapeHtml(c)}</div>`;
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
      const icon = entry.type === 'workout' ? '\u{1F3CB}\uFE0F' :
                   entry.type === 'supplement' ? '\u{1F48A}' :
                   entry.type === 'drink' ? '\u{1F964}' : '\u{1F372}';
      const cal = entry.type === 'workout' ? `${entry.calories_burned || '?'} cal burned` :
                  `${entry.calories || 0} cal`;
      const protein = entry.type !== 'workout' && entry.protein ? ` \u00B7 ${entry.protein}g protein` : '';

      html += `
        <div style="padding:var(--space-xs) 0; border-bottom:1px solid var(--border-color);">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <span style="font-size:var(--text-sm);">${icon} ${UI.escapeHtml(entry.description || entry.notes || entry.type)}</span>
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
        html += `<div style="font-size:var(--text-sm); color:var(--accent-green); margin-bottom:4px;">\u2713 ${UI.escapeHtml(h)}</div>`;
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
