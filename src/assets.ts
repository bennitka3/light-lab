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
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Level Card',
  },
});
