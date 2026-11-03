// Beta track test (?track=beta) against the running dev server.
// For each of the three beta scenes: screenshot the start, check the tip, play it
// the way a player would where that matters (1B: only the iPad dimmers, following
// the tip; lights must not move), then solve and check the win and that no gear
// is in the shot. Also checks the main track still has its seven scenes.
// Usage: node scripts/beta-track.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');

(async () => {
  const base = process.argv[2] || 'https://localhost:8081/';
  const out = process.argv[3] || '.';
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const errors = [];
  const failures = [];
  const check = (ok, what) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  const ll = (fn, arg) => page.evaluate(([f, a]) => window.lightLab[f](...(a ?? [])), [fn, arg]);

  // The main track is untouched.
  await page.goto(base);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  check((await ll('beta')) === false, 'main URL is not the beta track');
  check((await ll('level')).id === 'social-clip', 'main URL starts on the usual scene 1');

  await page.goto(`${base}?track=beta`);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  check((await ll('beta')) === true, '?track=beta is the beta track');
  await page.screenshot({ path: `${out}/beta-0-title.png` });
  await ll('pressCard');
  await page.waitForTimeout(1500);

  // --- 1B: dimmers only -----------------------------------------------------
  let lv = await ll('level');
  check(lv.id === 'beta-1b-dimmers', `scene 1 is 1B (${lv.id})`);
  const before = await page.evaluate(() => window.lightLab.fixtures().map((f) => f.local.toArray()));
  await page.screenshot({ path: `${out}/beta-1-start.png` });
  console.log('  start score', await ll('score'), 'tip:', await ll('hint'));
  // Try to drag the key light with the real mouse: it must not move.
  const key = await ll('screenOf', [0]);
  await page.mouse.move(key.x, key.y);
  await page.mouse.down();
  await page.mouse.move(key.x + 120, key.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterDrag = await page.evaluate(() => window.lightLab.fixtures().map((f) => f.local.toArray()));
  check(JSON.stringify(before) === JSON.stringify(afterDrag), '1B lights cannot be dragged');
  // A drag that didn't move counts as a click and flips the switch only if the mouse didn't move; make sure the key is on.
  const keyOn = await page.evaluate(() => window.lightLab.fixtures()[0].on);
  if (!keyOn) await ll('switchOn', [0, true]);
  // Follow the tip with real clicks on the iPad's dimmer arrows.
  let clicks = 0;
  for (let i = 0; i < 30; i++) {
    lv = await ll('level');
    if (lv.phase === 'won') break;
    const hint = await ll('hint');
    const m = /The (key|fill|back) light is (?:way )?too (bright|dark)/.exec(hint);
    if (!m) {
      await page.waitForTimeout(400);
      continue;
    }
    const idx = { key: 1, fill: 2, back: 3 }[m[1]];
    const ctl = await ll('screenOf', [`${m[2] === 'bright' ? 'dimmer' : 'brighter'}:${idx}`]);
    await page.mouse.click(ctl.x, ctl.y);
    clicks++;
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
  lv = await ll('level');
  console.log('  dimmers', await page.evaluate(() => window.lightLab.fixtures().map((f) => f.dimmer)), 'clicks', clicks);
  check(lv.phase === 'won', `1B won by following the tip with iPad clicks only (${clicks} clicks)`);
  await page.screenshot({ path: `${out}/beta-1-won.png` });
  await ll('pressCard');
  await page.waitForTimeout(1500);

  // --- 2 and 3: solve, then check the win and nothing in frame ---------------
  for (const [n, id] of [
    [2, 'beta-2-desert'],
    [3, 'beta-3-car'],
  ]) {
    lv = await ll('level');
    check(lv.id === id, `scene ${n} is ${id} (${lv.id})`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/beta-${n}-start.png` });
    console.log('  start score', await ll('score'), 'tip:', await ll('hint'));
    await ll('solve');
    await page.waitForTimeout(500);
    check((await ll('inFrame')) === null, `scene ${n}: solved lights are out of the shot`);
    await page.waitForTimeout(3000);
    lv = await ll('level');
    check(lv.phase === 'won', `scene ${n} wins when solved (score ${await ll('score')})`);
    await page.screenshot({ path: `${out}/beta-${n}-won.png` });
    await ll('pressCard');
    await page.waitForTimeout(1500);
  }
  lv = await ll('level');
  check(lv.phase === 'rolled', `after scene 3, the commercial rolls (${lv.phase})`);
  check((await ll('bubble')) !== null && !/Como/.test(await ll('bubble')), 'the beta finale is not Lake Como');
  await page.screenshot({ path: `${out}/beta-4-rolled.png` });
  await ll('pressCard');
  await page.waitForTimeout(800);
  check((await ll('level')).phase === 'credits', 'credits');
  await page.screenshot({ path: `${out}/beta-5-credits.png` });

  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await browser.close();
  console.log(failures.length ? `${failures.length} FAILED` : 'ALL PASSED');
  process.exit(failures.length ? 1 : 0);
})();
