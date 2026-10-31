# Lucky Break (Light Lab)

A lighting puzzle game for Meta Quest, built with the Immersive Web SDK. You're
an extra who got mistaken for the lighting operator; each level is a new set,
and you light it to match the director's target shot.

## Scene 1: social clip (soft key)

A tabletop soundstage with one cast member and a cine camera. Three lights wait
in the kit behind the tape: a softbox, a Fresnel and a PAR can. A light switches
on once it is moved past the tape. Pick the right one, place it until "your
shot" on the camera monitor matches the target, and hold a match of 90% or more
for the director to sign off.

- Headset: pinch or grab a light (hands or controllers).
- Desktop browser: drag a light across the set; scroll while dragging to raise
  or lower it. Drag empty space to turn the view, scroll to zoom.

## Develop

```sh
npm install
npm run dev
```

`npm run build` writes the site to `dist/`. Pushes to `main` deploy it to
GitHub Pages (`.github/workflows/pages.yml`).

## Layout

- `src/scene-assets/soundstage.scene-asset.ts`: the set, the cast member, the camera and the softbox.
- `src/lighting-level.ts`: the key light, the camera monitor, the match score and the desktop controls.
- `src/lighting-components.ts`: per-level data (target light position, start position).
- `public/scenes/main.iwsdk.scene.json`: where everything sits in the scene.
