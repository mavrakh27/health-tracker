#!/usr/bin/env node
// timeline.js — Plan evolution tracker for Coach
// Records events at three granularity levels:
//   major  — plan shifts, new goals, milestone changes (always loaded)
//   minor  — target adjustments, exercise swaps, preference tweaks (loaded on topic)
//   note   — observations, learned preferences, patterns noticed (loaded on demand)
//
// Usage:
//   const { writeEvent, readTimeline } = require('./timeline');
//   writeEvent('major', 'regimen-change', 'Switched to elliptical', 'No free weights at gym', 'coach-session');

const fs = require('fs');
const path = require('path');

const coachDir = process.env.COACH_DIR || path.join(require('os').homedir(), 'Coach');
const timelinePath = path.join(coachDir, 'profile', 'timeline.json');

function readTimeline() {
  try {
    return JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  } catch (e) {
    return { events: [], _summary: null };
  }
}

function writeTimeline(data) {
  fs.mkdirSync(path.dirname(timelinePath), { recursive: true });
  fs.writeFileSync(timelinePath, JSON.stringify(data, null, 2));
}

/**
 * Append an event to the timeline.
 * @param {'major'|'minor'|'note'} level — granularity level
 * @param {string} type — category (e.g. 'regimen-change', 'goal-change', 'preference', 'observation')
 * @param {string} summary — what changed (1 sentence)
 * @param {string} reason — why it changed (1 sentence)
 * @param {string} source — who made the change ('coach-session', 'inbox', 'cron', 'user-edit')
 */
function writeEvent(level, type, summary, reason, source) {
  const data = readTimeline();
  data.events.push({
    date: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    level,
    type,
    summary,
    reason: reason || null,
    source: source || 'unknown',
  });

  // Prune: if >100 events, summarize old notes into _summary
  if (data.events.length > 100) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const old = data.events.filter(e => e.date < cutoffStr && e.level === 'note');
    const keep = data.events.filter(e => e.date >= cutoffStr || e.level !== 'note');

    if (old.length > 0) {
      const oldSummary = old.map(e => `${e.date}: ${e.summary}`).join('; ');
      data._summary = data._summary
        ? data._summary + '; ' + oldSummary
        : oldSummary;
      data.events = keep;
    }
  }

  writeTimeline(data);
  return data;
}

/**
 * Read events filtered by level. Coach uses this at session start.
 * @param {'all'|'major'|'major+minor'} scope — what to load
 * @param {number} limit — max events to return (default 50)
 */
function getEvents(scope = 'major', limit = 50) {
  const data = readTimeline();
  let filtered = data.events;

  if (scope === 'major') {
    filtered = filtered.filter(e => e.level === 'major');
  } else if (scope === 'major+minor') {
    filtered = filtered.filter(e => e.level !== 'note');
  }
  // 'all' returns everything

  return {
    events: filtered.slice(-limit),
    _summary: data._summary,
    total: data.events.length,
  };
}

/**
 * Determine if a change should be recorded and at what level.
 * Option D: source-aware filtering. Field rules set the level,
 * source determines whether it actually gets recorded.
 *
 * @param {string} field — what changed
 * @param {*} oldValue — previous value
 * @param {*} newValue — new value
 * @param {string} source — 'coach-session' | 'cron' | 'user-edit' | 'inbox'
 * @returns {'major'|'minor'|'note'|null} — null means don't record
 */
function shouldRecord(field, oldValue, newValue, source) {
  // 1. Determine level from field
  let level = null;

  // Structural changes -- always major
  if (['activePlan', 'mealPlan.mealsPerDay'].includes(field)) level = 'major';
  else if (field.includes('milestones') && oldValue == null) level = 'major'; // new milestone
  else if (field.includes('weeklySchedule') && typeof newValue === 'object' && typeof oldValue === 'object') {
    // Workout type change (strength->cardio) = major, exercise swap = note
    level = oldValue?.type !== newValue?.type ? 'major' : 'note';
  }
  // Numeric target changes -- minor
  else if (typeof newValue === 'number' && typeof oldValue === 'number') level = 'minor';
  // Everything else -- note
  else level = 'note';

  // 2. Filter by source (Option D)
  if (source === 'coach-session' || source === 'user-edit') return level; // always record
  if (source === 'cron') return level === 'major' ? 'major' : null;       // cron: major only
  if (source === 'inbox') return level === 'major' ? 'major' : null;      // inbox: major only

  return level;
}

/**
 * Build a compact markdown summary for the coach to read at session start.
 * Only includes major events + recent minor events.
 */
function buildTimelineSummary() {
  const data = readTimeline();
  if (data.events.length === 0 && !data._summary) return '';

  let md = '## Plan History\n\n';

  if (data._summary) {
    md += `*Earlier: ${data._summary}*\n\n`;
  }

  // All major events
  const majors = data.events.filter(e => e.level === 'major');
  // Minor events from last 30 days only
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentMinor = data.events.filter(e =>
    e.level === 'minor' && e.date >= thirtyDaysAgo.toISOString().split('T')[0]
  );

  const display = [...majors, ...recentMinor].sort((a, b) => a.date.localeCompare(b.date));

  for (const e of display) {
    const icon = e.level === 'major' ? '**' : '';
    md += `- ${e.date}: ${icon}${e.summary}${icon}`;
    if (e.reason) md += ` — ${e.reason}`;
    md += '\n';
  }

  return md;
}

module.exports = { readTimeline, writeEvent, getEvents, shouldRecord, buildTimelineSummary };
