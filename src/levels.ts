import { remixLevel } from './blind-remix.js';
import type { FixtureKind } from './scene-assets/soundstage.scene-asset.js';

/**
 * The scenes of Lucky Break, as data. Each scene says which set pieces
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
  | 'restaurant'
  // Beta track sets.
  | 'desert'
  | 'led-volume';

export type KitItem = {
  kind: FixtureKind;
  /** A bi-color light: its color temperature dial (on the iPad) runs from warm 3200K to daylight 5600K. */
  dial?: boolean;
  /** "screen" lights always point at the green screen instead of the cast. */
  aim?: 'cast' | 'screen';
  /** Has a dimmer on the iPad (◀ dimmer, ▶ brighter), 10% to 100%. Beta track. */
  dimmer?: boolean;
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
  /** How bright the light should be, 0.1 to 1 (its dimmer). Only scored for lights with a dimmer. */
  level?: number;
};

/** A light the scene starts with already placed and switched on (kit index, orbit around the aim point). */
export type Preset = {
  kit: number;
  az: number;
  el: number;
  d: number;
  dimmer?: number;
  /** Knocked over: the stand is as low as it goes, on the floor (only its spot around the cast is from the orbit). */
  onFloor?: boolean;
};

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
  /** Dee's gossip text after the win (the story beat between scenes). */
  after: string;
  /** Lights already set up when the scene starts (the player fixes what is wrong). */
  preset?: Preset[];
  /** Whether the house lights start on. Defaults to true. */
  houseStartsOn?: boolean;
  /**
   * Dee's notes, texted when the scene starts. ben, round 11: Dee is your training
   * guide. The iPad tip says WHAT to do; Dee says WHY, and where a real gaffer puts
   * it. Short (they must all fit on the phone together), no button instructions.
   */
  dee: string[];
  /** Extra texts that arrive after the win. */
  texts?: Text[];
  /** The lights are rigged in place: they can be switched and dimmed but not moved. */
  locked?: boolean;
  /** Shot outdoors: no studio walls, grid or house lights; the ground fades out at the edges. */
  outdoor?: boolean;
  /**
   * 'ambient': the house lights are a quiet gotcha. Tips keep placing the lights
   * and only say "too much ambient light"; Dee eventually texts THE HOUSE LIGHTS.
   */
  houseHint?: 'ambient';
};

const HEAD = 0.105;
const SOFT_KEY = 'a big soft source (the softbox)';
const HARD = 'a hard light (Fresnel or PAR)';

/** The original seven scenes (round 1-7). The main track below now mixes in the beta scenes. */
export const CLASSIC_LEVELS: LevelDef[] = [
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
    directorWin: '"...Hm. You. Stick around."',
    after: 'did the director just TALK to you?? he never talks to anyone 👀',
    dee: [
      "key light = the main light, the one that shapes the face. big + soft = flattering on anyone",
      "real gaffers put it about 45° off the camera, a bit above the eyes, so the shadow falls down and away",
    ],
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
    // The real gaffer's three-point setup, with the key kicked over: knocked round to the
    // wrong side and down on the floor (ben, round 11: "start on the lowest point ... on the ground").
    preset: [
      { kit: 0, az: 70, el: 0, d: 0.2, onFloor: true },
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
    objective: 'Key, fill and back light were all set up. Somebody kicked one over. Find it and put it back.',
    after: 'ok you can MOVE lights now. who even are you. also the professor is asking if you do weddings 😂',
    dee: [
      "someone kicked one of the lights over 😬 you can grab the lights and move them",
      "key = big soft light on one side of his face. fill = dimmer, the other side, softens the shadows",
      "back light = high behind him. it outlines his hair so he pops off the background",
    ],
  },
  {
    id: 'product',
    title: 'Product shot',
    set: 'product',
    actors: [],
    directorsChair: false,
    // The bike on its riser: aim at the middle of the frame (0.6 m up, real).
    aim: [0, 0.045, -0.06],
    camera: { x: 0, z: 0.14, fov: 30 },
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
        // Off to the side and a touch behind: the bike is long, so further out than the old bottle's.
        orbit: { az: -105, el: 10, d: 0.17 },
      },
    ],
    winScore: 85,
    quote: '"The sponsor\'s new bike. Make it look like it costs ten grand."',
    objective: 'Shiny paint loves a big soft light from above and a thin rim of light along its edge.',
    after: 'the sponsor just sent a fruit basket to "Lighting Genius (name unknown)" lmao',
    dee: [
      "shiny stuff shows you reflections, not light. a big softbox up high = one long clean highlight on the paint",
      "a strip light behind it draws a thin bright edge along the frame so the bike pops off the black",
    ],
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
    after: "uh oh. the real gaffer is back from lunch. he's just watching you. he looks scared",
    dee: [
      "the lamp is in the shot, so your light has to look like it comes FROM the lamp",
      "lamps are warm, about 3200K. so the key comes from the lamp's side, in the lamp's color",
    ],
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
    after: "craft services is giving you the good sandwich now. you've made it 🥪",
    dee: [
      "one hard light, nearly straight overhead. hard = sharp shadows",
      "low-key lighting: the dark does the storytelling. real ones hang from the grid, out of the shot",
    ],
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
    after: '',
    dee: [
      "magic hour = the sun low and warm behind them. 3200K is warm, 5600K is daylight blue",
      "fake the sun with a hard light low behind him, then a soft fill so his face isn't a silhouette",
    ],
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
    after: '',
    dee: [
      "green screen rule: light the screen on its own, nice and even. one panel each side, up high",
      "then the couple, separately: soft key, plus a back light so they don't blend into the green",
    ],
  },
];

