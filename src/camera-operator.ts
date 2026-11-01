import type { Object3D } from '@iwsdk/core';
import { SCALE } from './scene-assets/set-dressing.js';

/**
 * The camera operator: a crew member standing right behind the cine camera
 * with both hands on its body, looking down at its back monitor (asked for in
 * the first headset playtest, so the camera reads as a camera on a dark set).
 *
 * He is parented to the "camera-rig", so he follows the camera wherever a
 * scene puts it (LevelDef.camera) and is hidden along with the rig whenever the
 * shot is rendered: he can never end up in the picture.
 *
 * Model: crew-operator.glb (Rocketbox Male_Adult_18, MIT, "operating" pose in
 * scripts/art/pose_character.py). Its root is on the floor under his pelvis and
 * he faces +Z, with his hands about 0.4 m (real) in front of his pelvis.
 */

export const OPERATOR_ASSET = 'crew-operator';
export const OPERATOR_NODE = 'crew-operator-model';

// Rig-local spot: 0.6 m (real) behind the camera's center, so his hands land
// on the rear half of the camera body and his eyes are about 25 cm behind its
// back monitor. The rig's lens looks down -Z, so he turns to face -Z too.
const OPERATOR_Z = 0.6 * SCALE;

/** Puts a copy of the loaded operator model behind the camera; returns it. */
export function attachCameraOperator(rig: Object3D, model: Object3D): Object3D {
  const existing = rig.getObjectByName(OPERATOR_NODE);
  if (existing) return existing;
  const operator = model.clone(true);
  operator.name = OPERATOR_NODE;
  operator.scale.setScalar(SCALE);
  operator.position.set(0, 0, OPERATOR_Z);
  operator.rotation.set(0, Math.PI, 0);
  operator.traverse((child) => {
    // He takes the set's light but casts no shadow: one less shadow caster for
    // the Quest, and nothing of his can fall into the shot.
    child.castShadow = false;
    child.receiveShadow = true;
  });
  rig.add(operator);
  return operator;
}
