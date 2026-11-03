import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  Path,
  Shape,
  ShapeGeometry,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { STAGE_DEPTH, STAGE_HEIGHT, STAGE_WIDTH } from './soundstage.scene-asset.js';

/**
 * Sets for the experimental beta track (?track=beta), in stage-local meters
 * (1:14), built the same way as level-sets.ts. Both carry their own light (the
 * sun, the LED wall's glow): set lights stay on in the target shot and the live
 * shot alike, so the player shapes them rather than switching them.
 */

/** Seat height of the cast's baked pose (0.58 m at 1:14). */
const SEAT_HEIGHT = 0.58 / 14;
const BACK_WALL_Z = -STAGE_DEPTH / 2 + 0.006;

function mat(color: string, roughness = 0.8, metalness = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

function block(w: number, h: number, d: number, material: MeshStandardMaterial, x: number, y: number, z: number, shadow = true): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function paintTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// --- Desert at noon -----------------------------------------------------------

/** A saguaro: a trunk and two arms, about 0.12 tall. */
function createCactus(material: MeshStandardMaterial, height: number): Group {
  const cactus = new Group();
  const trunk = new Mesh(new CylinderGeometry(0.006, 0.007, height, 10), material);
  trunk.position.y = height / 2;
  cactus.add(trunk);
  for (const side of [-1, 1]) {
    const arm = new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.012, 8), material);
    arm.rotation.z = (side * Math.PI) / 2;
    arm.position.set(side * 0.011, height * (side < 0 ? 0.45 : 0.6), 0);
    const up = new Mesh(new CylinderGeometry(0.0045, 0.0045, height * 0.32, 8), material);
    up.position.set(side * 0.017, height * (side < 0 ? 0.45 : 0.6) + height * 0.16, 0);
    cactus.add(arm, up);
  }
  cactus.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return cactus;
}

