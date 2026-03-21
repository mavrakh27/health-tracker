#!/usr/bin/env node
// test-fixtures/test-timeline.js — Adversarial unit tests for timeline.js
// Tests shouldRecord(), writeEvent(), getEvents(), buildTimelineSummary()
// Run: node test-fixtures/test-timeline.js

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Setup: point COACH_DIR at a temp directory ──────────────────────────────
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-test-'));
const PROFILE_DIR = path.join(TEMP_DIR, 'profile');
const TIMELINE_PATH = path.join(PROFILE_DIR, 'timeline.json');
process.env.COACH_DIR = TEMP_DIR;

// Load AFTER setting env var so module picks up TEMP_DIR
const {
  readTimeline,
  writeEvent,
  getEvents,
  shouldRecord,
  buildTimelineSummary,
} = require('../coach-plugin/timeline');

// ── Simple assert helpers ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${testName}`);
  } else {
    failed++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    failures.push(msg);
    console.log(`  FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

function assertEqual(actual, expected, testName) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, testName, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertThrows(fn, testName) {
  try {
    fn();
    failed++;
    failures.push(testName + ' — expected throw, did not throw');
    console.log(`  FAIL: ${testName} — expected throw, did not throw`);
  } catch (e) {
    passed++;
    console.log(`  PASS: ${testName}`);
  }
}

// Reset timeline file between test groups
function resetTimeline(content = null) {
  if (fs.existsSync(PROFILE_DIR)) {
    fs.rmSync(PROFILE_DIR, { recursive: true });
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  if (content !== null) {
    fs.writeFileSync(TIMELINE_PATH, content);
  }
}

// ── shouldRecord() ──────────────────────────────────────────────────────────
console.log('\n=== shouldRecord() ===\n');

// --- Same value (no actual change) ---
assertEqual(
  shouldRecord('moderate.calories.daily', 1200, 1200, 'coach-session'),
  'minor',
  'same numeric value still returns level (no dedup guard)'
);
// NOTE: the above reveals there is no guard against recording no-op changes.
// shouldRecord() returns 'minor' even when old === new. That is a latent bug
// because every caller must check independently, but the API implies it
// decides whether to record.

assertEqual(
  shouldRecord('activePlan', 'moderate', 'moderate', 'coach-session'),
  'major',
  'same string value (activePlan) still returns major — no dedup guard'
);

// --- undefined/null field values ---
assertEqual(
  shouldRecord('milestones[0]', null, 'flat tummy by April', 'coach-session'),
  'major',
  'new milestone (oldValue=null) triggers major'
);

// BUG: undefined == null is true in JS, so undefined oldValue triggers the
// milestones new-milestone branch and returns 'major', same as explicit null.
// The caller intent is ambiguous — but if undefined means "field never existed",
// treating it the same as null is actually correct. Documenting the JS behaviour.
assertEqual(
  shouldRecord('milestones[0]', undefined, 'flat tummy by April', 'coach-session'),
  'major',
  'undefined oldValue triggers new-milestone major (undefined == null in JS)'
);
// BUG PROBE: `undefined == null` is true in JS, so `oldValue == null` covers
// both. This test documents the actual behaviour.

assertEqual(
  shouldRecord('milestones[0]', 'old milestone', null, 'coach-session'),
  'note',
  'removing milestone (newValue=null) falls through to note — not flagged as major'
);
// This is arguably a bug: deleting a milestone is at least as significant
// as adding one, yet it gets downgraded to note.

// --- Unknown / missing source ---
assertEqual(
  shouldRecord('activePlan', 'moderate', 'hardcore', 'unknown-source'),
  'major',
  'unknown source falls through to return level (no null guard) — activePlan → major'
);

assertEqual(
  shouldRecord('someField', 1, 2, 'unknown-source'),
  'minor',
  'unknown source with numeric change returns minor (not null)'
);

assertEqual(
  shouldRecord('someField', 'a', 'b', null),
  'note',
  'null source falls through to return level — note'
);

assertEqual(
  shouldRecord('someField', 'a', 'b', undefined),
  'note',
  'undefined source falls through to return level — note'
);

// --- activePlan exact string match ---
assertEqual(
  shouldRecord('activePlan', 'moderate', 'hardcore', 'cron'),
  'major',
  'activePlan change via cron → major (major passes cron filter)'
);

assertEqual(
  shouldRecord('active_plan', 'moderate', 'hardcore', 'coach-session'),
  'note',
  'activePlan check is exact — active_plan (underscore) does NOT match → falls to note'
);

assertEqual(
  shouldRecord('ACTIVEPLAN', 'moderate', 'hardcore', 'coach-session'),
  'note',
  'activePlan check is case-sensitive — ACTIVEPLAN → note'
);

// --- weeklySchedule arrays ---
const oldScheduleDay = { type: 'cardio', exercise: 'elliptical', duration: 45 };
const newScheduleType = { type: 'strength', exercise: 'elliptical', duration: 45 };
const newScheduleSameType = { type: 'cardio', exercise: 'cycling', duration: 45 };

assertEqual(
  shouldRecord('weeklySchedule[0]', oldScheduleDay, newScheduleType, 'coach-session'),
  'major',
  'weeklySchedule: workout type change (cardio→strength) → major'
);

assertEqual(
  shouldRecord('weeklySchedule[0]', oldScheduleDay, newScheduleSameType, 'coach-session'),
  'note',
  'weeklySchedule: exercise swap, same type → note'
);

// BUG PROBE: what if newValue is not an object (e.g. a string gets assigned)?
assertEqual(
  shouldRecord('weeklySchedule[0]', oldScheduleDay, 'rest', 'coach-session'),
  'note',
  'weeklySchedule: newValue is string, typeof check fails, falls to note — not treated as major'
);
// Arguably a bug: replacing a scheduled workout with "rest" is significant.

// FIXED: weeklySchedule + null oldValue no longer hits the typeof null === 'object' branch.
// With null guard, this falls through to 'note' (default) — adding a new schedule day
// is a note-level change unless it's a structural field.
assertEqual(
  shouldRecord('weeklySchedule[0]', null, newScheduleType, 'coach-session'),
  'note',
  'FIXED: weeklySchedule + null oldValue skips object branch, falls to note'
);

// --- Deeply nested fields like "moderate.calories.daily" ---
assertEqual(
  shouldRecord('moderate.calories.daily', 1200, 1000, 'coach-session'),
  'minor',
  'deeply nested numeric field → minor (dot-notation field name treated as string)'
);

assertEqual(
  shouldRecord('moderate.calories.daily', 1200, 1000, 'cron'),
  null,
  'deeply nested numeric field via cron → null (cron suppresses minor)'
);

// --- Source filtering: cron and inbox only pass major ---
assertEqual(shouldRecord('activePlan', 'moderate', 'hardcore', 'cron'), 'major', 'cron: major field → major');
assertEqual(shouldRecord('someField', 1, 2, 'cron'), null, 'cron: minor field → null');
assertEqual(shouldRecord('someField', 'a', 'b', 'cron'), null, 'cron: note field → null');
assertEqual(shouldRecord('activePlan', 'moderate', 'hardcore', 'inbox'), 'major', 'inbox: major field → major');
assertEqual(shouldRecord('someField', 1, 2, 'inbox'), null, 'inbox: minor field → null');
assertEqual(shouldRecord('someField', 'a', 'b', 'inbox'), null, 'inbox: note field → null');

// --- milestones field edge cases ---
// What about a milestones array being set wholesale (not oldValue==null)?
assertEqual(
  shouldRecord('milestones', ['goal1'], ['goal1', 'goal2'], 'coach-session'),
  'note',
  'milestones array replacement (oldValue not null) → note, not major'
);
// This is a bug: adding a milestone to an existing array is treated as note,
// but adding the first milestone (null→value) is major. Inconsistent.

// ── writeEvent() ─────────────────────────────────────────────────────────────
console.log('\n=== writeEvent() ===\n');

// --- timeline.json does not exist ---
resetTimeline();
assert(!fs.existsSync(TIMELINE_PATH), 'precondition: timeline.json absent before test');
writeEvent('major', 'goal-change', 'Added water goal', 'Dehydration patterns', 'coach-session');
assert(fs.existsSync(TIMELINE_PATH), 'writeEvent creates timeline.json when absent');
assertEqual(readTimeline().events.length, 1, 'first event written correctly');

// --- timeline.json is empty string ---
resetTimeline('');
writeEvent('minor', 'preference', 'Switched to OMAD', 'Schedule constraint', 'user-edit');
assert(fs.existsSync(TIMELINE_PATH), 'writeEvent recovers from empty file');
assertEqual(readTimeline().events.length, 1, 'event written after recovery from empty file');

// --- timeline.json is corrupt JSON ---
resetTimeline('{ this is not valid json ]]]');
writeEvent('note', 'observation', 'Logged well today', null, 'cron');
assert(fs.existsSync(TIMELINE_PATH), 'writeEvent recovers from corrupt JSON');
assertEqual(readTimeline().events.length, 1, 'event written after recovery from corrupt JSON');

// --- null reason ---
resetTimeline();
writeEvent('major', 'goal-change', 'Removed snacks', null, 'coach-session');
assertEqual(readTimeline().events[0].reason, null, 'null reason stored as null');

// --- undefined reason ---
resetTimeline();
writeEvent('major', 'goal-change', 'Removed snacks', undefined, 'coach-session');
assertEqual(readTimeline().events[0].reason, null, 'undefined reason coerced to null');

// --- null source ---
resetTimeline();
writeEvent('major', 'goal-change', 'Test', 'reason', null);
assertEqual(readTimeline().events[0].source, 'unknown', 'null source becomes "unknown"');

// --- undefined source ---
resetTimeline();
writeEvent('major', 'goal-change', 'Test', 'reason', undefined);
assertEqual(readTimeline().events[0].source, 'unknown', 'undefined source becomes "unknown"');

// --- summary with special characters (quotes, backslash, newlines) ---
resetTimeline();
const nastySummary = 'User said "I want to lose weight"\n  and also: \\fast\\';
writeEvent('note', 'observation', nastySummary, null, 'coach-session');
const savedEvent = readTimeline().events[0];
assertEqual(savedEvent.summary, nastySummary, 'special chars in summary survive JSON round-trip');

// --- summary with Unicode / emoji ---
resetTimeline();
writeEvent('note', 'observation', 'Achieved goal \u2014 finally done', null, 'coach-session');
assertEqual(readTimeline().events[0].summary, 'Achieved goal \u2014 finally done', 'Unicode in summary survives');

// --- Pruning: >100 events triggers pruning of old notes ---
resetTimeline();
const now = new Date();
// Push 90 old note events (>90 days ago) then 15 recent ones → total 105 → pruning fires
for (let i = 0; i < 90; i++) {
  const oldDate = new Date(now);
  oldDate.setDate(oldDate.getDate() - 100 - i);
  const data = readTimeline();
  data.events.push({
    date: oldDate.toISOString().split('T')[0],
    timestamp: oldDate.getTime(),
    level: 'note',
    type: 'observation',
    summary: `Old note ${i}`,
    reason: null,
    source: 'cron',
  });
  const profileDir = path.join(TEMP_DIR, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
}
for (let i = 0; i < 10; i++) {
  const recentDate = new Date(now);
  recentDate.setDate(recentDate.getDate() - i);
  const data = readTimeline();
  data.events.push({
    date: recentDate.toISOString().split('T')[0],
    timestamp: recentDate.getTime(),
    level: 'major',
    type: 'goal-change',
    summary: `Recent major ${i}`,
    reason: null,
    source: 'coach-session',
  });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
}
assert(readTimeline().events.length === 100, 'precondition: exactly 100 events (no prune yet)');

// 101st event triggers prune
writeEvent('note', 'observation', 'Triggering prune', null, 'cron');
const afterPrune = readTimeline();
assert(afterPrune.events.length < 101, `pruning fires at >100 events (now ${afterPrune.events.length} events)`);
assert(afterPrune._summary !== null, 'pruned old notes collapsed into _summary');
assert(afterPrune._summary.includes('Old note 0'), '_summary contains pruned content');

// BUG PROBE: pruning only removes 'note' level events >90 days old.
// If there are 100 events but none qualify (all major or recent), pruning
// does NOT reduce the list. The array keeps growing past 100.
resetTimeline();
for (let i = 0; i < 100; i++) {
  const data = readTimeline();
  data.events.push({
    date: now.toISOString().split('T')[0],
    timestamp: now.getTime(),
    level: 'major',
    type: 'goal-change',
    summary: `Major event ${i}`,
    reason: null,
    source: 'coach-session',
  });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
}
writeEvent('major', 'goal-change', 'Event 101', null, 'coach-session');
const afterNonPrune = readTimeline();
assert(
  afterNonPrune.events.length === 101,
  'BUG: 101 major events — pruning finds nothing to prune, array grows past 100'
);

// ── getEvents() ──────────────────────────────────────────────────────────────
console.log('\n=== getEvents() ===\n');

resetTimeline();
// Write a mix of levels
writeEvent('major', 'goal-change', 'Major 1', null, 'coach-session');
writeEvent('minor', 'preference', 'Minor 1', null, 'coach-session');
writeEvent('note', 'observation', 'Note 1', null, 'coach-session');
writeEvent('major', 'goal-change', 'Major 2', null, 'coach-session');
writeEvent('note', 'observation', 'Note 2', null, 'coach-session');

// Scope: 'major'
const majorOnly = getEvents('major');
assert(majorOnly.events.every(e => e.level === 'major'), "scope='major' returns only major events");
assertEqual(majorOnly.events.length, 2, "scope='major' returns 2 events");

// Scope: 'major+minor'
const majorMinor = getEvents('major+minor');
assert(majorMinor.events.every(e => e.level !== 'note'), "scope='major+minor' excludes notes");
assertEqual(majorMinor.events.length, 3, "scope='major+minor' returns 3 events");

// Scope: 'all'
const allEvents = getEvents('all');
assertEqual(allEvents.events.length, 5, "scope='all' returns all 5 events");

// Scope: unknown string (not 'major', 'major+minor', or 'all')
const unknownScope = getEvents('unknown-scope');
assertEqual(unknownScope.events.length, 5, "unknown scope returns all events (no filter applied)");
// BUG: unknown scope strings silently fall through to unfiltered result.
// Callers could pass a typo like 'major+' and get all events without warning.

// Limit: default 50
resetTimeline();
for (let i = 0; i < 60; i++) {
  writeEvent('major', 'goal-change', `Event ${i}`, null, 'coach-session');
}
const defaultLimit = getEvents('all');
assertEqual(defaultLimit.events.length, 50, 'default limit=50 respected');

// Limit: explicit 10
const limitTen = getEvents('all', 10);
assertEqual(limitTen.events.length, 10, 'explicit limit=10 respected');

// Limit 0: BUG PROBE — does limit=0 return 0 events or fall back to some default?
const limitZero = getEvents('all', 0);
// BUG: Array.prototype.slice(-0) === slice(0) which returns the ENTIRE array.
// Passing limit=0 to getEvents() returns all 60 events instead of 0.
// -0 === 0 in JS arithmetic, so -limit where limit=0 gives -0 which slice
// treats identically to 0.
assert(
  limitZero.events.length === 0,
  'FIXED: limit=0 returns empty array (not all events)'
);

// Limit: negative number — should also return empty
const limitNeg = getEvents('all', -5);
assert(
  limitNeg.events.length === 0,
  'FIXED: negative limit returns empty array'
);

// total field reflects unfiltered event count
resetTimeline();
for (let i = 0; i < 5; i++) writeEvent('major', 'gc', `ev${i}`, null, 'coach-session');
for (let i = 0; i < 3; i++) writeEvent('note', 'obs', `note${i}`, null, 'coach-session');
const totals = getEvents('major', 50);
assertEqual(totals.total, 8, 'total reflects all events, not just filtered');
assertEqual(totals.events.length, 5, 'events filtered to major only');

// ── buildTimelineSummary() ──────────────────────────────────────────────────
console.log('\n=== buildTimelineSummary() ===\n');

// Empty timeline
resetTimeline();
const emptySummary = buildTimelineSummary();
assertEqual(emptySummary, '', 'empty timeline → empty string');

// All notes, no major/minor
resetTimeline();
writeEvent('note', 'observation', 'Just a note', null, 'coach-session');
writeEvent('note', 'observation', 'Another note', null, 'coach-session');
const noteOnlySummary = buildTimelineSummary();
assert(noteOnlySummary === '## Plan History\n\n', 'all notes → header only, no events listed');
// BUG: The function returns '## Plan History\n\n' (non-empty) when events
// exist but none are major or recent-minor. Callers checking for '' to
// detect "nothing to show" will wrongly get a non-empty string.

// Only minor events older than 30 days
resetTimeline();
(function() {
  const data = readTimeline();
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 31);
  data.events.push({
    date: oldDate.toISOString().split('T')[0],
    timestamp: oldDate.getTime(),
    level: 'minor',
    type: 'preference',
    summary: 'Old minor event',
    reason: null,
    source: 'coach-session',
  });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
})();
const oldMinorSummary = buildTimelineSummary();
assert(!oldMinorSummary.includes('Old minor event'), 'minor events older than 30 days excluded from summary');
assert(oldMinorSummary === '## Plan History\n\n', 'only stale minors → header only');

// 30-day boundary: exactly 30 days ago (edge case)
resetTimeline();
(function() {
  const data = readTimeline();
  const boundary = new Date();
  boundary.setDate(boundary.getDate() - 30);
  const boundaryStr = boundary.toISOString().split('T')[0];
  data.events.push({
    date: boundaryStr,
    timestamp: boundary.getTime(),
    level: 'minor',
    type: 'preference',
    summary: 'Boundary minor event',
    reason: null,
    source: 'coach-session',
  });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
})();
const boundarySummary = buildTimelineSummary();
assert(
  boundarySummary.includes('Boundary minor event'),
  '30-day boundary: event exactly 30 days ago is INCLUDED (>= comparison)'
);

// Major event formatting
resetTimeline();
writeEvent('major', 'goal-change', 'Switched to hardcore', 'Faster progress', 'coach-session');
const majorSummary = buildTimelineSummary();
assert(majorSummary.includes('**Switched to hardcore**'), 'major events wrapped in ** for bold');
assert(majorSummary.includes('Faster progress'), 'reason included after em dash');

// Minor event formatting (no bold)
resetTimeline();
(function() {
  const data = readTimeline();
  const today = new Date().toISOString().split('T')[0];
  data.events.push({
    date: today,
    timestamp: Date.now(),
    level: 'minor',
    type: 'preference',
    summary: 'Adjusted calorie target',
    reason: 'Plateau',
    source: 'coach-session',
  });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
})();
const minorFmt = buildTimelineSummary();
assert(!minorFmt.includes('**Adjusted calorie target**'), 'minor events NOT bolded');
assert(minorFmt.includes('Adjusted calorie target'), 'minor event text present');

// Event with null reason — no em dash appended
resetTimeline();
writeEvent('major', 'goal-change', 'No reason given', null, 'coach-session');
const noReasonSummary = buildTimelineSummary();
assert(!noReasonSummary.includes(' — '), 'no em dash when reason is null');

// Events sorted by date (not insertion order)
resetTimeline();
(function() {
  const data = readTimeline();
  data.events.push({ date: '2026-03-15', timestamp: 0, level: 'major', type: 'gc', summary: 'Later event', reason: null, source: 'coach-session' });
  data.events.push({ date: '2026-03-10', timestamp: 0, level: 'major', type: 'gc', summary: 'Earlier event', reason: null, source: 'coach-session' });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
})();
const sortedSummary = buildTimelineSummary();
const earlierPos = sortedSummary.indexOf('Earlier event');
const laterPos = sortedSummary.indexOf('Later event');
assert(earlierPos < laterPos, 'events sorted chronologically in summary');

// _summary (from pruning) appears in output
resetTimeline();
(function() {
  const data = { events: [], _summary: 'Archived: 2026-01-01: Old goal set' };
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
})();
const archiveSummary = buildTimelineSummary();
assert(archiveSummary.includes('Earlier: Archived:'), '_summary rendered as italic earlier note');

// _summary present but events empty
resetTimeline();
(function() {
  const data = { events: [], _summary: 'Old archived content' };
  fs.writeFileSync(TIMELINE_PATH, JSON.stringify(data, null, 2));
})();
const summaryOnlySummary = buildTimelineSummary();
// NOTE: data.events.length === 0 && data._summary is truthy — the early
// return `if (data.events.length === 0 && !data._summary) return '';` does
// NOT fire, so we get output. But events is empty so no event lines.
assert(summaryOnlySummary.includes('Old archived content'), '_summary shown even when events array is empty');

// ── Cleanup ──────────────────────────────────────────────────────────────────
fs.rmSync(TEMP_DIR, { recursive: true });
console.log('\n── Cleanup: temp dir removed ──\n');

// ── Results ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failures.length > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
