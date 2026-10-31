import { createComponent, Types } from '@iwsdk/core';

/** Marks the soundstage set that a lighting level is played on. */
export const LightingStage = createComponent('LightingStage', {
  levelId: { type: Types.String, default: 'scene-1-social-clip' },
});

/**
 * Marks a grabbable light. The target fields describe where this light has to
 * end up, relative to the subject's head and the camera axis, to match the
 * level's target shot.
 */
export const KeyLightRig = createComponent('KeyLightRig', {
  intensity: { type: Types.Float32, default: 0.1, min: 0, step: 0.01 },
  targetAzimuthDeg: { type: Types.Float32, default: -45 },
  targetElevationDeg: { type: Types.Float32, default: 35 },
  targetDistance: { type: Types.Float32, default: 0.16 },
  startAzimuthDeg: { type: Types.Float32, default: 0 },
  startElevationDeg: { type: Types.Float32, default: 0 },
  startDistance: { type: Types.Float32, default: 0.2 },
});
