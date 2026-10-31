import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

/**
 * Level 1 set: a tabletop black-box soundstage about 50 cm wide that sits on
 * the player's desk. Origin is the stage floor's center, so the scene places
 * it at desk height. Inside: one cast member on a stool and a cine camera on a
 * tripod. Named children ("subject-head", "camera-lens") are what the lighting
 * system aims the key light and the shot camera at.
 */

// The miniature is roughly 1:14 scale, so a seated person is about 11 cm tall.
export const STAGE_WIDTH = 0.5;
export const STAGE_DEPTH = 0.4;
export const STAGE_HEIGHT = 0.3;
export const SUBJECT_POSITION = [0, 0, -0.06] as const;
export const HEAD_HEIGHT = 0.105;
export const CAMERA_POSITION = [0, 0.105, 0.14] as const;

const wallMaterial = new MeshStandardMaterial({
  color: '#17171a',
  roughness: 0.95,
});
const floorMaterial = new MeshStandardMaterial({
  color: '#2a2724',
  roughness: 0.85,
});
const gridMaterial = new MeshStandardMaterial({
  color: '#3a3a3e',
  roughness: 0.6,
  metalness: 0.6,
});
const skinMaterial = new MeshStandardMaterial({
  color: '#d9a88a',
  roughness: 0.7,
});
const hairMaterial = new MeshStandardMaterial({
  color: '#3b2a20',
  roughness: 0.8,
});
const shirtMaterial = new MeshStandardMaterial({
  color: '#4f6fa3',
  roughness: 0.85,
});
const stoolMaterial = new MeshStandardMaterial({
  color: '#8a6a4a',
  roughness: 0.7,
});
const gearMaterial = new MeshStandardMaterial({
  color: '#1f1f22',
  roughness: 0.5,
  metalness: 0.5,
});
const glassMaterial = new MeshStandardMaterial({
  color: '#0d1a26',
  roughness: 0.1,
  metalness: 0.9,
});
const diffuserMaterial = new MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#fff4e0',
  emissiveIntensity: 1.2,
  roughness: 1,
});

function box(
  w: number,
  h: number,
  d: number,
  material: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSubject(): Group {
  const subject = new Group();
  subject.name = 'subject';

  const seat = new Mesh(new CylinderGeometry(0.016, 0.016, 0.006, 20), stoolMaterial);
  seat.position.y = 0.045;
  const leg = new Mesh(new CylinderGeometry(0.003, 0.004, 0.045, 8), stoolMaterial);
  leg.position.y = 0.0225;

  const torso = new Mesh(new CapsuleGeometry(0.016, 0.03, 6, 16), shirtMaterial);
  torso.position.y = 0.072;
  torso.scale.set(1.15, 1, 0.8);

  const neck = new Mesh(new CylinderGeometry(0.005, 0.006, 0.01, 12), skinMaterial);
  neck.position.y = 0.093;

  // The head carries the face details that make lighting readable: a nose
  // that casts a shadow, a brow, and ears.
  const head = new Group();
  head.name = 'subject-head';
  head.position.y = HEAD_HEIGHT;
  const skull = new Mesh(new SphereGeometry(0.0115, 32, 24), skinMaterial);
  skull.scale.set(0.92, 1.08, 1);
  const hair = new Mesh(
    new SphereGeometry(0.012, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45),
    hairMaterial,
  );
  hair.position.set(0, 0.002, -0.0012);
  hair.rotation.x = -0.25;
  const nose = new Mesh(new ConeGeometry(0.0022, 0.006, 12), skinMaterial);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.0008, 0.0118);
  const brow = new Mesh(new BoxGeometry(0.012, 0.0018, 0.003), skinMaterial);
  brow.position.set(0, 0.0035, 0.0102);
  const earGeometry = new SphereGeometry(0.0028, 12, 8);
  const earLeft = new Mesh(earGeometry, skinMaterial);
  earLeft.position.set(-0.0108, 0, 0);
  earLeft.scale.set(0.5, 1, 0.8);
  const earRight = earLeft.clone();
  earRight.position.x = 0.0108;
  head.add(skull, hair, nose, brow, earLeft, earRight);

  for (const part of [seat, leg, torso, neck]) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  head.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  subject.add(leg, seat, torso, neck, head);
  subject.position.set(...SUBJECT_POSITION);
  return subject;
}

