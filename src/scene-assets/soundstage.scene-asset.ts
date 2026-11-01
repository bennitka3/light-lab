import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import {
  SCALE,
  createAppleBoxes,
  createCStand,
  createCable,
  createDirectorsChair,
  createSandbag,
  createSlate,
  createTeeMark,
} from './set-dressing.js';
import { createCrewArea } from './crew.js';

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
const gearMaterial = new MeshStandardMaterial({
  color: '#1f1f22',
  roughness: 0.5,
  metalness: 0.5,
});
const cameraBodyMaterial = new MeshStandardMaterial({ color: '#6b6f78', roughness: 0.45, metalness: 0.5 });
const tallyMaterial = new MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 2 });
const monitorMaterial = new MeshStandardMaterial({ color: '#1b2a3a', emissive: '#7fb2ff', emissiveIntensity: 0.6 });
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

/**
 * Where the cast member sits. The actor himself is a glTF (`actor-seated` in
 * the manifest) placed as a child node of the stage in the scene JSON, scaled
 * 1:14, with his "subject-head" anchor landing at (0, HEAD_HEIGHT, -0.06).
 * This group holds the tall director's chair he sits on and his floor mark.
 */
function createSubject(): Group {
  const subject = new Group();
  subject.name = 'subject';
  const chair = createDirectorsChair();
  chair.scale.setScalar(SCALE);
  chair.position.z = 0.08 * SCALE;
  const mark = createTeeMark();
  mark.position.z = 0.06;
  subject.add(chair, mark);
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
  // The body is a lighter gunmetal than the light stands, with a red tally
  // light on top and a glowing monitor on the back, so the camera reads in a
  // dark set (first headset playtest: "really dark and kind of hard to see").
  const bodyMesh = box(0.016, 0.014, 0.026, cameraBodyMaterial, 0, CAMERA_POSITION[1], 0.004);
  const tally = box(0.003, 0.0018, 0.003, tallyMaterial, 0, CAMERA_POSITION[1] + 0.0079, -0.006);
  tally.castShadow = false;
  const monitor = box(0.012, 0.008, 0.0008, monitorMaterial, 0.004, CAMERA_POSITION[1] + 0.011, 0.0172);
  monitor.castShadow = false;
  rig.add(tally, monitor);
  const lens = new Mesh(new CylinderGeometry(0.0055, 0.0055, 0.012, 20), gearMaterial);
  lens.name = 'camera-lens';
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, CAMERA_POSITION[1], -0.014);
  const glass = new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.001, 20), glassMaterial);
  glass.rotation.x = Math.PI / 2;
  glass.position.set(0, CAMERA_POSITION[1], -0.0205);
  rig.add(bodyMesh, lens, glass);
  // A sandbag over the rear tripod leg, behind the camera, so it never sits in the shot.
  const sandbag = createSandbag();
  sandbag.scale.setScalar(SCALE);
  sandbag.position.set(0, 0.02, 0.019);
  rig.add(sandbag);
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
  stage.add(...createSetDressing());
  stage.add(...createCrewArea());
  return stage;
}

/** Front edge of the kit area, where unused lights are parked, in stage-local z. */
export const KIT_Z = 0.27;
export const KIT_HEIGHT = 0.05;
export type FixtureKind = 'softbox' | 'fresnel' | 'par' | 'panel' | 'strip';
/** A gel clipped over the light: CTO turns it warm orange, like tungsten or sunset. */
export type Gel = 'none' | 'cto';
const gelMaterial = new MeshStandardMaterial({
  color: '#ff9a3c',
  emissive: '#ff8a2a',
  emissiveIntensity: 0.35,
  transparent: true,
  opacity: 0.75,
  roughness: 0.4,
});

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

function createPanelHead(head: Group): void {
  // A flat bi-color LED panel: thin frame, grid of diodes behind a diffuser.
  const frame = new Mesh(new BoxGeometry(0.03, 0.022, 0.004), panelFrameMaterial);
  frame.position.z = -0.002;
  const face = new Mesh(new BoxGeometry(0.026, 0.018, 0.001), faceMaterial('#eef3ff'));
  face.name = 'fixture-face';
  face.position.z = 0.0005;
  const knob = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.002, 10), standMaterial);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0.011, -0.008, -0.005);
  head.add(frame, face, knob);
}

