// Blind track test (?track=beta) against the running dev server.
// ben, 2026-11-04: "put all the levels on the beta track and see if I can do it without
// the bar. mix up the shots for me though since I already know where they should be."
// Checks: the main track is untouched; the beta track plays every main scene in the same
// order; every scene's target differs from the main game's; every target spot can be
// reached by dragging; no match bar; each scene wins when solved with nothing in the shot,
// and does NOT win at the main game's old answer; the tutorial is won with iPad dimmer
// clicks only; the finale is Lake Como.
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
  const nextScene = async () => {
    await ll('pressCard'); // Roll
    await page.waitForTimeout(800);
    await ll('finishTake');
    await page.waitForTimeout(400);
    await ll('pressCard'); // Next scene
    await page.waitForTimeout(1500);
  };

  // --- The main track: unchanged, and its targets for comparison ----------
  await page.goto(base);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  check((await ll('beta')) === false, 'main URL is not the beta track');
  check((await ll('blind')) === false, 'main URL keeps the match bar');
  const mainIds = await ll('levelIds');
  const mainRoles = {};
  for (const id of mainIds) {
    await ll('loadLevelId', [id]);
    mainRoles[id] = await ll('roles');
  }

  // --- The blind track ----------------------------------------------------
  await page.goto(`${base}?track=beta`);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  check((await ll('beta')) === true, '?track=beta is the beta track');
  check((await ll('blind')) === true, 'beta track hides the match bar');
  const ids = await ll('levelIds');
  check(JSON.stringify(ids) === JSON.stringify(mainIds), `beta plays every main scene in order (${ids.length})`);
  await page.screenshot({ path: `${out}/blind-00-title.png` });
  await ll('pressCard');
  await page.waitForTimeout(1500);

  for (const [n, id] of ids.entries()) {
    let lv = await ll('level');
    check(lv.id === id, `scene ${n + 1} is ${id} (${lv.id})`);
    if (lv.id !== id) {
      // Keep one failure from cascading into every later scene.
      await ll('loadLevelId', [id]);
      await page.waitForTimeout(1500);
    }
    const roles = await ll('roles');
    check(JSON.stringify(roles) !== JSON.stringify(mainRoles[id]), `${id}: the director's shot is remixed`);
    const unreachable = await ll('unreachable');
    check(unreachable.length === 0, `${id}: every target can be reached by dragging ${unreachable.join(', ')}`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/blind-${String(n + 1).padStart(2, '0')}-${id}-start.png` });
    check((await ll('level')).phase === 'playing', `${id}: the starting rig does not already win`);

    if (id === 'beta-1-tutorial') {
      // Locked lights: win with iPad dimmer clicks only, using the hidden tip as a guide.
      let clicks = 0;
      for (let i = 0; i < 60; i++) {
        lv = await ll('level');
        if (lv.phase === 'won') break;
        const hint = await ll('hint');
        if (/house lights/i.test(hint)) {
          const h = await ll('screenOf', ['light:0']);
          await page.mouse.click(h.x, h.y);
          clicks++;
          await page.waitForTimeout(400);
          continue;
        }
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
      check(lv.phase === 'won', `tutorial won with iPad clicks only (${clicks} clicks, dimmers ${await page.evaluate(() => window.lightLab.fixtures().map((f) => f.dimmer))})`);
    } else {
      // The main game's answer must not win here: ben can't play it from memory.
      await ll('solveAs', [mainRoles[id]]);
      await page.waitForTimeout(3500);
      check((await ll('level')).phase === 'playing', `${id}: the main game's old answer does not win (score ${await ll('score')})`);
      await ll('solve');
      await page.waitForTimeout(500);
      check((await ll('inFrame')) === null, `${id}: solved lights are out of the shot`);
      await page.waitForTimeout(3000);
      lv = await ll('level');
      check(lv.phase === 'won', `${id}: wins when solved`);
    }
    await page.screenshot({ path: `${out}/blind-${String(n + 1).padStart(2, '0')}-${id}-won.png` });
    if (n < ids.length - 1) await nextScene();
    else {
      await ll('pressCard'); // Roll
      await page.waitForTimeout(800);
      await ll('finishTake');
      await page.waitForTimeout(400);
    }
  }
  const lv = await ll('level');
  console.log('  finale phase', lv.phase, 'bubble', await ll('bubble'));
  check(/Como/.test((await ll('bubble')) ?? '') || lv.phase === 'rolled', 'the blind track ends on Lake Como');

  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await browser.close();
  console.log(failures.length ? `${failures.length} FAILED` : 'ALL PASSED');
  process.exit(failures.length ? 1 : 0);
})();
