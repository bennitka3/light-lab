// The coach (ben, 2026-11-16: the how-to list "means nothing without seeing the actual controls").
// Plays the first scenes with a real mouse, the way a new player would, and checks that each
// lesson rings the right control, says what to do on the iPad, and moves on once it's done.
// Saves a screenshot of every lesson to outDir for a person to look at.
// Usage: node scripts/coach.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const base = process.argv[2] || 'https://localhost:8081/';
  const out = process.argv[3] || 'coach-shots';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let failures = 0;
  const check = (ok, what) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
    if (!ok) failures++;
  };
  const api = (fn, arg) => page.evaluate(fn, arg);
  const at = (what) => api((w) => window.lightLab.screenOf(w), what);
  const coach = () => api(() => window.lightLab.coach());
  const waitFor = async (skill, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const c = await coach();
      if (c && c.skill === skill) return c;
      await page.waitForTimeout(200);
    }
    return coach();
  };
  let shot = 0;
  const snap = (name) => page.screenshot({ path: `${out}/${String(++shot).padStart(2, '0')}-${name}.png` });

  await page.goto(base);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await snap('title');
  const card = await page.evaluate(() => window.lightLab.card());
  check(card.steps.length === 2 && !card.steps.some((s) => /Shift-drag|Drag empty/.test(s)), 'title page no longer lists the controls');
  const go = await at('card-button');
  await page.mouse.click(go.x, go.y);

  // Scene 1: the two shots, then HOUSE, then look around, then the dimmer.
  let c = await waitFor('shots', 5000);
  check(c && c.ring && /TARGET/.test(c.text), `scene 1 rings the two shots: ${c && c.text}`);
  await page.waitForTimeout(800);
  await snap('scene1-shots');
  c = await waitFor('house');
  check(c && c.ring && /HOUSE/.test(c.text), `then rings HOUSE: ${c && c.text}`);
  await snap('scene1-house');
  const house = await at('light:0');
  await page.mouse.click(house.x, house.y);
  await page.waitForTimeout(400);
  check(!(await api(() => window.lightLab.houseOn())), 'clicking the ringed HOUSE switched the house lights off');
  c = await waitFor('look', 3000);
  check(c && /Drag empty space/.test(c.text), `then says how to look around: ${c && c.text}`);
  await snap('scene1-look');
  await page.mouse.move(640, 150);
  await page.mouse.down();
  await page.mouse.move(800, 160, { steps: 8 });
  await page.mouse.up();
  c = await waitFor('dimmer', 3000);
  check(c && c.ring && /▶ on the Softbox/.test(c.text), `then rings the Softbox's ▶: ${c && c.text}`);
  await page.waitForTimeout(500);
  await snap('scene1-dimmer');
  const before = await api(() => window.lightLab.dimmer(0));
  const brighter = await at('brighter:1');
  await page.mouse.click(brighter.x, brighter.y);
  await page.waitForTimeout(400);
  check((await api(() => window.lightLab.dimmer(0))) > before, 'clicking the ringed ▶ made the Softbox brighter');
  await page.waitForTimeout(600);
  c = await coach();
  if (c) await snap(`scene1-${c.skill}`);
  console.log('learned so far:', (await api(() => window.lightLab.coachLearned())).join(', '), '| now:', c ? c.skill : 'nothing (tips back)');

  // Scene 2: drag the kicked light, then raise it.
  await api(() => window.lightLab.loadLevelId('interview'));
  await page.waitForTimeout(2500);
  c = await waitFor('drag', 15000);
  check(c && c.ring && /Drag the ringed light/.test(c.text), `scene 2 rings the kicked light: ${c && c.text}`);
  await snap('scene2-drag');
  const p = await at(0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 60, p.y + 10, { steps: 8 });
  await page.mouse.up();
  c = await waitFor('raise', 3000);
  check(c && c.ring && /Shift/.test(c.text), `then says how to raise it: ${c && c.text}`);
  await snap('scene2-raise');
  const y0 = (await api(() => window.lightLab.fixtures()[0].local.y));
  const q = await at(0);
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(q.x, q.y - 60, { steps: 8 });
  await page.keyboard.up('Shift');
  await page.mouse.up();
  await page.waitForTimeout(400);
  const y1 = await api(() => window.lightLab.fixtures()[0].local.y);
  check(y1 > y0, `shift-drag raised the light (${y0.toFixed(3)} -> ${y1.toFixed(3)})`);
  c = await coach();
  check(!c || c.skill !== 'raise', 'raise lesson done');
  if (c) await snap(`scene2-${c.skill}`);

  // Scene 3: lights start parked and off, so: switch one on.
  await api(() => window.lightLab.loadLevelId('key-back-dimmer'));
  await page.waitForTimeout(2500);
  c = await waitFor('switch', 15000);
  check(c && c.ring && /Softbox/.test(c.text), `scene 3 rings the Softbox switch: ${c && c.text}`);
  await snap('scene3-switch');
  const ids = await api(() => window.lightLab.lightButtons().map((b) => b.label));
  const sw = await at(`light:${ids.indexOf('Softbox')}`);
  await page.mouse.click(sw.x, sw.y);
  await page.waitForTimeout(400);
  c = await coach();
  check(!c || c.skill !== 'switch', 'switch lesson done after clicking it');
  console.log('learned:', (await api(() => window.lightLab.coachLearned())).join(', '));

  if (errors.length) console.log('page errors', errors);
  await browser.close();
  console.log(failures || errors.length ? `${failures} FAILED` : 'ALL PASSED (now look at the screenshots)');
  process.exit(failures || errors.length ? 1 : 0);
})();
