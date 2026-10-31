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
  // An apron in front of the set where the light kit is parked, edged with gaffer tape.
  const apronMaterial = new MeshStandardMaterial({ color: '#4a463f', roughness: 0.9 });
  const apron = box(STAGE_WIDTH, 0.01, 0.16, apronMaterial, 0, -0.005, STAGE_DEPTH / 2 + 0.08);
  apron.castShadow = false;
  const tapeMaterial = new MeshStandardMaterial({ color: '#d9b310', roughness: 0.8 });
  const tape = box(STAGE_WIDTH - 0.02, 0.0004, 0.004, tapeMaterial, 0, 0.0002, STAGE_DEPTH / 2 + 0.01);
  tape.castShadow = false;
  stage.add(apron, tape);
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

/** Front edge of the kit area, where unused lights are parked, in stage-local z. */
export const KIT_Z = 0.27;
export const KIT_HEIGHT = 0.05;
export type FixtureKind = 'softbox' | 'fresnel' | 'par';

const standMaterial = new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.45, metalness: 0.7 });
const fabricMaterial = new MeshStandardMaterial({ color: '#111113', roughness: 0.95 });
const fresnelMaterial = new MeshStandardMaterial({ color: '#3f5f86', roughness: 0.5, metalness: 0.4 });
const parMaterial = new MeshStandardMaterial({ color: '#141416', roughness: 0.35, metalness: 0.6 });
const barnDoorMaterial = new MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.6, metalness: 0.5 });

/** Emissive material for a fixture's front face; the lighting system brightens it when the light is on. */
function faceMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: '#d8d8d4', emissive: color, emissiveIntensity: 0, roughness: 1 });
}

/**
 * A light stand: three legs on the floor and a pole up to the yoke. The
 * lighting system stretches it every frame so the base stays on the floor
 * wherever the head is.
 */
function createStand(): Group {
  const stand = new Group();
  stand.name = 'fixture-stand';
  const pole = new Mesh(new CylinderGeometry(0.0011, 0.0013, 1, 8), standMaterial);
  pole.name = 'stand-pole';
  pole.castShadow = true;
  const base = new Group();
  base.name = 'stand-base';
  const legGeometry = new CylinderGeometry(0.0008, 0.0008, 0.03, 6);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = new Mesh(legGeometry, standMaterial);
    // Each leg runs from the pole down and out to the floor.
    leg.position.set(Math.sin(angle) * 0.011, 0.009, Math.cos(angle) * 0.011);
    leg.rotation.set(Math.cos(angle) * 0.95, 0, -Math.sin(angle) * 0.95);
    leg.castShadow = true;
    base.add(leg);
  }
  stand.add(pole, base);
  return stand;
}

/** The U-shaped yoke that holds a head on its stand, under the head center. */
function createYoke(halfWidth: number): Group {
  const yoke = new Group();
  yoke.name = 'fixture-yoke';
  const side = new BoxGeometry(0.0015, 0.014, 0.003);
  const left = new Mesh(side, standMaterial);
  left.position.set(-halfWidth, -0.005, 0);
  const right = left.clone();
  right.position.x = halfWidth;
  const bottom = new Mesh(new BoxGeometry(halfWidth * 2 + 0.0015, 0.0015, 0.003), standMaterial);
  bottom.position.y = -0.012;
  yoke.add(left, right, bottom);
  return yoke;
}

function createSoftboxHead(head: Group): void {
  // A rectangular softbox: black fabric sides tapering back to a speed ring, white diffusion on the front.
  const sides = new Mesh(new CylinderGeometry(0.009, 0.026, 0.024, 4, 1, true), fabricMaterial);
  sides.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
  sides.scale.set(1, 1, 0.72);
  sides.position.z = -0.012;
  const ring = new Mesh(new CylinderGeometry(0.007, 0.007, 0.004, 16), standMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -0.026;
  const face = new Mesh(new BoxGeometry(0.036, 0.026, 0.001), faceMaterial('#fff4e0'));
  face.name = 'fixture-face';
  head.add(sides, ring, face);
}

function createFresnelHead(head: Group): void {
  // A studio Fresnel: round barrel, stepped glass lens, four barn doors.
  const barrel = new Mesh(new CylinderGeometry(0.0085, 0.0085, 0.02, 20), fresnelMaterial);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.01;
  const vents = new Mesh(new BoxGeometry(0.008, 0.004, 0.012), fresnelMaterial);
  vents.position.set(0, 0.009, -0.012);
  const face = new Mesh(new CylinderGeometry(0.0072, 0.0072, 0.001, 20), faceMaterial('#ffd9a8'));
  face.name = 'fixture-face';
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.0005;
  head.add(barrel, vents, face);
  for (let i = 0; i < 4; i++) {
    const door = new Mesh(new BoxGeometry(0.016, 0.0006, 0.009), barnDoorMaterial);
    const hinge = new Group();
    hinge.rotation.z = (i * Math.PI) / 2;
    door.position.set(0, 0.0092, 0.0045);
    door.rotation.x = -0.45;
    hinge.add(door);
    head.add(hinge);
  }
}

function createParHead(head: Group): void {
  // A PAR can: a long, narrow black can with a sealed beam lamp at the front.
  const can = new Mesh(new CylinderGeometry(0.0068, 0.0058, 0.028, 18), parMaterial);
  can.rotation.x = Math.PI / 2;
  can.position.z = -0.014;
  const lip = new Mesh(new CylinderGeometry(0.0075, 0.0075, 0.002, 18), parMaterial);
  lip.rotation.x = Math.PI / 2;
  lip.position.z = -0.0005;
  const face = new Mesh(new CylinderGeometry(0.006, 0.006, 0.001, 18), faceMaterial('#ffe6c0'));
  face.name = 'fixture-face';
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.0003;
  head.add(can, lip, face);
}

/**
 * A light on a stand. The group's origin is the center of the light's head;
 * "fixture-head" turns to aim (it faces +Z, so lookAt aims it) and
 * "fixture-stand" is stretched down to the floor by the lighting system.
 */
export function createFixture(kind: FixtureKind): Group {
  const fixture = new Group();
  fixture.name = kind;
  const head = new Group();
  head.name = 'fixture-head';
  if (kind === 'softbox') {
    createSoftboxHead(head);
  } else if (kind === 'fresnel') {
    createFresnelHead(head);
  } else {
    createParHead(head);
  }
  head.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
    }
  });
  // A larger, faintly glowing grab target so a small light is easy to find and pinch.
  const handle = new Mesh(
    new SphereGeometry(0.026, 16, 12),
    new MeshBasicMaterial({ color: '#f5d90a', transparent: true, opacity: 0.05, depthWrite: false }),
  );
  handle.name = 'fixture-handle';
  fixture.add(head, createYoke(kind === 'softbox' ? 0.01 : 0.0095), createStand(), handle);
  return fixture;
}
