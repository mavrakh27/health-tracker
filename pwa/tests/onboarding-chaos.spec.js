// Onboarding edge case and chaos tests — uses playwright (not @playwright/test)
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8083';
let browser, context, page;
const results = [];
let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function runTest(name, fn) {
  testCount++;
  process.stdout.write(`  [${testCount}] ${name} ... `);
  try {
    // Fresh page per test
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let alertTriggered = false;
    let alertMsg = null;
    page.on('dialog', async dialog => {
      alertTriggered = true;
      alertMsg = dialog.message();
      await dialog.dismiss();
    });

    await fn(page, errors, { get alertTriggered() { return alertTriggered; }, get alertMsg() { return alertMsg; } });
    passCount++;
    console.log('PASS');
    results.push({ name, status: 'PASS' });
  } catch (e) {
    failCount++;
    console.log('FAIL');
    console.log(`    ${e.message}`);
    results.push({ name, status: 'FAIL', error: e.message });
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();

  console.log('\n=== EDGE CASE 1: Malformed URL params (index.html) ===\n');

  await runTest('empty key /?key=', async (page, errors) => {
    await page.goto(`${BASE}/?key=`);
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
  });

  await runTest('invalid key /?key=not-a-uuid', async (page, errors) => {
    await page.goto(`${BASE}/?key=not-a-uuid`);
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
  });

  await runTest('relay without key /?relay=https://example.com', async (page, errors) => {
    await page.goto(`${BASE}/?relay=https://example.com`);
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
  });

  await runTest('key with empty relay /?key=uuid&relay=', async (page, errors) => {
    await page.goto(`${BASE}/?key=550e8400-e29b-41d4-a716-446655440000&relay=`);
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
  });

  await runTest('XSS attempt /?key=<script>alert(1)</script>', async (page, errors, state) => {
    await page.goto(`${BASE}/?key=<script>alert(1)</script>`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    assert(!state.alertTriggered, 'XSS alert was triggered!');
    const html = await page.content();
    assert(!html.includes('<script>alert(1)</script>'), 'Raw script tag found in page HTML');
  });

  await runTest('null byte /?key=a%00b', async (page, errors) => {
    await page.goto(`${BASE}/?key=a%00b`);
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
  });

  await runTest('extremely long key (5000 chars)', async (page, errors) => {
    const longKey = 'a'.repeat(5000);
    await page.goto(`${BASE}/?key=${longKey}`);
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
  });

  await runTest('special HTML chars /?key=<>&"\'', async (page, errors, state) => {
    await page.goto(`${BASE}/?key=${encodeURIComponent('<>&"\'')}`);
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
    assert(!state.alertTriggered, 'Alert triggered');
  });

  console.log('\n=== EDGE CASE 1b: Malformed URL params (welcome.html) ===\n');

  await runTest('XSS via ?sync= on welcome.html', async (page, errors, state) => {
    await page.goto(`${BASE}/welcome.html?sync=<script>alert(1)</script>`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    assert(!state.alertTriggered, 'XSS alert was triggered via sync param!');
    // The sync param auto-fills input and clicks generate — input should have the value
    const inputVal = await page.inputValue('#pair-key');
    assert(inputVal.includes('<script>'), 'Input should contain raw text of script tag');
  });

  await runTest('XSS via ?key= on welcome.html (redirect)', async (page, errors, state) => {
    await page.goto(`${BASE}/welcome.html?key="><script>alert(1)</script>`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    assert(!state.alertTriggered, 'XSS alert triggered during redirect!');
  });

  await runTest('Parameter injection via welcome.html ?key= redirect', async (page, errors) => {
    // welcome.html line 596: location.href = ...?key=${params.get('key')}...
    // params.get('key') returns decoded value — if key contains & it could inject params
    await page.goto(`${BASE}/welcome.html?key=abc%26relay%3Dhttps://evil.com`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const url = page.url();
    // After redirect, check if evil.com ended up as the relay parameter
    // The redirect in welcome.html does NOT use encodeURIComponent on params.get('key')
    const urlObj = new URL(url);
    const relay = urlObj.searchParams.get('relay');
    const isInjected = relay === 'https://evil.com';
    if (isInjected) {
      console.log('    WARNING: Parameter injection successful! relay was overridden to evil.com');
      console.log(`    Final URL: ${url}`);
    }
    // This is a FINDING — log it even if we don't fail the test
    results.push({ name: '  -> SECURITY NOTE: relay param injection via welcome.html redirect',
                    status: isInjected ? 'ISSUE' : 'OK',
                    error: isInjected ? `Relay was injected: ${relay}` : 'Params properly isolated' });
  });

  console.log('\n=== EDGE CASE 2: Welcome.html chaos inputs ===\n');

  await runTest('extremely long string in sync key (1500 chars)', async (page, errors) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    await page.fill('#pair-key', 'x'.repeat(1500));
    await page.click('#pair-generate');
    await page.waitForTimeout(500);
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
    const visible = await page.isVisible('#pair-result');
    assert(visible, 'QR result should be visible');
  });

  await runTest('special characters <>&"\' in input', async (page, errors, state) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    await page.fill('#pair-key', '<>&"\'');
    await page.click('#pair-generate');
    await page.waitForTimeout(500);
    assert(errors.length === 0, `Got JS errors: ${errors.join(', ')}`);
    assert(!state.alertTriggered, 'Alert triggered');
    const urlText = await page.textContent('#pair-url-display');
    // Key should be URL-encoded in the display
    assert(urlText.includes('%3C'), 'URL should contain encoded < (%3C)');
  });

  await runTest('empty string submit shows alert', async (page, errors, state) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    await page.click('#pair-generate');
    await page.waitForTimeout(300);
    assert(state.alertTriggered, 'Should show alert for empty key');
    assert(state.alertMsg === 'Enter your sync key', `Wrong alert message: ${state.alertMsg}`);
    const visible = await page.isVisible('#pair-result');
    assert(!visible, 'QR result should NOT be visible');
  });

  await runTest('rapid-click copy buttons (20x)', async (page, errors) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    await page.fill('#pair-key', 'test-key-123');
    await page.click('#pair-generate');
    await page.waitForTimeout(300);

    // Rapid-click URL copy button
    for (let i = 0; i < 20; i++) {
      await page.click('#pair-copy-url', { force: true });
    }
    await page.waitForTimeout(300);
    assert(errors.length === 0, `Got JS errors from rapid copy URL: ${errors.join(', ')}`);

    // Rapid-click command copy buttons
    const copyBtns = await page.$$('.copy-btn[data-copy]');
    for (const btn of copyBtns) {
      for (let i = 0; i < 10; i++) {
        await btn.click({ force: true });
      }
    }
    await page.waitForTimeout(300);
    assert(errors.length === 0, `Got JS errors from rapid copy cmds: ${errors.join(', ')}`);
  });

  await runTest('img onerror XSS via sync key input', async (page, errors, state) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    await page.fill('#pair-key', '"><img src=x onerror=alert(1)>');
    await page.click('#pair-generate');
    await page.waitForTimeout(1000);
    assert(!state.alertTriggered, 'XSS via img onerror triggered!');
    assert(errors.length === 0, `JS errors: ${errors.join(', ')}`);
  });

  console.log('\n=== EDGE CASE 3: Navigation edge cases ===\n');

  await runTest('welcome.html -> index -> back button', async (page, errors) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    await page.goBack();
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `JS errors: ${errors.join(', ')}`);
    assert(page.url().includes('welcome.html'), `Should be back on welcome.html, got: ${page.url()}`);
  });

  await runTest('app with ?key=, refresh preserves key', async (page, errors) => {
    await page.goto(`${BASE}/?key=test-refresh-key`);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `JS errors: ${errors.join(', ')}`);
    // In browser mode (not standalone), key should stay in URL
    assert(page.url().includes('key=test-refresh-key'), `Key should persist in URL after refresh, got: ${page.url()}`);
  });

  await runTest('app with ?key=, back button', async (page, errors) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${BASE}/?key=test-back-key`);
    await page.waitForLoadState('networkidle');
    await page.goBack();
    await page.waitForLoadState('networkidle');
    assert(errors.length === 0, `JS errors: ${errors.join(', ')}`);
  });

  await runTest('welcome.html ?key= redirect does not loop', async (page, errors) => {
    await page.goto(`${BASE}/welcome.html?key=test-uuid`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    assert(errors.length === 0, `JS errors: ${errors.join(', ')}`);
    assert(!page.url().includes('welcome.html'), `Should have redirected away from welcome.html, got: ${page.url()}`);
    assert(page.url().includes('key=test-uuid'), `Should preserve key in redirect, got: ${page.url()}`);
  });

  console.log('\n=== EDGE CASE 4: CDN dependency (QR code library) ===\n');

  await runTest('QR library loads from CDN', async (page) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    const qrAvailable = await page.evaluate(() => typeof qrcode !== 'undefined');
    assert(qrAvailable, 'QR library should be loaded');
  });

  // Need a new context for route blocking
  await runTest('graceful degradation when CDN blocked', async (page, errors) => {
    // Block CDN at context level for this test
    await page.route('**/cdn.jsdelivr.net/**', route => route.abort());

    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    assert(title.includes('Coach'), `Page should load. Title: ${title}`);

    const qrAvailable = await page.evaluate(() => typeof qrcode !== 'undefined');
    assert(!qrAvailable, 'QR library should NOT be loaded when CDN is blocked');

    // Try generating — should not crash
    await page.fill('#pair-key', 'test-no-cdn');
    await page.click('#pair-generate');
    await page.waitForTimeout(500);

    // Filter errors — QR-related console.error is expected, actual crashes are not
    const crashErrors = errors.filter(e => !e.toLowerCase().includes('qr') && !e.toLowerCase().includes('qrcode'));
    assert(crashErrors.length === 0, `Non-QR JS errors: ${crashErrors.join(', ')}`);

    // URL display should still work even without QR canvas
    const resultVisible = await page.isVisible('#pair-result');
    assert(resultVisible, 'Pair result section should still be visible (URL without QR)');

    const urlText = await page.textContent('#pair-url-display');
    assert(urlText.includes('test-no-cdn'), 'URL should still display correctly');
  });

  console.log('\n=== EDGE CASE 5: Service Worker interaction ===\n');

  await runTest('welcome.html NOT in SW cache list', async () => {
    const { readFileSync } = require('fs');
    const swContent = readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf-8');
    assert(!swContent.includes('welcome.html'), 'welcome.html should NOT be in SW ASSETS list');
  });

  await runTest('welcome.html loads online', async (page) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    const heroText = await page.textContent('.hero h1');
    assert(heroText === 'Coach', `Hero should say "Coach", got: ${heroText}`);
  });

  console.log('\n=== Additional Security Tests ===\n');

  await runTest('pair URL uses encodeURIComponent for key', async (page) => {
    await page.goto(`${BASE}/welcome.html`);
    await page.waitForLoadState('networkidle');
    await page.fill('#pair-key', 'test&evil=true');
    await page.click('#pair-generate');
    await page.waitForTimeout(300);
    const urlText = await page.textContent('#pair-url-display');
    assert(urlText.includes('test%26evil%3Dtrue'), `Key should be encoded in URL. Got: ${urlText}`);
  });

  await runTest('javascript: protocol injection via key', async (page, errors, state) => {
    await page.goto(`${BASE}/welcome.html?key=javascript:alert(1)`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    assert(!state.alertTriggered, 'javascript: protocol XSS triggered!');
  });

  await runTest('welcome.html redirect preserves encoding for safe keys', async (page) => {
    await page.goto(`${BASE}/welcome.html?key=550e8400-e29b-41d4-a716-446655440000`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const url = page.url();
    assert(url.includes('550e8400'), `UUID should be in final URL: ${url}`);
  });

  // ---- SUMMARY ----
  console.log('\n========================================');
  console.log(`  TOTAL: ${testCount} | PASS: ${passCount} | FAIL: ${failCount}`);
  console.log('========================================\n');

  // Print issues/findings
  const issues = results.filter(r => r.status === 'ISSUE');
  if (issues.length > 0) {
    console.log('SECURITY/UX ISSUES FOUND:');
    issues.forEach(i => console.log(`  - ${i.name}: ${i.error}`));
    console.log('');
  }

  if (failCount > 0) {
    console.log('FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    console.log('');
  }

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
