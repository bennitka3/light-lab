import type { FixtureKind, Gel } from './scene-assets/soundstage.scene-asset.js';

/**
 * The seven scenes of Lucky Break, as data. Each scene says which set pieces
 * to build, where the cast sits, which lights are in the kit, and which
 * "roles" the lights must fill to match the director's target shot.
 *
 * Positions are stage-local meters (1:14 scale; origin at the stage floor's
 * center, the cine camera toward +Z). Orbit targets are measured around the
 * scene's aim point: azimuth 0 is the camera side, negative is camera-left,
 * elevation is above the aim point's height, distance in stage meters.
 */

export type SetId =
  | 'studio'
  | 'interview'
  | 'product'
  | 'living-room'
  | 'interrogation'
  | 'sunset'
  | 'restaurant';

export type KitItem = {
  kind: FixtureKind;
  gel?: Gel;
  /** "screen" lights always point at the green screen instead of the cast. */
  aim?: 'cast' | 'screen';
};

export type Role = {
  id: string;
  /** What the hint calls it, e.g. "Key light". */
  label: string;
  /** Which fixtures can fill it, and a plain-language reason for the hint. */
  kinds: FixtureKind[];
  gel?: Gel;
  aim?: 'cast' | 'screen';
  kindHint: string;
  /** Where it goes: an orbit around the aim point, or a fixed spot on the set. */
  orbit?: { az: number; el: number; d: number };
  pos?: [number, number, number];
};

export type LevelDef = {
  id: string;
  title: string;
  set: SetId;
  /** Actor seat positions (stage-local floor points) and turn. Empty = no cast. */
  actors: { pos: [number, number, number]; rotY?: number }[];
  /** Show the tall director's chair from the base set under the first actor. */
  directorsChair: boolean;
  /** Where lights aim and the camera looks. Defaults to the cast's head height. */
  aim?: [number, number, number];
  camera: { x: number; z: number; fov: number };
  kit: KitItem[];
  roles: Role[];
  /** A lamp in the shot that must be switched on. */
  practical?: boolean;
  winScore: number;
  quote: string;
  objective: string;
  lesson: string;
  /** Story beat shown after the win, before the next scene. */
  after: string;
};

const HEAD = 0.105;
const SOFT_KEY = 'a big soft source (the softbox)';
const HARD = 'a hard light (Fresnel or PAR)';

