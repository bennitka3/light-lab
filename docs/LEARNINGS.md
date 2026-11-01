# Learnings from building Lucky Break

Notes for whoever (human or Claude) works on this next. Newest first.

## 2026-11-01: playtest round 5

**Characters say things to your face, not through Dee.** When a line is the
director reacting to you, he says it himself and turns to look at you first
(`sayToYou`: turn, 0.9 s beat, line). Dee only texts what she would know
from video village.

**Swappable cast per scene.** `LevelDef.actorAsset` names a model for the
first seat; `loadedModel()` returns it only if it is in the manifest and
loaded, so the art and the code can land in either order.

**Don't nag about choices.** A reminder stops once the player has shown they
know (cut the house lights once = leaving them on is deliberate).

## 2026-11-01: playtest round 4, switches on the iPad

**All switches are buttons on the iPad, labeled.** HOUSE, every light and
the lamp. The game state stays on the fixtures; `updateLightButtons()` copies
it onto a fixed array each frame, and the iPad only redraws when something
changed (no per-frame allocation).

**Presses on the iPad need the hit point.** On desktop the mouse ray gives
it. In the headset the iPad listens for the pointer event IWSDK raises
(`pointerdown`, which bubbles up to the iPad group and carries `point`). Not
yet checked in the headset emulator or on a Quest.

**Bi-color instead of gels.** `KitItem.dial` makes a light dialable and
`Role.warm` needs it at 3200K. `applyKelvin()` blends from the light's own
color to the old orange-gel tint, so the target shot looks the same as before.

**The iPad now catches every press in play,** so a drag that starts on it no
longer turns the view. Tests that orbit must start on empty space.

## 2026-11-01: playtest rounds 2 and 3, "everything is practical UI"

**Design rule from ben: nothing floats.** Every piece of UI is a prop the
player holds (the iPad with the shots, the phone with Dee's texts) or comes
from someone on set (the director's speech bubble). New UI must go into one of
those three before anything else is considered.

**The iPad during play is just the shots plus one tip line.** Longer text
moved to people: the brief and objective are the director's lines in a row
(`say` then `sayNext`), and the lesson and gossip are Dee's texts. Hovering a
light replaces the tip line with its name.

**Footer text beside buttons gets cut off.** On the full iPad page the footer
runs full width above the button row, never squeezed in beside the buttons.

**Every HUD layer must be transparent.** Opaque meshes ignore `renderOrder`
against transparent ones, so the shot images drew behind the iPad body (black).

**Changing the number of lights recompiles every material** in three.js. Dim
lights to intensity 0 instead of hiding them, or the game stalls for a second.

## 2026-11-01: playtest round 1 fixes

**"Light in the shot" is a projection test, not a pixel test.** Each frame
`framedFixture()` projects the light's head and nine points down its stand
through the cine camera; any point inside the frame fails the take. Kit
lights are parked behind the camera, so they never count. Overhead lights
(above 0.17 m stage height) hang from the grid with the pipe going up, which
is what makes high top/back/screen lights possible without a stand in shot.
If you add a role, run `scripts/playtest-fixes.cjs`: it checks every scene's
solution is out of frame.

**Tips must point the way the score improves.** Scoring by angle around the
subject but hinting in floor directions made the tip ping-pong on high top
lights (near the top, a tiny sideways move swings the angle a lot). The tip
now tries a 1.5 cm move in all six directions against the real score and keeps
its current direction while that still helps. If you change `roleFit` or add a
role, run `scripts/follow-hints.cjs`: a bot follows the tips from a knocked-off
start and must win every trial.

**Match lights to roles with the best overall assignment.** Greedy
role-by-role matching credited the first-switched SCREEN panel to "left" no
matter where it stood. With at most four roles and five lights, trying every
assignment is instant.

**HUD in front of the view.** The lower third and phone are plain canvas
meshes with depthTest off and a high renderOrder, hidden during the monitor
renders. Desktop: fixed to the camera, sized from its fov and aspect.
Headset: head-space offsets with a lazy follow. The lower third only has
`RayInteractable` while it shows a button, so it never blocks rays to the
lights below it. Verified in the emulator: it sits 0.7 m ahead, 0.2 m below
eye level. Not yet seen on a real Quest.

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
