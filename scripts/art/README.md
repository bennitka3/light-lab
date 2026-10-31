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
