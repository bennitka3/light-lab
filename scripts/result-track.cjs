// Result beta test (?track=result) against the running dev server.
// ben, 2026-11-09: "this does have to be winnable by the result not by light positions",
// "it has to look closely at the things that lighting is meant to do in that shot".
// One scene (blind scene 3: key + back light). Checks: main track untouched; the result
// track has just that scene, no bar; the exact answer wins; a DIFFERENT setup that looks
// the same wins (key moved closer and dimmed down to match); the wrong look does not win
// (key on the wrong side, the main game's old answer, back light missing, house lights on).
// Usage: node scripts/result-track.cjs [baseUrl] [outDir]
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
  // Sets the lights as if the targets were these, waits for a fresh reading, returns the score.
  const tryRig = async (roles, house = false) => {
    await ll('solveAs', [roles]);
    await page.evaluate((h) => window.lightLab.setHouse(h), house);
    await page.waitForTimeout(900);
    return ll('score');
  };

  await page.goto(base);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  check((await ll('result')) === null, 'main URL is not the result track');
  check((await ll('levelIds')).length === 10, 'main playthrough still has ten scenes');

  await page.goto(`${base}?track=result`);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  check(JSON.stringify(await ll('levelIds')) === '["key-back-dimmer"]', 'result track is scene 3 alone');
  check((await ll('blind')) === true, 'result track hides the match bar');
  await page.screenshot({ path: `${out}/result-0-title.png` });
  await ll('pressCard');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/result-1-start.png` });
  check((await ll('level')).phase === 'playing', 'the starting state does not win');
  const roles = await ll('roles');
  const [key, back] = roles;

  // Looks wrong: none of these may reach the win line (85).
  const wrongSide = await tryRig([{ orbit: { ...key.orbit, az: -key.orbit.az } }, {}]);
  check(wrongSide < 85, `key on the wrong side of his face does not win (score ${wrongSide})`);
  const oldAnswer = await tryRig([{ orbit: { az: -45, el: 35, d: 0.16 }, level: 0.7 }, { orbit: { az: 150, el: 45, d: 0.14 }, level: 0.5 }]);
  check(oldAnswer < 85, `the main game's old answer does not win (score ${oldAnswer})`);
  const dimRim = await tryRig([{}, { level: 0.2 }]);
  check(dimRim < 85, `back light far too dim does not win (score ${dimRim})`);
  const house = await tryRig([{}, {}], true);
  check(house < 85, `house lights on does not win (score ${house})`);

  // Looks right in a different way: the key moved closer, dimmed down to compensate.
  let alt = null;
  for (const level of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    const score = await tryRig([{ orbit: { ...key.orbit, d: key.orbit.d * 0.8 }, level }, {}]);
    console.log(`  key 20% closer at ${level * 100}%: score ${score}`);
    if (score >= 85) {
      alt = { level, score };
      break;
    }
  }
  check(alt !== null && alt.level !== key.level, `a different setup that looks the same wins (key closer, dimmer ${alt && alt.level} instead of ${key.level})`);
  // And it actually calls the take.
  await page.waitForTimeout(3000);
  check((await ll('level')).phase === 'won', 'the take is called on that different setup');
  await page.screenshot({ path: `${out}/result-2-won-alt.png` });
  const shot = await ll('shotImage', ['live']);
  require('fs').writeFileSync(`${out}/result-2-won-alt-shot.png`, Buffer.from(shot.split(',')[1], 'base64'));
  void back;

  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await browser.close();
  console.log(failures.length ? `${failures.length} FAILED` : 'ALL PASSED');
  process.exit(failures.length ? 1 : 0);
})();
