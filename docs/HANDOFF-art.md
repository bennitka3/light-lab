# Handoff: character and set detail for Lucky Break

You are taking over the **art** of Scene 1: a realistic cast member and a more
detailed soundstage. Another Claude thread owns the **gameplay** (lights,
scoring, controls) and keeps pushing to `main` while you work. This file says
what is yours, what is not, and how your work gets merged.

Owner: ben (non-engineer, pro video editor; judges the result, not the code).
Explain in plain language, show before/after screenshots, and say what you
tested and what you didn't.

## Goal

1. Replace the blocky actor with a realistic, rigged human at roughly GTA IV
   detail, so lighting reads on the face: shadow under the nose, cheekbones,
   eye sockets, hair that can catch a rim light.
2. Dress the soundstage so it looks like a real studio at 1:14 scale (for
   example: apple box or director's chair instead of the stool, sandbags on
   stand legs, cable runs, a C-stand with a flag parked at the side, floor tape
   marks). Keep it readable from the player's seat.

## Where to start

- Repo: `bennitka3/light-lab`. Live build: https://bennitka3.github.io/light-lab/
- Read `AGENTS.md`, `README.md` and `.claude/skills/` (IWSDK skills) first.
- Character source, recommended: **Microsoft Rocketbox** (github.com/microsoft/Microsoft-Rocketbox),
  ~100 realistic rigged people made for VR. Confirm its license allows use in a
  public, possibly prize-winning game before using it, and tell ben what it
  says. Do not use Unreal MetaHumans (license ties them to Unreal).
  Anything that costs money needs ben's OK first.
- Convert to `.glb` (Blender CLI or FBX2glTF), compress with gltf-transform
  (meshopt geometry, KTX2 or WebP textures). Put files in `public/models/`.

## Budget (Quest 3 / 3S browser, must hold 72 fps)

- Actor: at most ~15k triangles, textures 1024 px (2048 only for the face if it clearly helps).
- Whole set including the actor: at most ~150k triangles, under ~100 draw calls.
- Keep the actor static (seated pose baked or a single idle frame) unless ben asks for animation.

## What is yours (edit freely)

- `src/scene-assets/soundstage.scene-asset.ts`: the set and the actor
  (`createSoundstage`, `createSubject`, `createCineCamera`). Do not change
  `createFixture` or its helpers (the lights) without asking the gameplay thread.
- `public/models/**` (new).
- New asset entries in `src/assets.ts` (add lines; do not rename or remove existing keys).

## What is not yours (do not edit)

- `src/lighting-level.ts`, `src/lighting-components.ts`, `src/panel.ts`, `src/index.ts`
- `iwsdk.config.json`
- Light nodes and `LightingStage` values in `public/scenes/main.iwsdk.scene.json`
- Renderer look: tone mapping, exposure, IBL/hemisphere intensity. These change
  what the score's target shot looks like. Ask first.

If you need a change in those files, message the gameplay thread (or ask ben)
instead of making it.

## The contract the gameplay code depends on (keep it true)

The lighting system finds objects in the stage by name. After your changes:

- `subject-head`: an Object3D at the center of the actor's head (between the
  ears, eye height). Lights aim at it and the score measures from it. Keep it
  at stage-local `(0, 0.105, -0.06)` (seated head height, 1:14 scale). If the new
  model can't sit there, move it as close as you can and tell the gameplay
  thread the new position, because the level's target numbers depend on it.
- The actor faces stage-local **+Z** (toward the cine camera).
- `camera-lens`: the cine camera's lens; the shot camera sits at its center and
  looks at `subject-head`. Nothing may sit between the lens and the face.
- `camera-rig`: the whole camera body; it is hidden while the shot renders.
- Stage origin is the center of the stage floor. Exports `STAGE_WIDTH`,
  `STAGE_DEPTH`, `STAGE_HEIGHT`, `KIT_Z`, `KIT_HEIGHT`, `SUBJECT_POSITION`,
  `HEAD_HEIGHT`, `CAMERA_POSITION` keep their names and meanings.
- The front apron (stage-local z 0.2 to 0.36) is the light kit area. Keep it
  clear and flat; the yellow tape line at z = 0.2 is the on/off line for lights.
- Walls stay black. The black box is what keeps virtual light readable against
  the real room in passthrough AR.
- Every visible mesh casts and receives shadows, except floors and walls (receive only).
- Add no lights to the scene. All light comes from the kit.

## How to work and merge

1. Branch from the latest `main`: `art/characters-and-set`. Never push to `main`.
2. Commit in small steps. Before each push, rebase on `main`
   (`git fetch origin main && git rebase origin/main`), so the gameplay thread's
   changes stay in and conflicts stay small.
3. Shared files (`src/assets.ts`, the scene JSON): only add lines; on a
   conflict keep both sides.
4. Checks before opening or updating the PR, all must pass:
   - `npm run typecheck`
   - `npm run build`
   - `npm run dev`, then `node scripts/smoke-test.cjs` (drags a light with the
     mouse and checks the level can still be won; saves screenshots). In a cloud
     container with a newer Playwright than the preinstalled browser, point
     `PLAYWRIGHT_BROWSERS_PATH` at a folder that links the expected browser
     revision names to `/opt/pw-browsers/*`; do not run `playwright install`.
   - Look at the screenshots: the face must still show a clear difference
     between a light at camera-left and camera-right on the monitor.
5. Open a PR into `main` titled "Art: realistic actor and set detail". Include
   before/after screenshots of the stage and the monitor, triangle counts, the
   character license, and what was not tested (headset frame rate, until ben
   tries it on a Quest).
6. Merge timing: ben merges it (or says to). Merge only when the checks pass on
   a branch rebased on the current `main`, and not while the gameplay thread has
   an open PR touching `src/scene-assets/` (check open PRs first). After merge,
   GitHub Pages republishes automatically; check the live page.

## Out of scope

Gameplay, new levels, the story scenes, sound, and anything that spends money.
