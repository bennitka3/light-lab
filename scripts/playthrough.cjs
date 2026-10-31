// Full playthrough against the running dev server (npm run dev): title card,
// every scene solved by the test helper, the finale roll, credits and replay.
// Screenshots each scene before and after solving. Fails on any page error.
// Usage: node scripts/playthrough.cjs [url] [outDir]
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
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const lv = () => page.evaluate(() => window.lightLab.level());
  const log = (...a) => console.log(...a);
  await page.screenshot({ path: `${out}/00-title.png` });
  log('start', await lv());
  await page.evaluate(() => window.lightLab.pressCard());
  await page.waitForTimeout(800);
  for (let i = 0; i < 7; i++) {
    const s = await lv();
    log('scene', i + 1, s, 'score', await page.evaluate(() => window.lightLab.score()), 'hint', await page.evaluate(() => window.lightLab.hint()));
    await page.screenshot({ path: `${out}/${i + 1}-a-start.png` });
    await page.evaluate(() => window.lightLab.solve());
    await page.waitForTimeout(3500);
    const after = await lv();
    log('  solved ->', after, 'score', await page.evaluate(() => window.lightLab.score()));
    await page.screenshot({ path: `${out}/${i + 1}-b-solved.png` });
    if (after.phase !== 'won') { log('  !! not won'); }
    await page.evaluate(() => window.lightLab.pressCard());
    await page.waitForTimeout(1500);
  }
  log('after last press', await lv());
  await page.screenshot({ path: `${out}/8-rolled.png` });
  await page.evaluate(() => window.lightLab.pressCard());
  await page.waitForTimeout(1000);
  log('credits?', await lv());
  await page.screenshot({ path: `${out}/9-credits.png` });
  await page.evaluate(() => window.lightLab.pressCard());
  await page.waitForTimeout(1500);
  log('replay?', await lv());
  log('errors', errors.length ? errors : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
