// "Does this look like realistic placement of objects?" (ben, round 10): run before every update.
// For every scene of the main playthrough, at the start (kit parked) and solved (lights rigged):
//  1. the game's own physical check (lightLab.placement(): nobody inside a wall or a light,
//     the silk over heads, crew on the floor, nothing floating or sunk), which must be empty;
//  2. screenshots of the set and of the camera's shot, saved to outDir, for a person (or Claude)
//     to look over: hands and props through things, odd scale, a dog's head through a door.
// Usage: node scripts/placement-check.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const base = process.argv[2] || 'https://localhost:8081/';
  const out = process.argv[3] || 'placement-shots';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.lightLab.pressCard());
  const ids = (await page.evaluate(() => window.lightLab.levelIds())).filter((id) => !process.env.ONLY || id.includes(process.env.ONLY));
  let problems = 0;
  for (const [n, id] of ids.entries()) {
    await page.evaluate((i) => window.lightLab.loadLevelId(i), id);
    // Models (the professor, the car) swap in a moment after the scene loads.
    await page.waitForTimeout(2500);
    for (const stage of ['start', 'solved']) {
      if (stage === 'solved') {
        await page.evaluate(() => window.lightLab.solve());
        await page.waitForTimeout(800);
      }
      const issues = await page.evaluate(() => window.lightLab.placement());
      problems += issues.length;
      console.log(`${issues.length ? 'FAIL' : 'PASS'} scene ${n + 1} ${id} (${stage})${issues.length ? ': ' + issues.join('; ') : ''}`);
      await page.screenshot({ path: `${out}/${String(n + 1).padStart(2, '0')}-${id}-${stage}.png` });
    }
    const shot = await page.evaluate(() => window.lightLab.shotImage('live'));
    fs.writeFileSync(`${out}/${String(n + 1).padStart(2, '0')}-${id}-shot.png`, Buffer.from(shot.split(',')[1], 'base64'));
  }
  if (errors.length) console.log('page errors', errors);
  await browser.close();
  console.log(problems || errors.length ? `${problems} PLACEMENT PROBLEMS` : 'ALL PASSED (now look at the screenshots)');
  process.exit(problems || errors.length ? 1 : 0);
})();
