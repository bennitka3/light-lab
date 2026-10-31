// Smoke test for Scene 1 against the running dev server (npm run dev).
// Loads the page, drags the softbox onto the set with the mouse, then kills the
// house lights, switches the softbox on, puts it at the target and checks the
// level can still be won. Saves screenshots.
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
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/smoke-start.png` });

  const state = () =>
    page.evaluate(() => ({
      on: window.lightLab.fixtures.filter((f) => f.on).map((f) => f.kind),
      score: window.lightLab.score(),
      hint: window.lightLab.hint(),
    }));

  // Drag the softbox (middle of the kit) onto the set with the mouse.
  const start = await page.evaluate(() => {
    const f = window.lightLab.fixtures.find((x) => x.kind === 'softbox');
    return { x: f.local.x, z: f.local.z };
  });
  await page.mouse.move(617, 535);
  await page.mouse.down();
  await page.mouse.move(540, 420, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const moved = await page.evaluate(() => {
    const f = window.lightLab.fixtures.find((x) => x.kind === 'softbox');
    return { x: f.local.x, z: f.local.z };
  });
  const dragWorked = Math.hypot(moved.x - start.x, moved.z - start.z) > 0.05;

  // Kill the house lights, switch the softbox on, put it exactly at the
  // target and wait past the win hold.
  const houseStartsOn = await page.evaluate(() => window.lightLab.houseOn());
  await page.evaluate(() => {
    window.lightLab.setHouse(false);
    const f = window.lightLab.fixtures.find((x) => x.kind === 'softbox');
    if (!f.on) window.lightLab.toggle('softbox');
    f.local.set(-0.0927, 0.197, 0.0327);
  });
  await page.waitForTimeout(2000);
  const atTarget = await state();
  await page.screenshot({ path: `${out}/smoke-win.png` });

  const ok = houseStartsOn && dragWorked && atTarget.score >= 90 && errors.length === 0;
  console.log(JSON.stringify({ ok, houseStartsOn, dragWorked, atTarget, errors }, null, 2));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
