import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createSoftbox,
  createSoundstage,
} from './scene-assets/soundstage.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  soundstage: createSoundstage(),
  softbox: createSoftbox(),
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Level Card',
  },
});