function createDesertSet(): Group {
  const set = new Group();
  // Outdoors: no walls. A round patch of desert that fades out at its edges, so
  // in passthrough it sits in your room like a map, and in the browser it melts
  // into a hazy sky (ben, round 9: "fade-out boundaries for the AR vibe").
  const fade = paintTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.68, '#ffffff');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  fade.colorSpace = NoColorSpace;
  const ground = new Mesh(
    new CircleGeometry(0.56, 64),
    new MeshStandardMaterial({ color: '#d9b98a', roughness: 0.95, alphaMap: fade, transparent: true }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.0005;
  ground.receiveShadow = true;
  ground.name = 'desert-ground';
  set.add(ground);
  // Mesas on the horizon, inside the solid part of the ground.
  const mesa = mat('#b8794a', 0.95);
  for (const [x, z, w, h, d] of [
    [-0.24, -0.3, 0.16, 0.07, 0.06],
    [0.02, -0.34, 0.12, 0.1, 0.05],
    [0.25, -0.29, 0.14, 0.06, 0.06],
  ]) {
    set.add(block(w, h, d, mesa, x, h / 2, z));
    set.add(block(w * 1.08, 0.006, d * 1.05, mat('#9a5f38', 0.95), x, h - 0.002, z));
  }
  const drift = mat('#c9a676', 0.95);
  for (const [x, z, sx, sz] of [
    [-0.14, -0.12, 0.08, 0.04],
    [0.12, -0.15, 0.1, 0.03],
    [0.16, 0.06, 0.06, 0.05],
  ]) {
    const d = new Mesh(new SphereGeometry(1, 16, 8), drift);
    d.scale.set(sx, 0.004, sz);
    d.position.set(x, 0, z);
    d.receiveShadow = true;
    set.add(d);
  }

  // The rock the two hikers sit on: a flat-topped boulder at seat height.
  const rockMaterial = mat('#9c6b48', 0.95);
  const rock = new Mesh(new DodecahedronGeometry(1, 0), rockMaterial);
  rock.scale.set(0.06, SEAT_HEIGHT / 1.1, 0.026);
  rock.position.set(0, (SEAT_HEIGHT / 1.1) * 0.15, -0.065);
  rock.castShadow = true;
  rock.receiveShadow = true;
  set.add(rock);
  set.add(block(0.1, 0.004, 0.03, rockMaterial, 0, SEAT_HEIGHT - 0.002, -0.065));
  // Backpacks at their feet and a water bottle.
  set.add(block(0.014, 0.018, 0.009, mat('#c2410c', 0.8), -0.06, 0.009, -0.045));
  set.add(block(0.013, 0.016, 0.009, mat('#1d4ed8', 0.8), 0.062, 0.008, -0.05));
  const bottle = new Mesh(new CylinderGeometry(0.0025, 0.0025, 0.012, 10), mat('#94a3b8', 0.3, 0.8));
  bottle.position.set(0.05, 0.006, -0.03);
  bottle.castShadow = true;
  set.add(bottle);

  // Cacti and boulders around the edges, out of the way of the kit.
  const cactusMaterial = mat('#4d7c3a', 0.85);
  for (const [x, z, h] of [
    [-0.17, -0.14, 0.12],
    [0.15, -0.16, 0.1],
    [-0.2, 0.02, 0.08],
  ]) {
    const c = createCactus(cactusMaterial, h);
    c.position.set(x, 0, z);
    set.add(c);
  }
  for (const [x, z, s] of [
    [0.19, -0.05, 0.02],
    [-0.12, -0.17, 0.014],
    [0.08, -0.17, 0.012],
  ]) {
    const boulder = new Mesh(new DodecahedronGeometry(s, 0), rockMaterial);
    boulder.position.set(x, s * 0.5, z);
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    set.add(boulder);
  }

  // The sun: hard, bright, nearly straight overhead (a touch toward camera-left
  // and the lens). Raccoon eyes until a silk goes up.
  const sun = new DirectionalLight('#fff4e0', 9);
  sun.name = 'sun';
  sun.position.set(-0.05, 0.6, 0.05);
  sun.target.position.set(0, 0.08, -0.06);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const cam = sun.shadow.camera;
  cam.left = -0.2;
  cam.right = 0.2;
  cam.top = 0.2;
  cam.bottom = -0.2;
  cam.near = 0.05;
  cam.far = 1.2;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.0005;
  sun.shadow.radius = 1;
  // Open sky: a blue skylight from above and warm light bounced off the sand.
  const skylight = new HemisphereLight('#a9cdf0', '#c79a62', 0.6);
  skylight.name = 'skylight';
  set.add(sun, sun.target, skylight);
  // A tumbleweed that blows across behind them when the camera rolls (hidden till then).
  const weedMaterial = new MeshStandardMaterial({ color: '#7a5a32', roughness: 1, wireframe: true });
  const tumbleweed = new Group();
  tumbleweed.name = 'tumbleweed';
  for (let i = 0; i < 5; i++) {
    const ball = new Mesh(new IcosahedronGeometry(0.02 - i * 0.002, 1), weedMaterial);
    ball.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    ball.castShadow = true;
    tumbleweed.add(ball);
  }
  tumbleweed.position.set(-0.3, 0.02, -0.13);
  tumbleweed.visible = false;
  set.add(tumbleweed);
  return set;
}

// --- Car commercial on an LED volume ------------------------------------------

function paintHighway(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // A coastal highway at golden hour, as the LED wall shows it (one full wraparound).
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#3a5f9e');
  sky.addColorStop(0.55, '#f0a35e');
  sky.addColorStop(1, '#ffd79a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffe9b8';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.58, h * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // Hills, the ocean, then the road with a guard rail.
  ctx.fillStyle = '#6a5a6e';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += 16) {
    // Whole numbers of hills across the width, so the picture tiles when the wall scrolls.
    ctx.lineTo(x, h * 0.52 - 40 * Math.abs(Math.sin((x / w) * Math.PI * 3)) - 14 * Math.sin((x / w) * Math.PI * 2 * 12));
  }
  ctx.lineTo(w, h * 0.62);
  ctx.fill();
  const sea = ctx.createLinearGradient(0, h * 0.62, 0, h * 0.74);
  sea.addColorStop(0, '#e6a46e');
  sea.addColorStop(1, '#2f5675');
  ctx.fillStyle = sea;
  ctx.fillRect(0, h * 0.62, w, h * 0.12);
  ctx.fillStyle = '#3b3b40';
  ctx.fillRect(0, h * 0.74, w, h * 0.26);
  ctx.fillStyle = '#f2d06b';
  for (let x = 0; x < w; x += 64) {
    ctx.fillRect(x, h * 0.86, 40, 5);
  }
  ctx.fillStyle = '#c9c9cc';
  ctx.fillRect(0, h * 0.73, w, 6);
  // Motion streaks: the background is "moving".
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 30; i++) {
    ctx.fillRect((i * 173) % w, h * 0.62 + ((i * 41) % 90), 120, 2);
  }
  ctx.globalAlpha = 1;
  // The seams between LED tiles.
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += w / 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += h / 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** Otis, the family dog, with his head out of the back window (faces -X, the way the car drives). */
function createDog(): Group {
  const dog = new Group();
  dog.name = 'otis';
  const fur = mat('#b5793d', 0.9);
  const dark = mat('#5a3a1e', 0.9);
  const head = new Mesh(new SphereGeometry(0.0075, 16, 12), fur);
  head.scale.set(1.05, 0.95, 0.95);
  const snout = new Mesh(new BoxGeometry(0.011, 0.0055, 0.0062), mat('#9a6331', 0.9));
  snout.position.set(-0.0095, -0.0022, 0);
  const nose = new Mesh(new SphereGeometry(0.0019, 8, 6), mat('#111113', 0.4));
  nose.position.set(-0.0152, -0.0004, 0);
  const tongue = new Mesh(new BoxGeometry(0.003, 0.0006, 0.0028), mat('#e46a8a', 0.5));
  tongue.position.set(-0.0125, -0.0058, 0.0004);
  tongue.rotation.z = 0.5;
  dog.add(head, snout, nose, tongue);
  for (const side of [-1, 1]) {
    // Floppy ears blowing back in the wind.
    const ear = new Mesh(new BoxGeometry(0.011, 0.0012, 0.006), dark);
    ear.position.set(0.006, 0.004, side * 0.0058);
    ear.rotation.set(side * 0.5, 0, -0.35);
    const eye = new Mesh(new SphereGeometry(0.0011, 8, 6), mat('#0b0b0d', 0.2));
    eye.position.set(-0.0055, 0.0022, side * 0.0035);
    dog.add(ear, eye);
  }
  const neck = new Mesh(new CylinderGeometry(0.0055, 0.0065, 0.014, 12), fur);
  neck.rotation.x = Math.PI / 2 - 0.4;
  neck.position.set(0.002, -0.004, -0.007);
  const collar = new Mesh(new CylinderGeometry(0.0062, 0.0062, 0.0018, 12), mat('#dc2626', 0.5));
  collar.rotation.x = Math.PI / 2 - 0.4;
  collar.position.set(0.002, -0.0045, -0.0035);
  dog.add(neck, collar);
  dog.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return dog;
}

/**
 * A family SUV seen side-on, nose toward camera-left, about 4 m long at 1:14.
 * The cast sit inside on the stage floor (their seated pose puts their heads at
 * window height); the glass doesn't cast shadows, so light reaches them.
 */
function createCar(): Group {
  const car = new Group();
  car.name = 'car';
  const paint = new MeshStandardMaterial({ color: '#8f1d1d', roughness: 0.22, metalness: 0.55 });
  const trim = mat('#16161a', 0.5, 0.3);
  const glass = new MeshStandardMaterial({ color: '#9fb4c4', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.12, depthWrite: false });
  const L = 0.28;
  const W = 0.12;
  // Lower body: the hood is a bit lower at the front.
  car.add(block(L, 0.042, W, paint, 0, 0.046, 0));
  car.add(block(0.07, 0.008, W - 0.004, paint, -L / 2 + 0.035, 0.071, 0));
  // Bumpers and side skirts.
  car.add(block(0.006, 0.016, W, trim, -L / 2 - 0.002, 0.034, 0));
  car.add(block(0.006, 0.016, W, trim, L / 2 + 0.002, 0.034, 0));
  // Cabin: roof, and pillars on both sides; glass in the openings.
  const cabinFront = -0.075;
  const cabinBack = 0.13;
  const roofY = 0.124;
  car.add(block(cabinBack - cabinFront - 0.02, 0.004, W - 0.008, paint, (cabinFront + cabinBack) / 2 + 0.01, roofY, 0));
  for (const side of [-1, 1]) {
    const z = side * (W / 2 - 0.003);
    for (const x of [0.015, 0.078]) {
      car.add(block(0.006, roofY - 0.067, 0.004, trim, x, (roofY + 0.067) / 2, z));
    }
    // A slanted A-pillar and a D-pillar.
    const a = block(0.005, (roofY - 0.067) / Math.cos(0.5), 0.004, trim, cabinFront - ((roofY - 0.067) * Math.tan(0.5)) / 2, (roofY + 0.067) / 2, z);
    a.rotation.z = -0.5;
    const d = block(0.006, roofY - 0.067, 0.004, paint, cabinBack - 0.003, (roofY + 0.067) / 2, z);
    car.add(a, d);
    // Window glass, except the near back window, which Otis has rolled down.
    for (const [x0, x1] of [
      [cabinFront + 0.012, 0.012],
      [0.018, 0.075],
      [0.081, cabinBack - 0.006],
    ]) {
      if (side > 0 && x0 === 0.018) continue;
      const pane = new Mesh(new PlaneGeometry(x1 - x0, roofY - 0.069), glass);
      pane.position.set((x0 + x1) / 2, (roofY + 0.069) / 2, z);
      pane.rotation.y = side > 0 ? 0 : Math.PI;
      car.add(pane);
    }
  }
  // Windshield and back glass.
  // The windshield rakes back from the hood to the roof.
  const rake = 0.5;
  const glassH = roofY - 0.071;
  const windshield = new Mesh(new PlaneGeometry(W - 0.01, glassH / Math.cos(rake)), glass);
  windshield.rotation.set(0, -Math.PI / 2, 0);
  windshield.rotateX(-rake);
  windshield.position.set(cabinFront - (glassH * Math.tan(rake)) / 2, (roofY + 0.071) / 2, 0);
  const backGlass = new Mesh(new PlaneGeometry(W - 0.01, glassH), glass);
  backGlass.rotation.set(0, Math.PI / 2, 0);
  backGlass.position.set(cabinBack + 0.001, (roofY + 0.071) / 2, 0);
  car.add(windshield, backGlass);
  // Wheels with silver hubs.
  const tire = mat('#121214', 0.9);
  const hub = mat('#c0c4ca', 0.3, 0.9);
  for (const x of [-0.088, 0.09]) {
    for (const side of [-1, 1]) {
      const wheel = new Mesh(new CylinderGeometry(0.025, 0.025, 0.016, 24), tire);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.025, side * (W / 2 - 0.006));
      wheel.castShadow = true;
      const cap = new Mesh(new CylinderGeometry(0.013, 0.013, 0.017, 16), hub);
      cap.rotation.x = Math.PI / 2;
      cap.position.copy(wheel.position);
      car.add(wheel, cap);
    }
  }
  // Headlights and taillights.
  const head = new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6dd', emissiveIntensity: 1.2 });
  const tail = new MeshStandardMaterial({ color: '#7f1010', emissive: '#ff2a2a', emissiveIntensity: 0.8 });
  for (const side of [-1, 1]) {
    car.add(block(0.002, 0.008, 0.02, head, -L / 2 - 0.0005, 0.056, side * 0.042, false));
    car.add(block(0.002, 0.012, 0.014, tail, L / 2 + 0.0005, 0.06, side * 0.046, false));
  }
  // Mirrors and a door handle line so it reads as a car at a glance.
  for (const side of [-1, 1]) {
    car.add(block(0.008, 0.006, 0.006, paint, cabinFront + 0.01, 0.076, side * (W / 2 + 0.003)));
    car.add(block(0.2, 0.0012, 0.001, trim, 0.02, 0.058, side * (W / 2 + 0.0004), false));
  }
  // Seats inside (just the backs show through the windows).
  const seat = mat('#2a2a2e', 0.9);
  car.add(block(0.006, 0.05, W - 0.02, seat, -0.018, 0.075, 0));
  car.add(block(0.006, 0.045, W - 0.02, seat, 0.07, 0.072, 0));
  return car;
}

