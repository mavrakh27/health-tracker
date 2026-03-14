// score.js — Daily score calculation (0-100) showing goal alignment

const DayScore = {
  // Calculate score from available data (works with or without analysis)
  async calculate(date) {
    const goals = await DB.getProfile('goals') || {};
    const summary = await DB.getDailySummary(date);
    const entries = await DB.getEntriesByDate(date);
    const analysis = await DB.getAnalysis(date);
    const regimen = await DB.getRegimen();

    const hc = goals.hardcore || {};
    const moderate = { calories: goals.calories || 1200, protein: goals.protein || 105, water_oz: goals.water_oz || 64 };
    const hardcore = { calories: hc.calories || 1000, protein: hc.protein || 120, water_oz: hc.water_oz || 64 };

    // Get actuals — prefer analysis data, fall back to entry counting
    const totals = analysis?.totals || {};
    const calActual = totals.calories || 0;
    const proteinActual = totals.protein || 0;
    const waterActual = summary.water_oz || 0;
    const hasAnalysis = !!analysis;

    // Workout check
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const todayPlan = regimen?.weeklySchedule?.find(d => d.day === dayName);
    const isWorkoutDay = todayPlan && todayPlan.type !== 'rest';
    const workoutEntries = entries.filter(e => e.type === 'workout');
    const fitnessChecked = summary.fitness_checked || [];
    const didWorkout = workoutEntries.length > 0 || fitnessChecked.length > 0;

    // Vices
    const vices = entries.filter(e => e.type === 'vice');
    const drinkCount = vices.reduce((sum, v) => sum + (v.quantity || 1), 0);

    // Meal logging
    const meals = entries.filter(e => e.type === 'meal');

    // --- Score calculation ---
    const scoreModerate = DayScore._calc(calActual, proteinActual, waterActual, moderate, hasAnalysis, meals, isWorkoutDay, didWorkout, drinkCount);
    const scoreHardcore = DayScore._calc(calActual, proteinActual, waterActual, hardcore, hasAnalysis, meals, isWorkoutDay, didWorkout, drinkCount);

    return {
      moderate: scoreModerate,
      hardcore: scoreHardcore,
      breakdown: scoreModerate.breakdown,
    };
  },

  _calc(calActual, proteinActual, waterActual, goals, hasAnalysis, meals, isWorkoutDay, didWorkout, drinkCount) {
    let score = 0;
    const breakdown = {};

    // Calories (25 pts) — within ±150 of target is full marks
    if (hasAnalysis && calActual > 0) {
      const diff = Math.abs(calActual - goals.calories);
      if (diff <= 150) { score += 25; breakdown.calories = 25; }
      else if (diff <= 300) { score += 15; breakdown.calories = 15; }
      else if (calActual > goals.calories + 300) { score += 0; breakdown.calories = 0; }
      else { score += 10; breakdown.calories = 10; }
    } else {
      // No analysis yet — give partial credit for logging
      breakdown.calories = null; // unknown
    }

    // Protein (25 pts) — proportional to target
    if (hasAnalysis && proteinActual > 0) {
      const pct = Math.min(1, proteinActual / goals.protein);
      const pts = Math.round(pct * 25);
      score += pts;
      breakdown.protein = pts;
    } else {
      breakdown.protein = null;
    }

    // Workout (25 pts)
    if (isWorkoutDay) {
      if (didWorkout) { score += 25; breakdown.workout = 25; }
      else { breakdown.workout = 0; }
    } else {
      // Rest day — full marks for resting
      score += 25;
      breakdown.workout = 25;
      breakdown._isRest = true;
    }

    // Water (10 pts)
    if (waterActual >= goals.water_oz) { score += 10; breakdown.water = 10; }
    else if (waterActual >= goals.water_oz * 0.5) { score += 5; breakdown.water = 5; }
    else { breakdown.water = 0; }

    // Logging consistency (15 pts) — logged at least 1 meal
    if (meals.length >= 1) { score += 15; breakdown.logging = 15; }
    else { breakdown.logging = 0; }

    // Vice penalty (-10 per drink, max -30)
    if (drinkCount > 0) {
      const penalty = Math.min(30, drinkCount * 10);
      score -= penalty;
      breakdown.vices = -penalty;
    }

    score = Math.max(0, Math.min(100, score));

    return { score, breakdown };
  },

  // Render the score gauge for the today screen
  render(result) {
    const { moderate, hardcore } = result;
    const ms = moderate.score;
    const hs = hardcore.score;

    const color = ms >= 75 ? 'var(--accent-green)' : ms >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
    const hcColor = hs >= 75 ? 'var(--accent-green)' : hs >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';

    // SVG circular gauge
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (ms / 100) * circumference;

    let html = `
      <div class="day-score">
        <div class="day-score-gauge">
          <svg viewBox="0 0 100 100" class="score-ring">
            <circle cx="50" cy="50" r="${radius}" fill="none" stroke="var(--border-color)" stroke-width="6"/>
            <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="6"
              stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
              stroke-linecap="round" transform="rotate(-90 50 50)"
              style="transition: stroke-dashoffset 0.5s ease"/>
          </svg>
          <div class="score-number" style="color:${color}">${ms}</div>
        </div>
        <div class="day-score-labels">
          <div class="score-label-main">Moderate: ${ms}</div>
          <div class="score-label-hc" style="color:${hcColor}">Hardcore: ${hs}</div>
        </div>
      </div>
    `;

    // Breakdown chips
    const bd = moderate.breakdown;
    const chips = [];
    if (bd.calories != null) chips.push({ label: 'Cal', pts: bd.calories, max: 25 });
    if (bd.protein != null) chips.push({ label: 'Protein', pts: bd.protein, max: 25 });
    chips.push({ label: bd._isRest ? 'Rest' : 'Workout', pts: bd.workout, max: 25 });
    chips.push({ label: 'Water', pts: bd.water, max: 10 });
    chips.push({ label: 'Logged', pts: bd.logging, max: 15 });
    if (bd.vices != null) chips.push({ label: 'Vices', pts: bd.vices, max: 0 });

    html += '<div class="score-breakdown">';
    for (const chip of chips) {
      const chipColor = chip.pts < 0 ? 'var(--accent-red)' :
                        chip.pts >= chip.max ? 'var(--accent-green)' :
                        chip.pts > 0 ? 'var(--accent-orange)' : 'var(--text-muted)';
      const label = chip.pts != null ? `${chip.pts > 0 ? '+' : ''}${chip.pts}` : '?';
      html += `<span class="score-chip" style="border-color:${chipColor}; color:${chipColor}">${chip.label} ${label}</span>`;
    }
    html += '</div>';

    return html;
  },
};
