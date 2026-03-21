// test-fixtures/test-summary-builder.js — Adversarial tests for build-summary.js
// Usage: node test-fixtures/test-summary-builder.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
const failures = [];

function assert(ok, name, detail) {
  if (ok) { pass++; console.log(`  OK: ${name}`); }
  else {
    fail++;
    const m = detail ? `${name} — ${detail}` : name;
    failures.push(m);
    console.log(`  FAIL: ${m}`);
  }
}

const builderPath = path.join(__dirname, '..', 'coach-plugin', 'build-summary.js');
const builderSrc = fs.readFileSync(builderPath, 'utf8').replace(/^#!.*[\r\n]+/, '');

const tmpDir = path.join(os.tmpdir(), `summary-test-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

const cleanup = () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
};

// Helper: run the builder in a COACH_DIR and return the output markdown
function runBuilder(coachDir, extraEnv = {}) {
  const wrapperPath = path.join(tmpDir, `wrapper-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  const envLines = Object.entries({ COACH_DIR: coachDir, ...extraEnv })
    .map(([k, v]) => `process.env[${JSON.stringify(k)}] = ${JSON.stringify(v)};`)
    .join('\n');
  fs.writeFileSync(wrapperPath, `${envLines}\n${builderSrc}`);
  const stdout = execSync(`node "${wrapperPath}"`, { encoding: 'utf8', timeout: 15000 });
  const outPath = path.join(coachDir, 'weekly-summary.md');
  const md = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
  return { stdout, md };
}

// Helper: create a standard analysis file
function makeAnalysis(dir, date, overrides = {}) {
  const base = {
    date,
    entries: [],
    totals: { calories: 1200, protein: 105, carbs: 150, fat: 40 },
    water_oz: 64,
    weight: { value: 150 },
    highlights: [],
    concerns: [],
    goals: {},
  };
  const merged = deepMerge(base, overrides);
  fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(merged));
}

function deepMerge(target, source) {
  const result = Object.assign({}, target);
  for (const k of Object.keys(source)) {
    if (source[k] !== null && typeof source[k] === 'object' && !Array.isArray(source[k]) && target[k] && typeof target[k] === 'object') {
      result[k] = deepMerge(target[k], source[k]);
    } else {
      result[k] = source[k];
    }
  }
  return result;
}

function makeCoachDir(name) {
  const dir = path.join(tmpDir, name);
  const analysisDir = path.join(dir, 'analysis');
  const profileDir = path.join(dir, 'profile');
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });
  return { dir, analysisDir, profileDir };
}

function writeGoals(profileDir, goals) {
  fs.writeFileSync(path.join(profileDir, 'goals.json'), JSON.stringify(goals));
}

const DEFAULT_GOALS = {
  activePlan: 'moderate',
  moderate: { calories: { daily: 1200 }, protein: { grams: 105 }, water: { daily_oz: 64 } },
  weight: { goal: 140 },
};

