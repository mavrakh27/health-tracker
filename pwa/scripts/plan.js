// plan.js — Plan tab: meals, workout, stretching, shopping list

const PlanView = {
  _view: 'today', // 'today' or 'week'

  async init() {
    const container = document.getElementById('plan-container');
    if (!container) return;

    const date = App.selectedDate;
    const analysis = await DB.getAnalysis(date) || await DB.getAnalysis(UI.yesterday(date));
    const mealPlan = await DB.getMealPlan();
    const regimen = await DB.getRegimen();

    let html = '';

    // Day type badge
    if (mealPlan?.days) {
      const todayPlan = mealPlan.days.find(d => d.date === date);
      if (todayPlan?.dayType) {
        html += `<div style="text-align:center; margin-bottom:var(--space-md);">
          <span style="font-size:var(--text-xs); color:var(--accent-gold); background:var(--accent-gold-dim); padding:4px 12px; border-radius:var(--radius-full); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">${UI.escapeHtml(todayPlan.dayType)}</span>
        </div>`;
      }
    }

    // --- Meals ---
    if (mealPlan?.days) {
      const todayPlan = mealPlan.days.find(d => d.date === date);
      if (todayPlan) {
        html += PlanView.renderMeals(todayPlan, analysis);
      } else {
        html += PlanView.renderMealPlanOverview(mealPlan);
      }
    }

    // --- Workout ---
    if (regimen) {
      html += await PlanView.renderWorkout(regimen, date);
    }

    // --- Stretching ---
    if (regimen?.flexibility) {
      html += PlanView.renderStretching(regimen.flexibility);
    }

    // --- Shopping List ---
    if (mealPlan?.shoppingList) {
      html += PlanView.renderShoppingList(mealPlan.shoppingList);
    }

    if (!html) {
      html = `<div class="card" style="text-align:center; padding:var(--space-lg);">
        <p style="color:var(--text-muted);">No plan yet. Sync to get your meal plan and workout regimen.</p>
      </div>`;
    }

    container.innerHTML = html;

    // Bind fitness events
    Fitness.bindEvents(date);
  },

  renderMeals(todayPlan, analysis) {
    let html = '<h2 class="section-header">Meals</h2>';

    // Context tip based on analysis
    if (analysis?.goals) {
      const goals = analysis.goals.moderate || analysis.goals;
      const proteinStatus = goals.protein?.status;
      if (proteinStatus === 'low') {
        html += `<div class="card" style="border-left:3px solid var(--accent-orange); margin-bottom:var(--space-sm);">
          <div style="font-size:var(--text-sm); color:var(--accent-orange);">Protein is behind — prioritize high-protein options today</div>
        </div>`;
      }
    }

    if (todayPlan.meals) {
      for (const meal of todayPlan.meals) {
        const mealType = UI.escapeHtml(meal.type || meal.meal || '');
        const mealName = UI.escapeHtml(meal.suggestion || meal.name || meal.description || '');
        const desc = meal.description ? UI.escapeHtml(meal.description) : '';
        html += `
          <div class="card" style="margin-bottom:var(--space-sm);">
            <div style="font-size:var(--text-xs); color:var(--accent-green); text-transform:uppercase; font-weight:600; margin-bottom:2px;">${mealType}</div>
            <div style="font-weight:500;">${mealName}</div>
            ${desc && desc !== mealName ? `<div style="font-size:var(--text-sm); color:var(--text-muted); margin-top:var(--space-xs);">${desc}</div>` : ''}
            <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:var(--space-xs);">
              ${meal.calories || '?'} cal · ${meal.protein || 0}g protein${meal.prep_time ? ' · ' + meal.prep_time : ''}
            </div>
          </div>
        `;
      }

      if (todayPlan.day_totals) {
        html += `<div style="font-size:var(--text-xs); color:var(--text-muted); text-align:center; margin-bottom:var(--space-md);">
          Day target: ~${todayPlan.day_totals.calories} cal · ~${todayPlan.day_totals.protein}g protein
          ${todayPlan.snack_buffer ? ` · ${todayPlan.snack_buffer} cal snack buffer` : ''}
        </div>`;
      }
    }

    return html;
  },

  async renderWorkout(regimen, date) {
    let html = '<h2 class="section-header">Workout</h2>';
    html += await Fitness.render(regimen, date);
    return html;
  },

  renderStretching(flex) {
    let html = `<h2 class="section-header">Splits Stretching</h2>`;
    html += `<div class="card">`;
    html += `<div style="font-size:var(--text-xs); color:var(--accent-cyan); margin-bottom:var(--space-sm);">${UI.escapeHtml(flex.frequency || 'Daily, 15-20 min')}</div>`;

    if (flex.routine) {
      for (let i = 0; i < flex.routine.length; i++) {
        const ex = flex.routine[i];
        const isLast = i === flex.routine.length - 1;
        html += `<div style="display:flex; justify-content:space-between; align-items:baseline; padding:4px 0; ${!isLast ? 'border-bottom:1px solid var(--border-color);' : ''}">
          <div>
            <div style="font-size:var(--text-sm);">${UI.escapeHtml(ex.name)}</div>
            <div style="font-size:var(--text-xs); color:var(--text-muted);">${UI.escapeHtml(ex.target)}${ex.notes ? ' · ' + UI.escapeHtml(ex.notes) : ''}</div>
          </div>
          <span style="font-size:var(--text-xs); color:var(--text-secondary); white-space:nowrap; margin-left:var(--space-sm);">${UI.escapeHtml(ex.duration)}</span>
        </div>`;
      }
    }

    html += `</div>`;
    return html;
  },

  renderShoppingList(list) {
    let html = `<h2 class="section-header">Shopping List</h2><div class="card">`;

    const sections = [
      { key: 'proteins', label: 'Proteins' },
      { key: 'produce', label: 'Produce' },
      { key: 'pantry', label: 'Pantry' },
    ];

    for (const sec of sections) {
      const items = list[sec.key];
      if (!items?.length) continue;
      html += `<div style="font-size:var(--text-xs); color:var(--accent-green); text-transform:uppercase; font-weight:600; margin-top:var(--space-sm); margin-bottom:2px;">${sec.label}</div>`;
      for (const item of items) {
        html += `<div style="font-size:var(--text-sm); padding:2px 0;">${UI.escapeHtml(item)}</div>`;
      }
    }

    if (list.already_have?.length) {
      html += `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-sm);">Already have: ${list.already_have.map(i => UI.escapeHtml(i)).join(', ')}</div>`;
    }

    html += `</div>`;
    return html;
  },

  renderMealPlanOverview(plan) {
    let html = '<h2 class="section-header">Meal Plan</h2>';
    if (plan.theme) {
      html += `<div style="font-size:var(--text-xs); color:var(--text-muted); margin-bottom:var(--space-sm);">${UI.escapeHtml(plan.theme)}</div>`;
    }

    for (const day of (plan.days || [])) {
      html += `<div class="card" style="margin-bottom:var(--space-sm); cursor:pointer;" onclick="App.goToDate('${day.date}')">`;
      html += `<div style="display:flex; justify-content:space-between; align-items:baseline;">
        <span style="font-weight:500;">${UI.formatDate(day.date)}</span>
        <span style="font-size:var(--text-xs); color:var(--text-muted);">${day.day_totals?.calories || '?'} cal</span>
      </div>`;
      if (day.dayType) {
        html += `<div style="font-size:var(--text-xs); color:var(--accent-gold);">${UI.escapeHtml(day.dayType)}</div>`;
      }
      html += `</div>`;
    }

    return html;
  },
};
