import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, TorusGeometry } from '@iwsdk/core';
import { SCALE, createDirectorsChair } from './set-dressing.js';

/**
 * The crew standing around the set, just outside the stage walls in front of
 * the camera, so they are never in the shot and never in the way of the lights
 * (lights roam x within ±0.23 and park at z 0.27).
 *
 * Each crew spot is an empty Object3D named "crew-<role>" on the stage whose +Z
 * faces the set. The gameplay code finds them by name (speech bubbles float
 * above "crew-director"). The people themselves are glTF models (crew-<role>.glb)
 * placed as scene nodes "crew-<role>-model" at the same spots in
 * public/scenes/main.iwsdk.scene.json; keep the two in sync.
 */

export type CrewRole = 'director' | 'gaffer' | 'sponsor' | 'crafty';

// Where each crew member looks: between the actor and the cine camera.
const LOOK_AT = [0, 0.04] as const;

function spot(x: number, z: number): { position: [number, number, number]; rotY: number } {
  return { position: [x, 0, z], rotY: Math.atan2(LOOK_AT[0] - x, LOOK_AT[1] - z) };
}

/** Stage-local spot and facing (radians about Y) of each crew member. */
export const CREW_ANCHORS: Record<CrewRole, { position: [number, number, number]; rotY: number }> = {
  // Front-left, in his director's chair beside the camera.
  director: spot(-0.29, 0.22),
  // The sponsor rep hovers right behind the director.
  sponsor: spot(-0.31, 0.32),
  // The real gaffer, front-right, watching you work.
  gaffer: spot(0.29, 0.23),
  // Craft services, front-right corner behind her table.
  crafty: spot(0.33, 0.34),
};

const matMaterial = new MeshStandardMaterial({ color: '#26241f', roughness: 0.95 });
const tableTopMaterial = new MeshStandardMaterial({ color: '#e9e6df', roughness: 0.8 });
const tableLegMaterial = new MeshStandardMaterial({ color: '#3a3a3d', roughness: 0.5, metalness: 0.6 });
const urnMaterial = new MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.3, metalness: 0.85 });
const boxMaterial = new MeshStandardMaterial({ color: '#f1d9a8', roughness: 0.8 });
const donutMaterial = new MeshStandardMaterial({ color: '#b5713a', roughness: 0.7 });
const icingMaterial = new MeshStandardMaterial({ color: '#e58fb0', roughness: 0.6 });
const cupMaterial = new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 });
const fruitMaterial = new MeshStandardMaterial({ color: '#d9a21c', roughness: 0.6 });

function shadowed<T extends Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function boxAt(w: number, h: number, d: number, material: MeshStandardMaterial, x: number, y: number, z: number): Mesh {
  const mesh = shadowed(new Mesh(new BoxGeometry(w, h, d), material));
  mesh.position.set(x, y, z);
  return mesh;
}

/** A rubber floor mat the crew member stands on, flush with the stage floor. */
function floorMat(w: number, d: number): Mesh {
  const mat = new Mesh(new BoxGeometry(w, 0.01, d), matMaterial);
  mat.position.y = -0.005;
  mat.receiveShadow = true;
  return mat;
}

/** A folding table with a coffee urn, a box of donuts and paper cups, in real meters (scaled by the caller). */
function createCraftTable(): Group {
  const table = new Group();
  table.name = 'craft-table';
  table.add(boxAt(1.2, 0.04, 0.6, tableTopMaterial, 0, 0.74, 0));
  for (const lx of [-0.55, 0.55]) {
    for (const lz of [-0.25, 0.25]) {
      table.add(boxAt(0.04, 0.72, 0.04, tableLegMaterial, lx, 0.36, lz));
    }
  }
  // Coffee urn with its tap.
  const urn = shadowed(new Mesh(new CylinderGeometry(0.13, 0.13, 0.42, 16), urnMaterial));
  urn.position.set(-0.38, 0.97, -0.05);
  const tap = boxAt(0.04, 0.04, 0.08, tableLegMaterial, -0.38, 0.82, 0.11);
  table.add(urn, tap);
  // Open donut box.
  table.add(boxAt(0.42, 0.06, 0.42, boxMaterial, 0.12, 0.79, 0));
  const donutGeometry = new TorusGeometry(0.045, 0.022, 8, 14);
  for (let i = 0; i < 6; i++) {
    const donut = shadowed(new Mesh(donutGeometry, i % 2 ? donutMaterial : icingMaterial));
    donut.rotation.x = Math.PI / 2;
    donut.position.set(0.12 + ((i % 3) - 1) * 0.12, 0.84, i < 3 ? -0.08 : 0.08);
    table.add(donut);
  }
  // A stack of paper cups and a bunch of bananas.
  const cups = shadowed(new Mesh(new CylinderGeometry(0.045, 0.035, 0.22, 10), cupMaterial));
  cups.position.set(0.44, 0.87, -0.12);
  const bananas = shadowed(new Mesh(new TorusGeometry(0.08, 0.025, 6, 10, Math.PI), fruitMaterial));
  bananas.rotation.x = -Math.PI / 2;
  bananas.position.set(0.45, 0.78, 0.15);
  table.add(cups, bananas);
  return table;
}

/** The crew spots ("crew-*" anchors) with their chair, table and floor mats. */
export function createCrewArea(): Object3D[] {
  const anchors: Object3D[] = [];
  for (const [role, { position, rotY }] of Object.entries(CREW_ANCHORS)) {
    const anchor = new Object3D();
    anchor.name = `crew-${role}`;
    anchor.position.set(...position);
    anchors.push(anchor);
    // Props live in a sibling group (not under the anchor), so a child under the
    // anchor always means a crew model.
    const props = new Group();
    props.name = `crew-${role}-props`;
    props.position.set(...position);
    props.rotation.y = rotY;
    if (role === 'director') {
      const chair = createDirectorsChair();
      chair.scale.setScalar(SCALE);
      // The chair's seat sits 8 cm in front of the sitter's root, as on the main set.
      chair.position.z = 0.08 * SCALE;
      props.add(floorMat(0.07, 0.07), chair);
    } else if (role === 'crafty') {
      const table = createCraftTable();
      table.scale.setScalar(SCALE);
      table.position.z = 0.55 * SCALE;
      props.add(floorMat(0.1, 0.09), table);
      props.children[0].position.z = 0.02;
    } else {
      props.add(floorMat(0.05, 0.05));
    }
    anchors.push(props);
    anchor.rotation.y = rotY;
  }
  return anchors;
}
