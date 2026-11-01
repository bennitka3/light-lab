import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import type { SetId } from '../levels.js';
import { STAGE_DEPTH, STAGE_HEIGHT, STAGE_WIDTH } from './soundstage.scene-asset.js';
import { steelMaterial, woodMaterial } from './set-dressing.js';

/**
 * Set pieces for each scene, built procedurally in stage-local meters (1:14).
 * The lighting system adds the returned group to the stage when a scene starts
 * and removes it when the scene ends. Named objects the system looks for:
 * "practical-lamp" (with a "practical-light" child), "green-screen" (whose
 * material it swaps for the Lake Como plate), and "seat-*" pieces.
 */

/** Seat height of the actor's baked pose (the director's chair seat, 0.58 m at 1:14). */
export const SEAT_HEIGHT = 0.58 / 14;
const BACK_WALL_Z = -STAGE_DEPTH / 2 + 0.006;

function mat(color: string, roughness = 0.8, metalness = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

function block(w: number, h: number, d: number, material: MeshStandardMaterial, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(rTop: number, rBottom: number, h: number, material: MeshStandardMaterial, x: number, y: number, z: number, segments = 20): Mesh {
  const mesh = new Mesh(new CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A tall seat the seated actor fits: seat at SEAT_HEIGHT, a back, a footrest bar. */
function createSeat(style: 'armchair' | 'metal' | 'bench' | 'dining', x: number, z: number, rotY = 0): Group {
  const seat = new Group();
  seat.name = `seat-${style}`;
  const material =
    style === 'armchair' ? mat('#6b3f32', 0.9) : style === 'metal' ? steelMaterial : style === 'dining' ? mat('#3b2418', 0.6) : woodMaterial;
  const width = style === 'armchair' ? 0.04 : 0.03;
  seat.add(block(width, 0.005, 0.03, material, 0, SEAT_HEIGHT - 0.0025, 0));
  // Legs.
  for (const [lx, lz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    seat.add(block(0.0025, SEAT_HEIGHT - 0.005, 0.0025, material, (lx * (width - 0.004)) / 2, (SEAT_HEIGHT - 0.005) / 2, (lz * 0.026) / 2));
  }
  // Footrest bar at the front and the backrest.
  seat.add(block(width, 0.002, 0.002, material, 0, 0.012, 0.013));
  seat.add(block(width, 0.03, 0.004, material, 0, SEAT_HEIGHT + 0.015, -0.015));
  if (style === 'armchair') {
    seat.add(block(0.006, 0.012, 0.03, material, -width / 2, SEAT_HEIGHT + 0.006, 0));
    seat.add(block(0.006, 0.012, 0.03, material, width / 2, SEAT_HEIGHT + 0.006, 0));
  }
  seat.position.set(x, 0, z);
  seat.rotation.y = rotY;
  return seat;
}

function paintTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    paint(ctx);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A painted backdrop on the back wall; emissive so it reads like a translight. */
function backdrop(texture: CanvasTexture, glow: number, name: string): Mesh {
  const material = new MeshStandardMaterial({
    map: texture,
    emissive: new Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: glow,
    roughness: 1,
  });
  const mesh = new Mesh(new PlaneGeometry(STAGE_WIDTH - 0.02, STAGE_HEIGHT - 0.02), material);
  mesh.name = name;
  mesh.position.set(0, STAGE_HEIGHT / 2, BACK_WALL_Z);
  mesh.receiveShadow = true;
  return mesh;
}

/** A bookshelf full of books, 0.14 wide and 0.16 tall, its back at z = 0. */
function createBookshelf(): Group {
  const shelfWood = mat('#4a3020', 0.7);
  const shelf = new Group();
  shelf.add(block(0.14, 0.16, 0.02, shelfWood, 0, 0.08, 0));
  const bookColors = ['#7c2d12', '#1e3a8a', '#14532d', '#a16207', '#581c87', '#334155'];
  for (let row = 0; row < 3; row++) {
    const y = 0.025 + row * 0.05;
    shelf.add(block(0.13, 0.003, 0.016, shelfWood, 0, y - 0.012, 0.004));
    let x = -0.058;
    let i = row * 2;
    while (x < 0.055) {
      const w = 0.006 + ((i * 7) % 5) * 0.0012;
      const h = 0.02 + ((i * 3) % 4) * 0.003;
      shelf.add(block(w, h, 0.012, mat(bookColors[i % bookColors.length], 0.85), x + w / 2, y - 0.01 + h / 2, 0.006));
      x += w + 0.001;
      i++;
    }
  }
  return shelf;
}

/**
 * Scene 2 is shot on location, not on a stage: a professor's study built
 * inside the soundstage walls. Wood-panelled walls, two bookshelves, a
 * daylight window, a desk with a banker's lamp, and his armchair.
 */
function createStudySet(): Group {
  const set = new Group();
  // Wood panelling with a picture rail, on the back wall and both side walls.
  const panelling = paintTexture(1024, 600, (ctx) => {
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(0, 0, 1024, 600);
    for (let x = 0; x < 1024; x += 128) {
      ctx.fillStyle = '#4a2f1c';
      ctx.fillRect(x + 12, 250, 104, 330);
      ctx.fillStyle = '#6b4630';
      ctx.fillRect(x + 18, 256, 92, 318);
    }
    ctx.fillStyle = '#3b2616';
    ctx.fillRect(0, 230, 1024, 14);
    ctx.fillStyle = '#7a6a52';
    ctx.fillRect(0, 0, 1024, 230);
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < 230; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? '#000' : '#fff';
      ctx.fillRect(0, y, 1024, 3);
    }
    ctx.globalAlpha = 1;
  });
  const wallMaterial = new MeshStandardMaterial({ map: panelling, roughness: 0.85 });
  const back = new Mesh(new PlaneGeometry(STAGE_WIDTH - 0.01, STAGE_HEIGHT - 0.01), wallMaterial);
  back.position.set(0, STAGE_HEIGHT / 2, BACK_WALL_Z + 0.001);
  back.receiveShadow = true;
  set.add(back);
  for (const side of [-1, 1]) {
    const wall = new Mesh(new PlaneGeometry(STAGE_DEPTH - 0.01, STAGE_HEIGHT - 0.01), wallMaterial);
    wall.position.set(side * (STAGE_WIDTH / 2 - 0.007), STAGE_HEIGHT / 2, 0);
    wall.rotation.y = -side * (Math.PI / 2);
    wall.receiveShadow = true;
    set.add(wall);
  }
  // A herringbone-ish wood floor and a rug.
  const floor = block(STAGE_WIDTH - 0.01, 0.001, STAGE_DEPTH - 0.01, mat('#6b4a2e', 0.6), 0, 0.0005, 0);
  floor.castShadow = false;
  const rug = block(0.15, 0.001, 0.11, mat('#3f2a4a', 0.95), 0, 0.0012, -0.05);
  rug.castShadow = false;
  set.add(floor, rug);

  // His armchair, turned with him.
  set.add(createSeat('armchair', 0, -0.06, -0.35));

  // Bookshelves on either side of a daylight window.
  const left = createBookshelf();
  left.position.set(-0.15, 0, -0.18);
  const right = createBookshelf();
  right.scale.set(0.8, 1, 1);
  right.position.set(0.16, 0, -0.18);
  const windowFrame = block(0.075, 0.1, 0.004, mat('#e5e1d8', 0.7), 0.02, 0.15, -0.193);
  const sky = block(
    0.065,
    0.09,
    0.001,
    new MeshStandardMaterial({ color: '#9cc3e6', emissive: '#b9d8f5', emissiveIntensity: 0.5 }),
    0.02,
    0.15,
    -0.19,
  );
  const mullion = block(0.002, 0.09, 0.002, mat('#e5e1d8', 0.7), 0.02, 0.15, -0.189);
  const transom = block(0.065, 0.002, 0.002, mat('#e5e1d8', 0.7), 0.02, 0.15, -0.189);
  set.add(left, right, windowFrame, sky, mullion, transom);

  // A desk camera-right with a green banker's lamp (set dressing, glowing softly).
  const desk = new Group();
  const deskWood = mat('#3b2418', 0.5);
  desk.add(block(0.07, 0.003, 0.035, deskWood, 0, 0.052, 0));
  desk.add(block(0.02, 0.05, 0.033, deskWood, -0.025, 0.025, 0));
  desk.add(block(0.02, 0.05, 0.033, deskWood, 0.025, 0.025, 0));
  desk.add(block(0.012, 0.0015, 0.016, mat('#e8e2d0', 0.8), -0.012, 0.0545, 0.004));
  desk.add(cylinder(0.0015, 0.0015, 0.012, mat('#b08d57', 0.3, 1), 0.02, 0.06, -0.006));
  const shade = block(
    0.016,
    0.005,
    0.007,
    new MeshStandardMaterial({ color: '#1f5d3a', emissive: '#ffd59a', emissiveIntensity: 0.25, roughness: 0.4 }),
    0.02,
    0.067,
    -0.004,
  );
  desk.add(shade);
  desk.position.set(0.13, 0, -0.13);
  desk.rotation.y = -0.4;

  // Framed diplomas on the panelling, camera-left.
  for (const [x, y] of [
    [-0.06, 0.2],
    [-0.06, 0.16],
  ]) {
    set.add(block(0.03, 0.022, 0.002, mat('#2a1d14', 0.6), x, y, -0.192));
    set.add(block(0.025, 0.017, 0.001, mat('#efe8d6', 0.9), x, y, -0.1905));
  }
  set.add(desk);
  return set;
}

function createProductSet(): Group {
  const set = new Group();
  // A pedestal with a glossy black top, and a perfume bottle on it.
  const pedestal = block(0.05, 0.055, 0.05, mat('#e8e4dc', 0.6), 0, 0.0275, -0.06);
  const top = block(0.052, 0.002, 0.052, mat('#0b0b0d', 0.08, 0.2), 0, 0.056, -0.06);
  const glass = new MeshStandardMaterial({
    color: '#c98a3a',
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82,
  });
  const body = block(0.022, 0.03, 0.012, glass, 0, 0.072, -0.06);
  const liquid = block(0.018, 0.022, 0.009, mat('#8a4a12', 0.2), 0, 0.069, -0.06);
  const neck = cylinder(0.003, 0.003, 0.004, mat('#d4af37', 0.25, 1), 0, 0.089, -0.06);
  const cap = block(0.012, 0.009, 0.009, mat('#d4af37', 0.2, 1), 0, 0.0955, -0.06);
  const label = block(0.012, 0.008, 0.0004, mat('#f4f1ea', 0.5), 0, 0.072, -0.0538);
  set.add(pedestal, top, liquid, body, neck, cap, label);
  // A seamless paper sweep behind it.
  const sweep = block(0.3, 0.18, 0.004, mat('#2c2c33', 0.95), 0, 0.09, -0.17);
  set.add(sweep);
  return set;
}

function createLivingRoomSet(): Group {
  const set = new Group();
  set.add(createSeat('armchair', -0.02, -0.07));
  // Rug.
  const rug = block(0.16, 0.001, 0.1, mat('#5b2a2a', 0.95), -0.01, 0.0005, -0.05);
  rug.castShadow = false;
  // Side table and the practical lamp, camera-right of the actor.
  const table = new Group();
  table.add(block(0.03, 0.002, 0.03, woodMaterial, 0, 0.046, 0));
  table.add(cylinder(0.002, 0.003, 0.045, woodMaterial, 0, 0.0225, 0));
  const lamp = new Group();
  lamp.name = 'practical-lamp';
  lamp.add(cylinder(0.005, 0.006, 0.004, mat('#2b2b2e', 0.4, 0.6), 0, 0.049, 0));
  lamp.add(cylinder(0.0012, 0.0012, 0.03, mat('#b08d57', 0.3, 1), 0, 0.064, 0));
  const shadeMaterial = new MeshStandardMaterial({ color: '#efe3c8', emissive: '#ffb45a', emissiveIntensity: 0, roughness: 0.9 });
  const shade = new Mesh(new CylinderGeometry(0.008, 0.013, 0.014, 20, 1, true), shadeMaterial);
  shade.name = 'practical-shade';
  shade.position.set(0, 0.082, 0);
  const bulb = new PointLight('#ffb45a', 0, 0.25, 2);
  bulb.name = 'practical-light';
  bulb.position.set(0, 0.08, 0);
  lamp.add(shade, bulb);
  table.add(lamp);
  table.position.set(0.05, 0, -0.1);
  // A framed picture and a window frame on the back wall.
  const frame = block(0.06, 0.045, 0.003, mat('#2a1d14', 0.6), -0.07, 0.13, -0.19);
  const art = block(0.052, 0.037, 0.001, mat('#3d5a6c', 0.9), -0.07, 0.13, -0.188);
  const windowFrame = block(0.07, 0.09, 0.003, mat('#e5e1d8', 0.7), 0.1, 0.13, -0.19);
  const night = block(0.06, 0.08, 0.001, new MeshStandardMaterial({ color: '#0d1630', emissive: '#0d1a3a', emissiveIntensity: 0.6 }), 0.1, 0.13, -0.188);
  set.add(rug, table, frame, art, windowFrame, night);
  return set;
}

function createInterrogationSet(): Group {
  const set = new Group();
  set.add(createSeat('metal', 0, -0.07));
  // Metal table in front of him with a paper cup and a file.
  const table = new Group();
  table.add(block(0.08, 0.002, 0.04, mat('#5d6166', 0.5, 0.6), 0, 0.052, 0));
  for (const lx of [-0.037, 0.037]) {
    table.add(block(0.002, 0.051, 0.036, mat('#3a3d41', 0.5, 0.6), lx, 0.0255, 0));
  }
  table.add(cylinder(0.0035, 0.003, 0.008, mat('#f0ece2', 0.7), 0.025, 0.057, 0.005));
  table.add(block(0.022, 0.0008, 0.028, mat('#c9a66b', 0.8), -0.015, 0.0535, 0.006));
  table.position.set(0, 0, -0.025);
  // The one-way mirror.
  const mirror = block(0.16, 0.07, 0.003, mat('#0c0f12', 0.05, 0.9), 0, 0.12, -0.192);
  const mirrorFrame = block(0.17, 0.08, 0.002, mat('#2a2c2f', 0.6, 0.5), 0, 0.12, -0.194);
  set.add(table, mirrorFrame, mirror);
  return set;
}

function createSunsetSet(): Group {
  const set = new Group();
  set.add(createSeat('bench', 0.01, -0.06, 0.25));
  const sky = paintTexture(1024, 600, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 600);
    gradient.addColorStop(0, '#2b1d4a');
    gradient.addColorStop(0.45, '#c2563a');
    gradient.addColorStop(0.62, '#f2a541');
    gradient.addColorStop(0.63, '#3a2a3a');
    gradient.addColorStop(1, '#1a1222');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 600);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(300, 372, 46, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(250 + Math.sin(i) * 20, 385 + i * 9, 100 - i * 5, 2);
    }
    ctx.globalAlpha = 1;
  });
  set.add(backdrop(sky, 0.35, 'sunset-backdrop'));
  // A deck railing behind him.
  const rail = new Group();
  rail.add(block(0.3, 0.003, 0.004, woodMaterial, 0, 0.07, 0));
  for (let i = -5; i <= 5; i++) {
    rail.add(block(0.003, 0.07, 0.003, woodMaterial, i * 0.028, 0.035, 0));
  }
  rail.position.set(0, 0, -0.14);
  set.add(rail);
  return set;
}

/** The Lake Como plate that replaces the green screen on "Roll!". */
export function paintLakeComo(): CanvasTexture {
  return paintTexture(1024, 600, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 330);
    sky.addColorStop(0, '#3b5b8c');
    sky.addColorStop(0.6, '#e9a46b');
    sky.addColorStop(1, '#f6d29b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 330);
    // Three ranges of mountains, farther ones paler.
    const ranges: [string, number, number][] = [
      ['#8b87a8', 210, 60],
      ['#5f6c8a', 250, 50],
      ['#3e5a4c', 290, 40],
    ];
    ranges.forEach(([color, base, amp], r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 330);
      for (let x = 0; x <= 1024; x += 16) {
        ctx.lineTo(x, base - amp * Math.abs(Math.sin(x * 0.006 + r * 1.7)) - 18 * Math.sin(x * 0.021 + r));
      }
      ctx.lineTo(1024, 330);
      ctx.fill();
    });
    // The lake, with streaks of reflected sky.
    const lake = ctx.createLinearGradient(0, 330, 0, 600);
    lake.addColorStop(0, '#d79a6a');
    lake.addColorStop(0.3, '#4f6f8f');
    lake.addColorStop(1, '#22364d');
    ctx.fillStyle = lake;
    ctx.fillRect(0, 330, 1024, 270);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffe2b0';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect((i * 97) % 1024, 340 + ((i * 37) % 200), 40 + (i % 5) * 12, 2);
    }
    ctx.globalAlpha = 1;
    // A villa on the shore, ochre with a terracotta roof, and its cypresses.
    ctx.fillStyle = '#e0b25c';
    ctx.fillRect(640, 268, 120, 62);
    ctx.fillStyle = '#a4472b';
    ctx.beginPath();
    ctx.moveTo(630, 270);
    ctx.lineTo(700, 246);
    ctx.lineTo(770, 270);
    ctx.fill();
    ctx.fillStyle = '#5c4a3a';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(652 + i * 18, 284, 7, 12);
    }
    ctx.fillStyle = '#1f3b2a';
    for (const x of [600, 618, 790, 808]) {
      ctx.beginPath();
      ctx.ellipse(x, 290, 7, 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // A little boat.
    ctx.fillStyle = '#f3efe6';
    ctx.beginPath();
    ctx.moveTo(300, 420);
    ctx.lineTo(360, 420);
    ctx.lineTo(350, 430);
    ctx.lineTo(308, 430);
    ctx.fill();
    // Restaurant terrace railing in the foreground.
    ctx.fillStyle = '#efe7d6';
    ctx.fillRect(0, 520, 1024, 10);
    for (let x = 10; x < 1024; x += 34) {
      ctx.fillRect(x, 530, 10, 70);
    }
  });
}

