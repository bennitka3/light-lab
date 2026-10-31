import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';

/**
 * Set dressing for the miniature soundstage: the things a real studio floor
 * is covered in (director's chair, C-stand with a flag, sandbags, apple boxes,
 * a slate, cable runs, tape marks). Props are modelled in real-world meters
 * and scaled to the miniature with SCALE, so sizes read like the real thing.
 * Each prop merges its parts into one mesh per material to keep draw calls
 * low on the headset.
 */

/** The miniature is 1:14 (a seated adult is about 11 cm tall). */
export const SCALE = 1 / 14;

export const woodMaterial = new MeshStandardMaterial({ color: '#7a5230', roughness: 0.6 });
export const canvasMaterial = new MeshStandardMaterial({ color: '#1f2430', roughness: 0.95 });
export const steelMaterial = new MeshStandardMaterial({ color: '#2a2a2d', roughness: 0.45, metalness: 0.75 });
export const flagMaterial = new MeshStandardMaterial({ color: '#0c0c0e', roughness: 1 });
export const sandbagMaterial = new MeshStandardMaterial({ color: '#2b2d33', roughness: 0.95 });
export const plywoodMaterial = new MeshStandardMaterial({ color: '#c9a66b', roughness: 0.8 });
export const slateMaterial = new MeshStandardMaterial({ color: '#0e0e10', roughness: 0.3 });
export const slateStripeMaterial = new MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.4 });
export const cableMaterial = new MeshStandardMaterial({ color: '#111113', roughness: 0.5 });
export const gaffTapeMaterial = new MeshStandardMaterial({ color: '#8d8f93', roughness: 0.9 });
export const markTapeMaterial = new MeshStandardMaterial({ color: '#d4402e', roughness: 0.85 });

/** A positioned, rotated part waiting to be merged into one mesh. */
function part(
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): Mesh {
  const mesh = new Mesh(geometry);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

/** A bar (cylinder) from point a to point b with the given radius. */
function bar(a: Vector3, b: Vector3, radius: number, segments = 8): Mesh {
  const length = a.distanceTo(b);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, segments));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  const direction = new Vector3().subVectors(b, a).normalize();
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
  return mesh;
}

/** Bakes each part's transform into its geometry and joins them into one mesh. */
export function merge(parts: Mesh[], material: MeshStandardMaterial): Mesh {
  const geometries: BufferGeometry[] = [];
  let total = 0;
  for (const piece of parts) {
    piece.updateMatrix();
    const geometry = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
    geometry.applyMatrix4(piece.matrix);
    geometries.push(geometry);
    total += geometry.attributes.position.count;
    piece.geometry.dispose();
  }
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let offset = 0;
  for (const geometry of geometries) {
    const count = geometry.attributes.position.count;
    position.set(geometry.attributes.position.array as Float32Array, offset * 3);
    normal.set(geometry.attributes.normal.array as Float32Array, offset * 3);
    if (geometry.attributes.uv) {
      uv.set(geometry.attributes.uv.array as Float32Array, offset * 2);
    }
    offset += count;
    geometry.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(position, 3));
  merged.setAttribute('normal', new BufferAttribute(normal, 3));
  merged.setAttribute('uv', new BufferAttribute(uv, 2));
  const mesh = new Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A tall director's chair (seat 0.58 m, like a makeup chair) built in meters:
 * X-frame sides, canvas seat and back, armrests and a footrest bar. Origin is
 * the floor under the seat center; the sitter faces +Z.
 */
export function createDirectorsChair(): Group {
  const chair = new Group();
  chair.name = 'directors-chair';
  const wood: Mesh[] = [];
  const r = 0.016;
  for (const x of [-0.26, 0.26]) {
    // The X on each side, from the floor to under the seat.
    wood.push(bar(new Vector3(x, 0.02, -0.21), new Vector3(x, 0.57, 0.21), r));
    wood.push(bar(new Vector3(x, 0.02, 0.21), new Vector3(x, 0.57, -0.21), r));
    // Back post up to the backrest, front post up to the armrest.
    wood.push(bar(new Vector3(x, 0.57, -0.2), new Vector3(x, 1.04, -0.2), r));
    wood.push(bar(new Vector3(x, 0.57, 0.2), new Vector3(x, 0.85, 0.2), r));
    // Armrest.
    wood.push(bar(new Vector3(x, 0.85, -0.22), new Vector3(x, 0.85, 0.24), r));
    // Footrest supports.
    wood.push(bar(new Vector3(x, 0.03, 0.21), new Vector3(x, 0.145, 0.4), r));
  }
  // Rails across: floor front and back, under the seat, the footrest bar.
  for (const [y, z] of [
    [0.03, 0.21],
    [0.03, -0.21],
    [0.56, 0.2],
    [0.56, -0.2],
    [0.145, 0.4],
  ]) {
    wood.push(bar(new Vector3(-0.26, y, z), new Vector3(0.26, y, z), r));
  }
  const canvas = [
    part(new BoxGeometry(0.5, 0.02, 0.42), 0, 0.58, 0),
    part(new BoxGeometry(0.5, 0.2, 0.02), 0, 0.95, -0.2),
  ];
  chair.add(merge(wood, woodMaterial), merge(canvas, canvasMaterial));
  return chair;
}

/** A sandbag draped over a stand leg: two lobes joined at the top, in meters. */
export function createSandbag(): Mesh {
  const lobe = new BoxGeometry(0.18, 0.07, 0.28);
  return merge(
    [
      part(lobe, -0.08, 0.05, 0, 0, 0, 0.5),
      part(lobe, 0.08, 0.05, 0, 0, 0, -0.5),
      part(new BoxGeometry(0.1, 0.03, 0.28), 0, 0.09, 0),
    ],
    sandbagMaterial,
  );
}

/**
 * A C-stand with a flag on its arm, in meters. Origin is the floor under the
 * riser; the arm reaches toward +X and the flag hangs at its end.
 */
export function createCStand(): Group {
  const stand = new Group();
  stand.name = 'c-stand';
  const steel: Mesh[] = [];
  // Turtle base: three legs at stepped heights so they nest.
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.6;
    const height = 0.06 + i * 0.07;
    const tip = new Vector3(Math.sin(angle) * 0.5, 0.02, Math.cos(angle) * 0.5);
    steel.push(bar(new Vector3(0, height, 0), tip, 0.016));
    steel.push(bar(tip, new Vector3(tip.x, 0.0, tip.z), 0.02));
  }
  steel.push(part(new CylinderGeometry(0.035, 0.035, 0.28, 12), 0, 0.14, 0));
  steel.push(part(new CylinderGeometry(0.016, 0.016, 1.3, 10), 0, 0.9, 0));
  steel.push(part(new CylinderGeometry(0.012, 0.012, 0.9, 10), 0, 1.75, 0));
  // Grip head, arm and the second grip head holding the flag.
  steel.push(part(new SphereGeometry(0.045, 12, 10), 0, 2.2, 0));
  steel.push(part(new CylinderGeometry(0.03, 0.03, 0.09, 10), 0.08, 2.2, 0, 0, 0, Math.PI / 2));
  steel.push(bar(new Vector3(0.1, 2.2, 0), new Vector3(0.95, 2.2, 0), 0.011));
  steel.push(part(new SphereGeometry(0.04, 12, 10), 0.95, 2.2, 0));
  steel.push(part(new CylinderGeometry(0.008, 0.008, 0.5, 8), 0.95, 1.95, 0));
  const flag = part(new BoxGeometry(0.46, 0.61, 0.012), 0.95, 1.45, 0);
  flag.rotation.y = 0.35;
  stand.add(merge(steel, steelMaterial), merge([flag], flagMaterial));
  return stand;
}

