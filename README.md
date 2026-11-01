# Lucky Break (Light Lab)

A lighting puzzle game for Meta Quest, built with the Immersive Web SDK. You're
an extra who got mistaken for the lighting operator; each level is a new set,
and you light it to match the director's target shot.

## The story

Background Extra #47 gets mistaken for the lighting operator on their last day
on set. Seven scenes on one tabletop soundstage, each teaching one real
lighting idea, then a finale where the green screen rolls into Lake Como.

| # | Scene | What it teaches | Kit (right lights in bold) |
|---|---|---|---|
| 1 | Social clip | One soft key, 45° to the side | Fresnel, **softbox**, PAR |
| 2 | Interview | Three-point: key, fill, back | **PAR or Fresnel**, **softbox**, **LED panel**, Fresnel |
| 3 | Product shot | Soft top light plus a strip rim on glass | Fresnel, **strip box**, **softbox**, PAR |
| 4 | Living room | Practicals and motivated light (warm gel) | softbox, Fresnel, **softbox with CTO gel**, panel, plus the lamp |
| 5 | Interrogation | Low-key: one hard top light | panel, **PAR or Fresnel**, softbox, Fresnel |
| 6 | Sunset | Magic hour: low warm backlight plus soft fill | Fresnel, **LED panel**, **Fresnel with CTO gel**, softbox |
| 7 | Green screen | Light the screen evenly, light the actors separately | **two SCREEN panels**, **softbox**, **Fresnel or PAR** |

Every scene: the house lights start on (hit HOUSE), the kit sits on the tape,
and the director signs off once "your shot" on the monitor holds a match of
85% or more (90% in scene 1). The call sheet on the left carries the story and
the "next" button.

`?scene=N` in the URL jumps straight to scene N (1-7), for testing or for
picking up where you left off.

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

- `node scripts/smoke-test.cjs` drives scene 1 with real mouse input.
- `node scripts/playthrough.cjs` plays title to credits (about 4 minutes in
  software rendering).

`npm run build` writes the site to `dist/`. Pushes to `main` deploy it to
GitHub Pages (`.github/workflows/pages.yml`).

## Layout

- `src/scene-assets/soundstage.scene-asset.ts`: the set, the camera and the light fixtures.
- `src/scene-assets/set-dressing.ts`: director's chair, C-stand, sandbags, apple boxes, cables, tape marks.
- `public/models/actor-seated.glb`: the cast member, a [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox)
  avatar (MIT license) posed seated and baked in Blender; its `subject-head` node is what the lights aim at.
- `src/levels.ts`: the seven scenes as data (cast, kit, the roles lights must fill, story text).
- `src/scene-assets/level-sets.ts`: each scene's set pieces (bookshelf, perfume bottle, lamp, green screen...).
- `src/lighting-level.ts`: the game: scene flow, lights, house switch, monitor, scoring, hints, controls.
- `src/ipad-hud.ts`: the iPad in the middle of the view (target vs your shot, how to play).
- `src/phone-hud.ts`: the phone with Dee's texts and notification banners.
- `src/speech-bubble.ts`: the director's lines, floating over the director on set.
- `docs/LEARNINGS.md`: what building this taught us.
- `public/scenes/main.iwsdk.scene.json`: where everything sits in the scene.
