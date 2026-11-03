# Lucky Break (Light Lab)

A lighting puzzle game for Meta Quest, built with the Immersive Web SDK. You're
an extra who got mistaken for the lighting operator; each level is a new set,
and you light it to match the director's target shot.

## The story

Background Extra #47 gets mistaken for the lighting operator on their last day
on set. Ten scenes on one tabletop soundstage, each teaching one real
lighting idea, then a finale where the green screen rolls into Lake Como.

| # | Scene | What it teaches | Kit (right lights in bold) |
|---|---|---|---|
| 1 | Tutorial: dial it in | Brightness only: key, fill, back on dimmers; house lights off to finish | **softbox**, **LED panel**, **Fresnel** (rigged, locked) |
| 2 | Social clip, with a dimmer | Place one soft key, then set its brightness | Fresnel, **softbox (dimmer)**, PAR |
| 3 | Interview | Three-point: key, fill, back | **PAR or Fresnel**, **softbox**, **LED panel**, Fresnel |
| 4 | Product shot | Soft top light plus a strip rim on glass | Fresnel, **strip box**, **softbox**, PAR |
| 5 | Desert at noon | Shape the sun: overhead silk, bounce card | Fresnel, **silk**, **bounce card**, softbox |
| 6 | Living room | Practicals and motivated light (warm gel) | softbox, Fresnel, **softbox with CTO gel**, panel, plus the lamp |
| 7 | Interrogation | Low-key: one hard top light | panel, **PAR or Fresnel**, softbox, Fresnel |
| 8 | Car commercial | LED volume: soft top light for the paint, key at half | Fresnel, **softbox**, **LED panel (dimmer)**, PAR |
| 9 | Sunset | Magic hour: low warm backlight plus soft fill | Fresnel, **LED panel**, **Fresnel with CTO gel**, softbox |
| 10 | Green screen | Light the screen evenly, light the actors separately | **two SCREEN panels**, **softbox**, **Fresnel or PAR** |

Every scene: the kit sits on the tape, and the director signs off once "your
shot" on the iPad holds a match of 85% or more (90% in scene 2, every dimmer
exact in the tutorial). Then you hit Roll: the take plays (the cast talk, the
LED wall scrolls, a tumbleweed blows across the desert), the director calls Cut,
and Next scene moves on.

`?scene=N` in the URL jumps straight to scene N (1-10), for testing or for
picking up where you left off.

`?track=beta` plays only the four scenes that started as the beta track
(tutorial, social clip with a dimmer, desert, car). `?track=beta&scene=2` jumps within it.

## Controls

- Headset: pinch and move a light (or squeeze on a controller); a quick pinch or
  a trigger press switches it on or off. Point at the HOUSE switch, the lamp or
  the call sheet and pinch (or pull the trigger).
- Desktop browser: click a light to switch it on or off, drag it to move it,
  Shift-drag (or scroll while dragging) to raise it. Click HOUSE, the lamp and
  the call sheet. Drag empty space to turn the view, scroll to zoom.

## Develop

```sh
npm install
npm run dev
```

Tests against the running dev server (they use a dev-only `window.lightLab`
test API that the production build leaves out):

- `node scripts/smoke-test.cjs` drives scenes 1 and 2 with real mouse input.
- `node scripts/placement-check.cjs [url] [outDir]` is the "does this look like realistic
  placement?" check (ben, round 10), run before every update: every scene, parked and solved,
  must have nobody inside a wall or a light, crew on the floor, nothing floating. It also saves
  screenshots of each scene and its camera shot to look over by eye.
- `node scripts/playthrough.cjs` plays title to credits (about 4 minutes in
  software rendering).
- `node scripts/beta-track.cjs` plays the four-scene beta track (the tutorial by clicking
  only the iPad's dimmers, house lights last) and checks the main track has its ten scenes.
- `node scripts/playtest-fixes.cjs` checks every playtest fix still holds.
- `node scripts/follow-hints.cjs [url]` plays by following the tips; give it a
  `?track=beta` URL for the beta scenes.

`npm run build` writes the site to `dist/`. Pushes to `main` deploy it to
GitHub Pages (`.github/workflows/pages.yml`).

## Layout

- `src/scene-assets/soundstage.scene-asset.ts`: the set, the camera and the light fixtures.
- `src/scene-assets/set-dressing.ts`: director's chair, C-stand, sandbags, apple boxes, cables, tape marks.
- `public/models/actor-seated.glb`: the cast member, a [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox)
  avatar (MIT license) posed seated and baked in Blender; its `subject-head` node is what the lights aim at.
- `public/models/car-suv.glb`: the beta car commercial's SUV, the "suv" from Kenney's
  [Car Kit](https://kenney.nl/assets/car-kit) (CC0, public domain), repainted in `beta-sets.ts`.
- `src/levels.ts`: the seven scenes as data (cast, kit, the roles lights must fill, story text).
- `src/scene-assets/level-sets.ts`: each scene's set pieces (bookshelf, perfume bottle, lamp, green screen...).
- `src/lighting-level.ts`: the game: scene flow, lights, house switch, monitor, scoring, hints, controls.
- `src/ipad-hud.ts`: the iPad in the middle of the view (target vs your shot, how to play).
- `src/phone-hud.ts`: the phone with Dee's texts and notification banners.
- `src/speech-bubble.ts`: the director's lines, floating over the director on set.
- `docs/LEARNINGS.md`: what building this taught us.
- `public/scenes/main.iwsdk.scene.json`: where everything sits in the scene.
