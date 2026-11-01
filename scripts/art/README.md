# Actor pipeline (Rocketbox FBX -> seated, baked glb)

One-time setup (Blender as a Python module, no GUI needed):

```sh
uv venv --python 3.11 bpyenv && uv pip install --python bpyenv/bin/python bpy pillow numpy
npm install --no-save @gltf-transform/cli@4
```

1. Download an avatar from github.com/microsoft/Microsoft-Rocketbox (MIT):
   `Assets/Avatars/Adults/<Name>/Export/<Name>.fbx` and its `Textures/*.tga`.
2. Convert textures to PNG in a `tex/` folder: `body_color`, `body_normal`,
   `head_color`, `head_normal`, `hair_color` (RGBA), and `body_mr`/`head_mr`
   (roughness in the green channel, made from the specular maps).
3. Pose and bake: `bpyenv/bin/python -I scripts/art/pose_actor.py -- <avatar>.fbx tex actor_raw.glb`
   (edit the `rot(...)` lines to change the pose; the printed ANCHOR lines give
   seat and foot heights for the chair in `set-dressing.ts`).
4. Preview: `bpyenv/bin/python -I scripts/art/render_glb.py -- $PWD/actor_raw.glb $PWD/prev`
5. Finish (1024 px WebP, alpha-masked hair, keeps the `subject-head` node):
   `cp scripts/art/finish_glb.mjs node_modules/.finish.mjs && node node_modules/.finish.mjs actor_raw.glb public/models/actor-seated.glb`
   (run from `node_modules/` so it resolves the gltf-transform packages).

## Crew and the co-star (`pose_character.py`)

Same setup, one script for any Rocketbox avatar and pose:

```sh
bpyenv/bin/python -I scripts/art/pose_character.py -- <avatar>.fbx tex out_raw.glb <pose> <name> [--subject-head]
node node_modules/.finish.mjs out_raw.glb public/models/<file>.glb [texture size, default 1024]
```

Poses: `seated` (same pose and seat height as `actor-seated.glb`), `dinner` (seated,
forearms on a 0.77 m dining table), `standing`, `standing-hip`, `standing-cup`.
Material slots are matched by name (`*body*`, `*head*`, `*opacity*` for hair), so
any avatar works; textures are converted the same way as for the actor.

| File | Avatar (Rocketbox, MIT) | Pose | Textures |
| --- | --- | --- | --- |
| `actress-seated.glb` | Female_Adult_11, dress recolored deep red | dinner, `--subject-head` | 1024 |
| `crew-director.glb` | Male_Adult_05 | seated | 512 |
| `crew-gaffer.glb` | Male_Adult_09 | standing | 512 |
| `crew-sponsor.glb` | Business_Female_01 | standing-hip | 512 |
| `crew-crafty.glb` | Chef_Female_01 | standing | 512 |

Texture conversion: `scripts/art/convert_tex.py <Textures dir> <tex dir> <size>`. The red
dress (`scripts/art/recolor_dress.py`): in `body_color.png`, every pixel darker than about 50% value was
remapped to crimson by its luminance (skin is brighter and stays as is). Crew
spots, the director's chair and the craft services table are in
`src/scene-assets/crew.ts`; the scene JSON places each `crew-<role>` model at
the matching `crew-<role>` anchor.