function createRestaurantSet(): Group {
  const set = new Group();
  // The green screen, slightly off the back wall, and a green floor runner.
  const screenMaterial = new MeshStandardMaterial({ color: '#1fa344', roughness: 0.95 });
  const screen = new Mesh(new PlaneGeometry(STAGE_WIDTH - 0.04, STAGE_HEIGHT - 0.04), screenMaterial);
  screen.name = 'green-screen';
  screen.position.set(0, STAGE_HEIGHT / 2, BACK_WALL_Z + 0.002);
  screen.receiveShadow = true;
  // Tracking marks on the screen, the little crosses VFX artists ask for.
  for (const [mx, my] of [
    [-0.12, 0.2],
    [0.12, 0.2],
    [-0.12, 0.08],
    [0.12, 0.08],
  ]) {
    const mark = block(0.008, 0.0012, 0.0004, mat('#8ad19a', 0.9), mx, my, BACK_WALL_Z + 0.003);
    const mark2 = block(0.0012, 0.008, 0.0004, mat('#8ad19a', 0.9), mx, my, BACK_WALL_Z + 0.003);
    mark.name = 'tracking-mark';
    mark2.name = 'tracking-mark';
    set.add(mark, mark2);
  }
  set.add(screen);
  // A table for two with a white cloth, a candle and two wine glasses.
  const table = new Group();
  table.add(cylinder(0.035, 0.035, 0.002, mat('#f4f1ea', 0.85), 0, 0.054, 0, 32));
  table.add(cylinder(0.0355, 0.0355, 0.012, mat('#f4f1ea', 0.85), 0, 0.047, 0, 32));
  table.add(cylinder(0.002, 0.004, 0.046, mat('#2b2b2e', 0.4, 0.6), 0, 0.023, 0));
  const candle = cylinder(0.002, 0.002, 0.01, mat('#f2e8cf', 0.6), 0, 0.06, 0.006);
  const flame = new Mesh(new SphereGeometry(0.0015, 8, 6), new MeshBasicMaterial({ color: '#ffcf6b' }));
  flame.position.set(0, 0.0665, 0.006);
  flame.scale.y = 1.8;
  for (const gx of [-0.016, 0.016]) {
    const glass = new MeshStandardMaterial({ color: '#d8e4ea', roughness: 0.05, transparent: true, opacity: 0.5 });
    table.add(cylinder(0.0028, 0.002, 0.006, glass, gx, 0.063, 0.01));
    table.add(cylinder(0.0004, 0.0004, 0.004, glass, gx, 0.057, 0.01));
    table.add(cylinder(0.0025, 0.0025, 0.002, mat('#5b0f1a', 0.3), gx, 0.0615, 0.01));
  }
  table.add(candle, flame);
  table.position.set(0, 0, -0.015);
  set.add(createSeat('dining', -0.04, -0.06, 0.85), createSeat('dining', 0.04, -0.06, -0.85), table);
  return set;
}

export function createLevelSet(id: SetId): Group {
  let set: Group;
  switch (id) {
    case 'study':
      set = createStudySet();
      break;
    case 'product':
      set = createProductSet();
      break;
    case 'living-room':
      set = createLivingRoomSet();
      break;
    case 'interrogation':
      set = createInterrogationSet();
      break;
    case 'sunset':
      set = createSunsetSet();
      break;
    case 'restaurant':
      set = createRestaurantSet();
      break;
    default:
      set = new Group();
  }
  set.name = `set-${id}`;
  return set;
}

/** Frees the GPU memory of a set that is leaving the stage (shared set-dressing materials stay). */
export function disposeSet(set: Object3D): void {
  const shared = new Set([woodMaterial, steelMaterial]);
  set.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (shared.has(material as MeshStandardMaterial)) {
          continue;
        }
        (material as MeshStandardMaterial).map?.dispose();
        material.dispose();
      }
    }
  });
}