/**
 * The experimental track (ben, 2026-11-03, after Greg's notes): open it with
 * ?track=beta. It never touches the seven scenes above.
 *
 *  1: tutorial. The lights are already rigged; kill the house lights, then
 *     only dial their brightness (Greg: start with intensity, build up to
 *     placement). ben, round 9: "more of a tutorial level than a level level".
 *  2: the usual scene 1 (move one soft key), plus its dimmer.
 *  3: a desert at high noon, outdoors (no studio walls): an overhead silk
 *     softens the harsh sun, a bounce card fills the shadows. These two are
 *     shapers, not lights: no switch, they work once they're on the set.
 *  4: a car commercial on an LED volume: a family and their dog in an SUV in
 *     front of a wraparound LED wall. The house lights are a quiet gotcha here.
 */
export const BETA_LEVELS: LevelDef[] = [
  {
    id: 'beta-1-tutorial',
    title: 'Tutorial: dial it in',
    set: 'studio',
    actors: [{ pos: [0, 0, -0.06] }],
    directorsChair: true,
    camera: { x: 0, z: 0.14, fov: 26 },
    kit: [{ kind: 'softbox', dimmer: true }, { kind: 'panel', dimmer: true }, { kind: 'fresnel', dimmer: true }],
    // The real gaffer rigged a textbook three-point setup, then left every dimmer wrong.
    preset: [
      { kit: 0, az: -45, el: 30, d: 0.16, dimmer: 0.3 },
      { kit: 1, az: 45, el: 10, d: 0.19, dimmer: 1 },
      { kit: 2, az: 150, el: 45, d: 0.14, dimmer: 1 },
    ],
    locked: true,
    roles: [
      { id: 'key', label: 'Key light', kinds: ['softbox'], kindHint: SOFT_KEY, orbit: { az: -45, el: 30, d: 0.16 }, level: 1 },
      { id: 'fill', label: 'Fill light', kinds: ['panel'], kindHint: 'a dimmer soft source (the LED panel)', orbit: { az: 45, el: 10, d: 0.19 }, level: 0.4 },
      { id: 'back', label: 'Back light', kinds: ['fresnel'], kindHint: HARD, orbit: { az: 150, el: 45, d: 0.14 }, level: 0.7 },
    ],
    // Every dimmer exactly right: one light a single stop off reads 95% and does not win.
    winScore: 96,
    quote: '"You! Lighting! The gaffer rigged these, then fiddled with every dimmer and walked out."',
    objective: 'Don\'t move anything. Just set how bright each light is, then kill the house lights and roll.',
    directorWin: '"...Hm. You. Stick around."',
    after: 'did the director just TALK to you?? he never talks to anyone 👀',
    dee: [
      "key = the main light, the one that shapes his face. the softbox here, so it's the brightest",
      "fill = the LED panel on the other side. softens the key's shadows, about half as bright",
      "back light = the Fresnel behind him. just a shine on his hair so he pops off the background",
    ],
  },
  {
    id: 'beta-2-key-dimmer',
    title: 'Social clip, with a dimmer',
    set: 'studio',
    actors: [{ pos: [0, 0, -0.06] }],
    directorsChair: true,
    camera: { x: 0, z: 0.14, fov: 26 },
    kit: [{ kind: 'fresnel' }, { kind: 'softbox', dimmer: true }, { kind: 'par' }],
    roles: [
      {
        id: 'key',
        label: 'Key light',
        kinds: ['softbox'],
        kindHint: SOFT_KEY,
        orbit: { az: -45, el: 35, d: 0.16 },
        level: 0.7,
      },
    ],
    winScore: 90,
    quote: '"New setup. Same guy. This time you place the light."',
    objective: 'One soft key: 45° to the side, a bit above the eyes. Then set its brightness.',
    after: 'ok you can MOVE lights now. who even are you',
    dee: [
      "softbox = your key. front-left of him, a bit above his eyes",
      "place it first, then dim it. moving a light closer makes it brighter too",
    ],
  },
  {
    id: 'beta-3-desert',
    title: 'Desert at noon',
    set: 'desert',
    outdoor: true,
    // Two hikers sitting on a rock, side by side.
    actors: [{ pos: [-0.028, 0, -0.06], rotY: 0.15 }, { pos: [0.028, 0, -0.06], rotY: -0.15 }],
    directorsChair: false,
    camera: { x: 0, z: 0.15, fov: 30 },
    kit: [{ kind: 'fresnel' }, { kind: 'silk' }, { kind: 'bounce' }, { kind: 'softbox' }],
    houseStartsOn: false,
    roles: [
      {
        id: 'silk',
        label: 'Overhead silk',
        kinds: ['silk'],
        kindHint: 'the overhead silk (the big white frame)',
        // Flat over their heads, high enough to stay out of the shot.
        pos: [0, 0.2, -0.06],
      },
      {
        id: 'bounce',
        label: 'Bounce card',
        kinds: ['bounce'],
        kindHint: 'the bounce card (white foam core)',
        // Off to the side enough that the card stays out of the shot (it has width).
        orbit: { az: 45, el: -5, d: 0.13 },
      },
    ],
    winScore: 85,
    quote: '"High noon in the desert. That sun is giving everyone raccoon eyes. Fix it. You can\'t move the sun."',
    objective: 'Stand the big silk over their heads to soften the sun. Then a bounce card low in front to fill their faces.',
    after: 'the PA just asked if you\'ve done a lot of westerns 🤠',
    dee: [
      "you can't move the sun, you shape it. a silk overhead turns harsh sun into soft light",
      "a bounce card throws some back up into their faces, so their eyes aren't dark holes",
    ],
  },
  {
    id: 'beta-4-car',
    title: 'Car commercial',
    set: 'led-volume',
    // Dad driving, mom riding; the dog in the back with his head out the window. The car faces camera-left.
    actors: [{ pos: [-0.035, 0, -0.035], rotY: -Math.PI / 2 }, { pos: [-0.035, 0, -0.088], rotY: -Math.PI / 2 }],
    directorsChair: false,
    aim: [0.01, 0.075, -0.05],
    camera: { x: 0.01, z: 0.24, fov: 48 },
    kit: [{ kind: 'fresnel' }, { kind: 'softbox' }, { kind: 'panel', dimmer: true }, { kind: 'par' }],
    houseStartsOn: true,
    houseHint: 'ambient',
    roles: [
      {
        id: 'top',
        label: 'Top light',
        kinds: ['softbox'],
        kindHint: 'a big soft source (the softbox), for one long highlight on the paint',
        orbit: { az: 0, el: 68, d: 0.14 },
      },
      {
        id: 'key',
        label: 'Key light',
        kinds: ['panel'],
        kindHint: 'the LED panel, through the windows onto their faces',
        orbit: { az: -62, el: 14, d: 0.19 },
        level: 0.5,
      },
    ],
    winScore: 85,
    quote: '"Car commercial. The family, the SUV, the dog. The LED wall does the scenery. You do the rest."',
    objective: 'The LED wall already lights them from behind. Add a big soft top light for the paint, and a key through the windows at half power.',
    directorWin: '"Somebody get that dog an agent."',
    after: 'the dog has more followers than you now 🐶',
    dee: [
      "on an LED volume the wall is your background AND part of your light",
      "a big soft source over a car = one long clean highlight on the paint. faces just need a gentle key",
    ],
  },
];

