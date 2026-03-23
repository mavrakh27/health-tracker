#!/usr/bin/env node
// build-summary.js — Generates a compact weekly-summary.md for coach sessions
// Run after processing. Reads analysis/*.json, outputs a human-readable
// summary the coach loads instead of 7 full analysis files (~1KB vs ~155KB).

const fs = require('fs');
const path = require('path');

const coachDir = process.env.COACH_DIR || path.join(require('os').homedir(), 'Coach');
const analysisDir = path.join(coachDir, 'analysis');
const goalsPath = path.join(coachDir, 'profile', 'goals.json');
const outPath = path.join(coachDir, 'weekly-summary.md');

if (!fs.existsSync(analysisDir)) {
  fs.writeFileSync(outPath, '# Weekly Summary\n\n_No analysis data yet._\n');
  console.log('No analysis dir — wrote empty summary');
  process.exit(0);
}

// Load goals for context
let goals = {};
try { goals = JSON.parse(fs.readFileSync(goalsPath, 'utf8')); } catch (e) {}
const activePlan = goals.activePlan || 'moderate';
const plan = goals[activePlan] || goals.moderate || {};
const calTarget = plan.calories?.daily ?? 1200;
const proTarget = plan.protein?.grams ?? 105;
const waterTarget = plan.water?.daily_oz ?? 64;

// Read last 14 days of analysis (show 7, use 14 for trends)
const today = new Date();
const files = fs.readdirSync(analysisDir)
  .filter(f => f.endsWith('.json'))
  .sort()
  .slice(-14);

const days = [];
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(analysisDir, f), 'utf8'));
    const entries = d.entries || [];
    const meals = entries.filter(e => ['meal', 'drink', 'snack', 'custom'].includes(e.type));
    const workouts = entries.filter(e => e.type === 'workout');

    days.push({
      date: d.date,
      cal: d.totals?.calories || 0,
      protein: d.totals?.protein || 0,
      carbs: d.totals?.carbs || 0,
      fat: d.totals?.fat || 0,
      water: d.water_oz || 0,
      weight: d.weight?.value || null,
      mealCount: meals.length,
      workedOut: workouts.length > 0,
      workoutDesc: workouts.map(w => w.description || w.type).join(', '),
      calStatus: d.goals?.calories?.status || (d.totals?.calories <= calTarget ? 'under' : 'over'),
      proStatus: (d.totals?.protein || 0) >= proTarget * 0.85 ? 'hit' : 'low',
      waterStatus: (d.water_oz || 0) >= waterTarget ? 'hit' : 'low',
      highlights: (d.highlights || []).slice(0, 2),
      concerns: (d.concerns || []).slice(0, 2),
      // Meal details for quick reference (no need to open full file)
      meals: meals.map(m => ({
        desc: (m.description || '').substring(0, 60),
        cal: m.calories || 0,
        protein: m.protein || 0,
      })),
    });
  } catch (e) { /* skip corrupt files */ }
}

if (days.length === 0) {
  fs.writeFileSync(outPath, '# Weekly Summary\n\n_No analysis data yet._\n');
  console.log('No analysis files — wrote empty summary');
  process.exit(0);
}

// Split into this week and last week
const thisWeek = days.slice(-7);
const lastWeek = days.slice(-14, -7);

// Calculate aggregates
const avg = (arr, fn) => arr.length ? Math.round(arr.reduce((s, d) => s + fn(d), 0) / arr.length) : 0;
const count = (arr, fn) => arr.filter(fn).length;

const thisAvgCal = avg(thisWeek, d => d.cal);
const thisAvgPro = avg(thisWeek, d => d.protein);
const thisWorkouts = count(thisWeek, d => d.workedOut);
const thisWaterHits = count(thisWeek, d => d.waterStatus === 'hit');
const thisCalHits = count(thisWeek, d => d.calStatus === 'under' || d.calStatus === 'on_track');
const thisProHits = count(thisWeek, d => d.proStatus === 'hit');

