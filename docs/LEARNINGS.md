# Learnings from building Lucky Break

Notes for whoever (human or Claude) works on this next. Newest first.

## 2026-10-31: seven scenes in one night

**One scene file, levels in code.** All seven scenes share the soundstage in
`public/scenes/main.iwsdk.scene.json`; `src/levels.ts` describes each scene as
data and `lighting-level.ts` builds and tears it down (set pieces, lights,
cast). Lights are created at runtime as entities, so a scene's kit can be any
size. Adding a scene is a new entry in `LEVELS` plus, if needed, a set in
`level-sets.ts`.

**Score lights by role, not by kind.** Each scene lists roles (key, fill,
back, screen-left...) with the light types that can fill them and where they
go (an orbit around the cast, or a fixed spot). The game matches the
switched-on lights to the roles, so "PAR or Fresnel" for a back light just
works, and extra lights cost score. Hints come from the same numbers: the hint
names whichever error (angle, height or distance) is costing the most, so the
hint never says "almost there" while the score is still short.

**Test with a test API, not pixel guessing.** Dev builds expose
`window.lightLab` (solve, pressCard, loadLevel, screenOf...). `screenOf()`
turns a 3D thing into screen pixels so the mouse test clicks the real
switch, card and lights. Production builds leave it out.

**The headset emulator in this container is about 1 frame per second**
(software rendering). Consequences:
- Screenshots in XR take ~25 s and hit the CLI's 27 s limit; a "timed out"
  is not a crash. Read state from console logs instead (`devLog` lines start
  `[lightLab]`) and read them with `npx @iwsdk/cli browser logs`.
- Anything timed (a "quick pinch" under 0.45 s) can't be done in real time.
  Pause the ECS (`ecs pause`), set the input, `ecs step` a few 1/72 s frames,
  release, step again.
- Controller trigger press on a light: verified this way. Card and HOUSE
  switch by controller ray: verified. Grab-and-move by squeeze or hand pinch:
  NOT verified in the emulator (no grab registered via set-gamepad-state or
  hand pinch while frame-stepping); it needs a real Quest check.

**Controller trigger didn't toggle lights.** IWSDK grabs on squeeze (or a
hand pinch, which it forwards to squeeze); the trigger only marks the entity
`Pressed`. The tap-to-toggle now listens to both `Grabbed` and `Pressed`.

**The camera monitor is a second render of the whole set.** In the headset it
now refreshes every third frame to keep the Quest near 72 fps. Watch this cost
if scenes get heavier (the art pass).

**Layout: three floating panels compete for space.** Call sheet top-left,
how-to-play bottom-left, monitor right. The stage's side wall hides anything
that drifts behind it from the default desktop camera, so buttons sit on the
left edge of the card.

**Desktop vs headset help.** The how-to-play lines are shown in any 2D view,
including on a Quest browser before entering XR, because the emulator makes
every dev page look "XR capable".

**Playwright in this environment**: the repo's playwright wants browser
revision 1248; use `PLAYWRIGHT_BROWSERS_PATH` pointing at a folder of symlinks
to `/opt/pw-browsers`. Never run `playwright install`. github.io is not
reachable from the container; test the built `dist/` served at
`/light-lab/` on localhost instead.
