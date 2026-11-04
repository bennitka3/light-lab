import type { LevelDef, Preset, Role } from './levels.js';

/**
 * The blind track (ben, 2026-11-04): "put all the levels on the beta track and see if I
 * can do it without the bar. Mix up the shots for me though since I already know where
 * they should be." Open it with ?track=beta.
 *
 * Every scene of the main playthrough, in the same order, but the director wants a
 * different shot: the lights move to new spots (often the other side), and some lights
 * get a dimmer with a new brightness to match. The iPad shows no match bar and no live
 * tip, so the player matches by eye; the game still scores the shot behind the scenes
 * and calls the win the same way. Dee's opening notes explain why, never where.
 *
 * Remixes are keyed by scene id and role id, so scenes can be reordered or added on the
 * main track without breaking this: a scene without a remix plays as it is (blind).
 * Directions in Dee's notes use the same words as the main game: "camera-left" is the
 * player's left looking from the camera, an orbit's az 0 is the camera side, negative
 * az is camera-left.
 */
type Remix = {
  /** New target per role id: where it goes and (for lights with a dimmer) how bright. */
  roles: Record<string, Partial<Pick<Role, 'orbit' | 'pos' | 'level'>>>;
  /** Kit indexes that gain a dimmer here, so the new brightness can be matched. */
  dimmers?: number[];
  /** A new starting rig (for scenes that start with lights already up). */
  preset?: Preset[];
  /** The director's brief, reworded for the new shot. */
  objective?: string;
  /** Dee's opening notes, reworded so they explain why without giving away the old spots. */
  dee?: string[];
};

const REMIXES: Record<string, Remix> = {
  // The rig is mirrored (key from camera-right now) and every dimmer wants a new level.
  'beta-1-tutorial': {
    preset: [
      { kit: 0, az: 45, el: 30, d: 0.16, dimmer: 0.4 },
      { kit: 1, az: -45, el: 10, d: 0.19, dimmer: 0.9 },
      { kit: 2, az: -150, el: 45, d: 0.14, dimmer: 1 },
    ],
    roles: {
      key: { orbit: { az: 45, el: 30, d: 0.16 }, level: 1 },
      fill: { orbit: { az: -45, el: 10, d: 0.19 }, level: 0.3 },
      back: { orbit: { az: -150, el: 45, d: 0.14 }, level: 0.5 },
    },
  },
  interview: {
    // The kicked light is still the key, but the whole rig is flipped and the fill is too hot.
    dimmers: [1],
    preset: [
      { kit: 0, az: -75, el: 0, d: 0.2, onFloor: true },
      { kit: 1, az: -50, el: 8, d: 0.19, dimmer: 1 },
      { kit: 2, az: -145, el: 40, d: 0.14 },
    ],
    roles: {
      key: { orbit: { az: 40, el: 30, d: 0.16 } },
      fill: { orbit: { az: -50, el: 8, d: 0.19 }, level: 0.5 },
      back: { orbit: { az: -145, el: 40, d: 0.14 } },
    },
    objective: 'Key, fill and back light are up, but this is not my shot. One light got kicked and one is too bright. Fix both.',
    dee: [
      "someone kicked one of the lights over 😬 and one of the others is way too hot",
      "key = big soft light on one side of his face. fill = dimmer, the other side, softens the shadows",
      "back light = high behind him. it outlines his hair so he pops off the background",
    ],
  },
  'key-back-dimmer': {
    roles: {
      key: { orbit: { az: 50, el: 25, d: 0.17 }, level: 0.9 },
      back: { orbit: { az: -140, el: 50, d: 0.14 }, level: 0.8 },
    },
    objective: 'A soft key and a back light. Look at my shot: which side, how high, how bright. Match it.',
    dee: [
      'key = the softbox. look at which side of his face is bright on the target',
      'back light = the Fresnel, high behind him on the opposite side from the key. a rim on his hair',
      'place first, dim second. moving a light closer makes it brighter too',
    ],
  },
  product: {
    dimmers: [1],
    roles: {
      top: { orbit: { az: -30, el: 70, d: 0.14 } },
      rim: { orbit: { az: 110, el: 12, d: 0.17 }, level: 0.5 },
    },
  },
  'beta-3-desert': {
    roles: {
      silk: { pos: [0.01, 0.19, -0.065] },
      bounce: { orbit: { az: -45, el: -5, d: 0.13 } },
    },
    objective: 'Stand the big silk over their heads to soften the sun. Then a bounce card low in front, on the side my shot shows.',
  },
  'living-room': {
    // The lamp stays camera-right, so the key still comes from there: lower, more from the side, and dimmer.
    dimmers: [2],
    roles: { key: { orbit: { az: 70, el: 10, d: 0.14 }, level: 0.6 } },
  },
  interrogation: {
    dimmers: [1, 3],
    roles: { top: { orbit: { az: 145, el: 62, d: 0.13 }, level: 0.8 } },
    objective: 'One hard light, high and behind him this time. Nothing else.',
    dee: [
      "one hard light. hard = sharp shadows. this time he's a silhouette with a glowing outline",
      "low-key lighting: the dark does the storytelling. real ones hang from the grid, out of the shot",
    ],
  },
  'beta-4-car': {
    dimmers: [1],
    roles: {
      top: { orbit: { az: 25, el: 72, d: 0.15 }, level: 0.7 },
      key: { orbit: { az: -45, el: 22, d: 0.2 }, level: 0.8 },
    },
    objective: 'The LED wall already lights them from behind. Add a big soft top light for the paint, and a key through the windows. Match my levels.',
  },
  sunset: {
    // The painted sun is camera-left, so the light stays that side: higher and more to the side, with a dimmer fill.
    dimmers: [1],
    roles: {
      sun: { orbit: { az: -105, el: 15, d: 0.2 } },
      fill: { orbit: { az: 55, el: 12, d: 0.2 }, level: 0.35 },
    },
  },
  restaurant: {
    dimmers: [1],
    roles: {
      key: { orbit: { az: 35, el: 30, d: 0.17 }, level: 0.7 },
      back: { orbit: { az: -150, el: 48, d: 0.13 } },
    },
  },
};

/** A scene as the blind track plays it: same set and cast, the director's new shot. */
export function remixLevel(level: LevelDef): LevelDef {
  const remix = REMIXES[level.id];
  if (!remix) return level;
  return {
    ...level,
    kit: level.kit.map((item, i) => (remix.dimmers?.includes(i) ? { ...item, dimmer: true } : item)),
    roles: level.roles.map((role) => ({ ...role, ...remix.roles[role.id] })),
    preset: remix.preset ?? level.preset,
    objective: remix.objective ?? level.objective,
    dee: remix.dee ?? level.dee,
  };
}

/** Scene ids that have a remix (the test checks every scene on the main track has one). */
export const REMIXED_IDS = Object.keys(REMIXES);
