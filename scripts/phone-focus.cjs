// Checks ben's 2026-11-16 ask: texts for the step you're on are bright, ones you've done
// or that no longer matter are dimmed.
// 1. A scene's notes arrive bright.
// 2. After the win, the scene's notes dim and the win texts are bright.
// 3. Next scene: the last scene's texts dim, the new notes are bright.
// 4. A house-lights nudge dims once the house lights are off.
// 5. Left idle, a text never repeats (the car scene's house-lights text came 5+ times).
// Usage: node scripts/phone-focus.cjs [url] [outDir]
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'https://localhost:8081/';
  const out = process.argv[3] || '.';
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const api = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const results = {};
  const check = (name, ok, detail) => {
    results[name] = ok;
    console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail));
  };
  const arrived = (text) => page.waitForFunction((t) => window.lightLab.texts().includes(`dee: ${t}`) && window.lightLab.phoneVisible().includes(t), text, { timeout: 120000 }).catch((e) => console.log('timed out waiting for', text, e.message.slice(0, 80)));
  const phone = () => api(() => ({ shown: window.lightLab.phoneVisible(), bright: window.lightLab.phoneBright() }));

  const ids = await api(() => window.lightLab.levelIds());
  await api(() => window.lightLab.clearPhone());
  await api((x) => window.lightLab.loadLevelId(x), ids[1]);
  const notes = await api(() => window.lightLab.levelDee());
  for (const line of notes) await api((t) => window.lightLab.dee(t), line);
  await arrived(notes[notes.length - 1]);
  await wait(1500);
  let p = await phone();
  check('scene notes arrive bright', notes.every((l) => p.bright.includes(l)), p);
  await page.screenshot({ path: `${out}/phone-1-scene-notes.png` });

  await api(() => window.lightLab.solve());
  await page.waitForFunction(() => window.lightLab.level().phase === 'won', null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction((n) => window.lightLab.phoneBright().some((t) => !n.includes(t)), notes, { timeout: 60000 }).catch((e) => console.log('no win text arrived', e.message.slice(0, 80)));
  await wait(1500);
  p = await phone();
  check('after the win the scene notes are dimmed', notes.every((l) => !p.bright.includes(l)), p);
  check('after the win the win text is bright', p.bright.length > 0 && p.bright.every((t) => !notes.includes(t)), p);
  await page.screenshot({ path: `${out}/phone-2-won.png` });
  const winBright = p.bright;

  await api((x) => window.lightLab.loadLevelId(x), ids[2]);
  const notes2 = await api(() => window.lightLab.levelDee());
  for (const line of notes2) await api((t) => window.lightLab.dee(t), line);
  await arrived(notes2[notes2.length - 1]);
  await wait(1500);
  p = await phone();
  check('next scene: its notes are bright', notes2.every((l) => p.bright.includes(l)), p);
  check('next scene: the last win texts are dimmed', winBright.every((t) => !p.bright.includes(t)), p);
  await page.screenshot({ path: `${out}/phone-3-next-scene.png` });

  // House-lights nudge: bright while on, dim once off.
  await api(() => window.lightLab.setHouse(true));
  await api(() => window.lightLab.dee('the house lights are flattening everything. turn them off!', 'house'));
  await arrived('the house lights are flattening everything. turn them off!');
  await wait(800);
  p = await phone();
  check('house nudge is bright while the house lights are on', p.bright.some((t) => /house lights/.test(t)), p);
  await api(() => window.lightLab.setHouse(false));
  await wait(500);
  p = await phone();
  check('house nudge dims once the house lights are off', !p.bright.some((t) => /house lights/.test(t)) && p.shown.some((t) => /house lights/.test(t)), p);
  await page.screenshot({ path: `${out}/phone-4-house-fixed.png` });

  // ben, 2026-11-16: on the car scene, left idle, "wait. THE HOUSE LIGHTS" came 5+ times.
  // Each text arrives at most once a scene, however long the player stands still.
  await api(() => window.lightLab.clearPhone());
  const logStart = await api(() => window.lightLab.texts().length);
  await api(() => window.lightLab.loadLevelId('beta-4-car'));
  await api(() => window.lightLab.setHouse(true));
  await api(() => window.lightLab.toggle('softbox'));
  await wait(90000);
  const all = (await api(() => window.lightLab.texts())).slice(logStart).filter((t) => /house lights/i.test(t));
  check('idle on the car scene: the house-lights text comes once', all.length === 1, all);
  await api(() => window.lightLab.dee('same text twice'));
  await api(() => window.lightLab.dee('same text twice'));
  await wait(6000);
  const twice = (await api(() => window.lightLab.texts())).slice(logStart).filter((t) => t === 'dee: same text twice');
  check('the phone never sends the same text twice in a step', twice.length === 1, twice);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  const failed = Object.entries(results).filter(([, ok]) => !ok);
  console.log(failed.length ? `FAILED ${failed.length}` : 'ALL PASSED');
  process.exit(failed.length ? 1 : 0);
})();