export const LEVELS: LevelDef[] = [
  {
    id: 'social-clip',
    title: 'Social clip',
    set: 'studio',
    actors: [{ pos: [0, 0, -0.06] }],
    directorsChair: true,
    camera: { x: 0, z: 0.14, fov: 26 },
    kit: [{ kind: 'fresnel' }, { kind: 'softbox' }, { kind: 'par' }],
    roles: [
      {
        id: 'key',
        label: 'Key light',
        kinds: ['softbox'],
        kindHint: SOFT_KEY,
        orbit: { az: -45, el: 35, d: 0.16 },
      },
    ],
    winScore: 90,
    quote: '"You! Lighting! Make the talent look good."',
    objective: 'Kill the house lights. Then one soft key: 45° to the side, a bit above the eyes.',
    lesson: 'Soft key, 45° to the side, a little above the eyes. Flattering on anyone.',
    after: "The director squints at you. \"Stick around.\"",
  },
  {
    id: 'interview',
    title: 'Interview',
    set: 'interview',
    actors: [{ pos: [0, 0, -0.06], rotY: -0.35 }],
    directorsChair: true,
    camera: { x: 0.03, z: 0.14, fov: 26 },
    kit: [{ kind: 'par' }, { kind: 'softbox' }, { kind: 'panel' }, { kind: 'fresnel' }],
    roles: [
      {
        id: 'key',
        label: 'Key light',
        kinds: ['softbox'],
        kindHint: SOFT_KEY,
        orbit: { az: -45, el: 30, d: 0.16 },
      },
      {
        id: 'fill',
        label: 'Fill light',
        kinds: ['panel'],
        kindHint: 'a dimmer soft source (the LED panel)',
        orbit: { az: 45, el: 10, d: 0.19 },
      },
      {
        id: 'back',
        label: 'Back light',
        kinds: ['fresnel', 'par'],
        kindHint: HARD,
        orbit: { az: 150, el: 45, d: 0.14 },
      },
    ],
    winScore: 85,
    quote: '"Same guy. Now he\'s a documentary expert. Give me the classic three."',
    objective: 'Key, fill and back light. The target on the monitor shows all three.',
    lesson: 'Three-point lighting: the key shapes, the fill softens, the back light separates him from the dark.',
    after: 'The documentary expert asks if you do weddings.',
  },
  {
    id: 'product',
    title: 'Product shot',
    set: 'product',
    actors: [],
    directorsChair: false,
    aim: [0, 0.074, -0.06],
    camera: { x: 0, z: 0.14, fov: 16 },
    kit: [{ kind: 'fresnel' }, { kind: 'strip' }, { kind: 'softbox' }, { kind: 'par' }],
    roles: [
      {
        id: 'top',
        label: 'Top light',
        kinds: ['softbox'],
        kindHint: SOFT_KEY,
        orbit: { az: 20, el: 65, d: 0.14 },
      },
      {
        id: 'rim',
        label: 'Rim light',
        kinds: ['strip'],
        kindHint: 'a tall, thin soft source (the strip box)',
        orbit: { az: -140, el: 10, d: 0.12 },
      },
    ],
    winScore: 85,
    quote: '"The sponsor\'s perfume. Make that bottle look expensive."',
    objective: 'Glass loves a big soft light from above and a thin rim of light on its edge.',
    lesson: 'Products: a soft top light gives shape, a strip light behind draws a crisp edge on the glass.',
    after: 'The sponsor sends a fruit basket addressed to "Lighting Genius (name unknown)".',
  },
  {
    id: 'living-room',
    title: 'Living room',
    set: 'living-room',
    actors: [{ pos: [-0.02, 0, -0.07] }],
    directorsChair: false,
    camera: { x: 0, z: 0.14, fov: 30 },
    kit: [{ kind: 'softbox' }, { kind: 'fresnel' }, { kind: 'softbox', gel: 'cto' }, { kind: 'panel' }],
    roles: [
      {
        id: 'key',
        label: 'Key light',
        kinds: ['softbox'],
        gel: 'cto',
        kindHint: 'a soft source with an orange gel, to match the lamp',
        orbit: { az: 45, el: 15, d: 0.15 },
      },
    ],
    practical: true,
    winScore: 85,
    quote: '"Cozy evening scene. The lamp is in the shot, so the light has to make sense."',
    objective: 'Switch on the lamp in the shot. Then light him from the lamp\'s side, in the lamp\'s warm color.',
    lesson: 'Motivated light: the key comes from where a real lamp in the scene would light him, in its color.',
    after: 'The real gaffer is back from lunch. He watches you. He says nothing. He looks scared.',
  },
  {
    id: 'interrogation',
    title: 'Interrogation',
    set: 'interrogation',
    actors: [{ pos: [0, 0, -0.07] }],
    directorsChair: false,
    camera: { x: 0.02, z: 0.14, fov: 28 },
    kit: [{ kind: 'panel' }, { kind: 'par' }, { kind: 'softbox' }, { kind: 'fresnel' }],
    roles: [
      {
        id: 'top',
        label: 'Top light',
        kinds: ['fresnel', 'par'],
        kindHint: HARD,
        orbit: { az: 0, el: 72, d: 0.13 },
      },
    ],
    winScore: 85,
    quote: '"Detective drama. I want him sweating under one hard light."',
    objective: 'One hard light, high and nearly straight overhead. Nothing else.',
    lesson: 'Low-key lighting: one hard top light, deep shadows. The dark does the storytelling.',
    after: 'Craft services gives you the good sandwich now.',
  },
  {
    id: 'sunset',
    title: 'Magic hour',
    set: 'sunset',
    actors: [{ pos: [0.01, 0, -0.06], rotY: 0.25 }],
    directorsChair: false,
    camera: { x: -0.02, z: 0.14, fov: 26 },
    kit: [{ kind: 'fresnel' }, { kind: 'panel' }, { kind: 'fresnel', gel: 'cto' }, { kind: 'softbox' }],
    roles: [
      {
        id: 'sun',
        label: 'Sun',
        kinds: ['fresnel'],
        gel: 'cto',
        kindHint: 'a hard light with an orange gel (the sun is hard and warm)',
        orbit: { az: -130, el: 8, d: 0.2 },
      },
      {
        id: 'fill',
        label: 'Fill light',
        kinds: ['panel'],
        kindHint: 'a dimmer soft source (the LED panel)',
        orbit: { az: 35, el: 5, d: 0.2 },
      },
    ],
    winScore: 85,
    quote: '"Golden hour on a soundstage. Fake me a sunset."',
    objective: 'A low, warm, hard sun from behind him, and a soft fill on his face.',
    lesson: 'Magic hour: a low warm backlight plus a gentle fill. Gels change the color of a light.',
    after: 'Your mom texts: "Are you famous yet?" Almost, Mom.',
  },
  {
    id: 'restaurant',
    title: 'Lake Como (green screen)',
    set: 'restaurant',
    actors: [{ pos: [-0.04, 0, -0.06], rotY: 0.3 }, { pos: [0.04, 0, -0.06], rotY: -0.3 }],
    directorsChair: false,
    aim: [0, HEAD, -0.06],
    camera: { x: 0, z: 0.15, fov: 34 },
    kit: [
      { kind: 'panel', aim: 'screen' },
      { kind: 'softbox' },
      { kind: 'par' },
      { kind: 'fresnel' },
      { kind: 'panel', aim: 'screen' },
    ],
    roles: [
      {
        id: 'screen-left',
        label: 'Left screen light',
        kinds: ['panel'],
        aim: 'screen',
        kindHint: 'a SCREEN panel',
        pos: [-0.12, 0.11, -0.15],
      },
      {
        id: 'screen-right',
        label: 'Right screen light',
        kinds: ['panel'],
        aim: 'screen',
        kindHint: 'a SCREEN panel',
        pos: [0.12, 0.11, -0.15],
      },
      {
        id: 'key',
        label: 'Key light',
        kinds: ['softbox'],
        kindHint: SOFT_KEY,
        orbit: { az: -40, el: 25, d: 0.17 },
      },
      {
        id: 'back',
        label: 'Back light',
        kinds: ['fresnel', 'par'],
        kindHint: HARD,
        orbit: { az: 150, el: 45, d: 0.13 },
      },
    ],
    winScore: 85,
    quote: '"The big one. Romantic dinner on Lake Como, which we are absolutely not paying to fly to."',
    objective: 'Light the green screen evenly with the two SCREEN panels, then a soft key and a back light on the couple.',
    lesson: 'Green screen: light the screen evenly on its own, light the actors separately, and keep them apart.',
    after: '',
  },
];