/** A full apple box with a half apple box stacked on it, in meters. */
export function createAppleBoxes(): Group {
  const stack = new Group();
  stack.name = 'apple-boxes';
  const wood: Mesh[] = [];
  const slots: Mesh[] = [];
  const boxes: Array<[number, number, number]> = [
    [0.203, 0.1015, 0],
    [0.102, 0.203 + 0.051, 0.2],
  ];
  for (const [height, centerY, yaw] of boxes) {
    const body = part(new BoxGeometry(0.508, height, 0.305), 0, centerY, 0, 0, yaw, 0);
    wood.push(body);
    // Hand slots on both long sides, slightly proud of the face so they read.
    for (const side of [-1, 1]) {
      const slot = part(new BoxGeometry(0.1, Math.min(height * 0.3, 0.035), 0.006), 0, 0, side * 0.1535, 0, 0, 0);
      slot.position.applyAxisAngle(new Vector3(0, 1, 0), yaw);
      slot.position.y = centerY;
      slot.rotation.y = yaw;
      slots.push(slot);
    }
  }
  stack.add(merge(wood, plywoodMaterial), merge(slots, slateMaterial));
  return stack;
}

/** A clapperboard (slate) leaning back, in meters. Origin is its bottom edge center. */
export function createSlate(): Group {
  const slate = new Group();
  slate.name = 'slate';
  const lean = -0.25;
  const board = part(new BoxGeometry(0.28, 0.22, 0.008), 0, 0.11, 0, lean);
  const stick = part(new BoxGeometry(0.28, 0.03, 0.02), 0, 0.235, 0, lean);
  const stripes: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const stripe = part(new BoxGeometry(0.035, 0.032, 0.022), -0.105 + i * 0.07, 0.235, 0, lean);
    stripes.push(stripe);
  }
  slate.add(merge([board, stick], slateMaterial), merge(stripes, slateStripeMaterial));
  return slate;
}

/**
 * A cable lying on the floor along the given points (stage units), plus a
 * few gaff-tape strips holding it down. Returns the cable and the tape.
 */
export function createCable(points: Vector3[], radius = 0.0009): [Mesh, Mesh] {
  const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const cable = new Mesh(new TubeGeometry(curve, 64, radius, 6, false), cableMaterial);
  cable.castShadow = true;
  cable.receiveShadow = true;
  const strips: Mesh[] = [];
  for (const t of [0.3, 0.7]) {
    const at = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const strip = part(new BoxGeometry(0.009, 0.0005, 0.004), at.x, 0.0003 + radius * 2, at.z);
    strip.rotation.y = Math.atan2(tangent.x, tangent.z);
    strips.push(strip);
  }
  return [cable, merge(strips, gaffTapeMaterial)];
}

/** A tape T-mark on the floor (the actor's mark), in stage units. */
export function createTeeMark(): Mesh {
  return merge(
    [
      part(new BoxGeometry(0.018, 0.0005, 0.0035), 0, 0.0003, 0),
      part(new BoxGeometry(0.0035, 0.0005, 0.014), 0, 0.0003, -0.0085),
    ],
    markTapeMaterial,
  );
}