/**
 * The real SUV (Kenney Car Kit, CC0) dressed for the commercial: deep red metallic
 * paint, see-through glass so the family shows, sized to the stand-in's spot.
 * `model` is the loaded glTF scene; its geometry stays shared with the cache
 * (userData.sharedGeometry), only the materials are copied.
 */
export function fitCarModel(model: Object3D): Group {
  const car = new Group();
  car.name = 'car';
  const clone = model.clone(true);
  // Kenney's car points down -z with its width on x: turn it to point camera-left (-x),
  // and stretch it a little longer and lower than the toy proportions.
  clone.rotation.y = Math.PI / 2;
  clone.scale.set(0.087, 0.1, 0.112);
  const paint = new MeshStandardMaterial({ color: '#8f1d1d', roughness: 0.22, metalness: 0.55 });
  const glass = new MeshStandardMaterial({ color: '#9fb4c4', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false });
  const wheels: Object3D[] = [];
  car.userData.wheels = wheels;
  clone.traverse((child) => {
    if (/^wheel_(front|back)(Left|Right)$/.test(child.name) && !(child instanceof Mesh)) wheels.push(child);
    // Smaller wheels (the kit's are toy-sized), still on the floor: radius 0.3 at y 0.3.
    if (/^wheel_(front|back)(Left|Right)$/.test(child.name) && !(child instanceof Mesh)) {
      child.scale.multiplyScalar(0.85);
      child.position.y -= 0.3 * 0.15;
    }
    if (!(child instanceof Mesh)) return;
    child.userData.sharedGeometry = true;
    child.castShadow = true;
    child.receiveShadow = true;
    const swap = (m: MeshStandardMaterial): MeshStandardMaterial => {
      if (m.name.startsWith('paint')) return paint;
      if (m.name === 'window') return glass;
      const copy = m.clone();
      if (m.name === 'lightFront') {
        copy.emissive.set('#fff6dd');
        copy.emissiveIntensity = 1.2;
      } else if (m.name === 'lightBack') {
        copy.emissive.set('#ff2a2a');
        copy.emissiveIntensity = 0.8;
      }
      return copy;
    };
    const original = child.material as MeshStandardMaterial;
    child.material = Array.isArray(child.material)
      ? child.material.map((m) => swap(m as MeshStandardMaterial))
      : swap(child.material as MeshStandardMaterial);
    if ((Array.isArray(child.material) ? child.material : [child.material]).includes(glass)) child.castShadow = false;
    if (!Array.isArray(original) && original.name === 'plastic') openRearWindows(child, glass);
  });
  car.add(clone);
  return car;
}

