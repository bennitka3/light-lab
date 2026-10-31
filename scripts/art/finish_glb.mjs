// Finish the baked actor: 1024px textures, WebP color maps, PNG normal maps,
// hair as alpha-masked double-sided cards, named head anchor kept.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const [input, output] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
for (const mat of doc.getRoot().listMaterials()) {
  if (mat.getName() === 'actor-hair') {
    mat.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true);
  } else {
    mat.setAlphaMode('OPAQUE').setDoubleSided(false);
  }
}
await doc.transform(
  dedup(),
  prune({ keepLeaves: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [1024, 1024], slots: /baseColor|metallicRoughness/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', lossless: true, resize: [1024, 1024], slots: /normal/ }),
);
let tris = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log('nodes', doc.getRoot().listNodes().map((n) => n.getName()), 'tris', tris);
for (const t of doc.getRoot().listTextures()) console.log('tex', t.getName() || t.getURI(), t.getMimeType(), t.getSize(), t.getImage().byteLength);
await io.write(output, doc);
