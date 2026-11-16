// The desert's bounce card (ben, 2026-11-15): "the bounce card is not white from the back so
// it's confusing. also it turns 'on' when it gets close... it should always be 'on' because it's
// reflecting the overhead sunlight at all times, the intensity won't change unless it's under
// the silk (which would be an interesting trap that we should make sure this level's tips
// don't lead people astray with)".
// Checks: white on both sides; always throwing light, even parked; the same strength anywhere
// in the sun; much weaker in a rigged silk's shade (and the score and tip say so); the target
// spot (main and blind track) is out in the sun and out of the shot; the scene still wins.
// Usage: node scripts/bounce-card.cjs [baseUrl] [outDir]
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
  const check = (ok, what, data) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${ok || data === undefined ? '' : ' ' + JSON.stringify(data)}`);
    if (!ok) failures.push(what);
  };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  const wait = (ms) => page.waitForTimeout(ms);
  const card = () =>
    page.evaluate(() => {
      const fs = window.lightLab.fixtures();
      const b = fs.find((f) => f.item.kind === 'bounce');
      const back = b.head.getObjectByName('fixture-face-back');
      const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      return {
        index: fs.indexOf(b),
        silk: fs.findIndex((f) => f.item.kind === 'silk'),
        on: b.on,
        lit: b.lit,
        visible: b.spot.visible,
        intensity: b.spot.intensity,
        front: lum(b.face.color),
        back: back ? lum(back.material.color) : 0,
        backGlow: back ? back.material.emissiveIntensity : 0,
        local: b.local.toArray(),
      };
    });

  for (const track of ['', '?track=beta']) {
    const name = track ? 'blind' : 'main';
    await page.goto(base + track);
    await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
    await page.evaluate(() => window.lightLab.loadLevelId('beta-3-desert'));
    await wait(1500);

    // Parked behind the tape, before anything is placed.
    const parked = await card();
    const silkHome = await page.evaluate((i) => window.lightLab.fixtures()[i].local.toArray(), parked.silk);
    check(parked.front > 0.8 && parked.back > 0.8, `${name}: the card is white on both sides`, parked);
    check(parked.visible && parked.intensity > 0, `${name}: parked, it still throws back sun (no switch, never "off")`, parked);

    // The director's answer.
    await page.evaluate(() => window.lightLab.solve());
    await wait(800);
    const solved = await card();
    const solvedScore = await page.evaluate(() => window.lightLab.score());
    const framed = await page.evaluate(() => window.lightLab.inFrame());
    check(solved.lit === 1, `${name}: the target spot for the card is fully out in the sun`, solved);
    check(!framed, `${name}: nothing in the shot at the answer`);
    check(solvedScore >= 85, `${name}: the answer still wins (${solvedScore})`);
    check(Math.abs(solved.intensity - parked.intensity) < 1e-6, `${name}: same strength parked and placed while both in sun`, { parked, solved });
    if (!track) await page.screenshot({ path: `${out}/bounce-1-solved.png` });

    // The trap: the card under the silk.
    const r = await page.evaluate(() => window.lightLab.roles().find((x) => x.id === 'bounce').orbit);
    const sign = Math.sign(r.az);
    // Find a spot close in, out of the shot, under the silk (the trap has to exist).
    let trapped;
    for (const [az, el, d] of [[70, -5, 0.12], [60, -5, 0.1], [90, -5, 0.08], [120, -5, 0.08], [90, -25, 0.07], [60, -30, 0.07], [150, -5, 0.08]]) {
      await page.evaluate(([i, a, e, dd]) => window.lightLab.place(i, a, e, dd), [solved.index, sign * az, el, d]);
      // Software rendering can lag a few frames behind; give the game time to re-read the card.
      await wait(1500);
      trapped = await card();
      const inShot = await page.evaluate(() => window.lightLab.inFrame());
      if (!inShot && trapped.lit < 0.5) break;
    }
    const trapScore = await page.evaluate(() => window.lightLab.score());
    const trapHint = await page.evaluate(() => window.lightLab.hint());
    check(trapped.lit < 0.5, `${name}: close in under the silk (out of the shot) the card is in shade`, trapped);
    check(trapped.intensity < solved.intensity * 0.65, `${name}: in the shade it throws back much less`, { trapped, solved });
    check(trapScore < 85, `${name}: a shaded card doesn't win (${trapScore})`);
    if (!track) {
      check(/shade/.test(trapHint), 'main: the tip says the card is in the shade', trapHint);
      await page.screenshot({ path: `${out}/bounce-2-under-silk.png` });
    }

    // Same spot, silk parked: back in full sun, nothing shades it.
    await page.evaluate(([i, p]) => window.lightLab.placeAt(i, ...p), [solved.silk, silkHome]);
    // Taking the silk down changes which things cast shadows; software rendering can stall a moment.
    await page
      .waitForFunction(() => window.lightLab.fixtures().find((f) => f.item.kind === 'bounce').lit === 1, null, { timeout: 15000 })
      .catch(() => {});
    const noSilk = await card();
    check(noSilk.lit === 1 && Math.abs(noSilk.intensity - parked.intensity) < 1e-6, `${name}: with the silk off the set the same spot is in full sun`, noSilk);
  }

  // The level's words don't send the card under the silk.
  await page.goto(base);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  await page.evaluate(() => window.lightLab.loadLevelId('beta-3-desert'));
  await wait(800);
  const dee = await page.evaluate(() => window.lightLab.levelDee());
  const words = dee.join(' ');
  check(!/under (the )?silk|beneath|in its shade/i.test(words), "Dee's notes never say to put the card under the silk", dee);

  // A look at the back of the card: orbit round behind it.
  await page.evaluate(() => {
    const ll = window.lightLab;
    const fs = ll.fixtures();
    ll.place(fs.findIndex((f) => f.item.kind === 'bounce'), 60, -5, 0.2);
    ll.orbit.yaw = 2.3;
    ll.orbit.pitch = 0.25;
    ll.orbit.radius = 0.55;
  });
  await wait(1200);
  await page.screenshot({ path: `${out}/bounce-3-back-of-card.png` });

  console.log('errors', errors.length ? errors : 'none');
  console.log(failures.length || errors.length ? `${failures.length} FAILED` : 'ALL PASSED');
  await browser.close();
  process.exit(failures.length || errors.length ? 1 : 0);
})();