/**
 * Kenney's SUV has one window a side; behind it the cabin is a solid gray panel, so the
 * dog's head poked through it (ben, round 10). This drops that panel (two triangles a
 * side, in the plastic part's own copy of the geometry) and puts back a panel with a
 * rolled-down rear door window (the dog leans out of it) and a glass rear quarter window.
 * Coordinates are the kit's own: x across the car, y up, z from the hood (-z) to the tailgate.
 */
function openRearWindows(plastic: Mesh, glass: MeshStandardMaterial): void {
  const geometry = plastic.geometry.clone();
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index) return;
  const keep: number[] = [];
  const isRearPanel = (a: number, b: number, c: number): boolean =>
    [a, b, c].every((v) => Math.abs(position.getX(v)) > 0.44 && position.getY(v) > 0.55 && position.getZ(v) > 0.2) &&
    [a, b, c].some((v) => Math.abs(position.getZ(v) - 1.25) < 0.01 || Math.abs(position.getZ(v) - 0.25) < 0.01) &&
    [a, b, c].some((v) => Math.abs(position.getY(v) - 0.6) < 0.01);
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (!isRearPanel(a, b, c)) keep.push(a, b, c);
  }
  geometry.setIndex(keep);
  plastic.geometry = geometry;
  plastic.userData.sharedGeometry = false;

  // The new side panel: the old outline (bottom at y 0.6, roof edge sloping up to the
  // tailgate corner), with the two window holes cut out.
  const outline = new Shape();
  outline.moveTo(0.25, 0.6);
  outline.lineTo(1.25, 0.6);
  outline.lineTo(1.05, 1.1);
  outline.lineTo(0.25, 1.002);
  outline.closePath();
  const rearDoor = new Path();
  rearDoor.moveTo(0.32, 0.64);
  rearDoor.lineTo(0.32, 0.95);
  rearDoor.lineTo(0.68, 0.95);
  rearDoor.lineTo(0.68, 0.64);
  rearDoor.closePath();
  const quarter = new Path();
  quarter.moveTo(0.8, 0.64);
  quarter.lineTo(0.8, 0.95);
  quarter.lineTo(1.06, 0.95);
  quarter.lineTo(1.12, 0.64);
  quarter.closePath();
  outline.holes.push(rearDoor, quarter);
  // Shape x is the car's z; the panel leans in toward the roof like the kit's (x 0.55 at the
  // sill, 0.45 at the roof).
  const toSide = (g: ShapeGeometry, side: number): ShapeGeometry => {
    const p = g.getAttribute('position');
    for (let v = 0; v < p.count; v++) {
      const z = p.getX(v);
      const y = p.getY(v);
      p.setXYZ(v, side * (0.55 - (y - 0.6) * 0.2), y, z);
    }
    g.computeVertexNormals();
    return g;
  };
  const trim = (plastic.material as MeshStandardMaterial).clone();
  trim.side = DoubleSide;
  const quarterGlass = new Shape();
  quarterGlass.moveTo(0.8, 0.64);
  quarterGlass.lineTo(0.8, 0.95);
  quarterGlass.lineTo(1.06, 0.95);
  quarterGlass.lineTo(1.12, 0.64);
  quarterGlass.closePath();
  // A dark interior behind the open window, so you don't see straight through the car.
  const cabin = new MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.9, side: DoubleSide });
  for (const side of [-1, 1]) {
    const panel = new Mesh(toSide(new ShapeGeometry(outline), side), trim);
    panel.position.copy(plastic.position);
    panel.castShadow = true;
    const pane = new Mesh(toSide(new ShapeGeometry(quarterGlass), side), glass);
    pane.position.copy(plastic.position);
    plastic.parent?.add(panel, pane);
  }
  const back = new Mesh(new PlaneGeometry(0.9, 0.36), cabin);
  back.rotation.y = Math.PI / 2;
  back.position.set(plastic.position.x + 0.2, plastic.position.y + 0.79, plastic.position.z + 0.7);
  plastic.parent?.add(back);
}