function createCineCamera(): Group {
  const rig = new Group();
  rig.name = 'camera-rig';
  const legGeometry = new CylinderGeometry(0.0012, 0.0012, 0.11, 6);
  for (let i = 0; i < 3; i++) {
    const tripodLeg = new Mesh(legGeometry, gearMaterial);
    const angle = (i / 3) * Math.PI * 2;
    tripodLeg.position.set(Math.sin(angle) * 0.012, 0.05, Math.cos(angle) * 0.012);
    tripodLeg.rotation.set(Math.cos(angle) * 0.22, 0, -Math.sin(angle) * 0.22);
    rig.add(tripodLeg);
  }
  const bodyMesh = box(0.016, 0.014, 0.026, gearMaterial, 0, CAMERA_POSITION[1], 0.004);
  const lens = new Mesh(new CylinderGeometry(0.0055, 0.0055, 0.012, 20), gearMaterial);
  lens.name = 'camera-lens';
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, CAMERA_POSITION[1], -0.014);
  const glass = new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.001, 20), glassMaterial);
  glass.rotation.x = Math.PI / 2;
  glass.position.set(0, CAMERA_POSITION[1], -0.0205);
  rig.add(bodyMesh, lens, glass);
  rig.position.set(CAMERA_POSITION[0], 0, CAMERA_POSITION[2]);
  return rig;
}

export function createSoundstage(): Group {
  const stage = new Group();
  stage.name = 'soundstage';

  const floor = box(STAGE_WIDTH, 0.01, STAGE_DEPTH, floorMaterial, 0, -0.005, 0);
  floor.castShadow = false;
  const back = box(STAGE_WIDTH, STAGE_HEIGHT, 0.008, wallMaterial, 0, STAGE_HEIGHT / 2, -STAGE_DEPTH / 2);
  const left = box(0.008, STAGE_HEIGHT, STAGE_DEPTH, wallMaterial, -STAGE_WIDTH / 2, STAGE_HEIGHT / 2, 0);
  const right = box(0.008, STAGE_HEIGHT, STAGE_DEPTH, wallMaterial, STAGE_WIDTH / 2, STAGE_HEIGHT / 2, 0);
  for (const wall of [back, left, right]) {
    wall.castShadow = false;
  }
  stage.add(floor, back, left, right);

  // Overhead lighting grid, like the pipe grid in a real studio.
  for (let i = -2; i <= 2; i++) {
    stage.add(box(STAGE_WIDTH, 0.004, 0.004, gridMaterial, 0, STAGE_HEIGHT, i * 0.08));
  }
  for (let i = -1; i <= 1; i++) {
    stage.add(box(0.004, 0.004, STAGE_DEPTH, gridMaterial, i * 0.16, STAGE_HEIGHT, 0));
  }

  stage.add(createSubject(), createCineCamera());
  return stage;
}

/**
 * A small softbox the player grabs. Origin is the center of the diffuser
 * face, which points down local +Z, so Object3D.lookAt(head) aims it.
 */
export function createSoftbox(): Group {
  const softbox = new Group();
  softbox.name = 'softbox';
  const housingMaterial = new MeshStandardMaterial({ color: '#5a5a60', roughness: 0.6, metalness: 0.3 });
  const housing = new Mesh(new CylinderGeometry(0.012, 0.022, 0.018, 4, 1, true), housingMaterial);
  housing.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
  housing.position.z = -0.009;
  const back = new Mesh(new BoxGeometry(0.012, 0.012, 0.004), gearMaterial);
  back.position.z = -0.019;
  const diffuser = new Mesh(new BoxGeometry(0.03, 0.03, 0.001), diffuserMaterial);
  diffuser.name = 'softbox-diffuser';
  // A larger, faintly glowing grab target so a small light is easy to find and pinch.
  const handle = new Mesh(
    new SphereGeometry(0.03, 16, 12),
    new MeshBasicMaterial({ color: '#f5d90a', transparent: true, opacity: 0.12, depthWrite: false }),
  );
  handle.name = 'softbox-handle';
  softbox.add(housing, back, diffuser, handle);
  return softbox;
}