function createStripHead(head: Group): void {
  // A strip softbox: tall and narrow, for rims and edges.
  const sides = new Mesh(new CylinderGeometry(0.006, 0.014, 0.02, 4, 1, true), fabricMaterial);
  sides.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
  sides.scale.set(0.45, 1, 1.9);
  sides.position.z = -0.01;
  const face = new Mesh(new BoxGeometry(0.011, 0.042, 0.001), faceMaterial('#fff4e0'));
  face.name = 'fixture-face';
  head.add(sides, face);
}

const panelFrameMaterial = new MeshStandardMaterial({ color: '#bfc3c9', roughness: 0.5, metalness: 0.5 });

/**
 * A light on a stand. The group's origin is the center of the light's head;
 * "fixture-head" turns to aim (it faces +Z, so lookAt aims it) and
 * "fixture-stand" is stretched down to the floor by the lighting system.
 */
export function createFixture(kind: FixtureKind, gel: Gel = 'none'): Group {
  const fixture = new Group();
  fixture.name = gel === 'none' ? kind : `${kind}-${gel}`;
  const head = new Group();
  head.name = 'fixture-head';
  if (kind === 'softbox') {
    createSoftboxHead(head);
  } else if (kind === 'fresnel') {
    createFresnelHead(head);
  } else if (kind === 'panel') {
    createPanelHead(head);
  } else if (kind === 'strip') {
    createStripHead(head);
  } else {
    createParHead(head);
  }
  if (gel !== 'none') {
    // An orange gel sheet clipped just in front of the face.
    const face = head.getObjectByName('fixture-face');
    if (face instanceof Mesh) {
      face.geometry.computeBoundingBox();
      const size = new Vector3();
      face.geometry.boundingBox?.getSize(size);
      const sheet = new Mesh(new BoxGeometry(size.x + 0.003, Math.max(size.y, size.z) + 0.003, 0.0006), gelMaterial);
      sheet.name = 'fixture-gel';
      sheet.position.z = 0.0022;
      head.add(sheet);
    }
  }
  head.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
    }
  });
  // A larger, faintly glowing grab target so a small light is easy to find and pinch.
  const handle = new Mesh(
    new SphereGeometry(0.038, 16, 12),
    new MeshBasicMaterial({ color: '#f5d90a', transparent: true, opacity: 0.035, depthWrite: false }),
  );
  handle.name = 'fixture-handle';
  fixture.add(head, createYoke(kind === 'softbox' ? 0.01 : 0.0095), createStand(), handle);
  return fixture;
}

/**
 * Studio clutter around the edges of the set, all outside the cine camera's
 * frame and clear of the kit apron: a C-stand parked stage-left with a flag,
 * apple boxes and a slate stage-right, and two cable runs taped to the floor.
 */
function createSetDressing(): Object3D[] {
  const cStand = createCStand();
  cStand.scale.setScalar(SCALE);
  cStand.position.set(-0.205, 0, -0.12);
  const standBag = createSandbag();
  standBag.position.set(0.17, 0.05, 0.25);
  standBag.rotation.y = 0.6;
  cStand.add(standBag);

  const appleBoxes = createAppleBoxes();
  appleBoxes.scale.setScalar(SCALE);
  appleBoxes.position.set(0.19, 0, -0.15);
  appleBoxes.rotation.y = 0.3;
  const slate = createSlate();
  slate.scale.setScalar(SCALE);
  slate.position.set(0.172, 0, -0.128);
  slate.rotation.y = 0.3;

  const cameraCable = createCable([
    new Vector3(0.012, 0, 0.16),
    new Vector3(0.07, 0, 0.175),
    new Vector3(0.15, 0, 0.12),
    new Vector3(0.21, 0, 0.0),
    new Vector3(0.225, 0, -0.16),
  ]);
  const stinger = createCable([
    new Vector3(-0.235, 0, -0.17),
    new Vector3(-0.235, 0, -0.06),
    new Vector3(-0.2, 0, 0.06),
    new Vector3(-0.13, 0, 0.185),
  ]);
  return [cStand, appleBoxes, slate, ...cameraCable, ...stinger];
}