try {

  // ── TEST 1: Empty analysis directory ──
  console.log('\n--- Test 1: Empty analysis directory ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('empty-analysis');
    writeGoals(profileDir, DEFAULT_GOALS);
    // analysis dir exists but has no files
    const { stdout, md } = runBuilder(dir);
    assert(md !== null, 'T1: output file created');
    assert(md.includes('# Weekly Summary'), 'T1: has Weekly Summary header');
    assert(md.includes('No analysis'), 'T1: empty state message shown');
    assert(!md.includes('undefined'), 'T1: no undefined in output');
    assert(!md.includes('NaN'), 'T1: no NaN in output');
  }

  // ── TEST 2: No analysis directory at all ──
  console.log('\n--- Test 2: No analysis directory ---');
  {
    const { dir, profileDir } = makeCoachDir('no-analysis-dir');
    // deliberately do NOT create analysisDir
    fs.rmdirSync(path.join(dir, 'analysis'));
    writeGoals(profileDir, DEFAULT_GOALS);
    const { stdout, md } = runBuilder(dir);
    assert(md !== null, 'T2: output file created even with no analysis dir');
    assert(md.includes('No analysis'), 'T2: fallback message present');
    assert(!md.includes('NaN'), 'T2: no NaN');
  }

  // ── TEST 3: Missing goals.json ──
  console.log('\n--- Test 3: Missing goals.json ---');
  {
    const { dir, analysisDir } = makeCoachDir('no-goals');
    // profileDir exists but no goals.json
    makeAnalysis(analysisDir, '2026-03-15');
    makeAnalysis(analysisDir, '2026-03-16');
    const { md } = runBuilder(dir);
    assert(md !== null, 'T3: output file created');
    assert(md.includes('# Weekly Summary'), 'T3: has header');
    assert(!md.includes('undefined'), 'T3: no undefined (goals defaults used)');
    assert(!md.includes('NaN'), 'T3: no NaN in output');
    // Should still show calorie targets with defaults
    assert(md.includes('1200'), 'T3: default calorie target (1200) used');
  }

  // ── TEST 4: Analysis files with all nulls/missing fields ──
  console.log('\n--- Test 4: Missing/null fields in analysis files ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('null-fields');
    writeGoals(profileDir, DEFAULT_GOALS);
    // Write analysis files with deliberately missing sections
    fs.writeFileSync(path.join(analysisDir, '2026-03-15.json'), JSON.stringify({
      date: '2026-03-15',
      // no entries, no totals, no water_oz, no weight, no highlights, no concerns, no goals
    }));
    fs.writeFileSync(path.join(analysisDir, '2026-03-16.json'), JSON.stringify({
      date: '2026-03-16',
      entries: null,
      totals: null,
      water_oz: null,
      weight: null,
      highlights: null,
      concerns: null,
    }));
    const { md } = runBuilder(dir);
    assert(md !== null, 'T4: output file created');
    assert(!md.includes('NaN'), 'T4: no NaN when totals/entries are null');
    assert(!md.includes('undefined'), 'T4: no undefined when totals/entries are null');
    assert(!md.includes('[object'), 'T4: no raw object stringification');
  }

  // ── TEST 5: calTarget = 0 (division by zero risk) ──
  console.log('\n--- Test 5: calTarget = 0 ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('zero-cal-target');
    writeGoals(profileDir, {
      activePlan: 'moderate',
      moderate: { calories: { daily: 0 }, protein: { grams: 0 }, water: { daily_oz: 0 } },
    });
    makeAnalysis(analysisDir, '2026-03-15', { totals: { calories: 1200, protein: 100, carbs: 150, fat: 40 } });
    makeAnalysis(analysisDir, '2026-03-16', { totals: { calories: 900, protein: 80, carbs: 120, fat: 35 } });
    let threw = false;
    let md = null;
    try {
      const result = runBuilder(dir);
      md = result.md;
    } catch (e) {
      threw = true;
    }
    assert(!threw, 'T5: builder does not crash with calTarget=0');
    if (md) {
      assert(!md.includes('Infinity'), 'T5: no Infinity from division by zero (calTarget=0 in highCalDays)');
      assert(!md.includes('NaN'), 'T5: no NaN with zero targets');
    }
  }

  // ── TEST 6: Negative calories (workout calorie burns) ──
  console.log('\n--- Test 6: Negative calories (workout burns) ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('negative-cals');
    writeGoals(profileDir, DEFAULT_GOALS);
    makeAnalysis(analysisDir, '2026-03-15', {
      entries: [
        { type: 'meal', description: 'Oatmeal', calories: 350, protein: 10 },
        { type: 'workout', description: 'Running 5k', calories: -400, protein: 0 },
      ],
      totals: { calories: -50, protein: 10, carbs: 50, fat: 5 },
    });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T6: output file created');
    assert(!md.includes('NaN'), 'T6: no NaN with negative totals');
    // std dev with negative calories should still produce a number
    const stdDevMatch = md.match(/std dev (\S+)/);
    if (stdDevMatch) {
      assert(!isNaN(parseFloat(stdDevMatch[1])), 'T6: std dev is a valid number');
    }
  }

  // ── TEST 7: Exactly 1 file (single-day std dev edge case) ──
  console.log('\n--- Test 7: Exactly 1 analysis file ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('single-file');
    writeGoals(profileDir, DEFAULT_GOALS);
    makeAnalysis(analysisDir, '2026-03-15', { totals: { calories: 1150, protein: 100, carbs: 140, fat: 38 } });
    let threw = false;
    let md = null;
    try {
      const result = runBuilder(dir);
      md = result.md;
    } catch (e) {
      threw = true;
    }
    assert(!threw, 'T7: builder does not crash with single analysis file');
    if (md) {
      assert(!md.includes('NaN'), 'T7: no NaN with single day (std dev of 1 item = 0)');
      // std dev of a single value should be 0
      const stdDevMatch = md.match(/std dev (\d+)/);
      if (stdDevMatch) {
        assert(stdDevMatch[1] === '0', `T7: std dev of 1 day is 0 (got ${stdDevMatch[1]})`);
      }
    }
  }

  // ── TEST 8: Exactly 7 files ──
  console.log('\n--- Test 8: Exactly 7 analysis files ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('seven-files');
    writeGoals(profileDir, DEFAULT_GOALS);
    for (let i = 1; i <= 7; i++) {
      const d = i < 10 ? `0${i}` : `${i}`;
      makeAnalysis(analysisDir, `2026-03-${d}`, { totals: { calories: 1200 + i * 10, protein: 100, carbs: 140, fat: 38 } });
    }
    const { md } = runBuilder(dir);
    assert(md !== null, 'T8: output file created with 7 files');
    assert(md.includes('7 days tracked'), 'T8: shows 7 days tracked');
    assert(!md.includes('last week') || !md.includes('Last Week'), 'T8: no last week section with only 7 files (no prior week data)');
    assert(!md.includes('NaN'), 'T8: no NaN with exactly 7 files');
  }

  // ── TEST 9: Exactly 14 files ──
  console.log('\n--- Test 9: Exactly 14 analysis files ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('fourteen-files');
    writeGoals(profileDir, DEFAULT_GOALS);
    for (let i = 1; i <= 14; i++) {
      const d = i < 10 ? `0${i}` : `${i}`;
      makeAnalysis(analysisDir, `2026-03-${d}`, { totals: { calories: 1100 + i * 10, protein: 100, carbs: 140, fat: 38 } });
    }
    const { md } = runBuilder(dir);
    assert(md !== null, 'T9: output file created with 14 files');
    assert(md.includes('7 days tracked'), 'T9: thisWeek shows 7 days');
    assert(!md.includes('NaN'), 'T9: no NaN with 14 files');
    // slice(-14, -7) gives days 1-7, slice(-7) gives days 8-14
    // The last 7 days should be days 8-14
    assert(md.includes('Mar 14') || md.includes('Mar 8'), 'T9: thisWeek contains one of the later dates');
  }

  // ── TEST 10: 0 days (all files corrupt) ──
  console.log('\n--- Test 10: All analysis files corrupt ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('all-corrupt');
    writeGoals(profileDir, DEFAULT_GOALS);
    fs.writeFileSync(path.join(analysisDir, '2026-03-15.json'), 'not json {{{');
    fs.writeFileSync(path.join(analysisDir, '2026-03-16.json'), '');
    fs.writeFileSync(path.join(analysisDir, '2026-03-17.json'), 'null');
    const { md } = runBuilder(dir);
    // 'null' parses successfully as JSON — it's valid JSON, but accessing .date on null will throw
    // The builder has a try/catch that skips corrupt files, so it depends on whether null triggers
    assert(md !== null, 'T10: output file created when all files are corrupt');
    assert(md.includes('No analysis') || md.includes('Weekly Summary'), 'T10: shows fallback or summary header');
    assert(!md.includes('NaN'), 'T10: no NaN');
  }

  // ── TEST 11: 0 meals but has weight/water data ──
  console.log('\n--- Test 11: Zero meals, weight and water present ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('no-meals');
    writeGoals(profileDir, DEFAULT_GOALS);
    // Entries with no meals (only workout), cal=0, mealCount=0 should cause day to be skipped
    makeAnalysis(analysisDir, '2026-03-15', {
      entries: [
        { type: 'workout', description: 'Yoga', calories: 0, protein: 0 },
      ],
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      water_oz: 80,
      weight: { value: 148.5 },
    });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T11: output file created');
    // cal=0 and mealCount=0 triggers the "skip empty days" guard
    assert(!md.includes('Yoga') || md.includes('workout'), 'T11: empty-cal day handled (skipped or shown without meal items)');
    assert(!md.includes('NaN'), 'T11: no NaN');
    // Weight trend should still be present in overview table
    assert(md.includes('lbs') || md.includes('no data'), 'T11: weight row rendered');
  }

  // ── TEST 12: Analysis files from 6 months ago ──
  console.log('\n--- Test 12: Old files (6 months ago) ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('old-files');
    writeGoals(profileDir, DEFAULT_GOALS);
    // Files from 6 months ago — they'll be included (builder just takes last 14 alphabetically)
    for (let i = 1; i <= 7; i++) {
      makeAnalysis(analysisDir, `2025-09-0${i}`, { totals: { calories: 1300, protein: 100, carbs: 140, fat: 38 } });
    }
    const { md } = runBuilder(dir);
    assert(md !== null, 'T12: output file created with old files');
    assert(!md.includes('NaN'), 'T12: no NaN with old dates');
    // Date formatting should work for old dates
    const dayHeaderMatch = md.match(/### \w{3}, \w{3} \d+/);
    assert(dayHeaderMatch !== null, `T12: day headers formatted correctly (got: ${md.match(/### .+/g)?.[0]})`);
  }

  // ── TEST 13: Highlights/concerns with markdown and special characters ──
  console.log('\n--- Test 13: Highlights/concerns with markdown special chars ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('markdown-injection');
    writeGoals(profileDir, DEFAULT_GOALS);
    makeAnalysis(analysisDir, '2026-03-15', {
      entries: [{ type: 'meal', description: 'Salad', calories: 300, protein: 20 }],
      totals: { calories: 1100, protein: 90, carbs: 120, fat: 35 },
      highlights: [
        'Great job! **Bold** and *italic* text',
        '## Fake heading injection\nWith newline',
      ],
      concerns: [
        'Watch out: `code injection`',
        '[Link injection](http://evil.com)',
      ],
    });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T13: output file created');
    assert(!md.includes('undefined'), 'T13: no undefined');
    // The builder does NOT sanitize highlights/concerns — it just embeds them
    // This test documents the actual behavior (not necessarily desired)
    const goodSection = md.includes('Great job!');
    assert(goodSection, 'T13: highlights content included in output');
    // Check that injected ## heading from highlights does NOT create a parseable section break
    // (it will be inline, not on its own line as a real heading)
    const hasInjectedH2 = /^## Fake heading injection/m.test(md);
    assert(!hasInjectedH2, 'T13: multiline highlight does not inject real ## heading into document structure');
  }

  // ── TEST 14: Weight missing on some days, present on others ──
  console.log('\n--- Test 14: Sparse weight data ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('sparse-weight');
    writeGoals(profileDir, DEFAULT_GOALS);
    makeAnalysis(analysisDir, '2026-03-11', { weight: { value: 151 } });
    makeAnalysis(analysisDir, '2026-03-12', { weight: null }); // no weight
    makeAnalysis(analysisDir, '2026-03-13', {}); // weight default (150 from makeAnalysis base)
    makeAnalysis(analysisDir, '2026-03-14', { weight: { value: null } }); // null value
    makeAnalysis(analysisDir, '2026-03-15', { weight: { value: undefined } }); // undefined value
    makeAnalysis(analysisDir, '2026-03-16', { weight: { value: 149 } });
    makeAnalysis(analysisDir, '2026-03-17', { weight: { value: 148 } });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T14: output file created');
    assert(!md.includes('NaN'), 'T14: no NaN with sparse weight data');
    assert(!md.includes('undefined'), 'T14: no undefined in output');
    // Weight trend should show a valid reading
    const weightRow = md.match(/Weight \| .+/);
    assert(weightRow !== null, 'T14: weight row present in table');
    if (weightRow) {
      assert(!weightRow[0].includes('NaN'), `T14: weight row has no NaN (got: ${weightRow[0]})`);
      assert(!weightRow[0].includes('undefined'), `T14: weight row has no undefined (got: ${weightRow[0]})`);
    }
  }

  // ── TEST 15: Timezone date formatting ──
  console.log('\n--- Test 15: Date formatting (timezone correctness) ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('timezone');
    writeGoals(profileDir, DEFAULT_GOALS);
    // Test boundary dates — months with different day counts, DST transitions
    makeAnalysis(analysisDir, '2026-03-08', { // DST spring-forward in US
      entries: [{ type: 'meal', description: 'Breakfast', calories: 400, protein: 30 }],
      totals: { calories: 1100, protein: 90, carbs: 120, fat: 35 },
    });
    makeAnalysis(analysisDir, '2026-02-28', { // end of February
      entries: [{ type: 'meal', description: 'Lunch', calories: 500, protein: 40 }],
      totals: { calories: 1200, protein: 100, carbs: 130, fat: 40 },
    });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T15: output file created');
    // The builder uses date + 'T12:00:00' to avoid midnight timezone bugs
    // Check: date headers should display the correct date (not off by one)
    if (md.includes('Mar')) {
      // "Mar 8" should appear, not "Mar 7" or "Mar 9"
      assert(md.includes('Mar 8') || md.includes('Mar 08'), 'T15: Mar 8 DST date renders correctly (not off by one)');
    }
    if (md.includes('Feb')) {
      assert(md.includes('Feb 28') || md.includes('Feb 27'), 'T15: Feb 28 renders as Feb 28 or nearby');
    }
    assert(!md.includes('NaN'), 'T15: no NaN in date-heavy output');
  }

  // ── TEST 16: Exactly 0 files in analysis dir (boundary from Test 1 — dir exists but empty) ──
  // Already covered by Test 1. This is a targeted check on the calorie consistency / std dev
  // when thisWeek is empty (days = []).
  console.log('\n--- Test 16: Std dev with empty thisWeek ---');
  {
    // The code runs: thisWeek.reduce(... Math.pow(d.cal - thisAvgCal, 2) ...) / thisWeek.length
    // If thisWeek is empty, thisAvgCal = 0, and thisWeek.length = 0 => 0/0 = NaN => Math.sqrt(NaN) = NaN => Math.round(NaN) = NaN
    // This path is only reached if days.length > 0 but slice(-7) is empty, which can't happen.
    // But let's verify the code path: with 1-6 files, thisWeek = those files, lastWeek = empty.
    const { dir, analysisDir, profileDir } = makeCoachDir('few-files-stddev');
    writeGoals(profileDir, DEFAULT_GOALS);
    makeAnalysis(analysisDir, '2026-03-15', { totals: { calories: 1200, protein: 100, carbs: 140, fat: 38 } });
    makeAnalysis(analysisDir, '2026-03-16', { totals: { calories: 1200, protein: 100, carbs: 140, fat: 38 } });
    // Only 2 files: days=[d1,d2], thisWeek=days.slice(-7)=[d1,d2], lastWeek=[]
    const { md } = runBuilder(dir);
    assert(md !== null, 'T16: output created with 2 files');
    assert(!md.includes('NaN'), 'T16: no NaN in std dev calculation with 2 identical calorie days');
    const stdMatch = md.match(/std dev (\d+)/);
    if (stdMatch) {
      assert(stdMatch[1] === '0', `T16: std dev is 0 when all cals identical (got ${stdMatch[1]})`);
    } else {
      assert(false, 'T16: Patterns section missing std dev line');
    }
  }

  // ── TEST 17: calTarget used in highCalDays with exactly calTarget * 1.1 boundary ──
  console.log('\n--- Test 17: High-cal boundary (exactly calTarget * 1.1) ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('boundary-cal');
    writeGoals(profileDir, DEFAULT_GOALS); // calTarget = 1200
    // Exactly 1320 = 1200 * 1.1 — borderline: 1320 > 1320 is false, so NOT counted as over-cal
    makeAnalysis(analysisDir, '2026-03-15', { totals: { calories: 1320, protein: 100, carbs: 140, fat: 38 } });
    makeAnalysis(analysisDir, '2026-03-16', { totals: { calories: 1321, protein: 100, carbs: 140, fat: 38 } }); // just over
    makeAnalysis(analysisDir, '2026-03-17', { totals: { calories: 1319, protein: 100, carbs: 140, fat: 38 } }); // just under
    const { md } = runBuilder(dir);
    assert(md !== null, 'T17: output file created');
    // 1321 should appear in over-cal days, 1320 should NOT
    const overCalLine = md.match(/Over-cal days: (.+)/i);
    if (overCalLine) {
      // 1321 cal day is 2026-03-16 (Sun or Mon depending on calendar)
      assert(!md.includes('no over-cal'), 'T17: over-cal detection fires for 1321 cal day');
    }
    assert(!md.includes('NaN'), 'T17: no NaN near cal target boundary');
  }

  // ── TEST 18: Analysis with entries but no calories (meals missing cal field) ──
  console.log('\n--- Test 18: Meals with missing calorie fields ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('missing-meal-cals');
    writeGoals(profileDir, DEFAULT_GOALS);
    makeAnalysis(analysisDir, '2026-03-15', {
      entries: [
        { type: 'meal', description: 'Mystery Food' }, // no calories, no protein
        { type: 'meal', description: 'Another Food', calories: null, protein: null },
        { type: 'meal' }, // no description, no calories
      ],
      totals: { calories: 1100, protein: 85, carbs: 130, fat: 35 },
    });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T18: output file created');
    assert(!md.includes('NaN'), 'T18: no NaN when meal entries have no calorie fields');
    assert(!md.includes('undefined'), 'T18: no undefined when meal desc/cals missing');
    // Meals with no description should render as empty string, not "undefined"
    const mealLines = md.match(/^- .+$/gm) || [];
    for (const line of mealLines) {
      assert(!line.includes('undefined'), `T18: meal line has no undefined: "${line}"`);
    }
  }

  // ── TEST 19: Protein target = 0 (proBelow calculation) ──
  console.log('\n--- Test 19: Protein target = 0 ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('zero-protein');
    writeGoals(profileDir, {
      activePlan: 'moderate',
      moderate: { calories: { daily: 1200 }, protein: { grams: 0 }, water: { daily_oz: 64 } },
    });
    makeAnalysis(analysisDir, '2026-03-15', { totals: { calories: 1200, protein: 100, carbs: 140, fat: 38 } });
    makeAnalysis(analysisDir, '2026-03-16', { totals: { calories: 1100, protein: 0, carbs: 120, fat: 30 } });
    let threw = false;
    let md = null;
    try {
      const result = runBuilder(dir);
      md = result.md;
    } catch (e) {
      threw = true;
    }
    assert(!threw, 'T19: builder does not crash with proTarget=0');
    if (md) {
      // proBelow checks d.protein < proTarget * 0.85 = 0 * 0.85 = 0
      // All protein values >= 0, so proBelow should be empty unless protein is literally negative
      assert(!md.includes('NaN'), 'T19: no NaN with zero protein target');
      assert(!md.includes('Infinity'), 'T19: no Infinity with zero protein target');
    }
  }

  // ── TEST 20: waterTarget = 0 (waterStatus logic) ──
  console.log('\n--- Test 20: Water target = 0 ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('zero-water');
    writeGoals(profileDir, {
      activePlan: 'moderate',
      moderate: { calories: { daily: 1200 }, protein: { grams: 105 }, water: { daily_oz: 0 } },
    });
    makeAnalysis(analysisDir, '2026-03-15', { water_oz: 0, totals: { calories: 1200, protein: 100, carbs: 140, fat: 38 } });
    makeAnalysis(analysisDir, '2026-03-16', { water_oz: 32, totals: { calories: 1100, protein: 95, carbs: 120, fat: 35 } });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T20: output file created');
    // 0 >= 0 is true, so all days "hit" water when target is 0
    assert(!md.includes('NaN'), 'T20: no NaN with zero water target');
    const waterRow = md.match(/Water \| .+/);
    if (waterRow) {
      // Should show 2/2 or similar
      assert(waterRow[0].includes('2/2') || waterRow[0].includes('good'), `T20: water all-hit with target=0 (row: ${waterRow[0]})`);
    }
  }

  // ── TEST 21: Malformed date in analysis file ──
  console.log('\n--- Test 21: Malformed date field ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('bad-date');
    writeGoals(profileDir, DEFAULT_GOALS);
    fs.writeFileSync(path.join(analysisDir, '2026-03-15.json'), JSON.stringify({
      date: 'not-a-date',
      entries: [{ type: 'meal', description: 'Food', calories: 400, protein: 30 }],
      totals: { calories: 1100, protein: 90, carbs: 120, fat: 35 },
      water_oz: 64,
    }));
    fs.writeFileSync(path.join(analysisDir, '2026-03-16.json'), JSON.stringify({
      date: null,
      entries: [{ type: 'meal', description: 'More Food', calories: 500, protein: 40 }],
      totals: { calories: 1200, protein: 100, carbs: 130, fat: 40 },
      water_oz: 70,
    }));
    let threw = false;
    let md = null;
    try {
      const result = runBuilder(dir);
      md = result.md;
    } catch (e) {
      threw = true;
    }
    assert(!threw, 'T21: builder does not crash with malformed date fields');
    if (md) {
      assert(!md.includes('NaN'), 'T21: no NaN with bad date (Invalid Date rendered)');
      // Date rendering: new Date('not-a-date' + 'T12:00:00').toLocaleDateString(...) = "Invalid Date"
      // This is a documentation of actual behavior — Invalid Date will appear if not guarded
      // Check whether builder shows "Invalid Date" in day headers
      const hasInvalid = md.includes('Invalid Date');
      if (hasInvalid) {
        // This is a bug — document it
        assert(false, 'T21: "Invalid Date" appears in output (malformed date not guarded)');
      }
    }
  }

  // ── TEST 22: goals.activePlan references a plan that does not exist ──
  console.log('\n--- Test 22: activePlan references nonexistent plan ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('missing-plan');
    writeGoals(profileDir, {
      activePlan: 'hardcore', // 'hardcore' key does not exist in goals
      moderate: { calories: { daily: 1200 }, protein: { grams: 105 }, water: { daily_oz: 64 } },
      // no 'hardcore' key
    });
    makeAnalysis(analysisDir, '2026-03-15');
    makeAnalysis(analysisDir, '2026-03-16');
    const { md } = runBuilder(dir);
    assert(md !== null, 'T22: output file created');
    // goals[activePlan] = goals['hardcore'] = undefined, falls back to goals.moderate
    // So calTarget should be 1200 (moderate fallback)
    assert(md.includes('1200'), 'T22: falls back to moderate targets when activePlan key missing');
    assert(!md.includes('NaN'), 'T22: no NaN with missing plan key');
    assert(!md.includes('undefined'), 'T22: no undefined with missing plan key');
  }

  // ── TEST 23: Very large number of analysis files (>14) ──
  console.log('\n--- Test 23: Many analysis files (30 days) ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('many-files');
    writeGoals(profileDir, DEFAULT_GOALS);
    // Write 30 files across two months
    for (let i = 1; i <= 28; i++) {
      const d = i < 10 ? `0${i}` : `${i}`;
      makeAnalysis(analysisDir, `2026-02-${d}`, { totals: { calories: 1100 + i * 5, protein: 95, carbs: 120, fat: 35 } });
    }
    makeAnalysis(analysisDir, '2026-03-01');
    makeAnalysis(analysisDir, '2026-03-02');
    const { md } = runBuilder(dir);
    assert(md !== null, 'T23: output file created with 30 files');
    // Builder takes last 14 alphabetically — should be Feb 15–28 + Mar 01–02
    assert(md.includes('7 days tracked') || md.includes('days tracked'), 'T23: shows days tracked');
    assert(!md.includes('NaN'), 'T23: no NaN with 30 files');
  }

  // ── TEST 24: All days have calStatus = 'over' (calHits = 0) ──
  console.log('\n--- Test 24: All days over calories ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('all-over-cal');
    writeGoals(profileDir, DEFAULT_GOALS); // calTarget = 1200
    for (let i = 15; i <= 21; i++) {
      makeAnalysis(analysisDir, `2026-03-${i}`, {
        entries: [{ type: 'meal', description: 'Big meal', calories: 2000, protein: 80 }],
        totals: { calories: 2000, protein: 80, carbs: 200, fat: 80 },
        goals: { calories: { status: 'over' } },
      });
    }
    const { md } = runBuilder(dir);
    assert(md !== null, 'T24: output file created');
    assert(md.includes('0/7 days on target'), 'T24: 0/7 days on target when all over cal');
    assert(!md.includes('NaN'), 'T24: no NaN');
  }

  // ── TEST 25: goals.weight.goal missing (weight goal display) ──
  console.log('\n--- Test 25: Missing weight goal ---');
  {
    const { dir, analysisDir, profileDir } = makeCoachDir('no-weight-goal');
    writeGoals(profileDir, {
      activePlan: 'moderate',
      moderate: { calories: { daily: 1200 }, protein: { grams: 105 }, water: { daily_oz: 64 } },
      // no weight.goal
    });
    makeAnalysis(analysisDir, '2026-03-15', { weight: { value: 150 } });
    makeAnalysis(analysisDir, '2026-03-16', { weight: { value: 149 } });
    const { md } = runBuilder(dir);
    assert(md !== null, 'T25: output file created');
    // goals.weight?.goal || '?' should produce '?'
    const weightRow = md.match(/Weight \| .+/);
    if (weightRow) {
      assert(weightRow[0].includes('?'), `T25: missing weight goal shows ? (got: ${weightRow[0]})`);
    }
    assert(!md.includes('undefined'), 'T25: no undefined for missing weight goal');
  }

} finally {
  cleanup();
}

// ── Results ──
console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (failures.length) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(fail > 0 ? 1 : 0);