/**
 * Scene 3 of the main playthrough (ben, round 11): after learning to dim (scene 1) and to
 * move lights (scene 2, the kicked light), place AND dim two lights: a key and a back light.
 */
const KEY_AND_BACK: LevelDef = {
  id: 'key-back-dimmer',
  title: 'Social clip: key and back',
  set: 'studio',
  actors: [{ pos: [0, 0, -0.06] }],
  directorsChair: true,
  camera: { x: 0, z: 0.14, fov: 26 },
  kit: [{ kind: 'fresnel', dimmer: true }, { kind: 'softbox', dimmer: true }, { kind: 'par' }],
  roles: [
    {
      id: 'key',
      label: 'Key light',
      kinds: ['softbox'],
      kindHint: SOFT_KEY,
      orbit: { az: -45, el: 35, d: 0.16 },
      level: 0.7,
    },
    {
      id: 'back',
      label: 'Back light',
      kinds: ['fresnel'],
      kindHint: 'the Fresnel (a hard light, for a crisp edge)',
      orbit: { az: 150, el: 45, d: 0.14 },
      level: 0.5,
    },
  ],
  winScore: 85,
  quote: '"New setup. Same guy. Key light and a back light, and get the levels right."',
  objective: 'Place a soft key and a back light, then set how bright each one is.',
  after: "two lights AND dimmers. the camera op just asked me if you're union 😬",
  dee: [
    'key first: softbox, 45° off the camera, a bit above his eyes.',
    'back light goes high behind him, on the opposite side from the key. just a rim on his hair',
    'place first, dim second. moving a light closer makes it brighter too',
  ],
};

