// test-fixtures/test-coach-plugin.js — Tests for Coach plugin setup + conversations builder
// Usage: node test-fixtures/test-coach-plugin.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
const failures = [];

function assert(ok, name, detail) {
  if (ok) { pass++; console.log(`  OK: ${name}`); }
  else { fail++; const m = detail ? `${name} (${detail})` : name; failures.push(m); console.log(`  FAIL: ${m}`); }
}

// Create a temp Coach folder for testing
const tmpDir = path.join(os.tmpdir(), `coach-test-${Date.now()}`);
const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} };

try {
  // ── TEST 1: Plugin templates exist and have key sections ──
  console.log('\n--- Plugin Templates ---');
  const pluginDir = path.join(__dirname, '..', 'coach-plugin');

  const soulPath = path.join(pluginDir, 'SOUL.md');
  const claudePath = path.join(pluginDir, 'CLAUDE.md');
  const convBuilderPath = path.join(pluginDir, 'build-conversations.js');

  assert(fs.existsSync(soulPath), 'SOUL.md exists');
  assert(fs.existsSync(claudePath), 'CLAUDE.md exists');
  assert(fs.existsSync(convBuilderPath), 'build-conversations.js exists');

  if (fs.existsSync(soulPath)) {
    const soul = fs.readFileSync(soulPath, 'utf8');
    assert(soul.includes('Your Essence'), 'SOUL.md has Essence section');
    assert(soul.includes('Core Traits'), 'SOUL.md has Core Traits');
    assert(soul.includes('How You Communicate'), 'SOUL.md has Communication style');
    assert(soul.includes("What You're Not"), 'SOUL.md has anti-patterns');
    assert(soul.includes('On Hard Days'), 'SOUL.md has Hard Days guidance');
    assert(soul.includes('On Wins'), 'SOUL.md has Wins guidance');
    assert(soul.includes('No "nourish your body"') || soul.includes('No corporate wellness'), 'SOUL.md bans wellness-speak');
    assert(soul.includes('over-count') || soul.includes('over-estimate'), 'SOUL.md mentions over-counting');
    assert(soul.includes('shame') || soul.includes('never harsh'), 'SOUL.md has no-shame rule');
  }

  if (fs.existsSync(claudePath)) {
    const claude = fs.readFileSync(claudePath, 'utf8');
    assert(claude.includes('SOUL.md'), 'CLAUDE.md references SOUL.md');
    assert(claude.includes('USER.md'), 'CLAUDE.md references USER.md');
    assert(claude.includes('conversations.md'), 'CLAUDE.md references conversations.md');
    assert(claude.includes('On Session Start'), 'CLAUDE.md has session start instructions');
    assert(claude.includes('analysis/'), 'CLAUDE.md references analysis dir');
    assert(claude.includes('profile/'), 'CLAUDE.md references profile dir');
    assert(claude.includes('/setup'), 'CLAUDE.md references setup skill');
    assert(claude.includes('real logged data'), 'CLAUDE.md has data-over-plans rule');
  }

  // ── TEST 2: Setup skill exists and has key sections ──
  console.log('\n--- Setup Skill ---');
  const setupPath = path.join(__dirname, '..', '.claude', 'skills', 'setup', 'SKILL.md');
  // Try force-read even if gitignored
  let setupContent = '';
  try { setupContent = fs.readFileSync(setupPath, 'utf8'); } catch (e) {}

  if (setupContent) {
    assert(setupContent.includes('~/Coach'), 'Setup creates ~/Coach');
    assert(setupContent.includes('coach alias') || setupContent.includes('function coach'), 'Setup installs alias');
    assert(setupContent.includes('HEALTH_SYNC_URL'), 'Setup configures sync URL');
    assert(setupContent.includes('HEALTH_SYNC_KEY'), 'Setup configures sync key');
    assert(setupContent.includes('onboarding') || setupContent.includes('Onboarding'), 'Setup has onboarding flow');
    assert(setupContent.includes('height') || setupContent.includes('weight'), 'Setup asks about stats');
    assert(setupContent.includes('goals.json'), 'Setup writes goals');
    assert(setupContent.includes('preferences.json'), 'Setup writes preferences');
    assert(setupContent.includes('USER.md'), 'Setup writes USER.md');
    assert(setupContent.includes('scheduled') || setupContent.includes('ScheduledTask') || setupContent.includes('crontab'), 'Setup creates scheduled task');
    assert(setupContent.includes('PowerShell') || setupContent.includes('powershell'), 'Setup supports Windows');
    assert(setupContent.includes('bash') || setupContent.includes('Bash') || setupContent.includes('zsh'), 'Setup supports Mac/Linux');
    assert(!setupContent.includes('fork') || setupContent.includes('No fork'), 'Setup does not require forking');
    assert(!setupContent.includes('wrangler deploy'), 'Setup does not require Cloudflare account');
    assert(setupContent.includes('emilyn-90a'), 'Setup has hardcoded relay URL');
  } else {
    assert(false, 'Setup skill readable (may be gitignored)');
  }

  // ── TEST 3: Conversations builder — mock data ──
  console.log('\n--- Conversations Builder ---');

  // Create temp Coach folder with mock analysis and daily data
  const mockCoach = tmpDir;
  const mockAnalysis = path.join(mockCoach, 'analysis');
  const mockData = path.join(mockCoach, 'mock-data');
  const mockDaily = path.join(mockData, 'daily', '2026-03-20');

  fs.mkdirSync(mockAnalysis, { recursive: true });
  fs.mkdirSync(mockDaily, { recursive: true });

  // Mock analysis with coach responses
  fs.writeFileSync(path.join(mockAnalysis, '2026-03-20.json'), JSON.stringify({
    date: '2026-03-20',
    coachResponses: [
      { replyTo: 'msg_001', text: 'Great question about snacks!', timestamp: 1773290000000 },
      { replyTo: 'msg_002', text: 'Try Greek yogurt for protein.', timestamp: 1773290001000 },
    ],
  }));

  // Mock log.json with user messages
  fs.writeFileSync(path.join(mockDaily, 'log.json'), JSON.stringify({
    date: '2026-03-20',
    coachChat: [
      { id: 'msg_001', role: 'user', text: 'What are good snacks?', timestamp: 1773282647792 },
      { id: 'msg_002', role: 'user', text: 'Need more protein ideas', timestamp: 1773282658558 },
    ],
  }));

  // Run builder with env vars pointing to mock dirs
  const builderSrc = fs.readFileSync(convBuilderPath, 'utf8').replace(/^#!.*\n/, '');
  // Write a wrapper that overrides the dirs
  const wrapperPath = path.join(tmpDir, 'run-builder.js');
  fs.writeFileSync(wrapperPath, `
    process.env.COACH_DIR = ${JSON.stringify(mockCoach)};
    process.env.HEALTH_DATA_DIR = ${JSON.stringify(mockData)};
    ${builderSrc}
  `);

  try {
    const output = execSync(`node "${wrapperPath}"`, { encoding: 'utf8', timeout: 10000 });
    assert(output.includes('Built conversations.md'), 'Builder runs successfully');

    const convPath = path.join(mockCoach, 'conversations.md');
    assert(fs.existsSync(convPath), 'conversations.md created');

    if (fs.existsSync(convPath)) {
      const conv = fs.readFileSync(convPath, 'utf8');

      assert(conv.includes('# Conversations'), 'Has title');
      assert(conv.includes('What are good snacks?'), 'Contains user message 1');
      assert(conv.includes('Need more protein ideas'), 'Contains user message 2');
      assert(conv.includes('Great question about snacks!'), 'Contains coach response 1');
      assert(conv.includes('Try Greek yogurt'), 'Contains coach response 2');
      assert(conv.includes('**You**'), 'User messages labeled as You');
      assert(conv.includes('**Coach**'), 'Coach responses labeled as Coach');
      assert(conv.includes('March'), 'Has date header');

      // Check ordering: user messages before coach responses (grouped by time)
      const userIdx = conv.indexOf('What are good snacks?');
      const coachIdx = conv.indexOf('Great question about snacks!');
      assert(userIdx < coachIdx, 'User message appears before coach response');

      // Check both user messages appear in order
      const msg1Idx = conv.indexOf('What are good snacks?');
      const msg2Idx = conv.indexOf('Need more protein ideas');
      assert(msg1Idx < msg2Idx, 'User messages in chronological order');
    }
  } catch (e) {
    assert(false, 'Builder execution', e.message);
  }

  // ── TEST 4: Builder handles empty data gracefully ──
  console.log('\n--- Builder Edge Cases ---');

  const emptyCoach = path.join(tmpDir, 'empty-coach');
  const emptyAnalysis = path.join(emptyCoach, 'analysis');
  fs.mkdirSync(emptyAnalysis, { recursive: true });

  const emptyWrapper = path.join(tmpDir, 'run-builder-empty.js');
  fs.writeFileSync(emptyWrapper, `
    process.env.COACH_DIR = ${JSON.stringify(emptyCoach)};
    process.env.HEALTH_DATA_DIR = ${JSON.stringify(path.join(tmpDir, 'nonexistent'))};
    ${builderSrc}
  `);

  try {
    execSync(`node "${emptyWrapper}"`, { encoding: 'utf8', timeout: 10000 });
    const emptyConv = fs.readFileSync(path.join(emptyCoach, 'conversations.md'), 'utf8');
    assert(emptyConv.includes('No conversations yet'), 'Empty data shows placeholder');
    assert(!emptyConv.includes('undefined'), 'No undefined in empty output');
    assert(!emptyConv.includes('null'), 'No null in empty output');
  } catch (e) {
    assert(false, 'Builder handles empty data', e.message);
  }

  // ── TEST 5: Builder handles corrupt/malformed files ──
  const corruptCoach = path.join(tmpDir, 'corrupt-coach');
  const corruptAnalysis = path.join(corruptCoach, 'analysis');
  fs.mkdirSync(corruptAnalysis, { recursive: true });

  // Write corrupt JSON
  fs.writeFileSync(path.join(corruptAnalysis, '2026-03-20.json'), 'not json at all{{{');

  const corruptWrapper = path.join(tmpDir, 'run-builder-corrupt.js');
  fs.writeFileSync(corruptWrapper, `
    process.env.COACH_DIR = ${JSON.stringify(corruptCoach)};
    process.env.HEALTH_DATA_DIR = ${JSON.stringify(path.join(tmpDir, 'nonexistent'))};
    ${builderSrc}
  `);

  try {
    execSync(`node "${corruptWrapper}"`, { encoding: 'utf8', timeout: 10000 });
    assert(true, 'Builder survives corrupt JSON');
  } catch (e) {
    assert(false, 'Builder survives corrupt JSON', e.message);
  }

  // ── TEST 6: Builder deduplicates messages ──
  console.log('\n--- Deduplication ---');

  const dupeCoach = path.join(tmpDir, 'dupe-coach');
  const dupeAnalysis = path.join(dupeCoach, 'analysis');
  const dupeData = path.join(tmpDir, 'dupe-data');
  const dupeDaily = path.join(dupeData, 'daily', '2026-03-20');
  fs.mkdirSync(dupeAnalysis, { recursive: true });
  fs.mkdirSync(dupeDaily, { recursive: true });

  // Same messages in both analysis and daily
  fs.writeFileSync(path.join(dupeAnalysis, '2026-03-20.json'), JSON.stringify({
    date: '2026-03-20',
    coachResponses: [
      { replyTo: 'msg_dup', text: 'Coach says hello', timestamp: 1773290000000 },
    ],
  }));

  fs.writeFileSync(path.join(dupeDaily, 'log.json'), JSON.stringify({
    date: '2026-03-20',
    coachChat: [
      { id: 'msg_dup', role: 'user', text: 'Hello coach', timestamp: 1773282647792 },
      { id: 'msg_dup', role: 'user', text: 'Hello coach', timestamp: 1773282647792 }, // exact duplicate
    ],
  }));

  const dupeWrapper = path.join(tmpDir, 'run-builder-dupe.js');
  fs.writeFileSync(dupeWrapper, `
    process.env.COACH_DIR = ${JSON.stringify(dupeCoach)};
    process.env.HEALTH_DATA_DIR = ${JSON.stringify(dupeData)};
    ${builderSrc}
  `);

  try {
    execSync(`node "${dupeWrapper}"`, { encoding: 'utf8', timeout: 10000 });
    const dupeConv = fs.readFileSync(path.join(dupeCoach, 'conversations.md'), 'utf8');
    const helloCount = (dupeConv.match(/Hello coach/g) || []).length;
    assert(helloCount === 1, `Duplicate messages deduplicated (found ${helloCount})`);
  } catch (e) {
    assert(false, 'Deduplication test', e.message);
  }

  // ── TEST 7: Live Coach folder validation (Emily's actual setup) ──
  console.log('\n--- Live Coach Folder ---');
  const liveCoach = path.join(os.homedir(), 'Coach');

  if (fs.existsSync(liveCoach)) {
    assert(fs.existsSync(path.join(liveCoach, 'CLAUDE.md')), 'Live: CLAUDE.md exists');
    assert(fs.existsSync(path.join(liveCoach, 'SOUL.md')), 'Live: SOUL.md exists');
    assert(fs.existsSync(path.join(liveCoach, 'USER.md')), 'Live: USER.md exists');
    assert(fs.existsSync(path.join(liveCoach, 'conversations.md')), 'Live: conversations.md exists');

    const liveConv = fs.readFileSync(path.join(liveCoach, 'conversations.md'), 'utf8');
    assert(liveConv.includes('# Conversations'), 'Live: conversations.md has header');
    assert(!liveConv.includes('undefined'), 'Live: no undefined values');

    // Check profile data exists
    assert(fs.existsSync(path.join(liveCoach, 'profile', 'goals.json')), 'Live: goals.json exists');
    assert(fs.existsSync(path.join(liveCoach, 'profile', 'preferences.json')), 'Live: preferences.json exists');
    assert(fs.existsSync(path.join(liveCoach, 'profile', 'regimen.json')), 'Live: regimen.json exists');

    // Check analysis data exists
    const analysisFiles = fs.readdirSync(path.join(liveCoach, 'analysis')).filter(f => f.endsWith('.json'));
    assert(analysisFiles.length > 0, `Live: has ${analysisFiles.length} analysis files`);

    // Validate a goals.json structure
    try {
      const goals = JSON.parse(fs.readFileSync(path.join(liveCoach, 'profile', 'goals.json'), 'utf8'));
      assert(goals.activePlan, 'Live: goals has activePlan');
      assert(goals.moderate || goals.hardcore, 'Live: goals has plan variants');
    } catch (e) {
      assert(false, 'Live: goals.json valid JSON', e.message);
    }
  } else {
    console.log('  SKIP: ~/Coach not found (not set up on this machine)');
  }

  // ── TEST 8: PowerShell alias check ──
  console.log('\n--- Alias ---');
  try {
    const profile = execSync('powershell -NoProfile -Command "Get-Content $PROFILE"', { encoding: 'utf8' });
    assert(profile.includes('function coach'), 'PowerShell profile has coach function');
    assert(profile.includes('Coach') && profile.includes('claude'), 'Alias cd\'s to Coach and runs claude');
  } catch (e) {
    console.log('  SKIP: PowerShell profile not readable');
  }

} finally {
  cleanup();
}

// ── Results ──
console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(fail > 0 ? 1 : 0);
