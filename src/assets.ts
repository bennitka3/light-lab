import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createFixture,
  createSoundstage,
} from './scene-assets/soundstage.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  soundstage: createSoundstage(),
  softbox: createFixture('softbox'),
  fresnel: createFixture('fresnel'),
  par: createFixture('par'),
  // The seated cast member: a Microsoft Rocketbox avatar (MIT) posed and baked in Blender.
  'actor-seated': {
    url: publicAssetUrl('models/actor-seated.glb'),
    type: AssetType.GLTF,
    priority: 'critical',
  },
  // The superstar co-star for the Lake Como dinner: Rocketbox Female_Adult_11 (MIT),
  // red evening dress, seated with her forearms on the table. Same seat height as
  // actor-seated, with her own "subject-head" node.
  actress: {
    url: publicAssetUrl('models/actress-seated.glb'),
    type: AssetType.GLTF,
    priority: 'background',
  },
  // Crew around the set (Rocketbox, MIT), placed at the "crew-*" anchors.
  'crew-director': { url: publicAssetUrl('models/crew-director.glb'), type: AssetType.GLTF, priority: 'background' },
  'crew-gaffer': { url: publicAssetUrl('models/crew-gaffer.glb'), type: AssetType.GLTF, priority: 'background' },
  'crew-sponsor': { url: publicAssetUrl('models/crew-sponsor.glb'), type: AssetType.GLTF, priority: 'background' },
  'crew-crafty': { url: publicAssetUrl('models/crew-crafty.glb'), type: AssetType.GLTF, priority: 'background' },
});
