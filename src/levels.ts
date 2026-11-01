import type { FixtureKind } from './scene-assets/soundstage.scene-asset.js';

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
  | 'study'
  | 'product'
  | 'living-room'
  | 'interrogation'
  | 'sunset'
  | 'restaurant';

export type KitItem = {
  kind: FixtureKind;
  /** A bi-color light: its color temperature dial (on the iPad) runs from warm 3200K to daylight 5600K. */
  dial?: boolean;
  /** "screen" lights always point at the green screen instead of the cast. */
  aim?: 'cast' | 'screen';
};

export type Role = {
  id: string;
  /** What the hint calls it, e.g. "Key light". */
  label: string;
  /** Which fixtures can fill it, and a plain-language reason for the hint. */
  kinds: FixtureKind[];
  /** Needs warm (tungsten, about 3200K) light: a bi-color light dialed down. */
  warm?: boolean;
  aim?: 'cast' | 'screen';
  kindHint: string;
  /** Where it goes: an orbit around the aim point, or a fixed spot on the set. */
  orbit?: { az: number; el: number; d: number };
  pos?: [number, number, number];
};

/** A light the scene starts with already placed and switched on (kit index, orbit around the aim point). */
export type Preset = { kit: number; az: number; el: number; d: number };

/** A text message on the player's phone. */
export type Text = { from: 'dee' | 'mom'; text: string };

