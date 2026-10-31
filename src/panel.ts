/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, UIKitMLAsset, VisibilityState } from '@iwsdk/core';

/**
 * The level card. "Play in your room" starts the headset session; it only
 * shows when the browser can actually run one, and a desktop browser gets a
 * note to open the page on a Quest instead.
 */
export class PanelSystem extends createSystem({}) {
  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel?.getElementById('xr-button');
    const exitButton = panel?.getElementById('exit-button');
    const headsetNote = panel?.getElementById('headset-note');
    const desktopHelp = ['desktop-help', 'desktop-help-2', 'desktop-help-3'].map((id) => panel?.getElementById(id));
    if (xrButton == null || exitButton == null) {
      return;
    }
    xrButton.setProperties({ display: 'none' });
    exitButton.setProperties({ display: 'none' });
    if (!this.world.xrEnabled) {
      return;
    }

    let canEnterXR = false;
    const showFor = (is2D: boolean) => {
      xrButton.setProperties({ display: is2D && canEnterXR ? 'flex' : 'none' });
      exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      headsetNote?.setProperties({ display: is2D && !canEnterXR ? 'flex' : 'none' });
      for (const line of desktopHelp) {
        line?.setProperties({ display: is2D ? 'flex' : 'none' });
      }
    };
    const xr = navigator.xr;
    if (xr) {
      Promise.all([
        xr.isSessionSupported('immersive-ar').catch(() => false),
        xr.isSessionSupported('immersive-vr').catch(() => false),
      ]).then(([ar, vr]) => {
        canEnterXR = ar || vr;
        showFor(this.world.visibilityState.value === VisibilityState.NonImmersive);
      });
    }

    const launchXR = () => this.world.launchXR();
    const exitXR = () => this.world.exitXR();
    xrButton.addEventListener('click', launchXR);
    exitButton.addEventListener('click', exitXR);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
      this.world.visibilityState.subscribe((visibilityState) => {
        showFor(visibilityState === VisibilityState.NonImmersive);
      }),
    );
  }
}