const scene = (id: string): LevelDef => {
  const found = [...CLASSIC_LEVELS, ...BETA_LEVELS, KEY_AND_BACK].find((level) => level.id === id);
  if (!found) throw new Error(`no scene ${id}`);
  return found;
};

/**
 * The main playthrough (ben, round 10: "add these levels in sequence to the normal playthrough").
 * The dimmer tutorial comes first; the one-light-with-a-dimmer scene takes the old social
 * clip's place (same lesson, plus the dimmer); the desert and the car commercial slot in
 * where they raise the difficulty; Lake Como stays the finale.
 */
export const LEVELS: LevelDef[] = [
  scene('beta-1-tutorial'),
  scene('interview'),
  scene('key-back-dimmer'),
  scene('product'),
  scene('beta-3-desert'),
  scene('living-room'),
  scene('interrogation'),
  scene('beta-4-car'),
  scene('sunset'),
  scene('restaurant'),
];

/**
 * The scenes this visit plays. ?track=beta is the blind track (ben, 2026-11-04): every
 * scene of the main playthrough with the director's shot remixed (src/blind-remix.ts)
 * and no match bar on the iPad. Otherwise the main playthrough.
 */
const TRACK = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('track') : null;
/**
 * ?track=result (ben, 2026-11-09: "this does have to be winnable by the result not by
 * light positions"): one scene, the blind scene 3 (key + back light), judged only by how
 * the shot looks. No bar, no overlay. See LightingLevel.evaluateResult().
 */
export const IS_RESULT = TRACK === 'result';
export const IS_BETA = TRACK === 'beta' || IS_RESULT;
export const TRACK_LEVELS: LevelDef[] = IS_RESULT
  ? [remixLevel(scene('key-back-dimmer'))]
  : IS_BETA
  ? LEVELS.map(remixLevel)
  : LEVELS;

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
