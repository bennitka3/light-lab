# Lucky Break (Light Lab)

A lighting puzzle game for Meta Quest, built with the Immersive Web SDK. You're
an extra who got mistaken for the lighting operator; each level is a new set,
and you light it to match the director's target shot.

## Scene 1: social clip (soft key)

A tabletop soundstage with one cast member and a cine camera. Move the softbox
until "your shot" on the camera monitor matches the target. Hold a match of 90%
or more and the director signs off.

- Headset: pinch or grab the softbox (hands or controllers).
- Desktop browser: drag the softbox with the mouse; scroll to move it closer or farther.

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
