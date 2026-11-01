// Real-mouse smoke test for Scene 1 against the running dev server (npm run dev).
// Uses only mouse input for: the call sheet button, the HOUSE switch, dragging
// a light, raising it with the wheel mid-drag, clicking it on, orbiting and
// zooming. Then puts the light on its mark through the test API and checks the
// scene is won and the call sheet moves on. Saves screenshots.
// Usage: node scripts/smoke-test.cjs [url] [outDir]
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
  const at = (what) => api((w) => window.lightLab.screenOf(w), what);
  const click = async (p) => {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);
  };
  const results = {};

  await click(await at('card-button'));
  results.cardStartsScene = (await api(() => window.lightLab.level())).phase === 'playing';

  results.houseStartsOn = await api(() => window.lightLab.houseOn());
  // The iPad's light row is drawn on the next frame after the scene starts.
  await page.waitForFunction(() => window.lightLab.screenOf('light:0') !== null, null, { timeout: 10000 });
  await click(await at('light:0'));
  results.houseSwitchWorks = !(await api(() => window.lightLab.houseOn()));

  const idx = await api(() => window.lightLab.fixtures().findIndex((f) => f.item.kind === 'softbox'));
  const before = await api((i) => ({ ...window.lightLab.fixtures()[i].local }), idx);
  const p = await at(idx);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 60, p.y - 110, { steps: 15 });
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await api((i) => ({ ...window.lightLab.fixtures()[i].local }), idx);
  results.dragMoves = Math.hypot(after.x - before.x, after.z - before.z) > 0.03;
  results.wheelRaises = after.y > before.y + 0.01;

  await click(await at(idx));
  results.clickTurnsOn = await api((i) => window.lightLab.fixtures()[i].on, idx);

  const yaw0 = await api(() => window.lightLab.orbit.yaw);
  await page.mouse.move(1150, 150);
  await page.mouse.down();
  await page.mouse.move(1050, 150, { steps: 10 });
  await page.mouse.up();
  results.emptyDragOrbits = Math.abs((await api(() => window.lightLab.orbit.yaw)) - yaw0) > 0.1;
  const r0 = await api(() => window.lightLab.orbit.radius);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  results.wheelZooms = (await api(() => window.lightLab.orbit.radius)) > r0;
  await page.screenshot({ path: `${out}/smoke-playing.png` });

  // Put the light exactly on its mark and wait for the director to call it.
  await api(() => window.lightLab.solve());
  await page.waitForTimeout(3500);
  results.wins = (await api(() => window.lightLab.level())).phase === 'won';
  await page.screenshot({ path: `${out}/smoke-won.png` });
  await click(await at('card-button'));
  await page.waitForTimeout(800);
  results.cardGoesToScene2 = (await api(() => window.lightLab.level())).index === 1;

  console.log(results);
  console.log('errors', errors.length ? errors : 'none');
  await browser.close();
  const ok = Object.values(results).every(Boolean) && !errors.length;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