function createLedVolumeSet(): Group {
  const set = new Group();
  // The wraparound LED wall: a half cylinder behind the car, showing a highway.
  const screen = paintTexture(2048, 512, (ctx) => paintHighway(ctx, 2048, 512));
  // It tiles, so the scenery can scroll past while the camera rolls.
  screen.wrapS = RepeatWrapping;
  const wall = new Mesh(
    new CylinderGeometry(0.195, 0.195, STAGE_HEIGHT - 0.02, 64, 1, true, Math.PI / 2, Math.PI),
    new MeshBasicMaterial({ map: screen, toneMapped: false, side: DoubleSide }),
  );
  wall.name = 'led-wall';
  // Its back stays just in front of the stage's back wall.
  wall.position.set(0, (STAGE_HEIGHT - 0.02) / 2, 0.004);
  set.add(wall);
  // The wall's black frame and the truss it hangs from.
  const truss = mat('#1a1a1d', 0.6, 0.6);
  set.add(block(0.4, 0.006, 0.006, truss, 0, STAGE_HEIGHT - 0.012, -0.19, false));
  // A dark gray stage floor: on a volume the floor is often matched to the road.
  set.add(block(STAGE_WIDTH - 0.01, 0.001, STAGE_DEPTH - 0.01, mat('#2f2f33', 0.85), 0, 0.0005, 0, false));
  const car = createCar();
  car.position.set(0.005, 0, -0.06);
  set.add(car);
  const dog = createDog();
  // Head out of the rolled-down rear door window (fitCarModel), neck back inside.
  dog.position.set(0.049, 0.099, -0.004);
  dog.rotation.y = -0.35;
  set.add(dog);

  // The wall lights the car too: warm sunset glow from behind, and its sky as soft ambient.
  const glow = new DirectionalLight('#ffb36b', 0.9);
  glow.name = 'led-wall-glow';
  glow.position.set(0.05, 0.25, -0.45);
  glow.target.position.set(0.005, 0.07, -0.06);
  const ambient = new HemisphereLight('#7d97c9', '#3a2e2a', 0.4);
  ambient.name = 'led-wall-ambient';
  set.add(glow, glow.target, ambient);
  return set;
}

/** The beta track's set for an id, or undefined if the id isn't one of them. */
export function createBetaSet(id: string): Group | undefined {
  if (id === 'desert') return createDesertSet();
  if (id === 'led-volume') return createLedVolumeSet();
  return undefined;
}
