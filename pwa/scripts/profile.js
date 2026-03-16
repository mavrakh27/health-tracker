// profile.js — Profile tab: Coach chat + Fitness goals sub-tabs

const ProfileView = {
  _tab: 'coach',

  async init() {
    const coachEl = document.getElementById('profile-coach');
    const goalsEl = document.getElementById('profile-goals');
    if (!coachEl && !goalsEl) return;

    const activeTab = ProfileView._tab || 'coach';
    const date = UI.today();

    // Build segment control HTML
    let html = `
      <div class="segment-control" style="margin-bottom:var(--space-md);">
        <button class="segment-btn${activeTab === 'coach' ? ' active' : ''}" data-ptab="coach">Coach</button>
        <button class="segment-btn${activeTab === 'goals' ? ' active' : ''}" data-ptab="goals">Goals</button>
      </div>
    `;

    if (activeTab === 'coach' && coachEl) {
      html += await CoachChat.render(date);
      coachEl.innerHTML = html;
      CoachChat.bindEvents(date);
      if (goalsEl) goalsEl.style.display = 'none';
    } else if (coachEl) {
      coachEl.innerHTML = html;
    }

    // Bind segment tabs after innerHTML is set
    if (coachEl) {
      coachEl.querySelectorAll('.segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          ProfileView._tab = btn.dataset.ptab;
          ProfileView.init();
        });
      });
    }

    if (activeTab === 'goals') {
      if (goalsEl) {
        goalsEl.style.display = 'block';
        await ProfileView.renderGoals(goalsEl);
      }
    }
  },

  async renderGoals(container) {
    const goals = await DB.getProfile('goals') || {};
    const date = UI.today();
    let analysis = await DB.getAnalysis(date);
    if (!analysis) {
      const yesterday = UI.yesterday(date);
      analysis = await DB.getAnalysis(yesterday);
    }

    let html = '';

    // Remaining budget (if analysis available) — pass current profile goals to override stale analysis targets
    if (analysis) {
      html += GoalsView.renderRemainingBudget(analysis, goals);
    }

    // Fitness goals
    if (goals.fitnessGoals?.length) {
      html += '<h2 class="section-header">Fitness Goals</h2><div class="card">';
      for (let i = 0; i < goals.fitnessGoals.length; i++) {
        const g = goals.fitnessGoals[i];
        const isLast = i === goals.fitnessGoals.length - 1;
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
    }

    // Analysis summary (if available) — pass current profile goals
    if (analysis) {
      html += GoalsView.renderAnalysisSummary(analysis, goals);
    }

    // Empty state when no analysis and no fitness goals
    if (!html) {
      html = `
        <div class="card" style="text-align:center; padding:var(--space-lg); color:var(--text-muted);">
          <div style="font-size:var(--text-sm); margin-bottom:var(--space-xs);">No analysis data yet</div>
          <div style="font-size:var(--text-xs);">Log meals and sync to see your daily breakdown, remaining budget, and goal tracking here.</div>
        </div>
      `;
    }

    container.innerHTML = html;
  },
};
