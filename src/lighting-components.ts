import { createComponent, Types } from '@iwsdk/core';

/**
 * Marks the soundstage set that a lighting level is played on. The target
 * fields describe where the right light has to end up, relative to the
 * subject's head and the camera axis, to match the level's target shot.
 */
export const LightingStage = createComponent('LightingStage', {
  levelId: { type: Types.String, default: 'scene-1-social-clip' },
  targetKind: { type: Types.String, default: 'softbox' },
  targetAzimuthDeg: { type: Types.Float32, default: -45 },
  targetElevationDeg: { type: Types.Float32, default: 35 },
  targetDistance: { type: Types.Float32, default: 0.16 },
});

/**
 * A light from the kit. It starts parked in the kit area at the front of the
 * stage, switched off, and comes on once the player moves it onto the set.
 * kind is "softbox", "fresnel" or "par" and sets both the look of the fixture
 * and the quality of its light. kitX is its parking spot across the stage.
 */
export const StageLight = createComponent('StageLight', {
  kind: { type: Types.String, default: 'softbox' },
  kitX: { type: Types.Float32, default: 0 },
});