export type LevelDef = {
  id: string;
  title: string;
  set: SetId;
  /** Actor seat positions (stage-local floor points) and turn. Empty = no cast. */
  actors: { pos: [number, number, number]; rotY?: number }[];
  /** A different model for the first seat (asset key), used once it exists; else the usual actor. */
  actorAsset?: string;
  /** What the director says on the win in this scene, instead of a random line. */
  directorWin?: string;
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
  /** Dee's gossip text after the win (the story beat between scenes). */
  after: string;
  /** Lights already set up when the scene starts (the player fixes what is wrong). */
  preset?: Preset[];
  /** Whether the house lights start on. Defaults to true. */
  houseStartsOn?: boolean;
  /** Dee's tip, texted when the scene starts. */
  tip: string;
  /** Extra texts that arrive after the win. */
  texts?: Text[];
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
    directorWin: '"...Hm. You. Stick around."',
    after: 'did the director just TALK to you?? he never talks to anyone 👀',
    tip: 'Big square softbox = your key. Kill the house lights first (HOUSE on the iPad), then put it front-left of him, a little above his eyes.',
  },
  {
    id: 'interview',
    title: 'Interview (on location)',
    set: 'study',
    actors: [{ pos: [0, 0, -0.06], rotY: -0.35 }],
    actorAsset: 'professor',
    directorsChair: false,
    camera: { x: 0.03, z: 0.14, fov: 26 },
    kit: [{ kind: 'softbox' }, { kind: 'panel' }, { kind: 'fresnel' }],
    // The real gaffer's three-point setup, with the key kicked round to the wrong side.
    preset: [
      { kit: 0, az: 70, el: 0, d: 0.2 },
      { kit: 1, az: 45, el: 10, d: 0.19 },
      { kit: 2, az: 150, el: 45, d: 0.14 },
    ],
    houseStartsOn: false,
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
    quote: '"On location at the professor\'s house. The real gaffer lit this before he quit, then somebody kicked a light."',
    objective: 'Key, fill and back light are already up. One of them got bumped. Find it and put it back.',
    lesson: 'Three-point lighting: the key shapes the face, the fill softens its shadows, the back light separates him from the background.',
    after: 'the professor is asking if you do weddings 😂',
    tip: 'Key = softbox (shapes the face). Fill = LED panel (softens). Back = Fresnel (outlines him). One of them is on the wrong side 👀',
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
        orbit: { az: -125, el: 10, d: 0.12 },
      },
    ],
    winScore: 85,
    quote: '"The sponsor\'s perfume. Make that bottle look expensive."',
    objective: 'Glass loves a big soft light from above and a thin rim of light on its edge.',
    lesson: 'Products: a soft top light gives shape, a strip light behind draws a crisp edge on the glass.',
    after: 'the sponsor just sent a fruit basket to "Lighting Genius (name unknown)" lmao',
    tip: 'Glass is all reflections. Big softbox high above it, skinny strip box behind it off to one side. Keep every stand OUT of the shot.',
  },
  {
    id: 'living-room',
    title: 'Living room',
    set: 'living-room',
    actors: [{ pos: [-0.02, 0, -0.07] }],
    directorsChair: false,
    camera: { x: 0, z: 0.14, fov: 30 },
    kit: [{ kind: 'softbox' }, { kind: 'fresnel' }, { kind: 'softbox', dial: true }, { kind: 'panel' }],
    roles: [
      {
        id: 'key',
        label: 'Key light',
        kinds: ['softbox'],
        warm: true,
        kindHint: 'a soft source dialed warm (3200K), to match the lamp',
        orbit: { az: 45, el: 15, d: 0.15 },
      },
    ],
    practical: true,
    winScore: 85,
    quote: '"Cozy evening scene. The lamp is in the shot, so the light has to make sense."',
    objective: 'Switch on the lamp in the shot. Then light him from the lamp\'s side, in the lamp\'s warm color.',
    lesson: 'Motivated light: the key comes from where a real lamp in the scene would light him, in its color.',
    after: "uh oh. the real gaffer is back from lunch. he's just watching you. he looks scared",
    tip: 'Lamp on first (tap it, or its button on the iPad). Then the bi-color softbox, dialed down to 3200K, from the lamp\'s side, camera-right.',
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
    after: "craft services is giving you the good sandwich now. you've made it 🥪",
    tip: 'One hard light (Fresnel or PAR) almost straight over his head. Raise it high and it hangs from the grid, out of the shot.',
  },
  {
    id: 'sunset',
    title: 'Magic hour',
    set: 'sunset',
    actors: [{ pos: [0.01, 0, -0.06], rotY: 0.25 }],
    directorsChair: false,
    camera: { x: -0.02, z: 0.14, fov: 26 },
    kit: [{ kind: 'fresnel' }, { kind: 'panel' }, { kind: 'fresnel', dial: true }, { kind: 'softbox' }],
    roles: [
      {
        id: 'sun',
        label: 'Sun',
        kinds: ['fresnel'],
        warm: true,
        kindHint: 'a hard light dialed warm (3200K): the sun is hard and warm',
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
    lesson: 'Magic hour: a low warm backlight plus a gentle fill. Color temperature: low Kelvin is warm, high Kelvin is daylight blue.',
    after: '',
    tip: 'Sun = the bi-color Fresnel dialed to 3200K, low and behind him on camera-left. LED panel soft on his face from camera-right.',
    texts: [{ from: 'mom', text: 'Are you famous yet? 🎬❤️' }],
  },
  {
    id: 'restaurant',
    title: 'Lake Como (green screen)',
    set: 'restaurant',
    // The couple turned toward each other, three-quarters to camera.
    actors: [{ pos: [-0.04, 0, -0.06], rotY: 0.85 }, { pos: [0.04, 0, -0.06], rotY: -0.85 }],
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
        pos: [-0.17, 0.2, -0.12],
      },
      {
        id: 'screen-right',
        label: 'Right screen light',
        kinds: ['panel'],
        aim: 'screen',
        kindHint: 'a SCREEN panel',
        pos: [0.17, 0.2, -0.12],
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
    objective: 'Light the green screen evenly with the two SCREEN panels, hung high on either side and out of the shot. Then a soft key and a back light on the couple.',
    lesson: 'Green screen: light the screen evenly on its own, light the actors separately, and keep them apart.',
    after: '',
    tip: 'Screen first: hang the two SCREEN panels up high, one each side. Then softbox key and a back light on the couple. Nothing in the shot!',
  },
];

/** What the director says when a take works. One is picked at random each time (never the same twice in a row). */
export const DIRECTOR_WINS = [
  '"That\'s the look! Who ARE you?"',
  '"Print it. Frame it. Hang it in my house."',
  '"Cut! Gorgeous. Moving on!"',
  '"I don\'t know what you did, but do it every time."',
  '"That\'s the shot. Somebody get this person a coffee."',
  '"Beautiful. Where have you been all my life?"',
  '"Checking the gate... we\'re good. Moving on!"',
  '"Now THAT is cinema."',
  '"I\'m getting chills. Are you getting chills?"',
  '"Perfect. Lock it off. Nobody breathe."',
  '"Did you go to film school? Don\'t answer. I don\'t care."',
  '"That\'s a keeper. Next setup!"',
  '"The light! The LIGHT! Okay, moving on."',
  '"See, THIS is why I fight for the budget."',
  '"Somebody write down whatever that was."',
  '"Ooh. Moody. I love it. Next!"',
  '"That\'s the one. Don\'t let it go to your head."',
  '"Flawless. Like a painting. A painting that moves."',
  '"Ten years I\'ve waited for a light like that."',
  '"Okay, okay, you\'re hired. Again. Moving on!"',
];

/** What Dee texts when a take works. */
export const DEE_WINS = [
  'NAILED IT 🙌',
  'ok how did you do that',
  'the director bought it 😂 keep going',
  'nobody suspects a thing 🤫',
  'honestly better than the actual gaffer would do',
  '🔥🔥🔥',
  'video village is clapping rn',
  'I literally gasped',
  'you might actually be good at this??',
]