// Weight trend
const weights = days.filter(d => d.weight).map(d => ({ date: d.date, w: d.weight }));
const weightTrend = weights.length >= 2
  ? `${weights[0].w} → ${weights[weights.length - 1].w} lbs (${weights[weights.length - 1].w < weights[0].w ? 'down' : 'up'} ${Math.abs(weights[weights.length - 1].w - weights[0].w).toFixed(1)})`
  : weights.length === 1 ? `${weights[0].w} lbs (single reading)` : 'no data';

// Build markdown
let md = '# Weekly Summary\n\n';
md += `Auto-generated from analysis data. Coach reads this instead of loading all analysis files.\n`;
md += `For details on a specific day, read \`analysis/YYYY-MM-DD.json\`.\n\n`;

// Overview
md += `## This Week (${thisWeek.length} days tracked)\n\n`;
md += `| Metric | Avg/Count | Target | Status |\n`;
md += `|--------|-----------|--------|--------|\n`;
md += `| Calories | ${thisAvgCal}/day | ${calTarget} | ${thisCalHits}/${thisWeek.length} days on target |\n`;
md += `| Protein | ${thisAvgPro}g/day | ${proTarget}g | ${thisProHits}/${thisWeek.length} days hit |\n`;
md += `| Water | ${thisWaterHits}/${thisWeek.length} days | ${waterTarget}oz | ${thisWaterHits >= thisWeek.length * 0.7 ? 'good' : 'needs work'} |\n`;
md += `| Workouts | ${thisWorkouts}/${thisWeek.length} days | - | ${thisWorkouts >= 4 ? 'solid' : thisWorkouts >= 2 ? 'ok' : 'low'} |\n`;
md += `| Weight | ${weightTrend} | ${goals.weight?.goal || '?'} lbs | - |\n`;
md += '\n';

// Day-by-day
md += '## Day by Day\n\n';
for (const d of thisWeek) {
  if (d.cal === 0 && d.mealCount === 0) continue; // skip empty days
  const dateObj = new Date(d.date + 'T12:00:00');
  if (isNaN(dateObj.getTime())) continue; // skip malformed dates
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const flags = [];
  if (d.calStatus === 'over') flags.push('over cal');
  if (d.proStatus === 'low') flags.push('low protein');
  if (d.waterStatus === 'low') flags.push('low water');
  if (d.workedOut) flags.push('workout');

  md += `### ${dayName} — ${d.cal} cal, ${d.protein}g protein${d.weight ? ', ' + d.weight + ' lbs' : ''}\n`;
  md += `${flags.join(' | ')}\n\n`;

  // Meals compact list
  for (const m of d.meals) {
    md += `- ${m.desc} (${m.cal} cal, ${m.protein}g P)\n`;
  }

  if (d.highlights.length) {
    md += `\n**Good:** ${d.highlights.join('; ')}\n`;
  }
  if (d.concerns.length) {
    md += `**Watch:** ${d.concerns.join('; ')}\n`;
  }
  md += '\n';
}

// Patterns (coach-useful observations)
md += '## Patterns\n\n';

// Calorie consistency
const calStdDev = Math.round(Math.sqrt(thisWeek.reduce((s, d) => s + Math.pow(d.cal - thisAvgCal, 2), 0) / thisWeek.length));
md += `- Calorie consistency: avg ${thisAvgCal}, std dev ${calStdDev} (${calStdDev < 200 ? 'consistent' : 'variable'})\n`;

// Protein trend
const proBelow = thisWeek.filter(d => d.protein < proTarget * 0.85);
if (proBelow.length > 0) {
  md += `- Protein under target ${proBelow.length}/${thisWeek.length} days (avg ${thisAvgPro}g vs ${proTarget}g goal)\n`;
}

// Workout consistency
if (thisWorkouts < 4) {
  md += `- Only ${thisWorkouts} workouts this week\n`;
}

// Late-day patterns (if data available)
const highCalDays = thisWeek.filter(d => d.cal > calTarget * 1.1);
if (highCalDays.length > 0) {
  md += `- Over-cal days: ${highCalDays.map(d => new Date(d.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'})).join(', ')}\n`;
}

md += '\n';

fs.writeFileSync(outPath, md);
console.log(`Built weekly-summary.md: ${thisWeek.length} days, ${md.length} bytes`);
