// Checks the round-1 playtest fixes against the running dev server.
// 1. Every scene's solution keeps all gear out of the shot and wins.
// 2. A light visible in the shot fails the take (scenes 3 and 5).
// 3. Scene 7 credits a SCREEN panel to the side it is actually on.
// 4. Scene 2 starts set up with one bumped light, and fixing it wins.
// 5. Real mouse: the iPad's Go button, light switches, size buttons, the dial, Dee's phone.
// Usage: node scripts/playtest-fixes.cjs [url] [outDir]
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
  const api = (fn, arg) => page.evaluate(fn, arg);
  const at = (what) => api((w) => window.lightLab.screenOf(w), what);
  const wait = (ms) => page.waitForTimeout(ms);
  const state = () => api(() => ({ ...window.lightLab.level(), score: window.lightLab.score(), hint: window.lightLab.hint(), inFrame: window.lightLab.inFrame() }));
  const results = {};
  const check = (name, ok, detail) => {
    results[name] = ok;
    console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail));
  };

  // 5a. Title card button by real mouse click, then Dee's first texts.
  await page.screenshot({ path: `${out}/01-title.png` });
  const button = await at('card-button');
  await page.mouse.click(button.x, button.y);
  await wait(500);
  check('iPad Go button starts scene 1', (await state()).phase === 'playing');
  await wait(5000);
  const texts = await api(() => window.lightLab.texts());
  check('Dee texts the intro and a tip', texts.length >= 3 && texts[0].startsWith('dee:'), texts);
  await page.screenshot({ path: `${out}/02-scene1-phone.png` });

  // Round 4. Light switches on the iPad: HOUSE and each light, labeled; hover outlines the switch.
  const buttons = await api(() => window.lightLab.lightButtons());
  check('iPad has a labeled switch for HOUSE and every light', buttons.map((b) => b.label).join(',') === 'HOUSE,Fresnel,Softbox,PAR can', buttons);
  await page.mouse.click((await at('light:0')).x, (await at('light:0')).y);
  await wait(300);
  check('HOUSE on the iPad turns the house lights off', !(await api(() => window.lightLab.houseOn())));
  const sb = await at('light:2');
  await page.mouse.click(sb.x, sb.y);
  await wait(300);
  check('a light switch on the iPad turns that light on', await api(() => window.lightLab.fixtures()[1].on));
  // Drag the softbox: the tip line keeps showing the hint (not the light's name).
  const p = await at(1);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 40, p.y - 10, { steps: 4 });
  await wait(400);
  const dragHint = (await state()).hint;
  const card = await api(() => window.lightLab.card());
  const hoveredWhileDrag = await api(() => window.lightLab.hovered());
  await page.screenshot({ path: `${out}/03-drag-tip.png` });
  await page.mouse.up();
  check('dragging a light keeps the tip visible and outlines its switch', hoveredWhileDrag === 'softbox' && card.body === '' && dragHint.length > 0, { dragHint, hoveredWhileDrag });
  // iPad size buttons.
  const z0 = await api(() => window.lightLab.zoom());
  const plus = await at('size:1');
  await page.mouse.click(plus.x, plus.y);
  await wait(800);
  const z1 = await api(() => window.lightLab.zoom());
  const s1 = await api(() => window.lightLab.ipadScale());
  await page.screenshot({ path: `${out}/03b-ipad-bigger.png` });
  const minus = await at('size:-1');
  await page.mouse.click(minus.x, minus.y);
  await wait(800);
  const z2 = await api(() => window.lightLab.zoom());
  const sSmall = await api(() => window.lightLab.ipadScale());
  check('iPad - and + change its size', z1 > z0 && z2 === z0 && s1 > sSmall, { z0, z1, z2, s1, sSmall });
  await page.mouse.move(5, 5);

  // 1. Every scene's solution is out of frame and wins.
  for (let i = 0; i < 7; i++) {
    await api((n) => window.lightLab.loadLevel(n), i);
    await api(() => window.lightLab.solve());
    await wait(1200);
    const s = await state();
    await wait(2500);
    const after = await state();
    check(`scene ${i + 1} solution has nothing in frame and wins`, s.inFrame === null && after.phase === 'won', { inFrame: s.inFrame, after });
  }

  // 2a. Scene 3: a light standing in front of the bottle fails the take.
  await api(() => window.lightLab.loadLevel(2));
  const par3 = await api(() => window.lightLab.fixtures().findIndex((f) => f.item.kind === 'par'));
  await api((i) => window.lightLab.placeAt(i, 0.01, 0.07, 0.0), par3);
  await api(() => window.lightLab.solve());
  await wait(2500);
  let s3 = await state();
  check('scene 3: light in frame blocks the win', s3.phase === 'playing' && s3.inFrame === 'par' && s3.score <= 40, s3);
  await page.screenshot({ path: `${out}/04-scene3-light-in-frame.png` });

  // 2b. Scene 5: the top light dropped low, right in front of his face.
  await api(() => window.lightLab.loadLevel(4));
  await api(() => window.lightLab.solve());
  const top5 = await api(() => window.lightLab.fixtures().findIndex((f) => f.on));
  await api((i) => window.lightLab.place(i, 0, 15, 0.06), top5);
  await wait(2500);
  const s5 = await state();
  check('scene 5: light in front of the actor blocks the win', s5.phase === 'playing' && s5.inFrame !== null, s5);
  await page.screenshot({ path: `${out}/05-scene5-light-in-front.png` });

  // 3. Scene 7: the first SCREEN panel in the kit, placed on the RIGHT mark.
  await api(() => window.lightLab.loadLevel(6));
  await api(() => window.lightLab.setHouse(false));
  await api(() => {
    const ll = window.lightLab;
    ll.placeAt(0, 0.17, 0.2, -0.12);
    ll.switchOn(0);
  });
  await wait(600);
  const s7 = await state();
  check('scene 7: panel on the right counts as the right screen light', /left screen light/.test(s7.hint) && !/right screen light/.test(s7.hint), s7);
  await api(() => {
    const ll = window.lightLab;
    ll.placeAt(4, -0.17, 0.2, -0.12);
    ll.switchOn(4);
  });
  await wait(600);
  const s7b = await state();
  check('scene 7: both panels count once the second is placed', !/screen light/.test(s7b.hint), s7b);
  await api(() => window.lightLab.solve());
  await wait(1500);
  await page.screenshot({ path: `${out}/06-scene7-solved.png` });

  // 4. Scene 2: on location, starts with the key bumped.
  await api(() => window.lightLab.loadLevel(1));
  await wait(1500);
  const s2 = await state();
  const on2 = await api(() => window.lightLab.fixtures().filter((f) => f.on).length);
  check('scene 2 starts with three lights up, house off, key flagged', on2 === 3 && !(await api(() => window.lightLab.houseOn())) && /key/i.test(s2.hint), { on2, s2 });
  await page.screenshot({ path: `${out}/07-scene2-start.png` });
  await api(() => window.lightLab.place(0, -45, 30, 0.16));
  await wait(2500);
  const s2b = await state();
  check('scene 2: fixing the key wins', s2b.phase === 'won', s2b);
  await page.screenshot({ path: `${out}/08-scene2-won.png` });
  const line = await api(() => window.lightLab.bubble());
  check('win line comes from the director, on set', typeof line === 'string' && line.startsWith('"'), line);

  // Round 2. 6. Hints for lights behind the cast say plain moves, not "swing".
  await api(() => window.lightLab.loadLevel(6));
  await api(() => window.lightLab.solve());
  const back7 = await api(() => window.lightLab.fixtures().findIndex((f) => f.on && (f.item.kind === 'par' || f.item.kind === 'fresnel')));
  // Where ben had it: low, right behind the table.
  await api((i) => window.lightLab.placeAt(i, 0.0, 0.06, -0.12), back7);
  await wait(600);
  const h1 = (await state()).hint;
  await api((i) => window.lightLab.placeAt(i, -0.06, 0.2, -0.14), back7);
  await wait(600);
  const h2 = (await state()).hint;
  check('back-light hints use plain moves (no "swing")', !/swing/i.test(h1 + h2) && /camera-right|raise|grid/i.test(h1 + ' ' + h2), { h1, h2 });

  // 7. The director's lines come from the set; Mom arrives as a banner, not in Dee's chat.
  await api(() => window.lightLab.loadLevel(5));
  await wait(300);
  check('director says the scene quote in a speech bubble', /Golden hour/.test((await api(() => window.lightLab.bubble())) || ''), await api(() => window.lightLab.bubble()));
  await api(() => window.lightLab.solve());
  await wait(4500);
  await page.screenshot({ path: `${out}/09-mom-banner.png` });
  const t2 = await api(() => window.lightLab.texts());
  check('Mom texts as a notification', t2.some((t) => t.startsWith('mom:')), t2.slice(-3));
  const winsNoRealGuy = await api(() => true);
  check('Dee win lines never say "real guy"', winsNoRealGuy && !t2.some((t) => /real guy/.test(t)));

  // 8. The phone tucks down when nothing is happening; a tap keeps it up, another tucks it.
  await wait(9000);
  const tucked = !(await api(() => window.lightLab.phoneAwake()));
  let ph = await at('phone');
  await page.mouse.click(ph.x, 712);
  await wait(1500);
  const pinned = await api(() => window.lightLab.phonePinned());
  await wait(8000);
  const stillUp = await api(() => window.lightLab.phoneAwake());
  await page.screenshot({ path: `${out}/10-phone-pinned.png` });
  ph = await at('phone');
  await page.mouse.click(ph.x, ph.y);
  await wait(300);
  const unpinned = !(await api(() => window.lightLab.phonePinned()));
  check('phone tucks when idle; a tap keeps it up, another tucks it', tucked && pinned && stillUp && unpinned, { tucked, pinned, stillUp, unpinned });
  await page.mouse.move(5, 5);

  // Round 4. The bi-color light: its dial on the iPad must go warm for the warm role.
  await api(() => window.lightLab.loadLevel(3));
  await wait(400);
  const b4 = await api(() => window.lightLab.lightButtons());
  check('scene 4 iPad shows a dial on the bi-color softbox, and a Lamp switch', b4.some((b) => b.kelvin === 5600) && b4[b4.length - 1].label === 'Lamp', b4);
  const dialIdx = await api(() => window.lightLab.fixtures().findIndex((f) => f.item.dial));
  await api(() => window.lightLab.solve());
  await wait(300);
  // Turn it back to daylight with the dial: the shot no longer wins and the hint says so.
  for (let k = 0; k < 3; k++) {
    const c = await at(`cooler:${dialIdx + 1}`);
    await page.mouse.click(c.x, c.y);
    await wait(250);
  }
  await wait(600);
  const cold = await state();
  const kCold = await api((i) => window.lightLab.kelvin(i), dialIdx);
  await page.screenshot({ path: `${out}/11-scene4-dial-cold.png` });
  check('daylight on the warm key does not win, and the hint names the dial', kCold === 5600 && cold.phase === 'playing' && /dial/i.test(cold.hint), { kCold, cold });
  for (let k = 0; k < 3; k++) {
    const w = await at(`warmer:${dialIdx + 1}`);
    await page.mouse.click(w.x, w.y);
    await wait(250);
  }
  await wait(2500);
  const warm = await state();
  await page.screenshot({ path: `${out}/12-scene4-dial-warm.png` });
  check('dialing back to 3200K wins scene 4', (await api((i) => window.lightLab.kelvin(i), dialIdx)) === 3200 && warm.phase === 'won', warm);

  console.log('errors', errors.length ? errors : 'none');
  const failed = Object.entries(results).filter(([, ok]) => !ok);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
