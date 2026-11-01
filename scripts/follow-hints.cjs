// Plays every scene by doing exactly what the iPad tip says, like a new player would.
// Each light starts knocked off its spot; the bot moves it 1.5 cm per step in the
// direction the tip names (camera-left/right, back/forward, raise/lower) and counts
// how many steps it takes to win and how often the tip reverses itself.
// Greg's round-7 playtest: in scene 3 the tip flipped left/right/back/forward and he
// "didn't know where to go". A reversal storm here is that bug.
// Usage: node scripts/follow-hints.cjs [url]
const { chromium } = require('playwright');

const STEP = 0.015; // meters on the 1:14 set, about one small drag
const MAX_STEPS = 80;
const TRIALS = Number(process.env.TRIALS || 6);

(async () => {
  const url = process.argv[2] || 'https://localhost:8081/';
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  await page.goto(url);
  await page.waitForFunction(() => window.lightLab, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  const results = await page.evaluate(
    ({ STEP, MAX_STEPS, TRIALS }) => {
      const ll = window.lightLab;
      // Deterministic random numbers so runs compare.
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
      const out = [];
      const moves = [
        [/camera-left/, 0, -1],
        [/camera-right/, 0, 1],
        [/back, away from the camera|round the back/, 2, -1],
        [/forward, toward the camera/, 2, 1],
        [/Raise/, 1, 1],
        [/Lower/, 1, -1],
        [/closer to the screen/, 2, -1],
        [/away from the screen/, 2, 1],
      ];
      for (let scene = 0; scene < 7; scene++) {
        if (scene === 1) continue; // scene 2 starts set up; nothing to place
        const runs = [];
        for (let t = 0; t < TRIALS; t++) {
          ll.loadLevel(scene);
          ll.solve();
          const lit = ll.fixtures().map((f, i) => (f.on ? i : -1)).filter((i) => i >= 0);
          // Knock each light up to 6 cm off its spot (re-rolled if that lands it in the shot).
          for (const i of lit) {
            const p = ll.fixtures()[i].local;
            const home = { x: p.x, y: p.y, z: p.z };
            do {
              p.x = home.x + rand() * 0.06;
              p.z = home.z + rand() * 0.06;
              p.y = Math.max(0.03, home.y + rand() * 0.05);
            } while (ll.inFrame());
          }
          const win = { 0: 90 }[scene] ?? 85;
          let steps = 0;
          let reversals = 0;
          let last = null;
          const seen = [];
          for (; steps < MAX_STEPS; steps++) {
            if (ll.score() >= win) break;
            const hint = ll.hint();
            seen.push(hint);
            const move = moves.find(([re]) => re.test(hint));
            if (!move) {
              if (/Almost there/.test(hint)) break;
              break; // a hint the bot can't act on
            }
            const [, axis, sign] = move;
            if (last && last[0] === axis && last[1] === -sign) reversals++;
            last = [axis, sign];
            const i = ll.hintFixture();
            if (i < 0) break;
            const p = ll.fixtures()[i].local;
            p[['x', 'y', 'z'][axis]] += sign * (/Nudge|a little/.test(hint) ? STEP / 2 : STEP);
            if (p.y < 0.02) p.y = 0.02;
          }
          runs.push({ won: ll.score() >= win, steps, reversals, lastHint: ll.hint(), score: ll.score(), tail: seen.slice(-4) });
        }
        out.push({ scene: scene + 1, runs });
      }
      return out;
    },
    { STEP, MAX_STEPS, TRIALS },
  );

  let fails = 0;
  for (const { scene, runs } of results) {
    const won = runs.filter((r) => r.won).length;
    const avgSteps = (runs.reduce((s, r) => s + r.steps, 0) / runs.length).toFixed(1);
    const rev = runs.reduce((s, r) => s + r.reversals, 0);
    console.log(`scene ${scene}: won ${won}/${runs.length}, avg steps ${avgSteps}, tip reversals ${rev}`);
    for (const r of runs.filter((r) => !r.won)) {
      fails++;
      console.log(`   stuck at ${r.score}% after ${r.steps} steps: ${JSON.stringify(r.tail)}`);
    }
  }
  console.log(fails === 0 ? 'PASS follow-the-tips wins every trial' : `FAIL ${fails} trials never won`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
