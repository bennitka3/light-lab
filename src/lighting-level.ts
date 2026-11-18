import {
  AssetManager,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  createSystem,
  DirectionalLight,
  DistanceGrabbable,
  DoubleSide,
  Entity,
  Grabbed,
  Group,
  HemisphereLight,
  Hovered,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  LinearToneMapping,
  MovementMode,
  NoToneMapping,
  Object3D,
  type ToneMapping,
  OneHandGrabbable,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Pressed,
  RayInteractable,
  Raycaster,
  SpotLight,
  SRGBColorSpace,
  SessionMode,
  Vector2,
  Vector3,
  VisibilityState,
  WebGLRenderTarget,
  LinearMipmapLinearFilter,
} from '@iwsdk/core';
import { CoachRing } from './coach.js';
import { CreatureFeature } from './creature-feature.js';
import { OPERATOR_ASSET, attachCameraOperator } from './camera-operator.js';
import { LightingStage, StageLight } from './lighting-components.js';
import { DEE_WINS, DIRECTOR_WINS, IS_BETA, IS_RESULT, type KitItem, type LevelDef, type Role, TRACK_LEVELS as LEVELS } from './levels.js';
import { PHONE_HEIGHT, PHONE_WIDTH, PhoneHud } from './phone-hud.js';
import { createLevelSet, disposeSet, paintLakeComo } from './scene-assets/level-sets.js';
import { fitCarModel } from './scene-assets/beta-sets.js';
import {
  createFixture,
  type FixtureKind,
  CAMERA_POSITION,
  KIT_HEIGHT,
  KIT_Z,
  SILK_SIZE,
  STAGE_DEPTH,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './scene-assets/soundstage.scene-asset.js';
import {
  IPAD_COMPACT_HEIGHT,
  IPAD_HEIGHT,
  IPAD_WIDTH,
  IPad,
  type IPadControl,
  type IPadPage,
  KELVIN_MAX,
  KELVIN_MIN,
  type LightButton,
} from './ipad-hud.js';
import { BUBBLE_HEIGHT, SpeechBubble } from './speech-bubble.js';
import { CARD_H, CARD_W, EdgeStrip, LightPanel, PANEL_H, ShotSign, type PanelControl } from './set-hud.js';
import * as sfx from './sfx.js';
import { checkPlacement, localBox } from './placement-check.js';

/**
 * Runs Lucky Break: ten lighting scenes on one tabletop soundstage, and the
 * story between them.
 *
 * Each scene (see levels.ts) builds its set pieces, seats the cast, and hands
 * the player a kit of lights parked behind the tape. The house lights start
 * on and flatten everything; the HOUSE switch kills them. Tapping a light
 * switches it on or off, and a switched-on light aims at the cast (or, for
 * SCREEN panels, at the green screen). A cine camera renders "your shot" to
 * the monitor next to a "target" shot of the same set lit the way the scene
 * asks for, and a match score compares the two setups role by role (key,
 * fill, back light and so on). Hold the winning score and the director calls
 * cut; the call sheet card then moves the story on.
 *
 * In the headset a light is grabbed with a pinch (DistanceGrabbable); a quick
 * pinch that barely moves it toggles it. Switches and the card are pressed
 * with a ray or a poke. In a desktop browser a light is dragged across the
 * floor, Shift-drag or the scroll wheel raises it, a click toggles it, and
 * dragging empty space turns the view around the set.
 */

const SHOT_W = 512;
const SHOT_H = 288;
/** Result track: half a head's width in stage meters (1:14 scale), for placing the face zones. */
const HEAD_HALF_WIDTH = 0.0075;
type ResultReading = { left: number; right: number; rim: number };
const SRGB_TO_LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const WIN_HOLD_SECONDS = 0.8;
// Where a light's head may go, in stage-local meters.
const BOUNDS_X = STAGE_WIDTH / 2 - 0.02;
const BOUNDS_BACK = -STAGE_DEPTH / 2 + 0.02;
const BOUNDS_FRONT = STAGE_DEPTH / 2 + 0.14;
const MIN_HEIGHT = 0.03;
const MAX_HEIGHT = STAGE_HEIGHT - 0.02;
/** The silk's lowest height: clear of a standing crew member's head (1.8 m = 0.13 on the 1:14 set). */
const SILK_MIN_HEIGHT = 0.17;
/** How long a take rolls after a win, "Action!" to "Cut!". */
const TAKE_SECONDS = 5.5;
/** When the action starts in a take (after the director calls it). */
const ACTION_AT = 1.3;
/**
 * How long after a match the director calls "Roll camera... ACTION!" on his own (ben,
 * 2026-11-16: no Roll button). He turns to you, says his line, then rolls.
 */
const ROLL_DELAY = 3;
/** Seconds after "Cut" before the next scene loads by itself (ben, 2026-11-18: no Next scene click). */
const AUTO_NEXT_SECONDS = 4;
/** How far (stage meters, 2 cm in the hand) a held light may drift after the match before it counts as moved. */
const ROLL_MOVE_SLACK = 0.02;
/** A blown take (you touched something while they rolled): when the actor blows up, and when it resets. */
const BLOWN_TANTRUM_AT = 1.8;
const BLOWN_RESET_AT = 4.6;
/** Touching the set before "Action!" only gets a warning: when it resets. */
const BLOWN_WARNING_RESET_AT = 2.6;
/** The actor's blow-up when a take is ruined (one at random). */
const TANTRUMS = [
  '"I can\'t WORK like this! Amateurs!"',
  '"I was IN it! I was in the moment!"',
  '"Is the light guy even a real gaffer?!"',
  '"Twelve years of training, and the LIGHTS are moving?!"',
];
// Keeps lights from being pushed through the cast.
const SUBJECT_CLEARANCE = 0.03;
// A grab or click shorter than this, that barely moves the light, is a tap on its switch.
const TAP_SECONDS = 0.45;
const TAP_MAX_MOVE = 0.01;
const TAP_MAX_PIXELS = 5;
// Where SCREEN lights point: the middle of the back wall.
const SCREEN_CENTER = new Vector3(0, STAGE_HEIGHT / 2, -STAGE_DEPTH / 2);
const HEAD_HEIGHT = 0.105;
// Within this distance of a fixed-position role target counts as a perfect spot.
const POSITION_TOLERANCE = 0.045;
/** The house lights left on multiply the match by this (so a perfect setup reads 50% until you cut them). */
const HOUSE_FACTOR = 0.5;
/** How far (stage meters, about one small drag) the tip looks ahead when it picks a direction. */
const TIP_STEP = 0.015;
// A light raised this high hangs from the grid instead of standing on the floor
// (its pipe runs up, out of the shot, like a real studio's overhead lights).
const HANG_HEIGHT = 0.17;
// How long a hint must stay the same before Dee nudges (the house lights only, now).
const NUDGE_SECONDS = 14;
/** Dee only mentions the house lights once the player is this far into a scene. */
const HOUSE_NUDGE_SECONDS = 20;
/** How long the scene stays dark before the director's house lights come on (LevelDef.houseIntro). */
const HOUSE_INTRO_SECONDS = 2.2;
// Where the lower third and the phone ride in front of the headset view (meters, head space).
// In the headset they sit about 85 cm out, near the lenses' focus distance and
// the sharp middle of the view (first headset playtest: at 60 cm, low and off
// to the side, the text was soft and unreadable on a Quest 1).
const HUD_IPAD_OFFSET = new Vector3(0, -0.22, -0.85);
const HUD_IPAD_FULL_OFFSET = new Vector3(0, -0.05, -0.85);
const HUD_IPAD_XR_SCALE = 1.35;
const HUD_IPAD_FULL_XR_SCALE = 1.6;
// The phone: small and low beside the iPad when tucked; raised near the middle
// of the view, and bigger, when a text lands (like lifting it to read).
const HUD_PHONE_OFFSET = new Vector3(0.36, -0.33, -0.84);
const HUD_PHONE_AWAKE_OFFSET = new Vector3(0.26, 0, -0.84);
const HUD_PHONE_XR_SCALE = 1.6;
const HUD_PHONE_AWAKE_XR_SCALE = 2.3;
const HUD_DESKTOP_DISTANCE = 0.6;
// Headset (ben, 2026-11-18: "the whole goal of this is to focus on what you're actually doing
// and not on the monitor"): no iPad in play. The target and your shot hang on a sign above the
// front of the stage like a storefront sign, the match bar and tip run right under them, and
// each light's controls float over it when you point at it. All fixed
// to the set; nothing follows your head.
/** Where you stand at the start, in the set's meters. */
const START_SPOT = { x: 0, z: 0.55 };
/** The sign's bottom edge sits this far above your sightline to the back of the set floor. */
const SIGN_CLEAR = 0.025;
/** The HOUSE wall switch in the headset: a plate on the set's front edge, toward the director. */
const HOUSE_PLATE_W = 0.032;
const HOUSE_PLATE_H = 0.045;
/** The sign's size on the back wall (ben, 2026-11-18: 0.75 and 0.9 a little too small). */
const SIGN_SCALE = 1;
/** The sign on the set's top front corner is this much smaller than it was on the back wall. */
const SIGN_CORNER_SCALE = 0.45;
/** The phone lies on the apron's front corner on the craft-services side, clear of the crew (stage meters). */
const PHONE_SPOT = new Vector3(0.36, 0.004, 0.385);
/** The phone lying on the craft services table: a real phone's size next to the crew (1/14 scale). */
const PHONE_SPOT_SCALE = 0.11;
/** A light's panel stays this long after the pointer leaves the light (seconds). */
const PANEL_LINGER = 1.2;
const PANEL_SCALE = 1.4;
/**
 * The tip once everything but the house lights is in place. In the headset, after the first
 * scene's house lesson, it's no note at all: only the HOUSE switch pulses (ben, 2026-11-18 morning).
 */
const HOUSE_TIP = "Don't forget the house lights.";
/** The tip card on the set: CARD_W x CARD_H at this scale. */
const CARD_SCALE = 0.65;
const Y_AXIS = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
// Squeeze and drag the picked-up phone to move it in your view; that spot is remembered.
const HELD_KEY = 'lightLab.heldOffsets.v2';

type Pose = { azimuth: number; elevation: number; distance: number };
type Phase = 'title' | 'playing' | 'won' | 'rolled' | 'credits';

/** How each kind of fixture lights: softboxes and panels are broad and soft, the others hard. */
const LIGHT_QUALITY: Record<
  FixtureKind,
  { color: string; intensity: number; angleDeg: number; penumbra: number; shadowRadius: number }
> = {
  softbox: { color: '#fff1dc', intensity: 0.25, angleDeg: 60, penumbra: 1, shadowRadius: 10 },
  panel: { color: '#eef3ff', intensity: 0.11, angleDeg: 70, penumbra: 1, shadowRadius: 8 },
  strip: { color: '#fff1dc', intensity: 0.2, angleDeg: 45, penumbra: 1, shadowRadius: 6 },
  fresnel: { color: '#ffd2a0', intensity: 0.45, angleDeg: 20, penumbra: 0.3, shadowRadius: 1 },
  par: { color: '#ffe2b8', intensity: 0.6, angleDeg: 12, penumbra: 0.15, shadowRadius: 1 },
  // Light shapers (beta track): the silk re-emits the sun it blocks as a big soft top light,
  // the bounce card throws a little of it back up into the faces.
  silk: { color: '#fff4e4', intensity: 0.07, angleDeg: 75, penumbra: 1, shadowRadius: 14 },
  // Stands a bit further out than it used to (out of the silk's shade), so a bit brighter.
  bounce: { color: '#fff1dc', intensity: 0.1, angleDeg: 65, penumbra: 1, shadowRadius: 10 },
};
/** How much sun a full silk lets through to a bounce card in its shade (about two stops). */
const SILK_PASSES = 0.25;
/** Points across the bounce card's face (head-local), to see how much of it the silk shades. */
const CARD_SAMPLES: [number, number][] = [
  [-0.02, -0.02],
  [0, -0.02],
  [0.02, -0.02],
  [-0.02, 0],
  [0, 0],
  [0.02, 0],
  [-0.02, 0.02],
  [0, 0.02],
  [0.02, 0.02],
];
const CTO_TINT = new Color('#ff9a45');
/** The browser's background: a dark studio, or a hazy sky for outdoor scenes. */
const STUDIO_BACKDROP = '#141416';
const OUTDOOR_SKY = '#cfe2f1';
/** Light shapers (beta track): no switch; they work whenever they stand on the set, past the tape. */
const SHAPERS = new Set<FixtureKind>(['silk', 'bounce']);
const TAPE_Z = STAGE_DEPTH / 2 + 0.01;
/** How far each kind's head reaches from its center (stage meters), for "is it in the shot". */
const HEAD_REACH: Record<FixtureKind, number> = {
  softbox: 0.018,
  panel: 0.015,
  strip: 0.021,
  fresnel: 0.009,
  par: 0.008,
  silk: 0, // checked by its frame and stands instead
  bounce: 0.025,
};

const KIND_NAMES: Record<FixtureKind, string> = {
  softbox: 'softbox',
  panel: 'LED panel',
  strip: 'strip box',
  fresnel: 'Fresnel',
  par: 'PAR can',
  silk: 'overhead silk',
  bounce: 'bounce card',
};

/** The short name on each light's switch on the iPad. */
const KIND_LABELS: Record<FixtureKind, string> = {
  softbox: 'Softbox',
  panel: 'LED panel',
  strip: 'Strip box',
  fresnel: 'Fresnel',
  par: 'PAR can',
  silk: 'Silk',
  bounce: 'Bounce',
};
/** The bi-color dial's stops, warm to daylight. Warm roles need the warm end. */
const KELVIN_STEPS = [3200, 4000, 4800, 5600];
const WARM_MAX_K = 3600;
const NEUTRAL_MIN_K = 4800;
/** A dimmer's stops: 10% to 100% in tens. */
const DIMMER_STEP = 0.1;
/** How far off a dimmer can be before it costs the match (one stop off scores about 85%, so the bar climbs as you get close). */
const DIMMER_TOLERANCE = 0.25;

/**
 * How much light a dimmer setting lets through. Squared, like a real dimmer's
 * curve feels to the eye, and 100% runs a bit hotter than the light's usual
 * output so the gap between key and fill reads on the iPad.
 */
function dimmerGain(level: number): number {
  return 1.8 * level * level;
}

/** The controls the coach teaches, in the order it teaches them. */
const COACH_SKILLS = ['moveset', 'shots', 'house', 'look', 'switch', 'drag', 'raise', 'dimmer', 'phone'] as const;
type CoachSkill = (typeof COACH_SKILLS)[number];
type CoachLesson = { skill: CoachSkill; text: string };
/** Lessons that are only reading: they wait for Got it instead of an action. */
const COACH_READING = new Set<CoachSkill>(['shots', 'moveset']);
/** Headset: the grab spot on the floor for sliding the whole set (stage meters), its size, and how far the set can go. */
const SET_PAD_AT = new Vector3(-0.15, 0.002, 0.2 + 0.05);
const SET_PAD_SIZE = 0.06;
const SET_SLIDE_MAX = 0.35;

type Fixture = {
  entity: Entity;
  object: Object3D;
  item: KitItem;
  head: Object3D;
  face?: MeshStandardMaterial;
  led: MeshStandardMaterial;
  handle?: Object3D;
  pole: Object3D;
  base: Object3D;
  yoke?: Object3D;
  spot: SpotLight;
  /** Head position in stage-local meters. */
  local: Vector3;
  on: boolean;
  /** Color temperature; only bi-color lights (with a dial) can change it. */
  kelvin: number;
  /** Brightness, 0.1 to 1; only lights with a dimmer (beta track) can change it. */
  dimmer: number;
  /** Headset grab bookkeeping for telling a tap from a move. */
  grabTime: number;
  grabStart: Vector3;
  /** Where the light stood when the shot matched (moving it from there ruins the take). */
  rollFrom: Vector3;
  /** Bounce card only: how much of it is out in the sun (1) rather than under a rigged silk (0). */
  lit: number;
};

/** Something the player switches by pressing it: the HOUSE switch, a practical lamp. */
type Switch = {
  entity: Entity;
  hit: Object3D;
  toggle: () => void;
  pressed: boolean;
};

/**
 * Sets a light's color and brightness from its color temperature: 5600K is
 * the light's own daylight color, 3200K is the warm orange of tungsten
 * (the same as the old orange gel), in between blends.
 */
function applyKelvin(spot: SpotLight, kind: FixtureKind, kelvin: number): void {
  const quality = LIGHT_QUALITY[kind];
  const warm = MathUtils.clamp((KELVIN_MAX - kelvin) / (KELVIN_MAX - KELVIN_MIN), 0, 1);
  spot.color.set(quality.color);
  KELVIN_TINT.setRGB(1, 1, 1).lerp(CTO_TINT, warm);
  spot.color.multiply(KELVIN_TINT);
  spot.intensity = quality.intensity * (1 + 0.4 * warm);
}
const KELVIN_TINT = new Color();

function createSpot(kind: FixtureKind, kelvin: number = KELVIN_MAX): SpotLight {
  const quality = LIGHT_QUALITY[kind];
  const spot = new SpotLight(
    quality.color,
    quality.intensity,
    0,
    MathUtils.degToRad(quality.angleDeg),
    quality.penumbra,
    2,
  );
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.01;
  spot.shadow.camera.far = 1;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.0005;
  spot.shadow.radius = quality.shadowRadius;
  spot.shadow.blurSamples = 16;
  applyKelvin(spot, kind, kelvin);
  return spot;
}

function itemName(item: KitItem): string {
  const prefix = item.aim === 'screen' ? 'screen ' : item.dial ? 'bi-color ' : '';
  return `${prefix}${KIND_NAMES[item.kind]}`;
}

const ZOOM_KEY = 'lightLab.ipadZoom';
/** Headset: how long the quiet "too much ambient light" tip waits before it names the HOUSE switch (seconds). */
const AMBIENT_RESCUE_SECONDS = 12;
/** How long the ring stays round a light the tip names for the first time, unless you point at it first (seconds). */
const HINT_RING_SECONDS = 12;
/** Headset: how much bigger the set looks (you're scaled down), and where your eyes start, in set meters. */
const SET_ZOOM = 1.6;
const VIEW_AT = new Vector3(0, 0.25, 0.46);
// Headset brightness (ben, 2026-11-18: "everything is just darker in VR"): an exposure for the
// view of the set, set with - and + under the title page and saved on this headset.
const BRIGHT_KEY = 'lightLab.vrBrightness';
const BRIGHT_STEPS = [1, 1.25, 1.5, 1.8, 2.2];
const BRIGHT_DEFAULT = 2;

function loadBrightness(): number {
  try {
    const saved = Number(localStorage.getItem(BRIGHT_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < BRIGHT_STEPS.length && localStorage.getItem(BRIGHT_KEY) !== null) return saved;
  } catch {
    // No storage: the default.
  }
  return BRIGHT_DEFAULT;
}

function saveBrightness(step: number): void {
  try {
    localStorage.setItem(BRIGHT_KEY, String(step));
  } catch {
    // Not remembered.
  }
}

/** Where you last dragged the picked-up phone to (head space), or the default. */
function loadHeldOffsets(): { phone: Vector3 } {
  const offsets = { phone: HUD_PHONE_AWAKE_OFFSET.clone() };
  try {
    const saved = JSON.parse(localStorage.getItem(HELD_KEY) ?? 'null') as { phone?: number[] } | null;
    if (saved?.phone?.length === 3) offsets.phone.fromArray(saved.phone);
  } catch {
    // No storage (private window): the defaults.
  }
  return offsets;
}

function saveHeldOffsets(offsets: { phone: Vector3 }): void {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify({ phone: offsets.phone.toArray() }));
  } catch {
    // No storage: it just isn't remembered.
  }
}

/** The iPad size the player picked last time (1 = default). */
function loadZoom(): number {
  try {
    const value = Number.parseFloat(window.localStorage.getItem(ZOOM_KEY) ?? '');
    return Number.isFinite(value) ? MathUtils.clamp(value, 0.7, 1.6) : 1;
  } catch {
    return 1;
  }
}

function saveZoom(zoom: number): void {
  try {
    window.localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    // Private windows can refuse storage; the size just won't be remembered.
  }
}

function startLevelFromUrl(): number {
  const param = new URLSearchParams(window.location.search).get('scene');
  const n = param ? Number.parseInt(param, 10) : 1;
  return Number.isFinite(n) ? MathUtils.clamp(n, 1, LEVELS.length) - 1 : 0;
}

/** Dev-only trail of player actions, so headset-emulator tests can read what happened. */
function devLog(message: string): void {
  if (import.meta.env.DEV) {
    console.info(`[lightLab] ${message}`);
  }
}

export class LightingLevelSystem extends createSystem({
  stages: { required: [LightingStage] },
}) {
  private ready = false;
  private stage!: Object3D;
  private lens!: Object3D;
  private cameraRig!: Object3D;
  private directorsChair?: Object3D;
  private actor?: Object3D;
  private extraActors: Object3D[] = [];

  // The scene being played.
  private levelIndex = 0;
  private level: LevelDef = LEVELS[0];
  private phase: Phase = 'title';
  private set?: Object3D;
  private fixtures: Fixture[] = [];
  private targetSpots: SpotLight[] = [];
  private aimLocal = new Vector3();
  /** Result track: brightness of the shot's lighting jobs, measured from the pictures (target once, live a few times a second). */
  private resultTarget?: ResultReading;
  private resultLive?: ResultReading;
  private resultTimer = 0;
  private resultPixels = new Uint8Array(SHOT_W * SHOT_H * 4);
  private aimWorld = new Vector3();
  private screenWorld = new Vector3();
  private practical?: { on: boolean; shade: MeshStandardMaterial; bulb: PointLight; switch: Switch };
  private greenScreen?: Mesh;
  /** A silk frame that only exists for the target shot, so the director's version blocks the sun too (beta track). */
  private targetSilk?: Mesh;
  /** The set's sun (outdoor scenes), found once per set; null when the set has none. */
  private sunLight?: DirectionalLight | null;
  private sunDir = new Vector3();

  // House lights and switches.
  private houseOn = true;
  // House lights are dimmed to zero rather than hidden: hiding a light changes the
  // light count, which makes three.js recompile every material (a visible stall).
  private houseLights: (HemisphereLight | DirectionalLight)[] = [];
  private houseIntensity: number[] = [];
  /** The glowing undersides of the house light fixtures hanging from the grid. */
  private houseBulb?: MeshStandardMaterial;
  private switches: Switch[] = [];
  /** The room's own light switch on the set's wall (scene 2's study): works the house lights too. */
  private wallSwitch?: { switch: Switch; rocker: Object3D; pilot: MeshStandardMaterial };
  /** When (performance.now() ms) the director hits the house lights at the start of a scene (LevelDef.houseIntro); -1 = not pending. */
  private houseIntroIn = -1;

  // Camera shots and the monitor.
  private shotCamera!: PerspectiveCamera;
  private shotTarget!: WebGLRenderTarget;
  private targetShot!: WebGLRenderTarget;
  private framesSinceLoad = 0;
  private ipad!: IPad;
  private label!: { canvas: HTMLCanvasElement; texture: CanvasTexture };
  private shownText = '';
  private holdTime = 0;
  private creature = new CreatureFeature();
  private creatureHold = 0;

  // The lower third, the phone, and the hover label.
  private ipadEntity!: Entity;
  private phoneEntity!: Entity;
  private bubble = new SpeechBubble();
  private director?: { anchor: Object3D; placeholder?: Object3D };
  private lastDeeWin = -1;
  private phone = new PhoneHud();
  private hudPlaced = false;
  private xrPlaced = false;
  /** Headset: the sign, the strip and the phone's spot are set up (a few frames into the session). */
  private dockReady = false;
  private immersiveFrames = 0;
  private dockTmp = new Vector3();
  private dockDir = new Vector3();
  private dockQuatTmp = new Quaternion();
  private v3d = new Vector3();
  /** A hand's ray is on the light panel (it stays up while you use it). */
  private panelHot = false;
  /** The light the dimmer tip is about (it stays there until that light is right). */
  private dimFocus?: Fixture;
  /**
   * The first time a tip names a light this scene, a yellow ring goes round that light on the
   * set and its name shows in yellow (ben, 2026-11-18). Lights already shown, and the ring's light.
   */
  private hintShown = new Set<Fixture>();
  private hintHalo?: { fixture: Fixture; mesh: Mesh; home: MeshBasicMaterial; glow: MeshBasicMaterial };
  private hintPulse = 0;
  /** The yellow arrow showing which way to move the light the tip is about. */
  private moveArrow?: Group;
  private arrowFixture?: Fixture;
  private arrowHint = '';
  private arrowTime = 0;
  /** Texts on the phone when last placed, and how much buzz is left (seconds). */
  private phoneSeen = 0;
  private craftTableRef?: Object3D;
  private stepTarget = new Vector3();
  /** Headset: the HOUSE switch plate on the set's wall, and its rocker. */
  private houseSwitchPlate?: Mesh;
  private houseSwitchRocker?: Object3D;
  /** The match bar under the camera monitor. */
  private monitorBar?: { canvas: HTMLCanvasElement; texture: CanvasTexture; key: string };
  private phoneBuzz = 0;
  /** The light a brightness tip is about and which way (its panel shows, the button outlined). */
  private dimCue?: Fixture;
  private dimCueDir: 'dimmer' | 'brighter' = 'brighter';
  /** The little YOUR SHOT monitor on a C-stand beside the film camera. */
  private camMonitor?: Group;
  /** The camera monitor's red border: on while a light is in the shot. */
  private monitorAlert?: Group;
  private alertTime = 0;
  private hintRingFixture?: Fixture;
  private hintRingTime = 0;
  /** The name of the light the tip is about, shown in yellow on the strip. */
  private hintName = '';
  /** Headset brightness (exposure), saved on this headset; the set is raised toward eye level too. */
  private vrBrightness = loadBrightness();
  private toneMappingHome?: ToneMapping;
  private exposureHome = 1;
  /** Where the strip sits on the sign (the sign's own meters). */
  private stripOnSign = new Vector3();
  /** The tip card was up last frame (so it glides instead of jumping when its subject changes). */
  private cardShown = false;
  /** Headset: the floor spot you pinch and drag to slide the whole set, and the drag in progress. */
  private setPad?: Mesh;
  private setDrag: { hand: 'left' | 'right'; grab: Vector3 } | null = null;
  private setMoved = false;
  private playerHome = new Vector3();
  private prevSelect = { left: false, right: false };
  /** Select (trigger or hand pinch) held per hand, from the session's own events: hands may have no gamepad. */
  private selectHeld = { left: false, right: false };
  private selectSession?: XRSession;
  /** Times the phone has pinged this session (at most two), and a hop is due on the table. */
  private phonePings = 0;
  private phoneHop = false;
  /** The move arrow's dark outline material. */
  private arrowInk?: MeshBasicMaterial;
  /** The light the player last switched, dimmed, dialed or moved: the tips stay on it until it's done (ben). */
  private touchedFixture?: Fixture;
  /** The HOUSE switch is ringed for the house-lights-first tip (not a lesson). */
  private houseTipRing = false;
  /** The sign over the front of the stage (target + your shot) and its own copy of the live picture. */
  private sign?: ShotSign;
  /** The sign's center and facing in world space (full pages show the iPad there). */
  private signPos = new Vector3();
  private signQuat = new Quaternion();
  /** The match bar and tip along the front of the set, with HOUSE and Next scene. */
  private strip?: EdgeStrip;
  /** A light's controls, over the light you point at. */
  private panel?: LightPanel;
  private panelFixture?: Fixture;
  private panelLinger = 0;
  private phoneSpotPos = new Vector3();
  private phoneSpotQuat = new Quaternion();
  /** Where the picked-up phone rides in front of your eyes (head space); you can drag it. */
  private heldOffsets = loadHeldOffsets();
  /** Is each hand's near-grab on? Off while its ray points at the iPad or phone, so they win (ben, 2026-11-17). */
  private grabOn = { left: true, right: true };
  /** A held iPad or phone being dragged to a new spot with the squeeze. */
  private hudDrag: { hand: 'left' | 'right'; what: 'phone'; distance: number } | null = null;
  private rayOrigin = new Vector3();
  private rayDir = new Vector3();
  private hudRaycaster = new Raycaster();
  /** The director's brief, held until the coach has nothing left to teach (ben, 2026-11-17). */
  private briefPending = false;
  private hudScale = 1;
  private hudY = 0;
  private phoneTuck = 0;
  /** Seconds until a held thumbstick scrolls the phone again. */
  private thumbstickWait = 0;
  // The light the pointer is on (or being moved); its switch on the iPad is outlined.
  private hovered?: Fixture;
  /** The iPad's light row: HOUSE, each light in the kit, then the lamp when there is one. */
  private lightButtons: LightButton[] = [];
  /** What each switch on the iPad's row works: the house lights, a light from the kit, or the lamp. */
  private buttonTargets: (Fixture | 'house' | 'lamp')[] = [];
  /** How big the player wants the iPad (the - and + buttons), remembered between visits. */
  private ipadZoom = loadZoom();
  private canEnterXR = false;
  /** Session types this browser says it can start, best first (passthrough, then VR). */
  private xrModes: SessionMode[] = [];
  /** What happened on the last "Play in VR" press, shown on the title page if it failed. */
  private xrStatus = '';
  private mouseHover: Fixture | null = null;
  private lastDirectorLine = -1;
  // The director turning to look at you before a line.
  private directorModel?: Object3D;
  private directorYaw = 0;
  private directorLooking = false;
  private directorBlend = 0;
  private pendingLine: { line: string; hold: boolean; wait: number } | null = null;
  /** The scene's own cast member hasn't loaded yet (the stand-in actor is sitting in). */
  private castPending = false;
  /** Seconds since the camera rolled on this scene's take, or -1 before it rolls. */
  private takeTime = -1;
  private takeVoice = 0;
  private directorChair?: Object3D;
  private directorChairYaw = 0;
  private directorTalkTime = 0;
  private directorWobble = 0;
  /** The car commercial's real SUV model hasn't replaced the stand-in yet. */
  private carPending = false;
  private retakeTarget = false;
  /** Seconds until the director rolls on a matched shot by himself, or -1. */
  private rollIn = -1;
  /** Counts down from Cut to loading the next scene by itself; -1 when not counting. */
  private nextIn = -1;
  /** Tests that check the after-Cut page turn this off. */
  private autoNext = true;
  /** Seconds since a take was blown (someone touched the set while rolling), or -1. */
  private blownTime = -1;
  /** The blown take happened mid-take (Cut, the actor blows up) rather than just before "Action!". */
  private blownRolling = false;
  /** This scene was matched before (the gossip and Dee's win text only come the first time). */
  private wonOnce = false;
  private lastTantrum = -1;
  /** A second bubble, over the cast, for the actor's blow-up. */
  private castBubble = new SpeechBubble();
  private castBubbleAt = new Vector3();
  /** The camera operator's model hasn't loaded yet (he joins the camera rig once it has). */
  private operatorPending = true;
  // House lights: has the player cut them this scene (then leaving them on is on purpose),
  // how long the scene has run, and how often Dee has mentioned them all game.
  private houseEverOff = false;
  private sceneTime = 0;
  private houseTexts = 0;
  /** Dee has texted about the house lights this scene (once per scene: ben saw it 5 times in a row). */
  private houseNudged = false;
  /** Seconds the house lights have been on while lights were on the set, this scene. */
  private houseWork = 0;
  /** Headset: how long the quiet "too much ambient light" tip has been up (seconds). */
  private ambientWait = 0;

  // Dee's texts: a light in the shot, or a hint that hasn't changed in a while.
  private inFrameTime = 0;
  private inFrameFixture: Fixture | undefined;
  private hintSince = 0;
  private lastHint = '';
  private lastNudge = '';
  private sinceNudge = 0;

  private errorShown = false;
  /** Shader warm-up after a scene loads: how many lights to have on in the next pass, or -1 when done. */
  private warmup = -1;
  private warmupTarget = new WebGLRenderTarget(16, 9);
  private backdrop = new Color(STUDIO_BACKDROP);
  private chime = new Audio(`${import.meta.env.BASE_URL}audio/chime.mp3`);

  // Desktop mouse: dragging a light, or orbiting the view around the set.
  private immersive = false;
  private dragged: Fixture | null = null;
  private orbiting = false;
  private pressing: (() => void) | null = null;
  private dragPlane = new Plane();
  private dragOffset = new Vector3();
  private downPointer = new Vector2();
  private dragMoved = false;
  private lastPointer = new Vector2();
  private pointerNdc = new Vector2();
  private raycaster = new Raycaster();
  private orbit = { yaw: 0, pitch: 0.4, radius: 0.85 };
  private pivot = new Vector3();

  // Scratch values, reused every frame.
  private v1 = new Vector3();
  private v2 = new Vector3();
  private v3 = new Vector2();
  private v4 = new Vector3();
  private v5 = new Vector3();
  private v6 = new Vector3();
  /** The move the tip asked for last (which light, axis 0/1/2 = x/y/z, sign), so the tip doesn't flip-flop. */
  private tipMove = { role: '', axis: -1, sign: 0 };
  /** "Height looks good." once the player has finished one direction and the tip moves on to another. */
  private tipDone = '';
  /** Directions (bitmask of axes) the tip has finished for its current light. */
  private tipFinished = 0;
  /**
   * The coach (ben, 2026-11-16: the how-to list "means nothing without seeing the actual
   * controls"): the first time a scene needs a control, a yellow ring pulses around the
   * real thing (an iPad button, the shots, the phone, a light on set) and the iPad's tip
   * line says what to do with it. Each lesson is taught once per visit.
   */
  private coachRing = new CoachRing();
  private coachLearned = new Set<CoachSkill>();
  private coachStep: CoachLesson | null = null;
  private coachTime = 0;
  private coachFixture?: Fixture;
  private coachStart = new Vector3();
  private coachDimmers: number[] = [];
  private coachStarts: Vector3[] = [];
  private coachOnCount = 0;
  private coachOrbit = { yaw: 0, pitch: 0, radius: 0 };
  private coachPinned = false;
  /** The player pressed Got it on a lesson that's just reading (ben, 2026-11-18: tutorial steps are click-through). */
  private coachGotIt = false;
  private coachHouse = true;
  private coachBox = new Box3();
  private lensWorld = new Vector3();
  private headWorld = new Vector3();
  private hudTarget = new Vector3();

  init(): void {
    // Can this browser start a headset session? Decides the iPad's "Play in VR" button.
    const xr = navigator.xr;
    if (xr && this.world.xrEnabled) {
      Promise.all([
        xr.isSessionSupported('immersive-ar').catch(() => false),
        xr.isSessionSupported('immersive-vr').catch(() => false),
      ]).then(([ar, vr]) => {
        this.canEnterXR = ar || vr;
        this.xrModes = [...(vr ? [SessionMode.ImmersiveVR] : []), ...(ar ? [SessionMode.ImmersiveAR] : [])];
        if (this.ready && this.phase === 'title') this.showTitleCard();
        if (this.ready) this.ipad.setVrButton(this.canEnterXR && !this.immersive);
      });
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const wasImmersive = this.immersive;
        this.immersive = state !== VisibilityState.NonImmersive;
        if (wasImmersive !== this.immersive) this.resetOnSet();
        if (this.immersive) sfx.unlock();
        if (this.ready) this.ipad.setVrButton(this.canEnterXR && !this.immersive);
        if (this.ready && this.phase === 'title' && wasImmersive !== this.immersive) this.showTitleCard();
        this.dragged = null;
        this.orbiting = false;
        // A dark studio backdrop in the browser; in the headset the real room shows through.
        this.world.scene.background = this.immersive ? null : this.backdrop;
      }),
    );
    const canvas = this.world.renderer.domElement;
    const onDown = (event: PointerEvent) => {
      sfx.unlock();
      this.onPointerDown(event);
    };
    const onMove = (event: PointerEvent) => this.onPointerMove(event);
    const onUp = () => this.onPointerUp();
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    const onContextMenu = (event: Event) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && this.ready && this.ipad.hasButton) {
        event.preventDefault();
        this.pressCard();
      } else if ((event.key === '-' || event.key === '=' || event.key === '+') && this.ready) {
        this.zoomIpad(event.key === '-' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
      this.unloadLevel();
      for (const light of this.houseLights) {
        light.removeFromParent();
      }
      for (const sw of this.switches) {
        sw.entity.dispose();
      }
      this.ipadEntity?.dispose();
      this.phoneEntity?.dispose();
      this.bubble.mesh.removeFromParent();
      this.castBubble.mesh.removeFromParent();
      this.director?.placeholder?.removeFromParent();
      this.shotTarget?.dispose();
      this.targetShot?.dispose();
    });
  }

  update(delta: number): void {
    try {
      if (!this.ready && !this.trySetup()) {
        return;
      }
      // The view and the lights respond first, so a rendering problem further
      // down never freezes the controls.
      if (!this.immersive) {
        this.applyOrbit();
      }
      this.framesSinceLoad++;
      this.updateAim();
      this.updateSwitches();
      for (const fixture of this.fixtures) {
        this.updateGrab(fixture, delta);
        if (SHAPERS.has(fixture.item.kind)) {
          const placed = fixture.local.z < TAPE_Z;
          if (placed !== fixture.on) {
            fixture.on = placed;
            this.resetHold();
          }
        }
        this.updateFixture(fixture);
      }
      this.aimShotCamera();
      // Capture the target once shadows settle, then refresh it now and then in
      // case the set was moved (for example placed on a desk in the headset).
      if (this.framesSinceLoad % 90 === 3 || this.retakeTarget) {
        this.retakeTarget = false;
        this.renderTargetShot();
        if (IS_RESULT) this.resultTarget = this.readResult(this.targetShot);
      }
      // The monitor's live picture is a second full render of the set. In the
      // headset that doubles a frame's cost, so refresh it every third frame
      // there (24 fps on a 72 Hz Quest is plenty for a monitor).
      if (!this.immersive || this.framesSinceLoad % 3 === 0) {
        this.renderShot(this.shotTarget, true);
      }
      // Result track: read the live picture a few times a second (a pixel read stalls the GPU).
      this.resultTimer += delta;
      if (IS_RESULT && this.resultTimer > 0.25) {
        this.resultTimer = 0;
        this.resultLive = this.readResult(this.shotTarget);
      }
      if (this.warmup >= 0 && this.framesSinceLoad > 2) this.warmupStep();
      if (this.castPending && this.framesSinceLoad % 20 === 0) this.seatCastMember();
      if (this.carPending && this.framesSinceLoad % 20 === 5) this.swapInCar();
      if (this.operatorPending && this.framesSinceLoad % 20 === 10) this.placeOperator();
      this.creature.update(delta);
      this.updateRoll(delta);
      this.updateTake(delta);
      this.updateBlown(delta);
      this.updateScore(delta);
      this.updateCoach(delta);
      this.updateHintRing(delta);
      this.updateMoveArrow(delta);
      // Dee waits for the director to finish, then a beat more (ben, round 10: "give them room to breathe").
      if (this.bubble.speaking || this.pendingLine) this.phone.quietFor = Math.max(this.phone.quietFor, 1.2);
      // Texts about the house lights dim once they're off (and brighten again if they go back on).
    this.phone.setResolved('house', !this.houseOn);
    this.phone.update(delta);
      this.scrollPhoneWithThumbstick(delta);
      this.updateHudRays();
      this.placeHud(delta);
      this.updateHoverTag();
    } catch (error) {
      this.reportError(error);
    }
  }

  /** Shows the first error on the monitor and in the console instead of failing silently. */
  private reportError(error: unknown): void {
    if (this.errorShown) {
      return;
    }
    this.errorShown = true;
    console.error('[LightingLevel]', error);
    if (this.ipad) {
      const message = error instanceof Error ? error.message : String(error);
      this.ipad.setStatus(0, `ERROR (send ben a screenshot): ${message.slice(0, 70)}`, false);
    }
  }

  private trySetup(): boolean {
    const stageEntity = this.queries.stages.entities.values().next().value;
    const stage = stageEntity?.object3D;
    const lens = stage?.getObjectByName('camera-lens');
    const cameraRig = stage?.getObjectByName('camera-rig');
    if (!stageEntity || !stage || !lens || !cameraRig) {
      return false;
    }
    this.stage = stage;
    this.lens = lens;
    this.cameraRig = cameraRig;
    this.directorsChair = stage.getObjectByName('subject');
    this.actor = this.world.getSceneObject('actor') ?? stage.getObjectByName('subject-head')?.parent ?? undefined;

    this.shotCamera = new PerspectiveCamera(26, SHOT_W / SHOT_H, 0.005, 2);
    // Mipmapped, so the small monitor by the camera and the far sign stay sharp instead of
    // shimmering (ben, 2026-11-18: make the little monitor high res).
    this.shotTarget = new WebGLRenderTarget(SHOT_W, SHOT_H, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    this.shotTarget.texture.colorSpace = SRGBColorSpace;
    this.targetShot = new WebGLRenderTarget(SHOT_W, SHOT_H, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    this.targetShot.texture.colorSpace = SRGBColorSpace;

    this.buildMonitor();
    this.buildHouseLights();
    this.buildCard();
    this.initOrbit();
    this.ready = true;
    this.ipad.setVrButton(this.canEnterXR && !this.immersive);

    // A ?scene=N link still opens on the title page, so the iPad's "Play in VR"
    // button is there (ben, round 6: jumping to a scene left no way into VR).
    // Go then starts that scene.
    const start = startLevelFromUrl();
    this.loadLevel(start);
    this.phase = 'title';
    this.showTitleCard();

    if (import.meta.env.DEV) {
      // Lets automated browser tests drive and read the game.
      Object.assign(window, {
        lightLab: {
          fixtures: () => this.fixtures,
          orbit: this.orbit,
          score: () => this.evaluate().score,
          hint: () => this.evaluate().hint,
          // The fixture index the tip is about (a light to move), or -1.
          hintFixture: () => {
            const f = this.evaluate().fixture;
            return f ? this.fixtures.indexOf(f) : -1;
          },
          houseOn: () => this.houseOn,
          // The room's wall switch (scene 2): its rocker (+ = up/on) and pilot glow, or null.
          wallSwitch: () =>
            this.wallSwitch
              ? { rocker: this.wallSwitch.rocker.rotation.z, pilot: this.wallSwitch.pilot.emissiveIntensity, introPending: this.houseIntroIn >= 0 }
              : null,
          setHouse: (on: boolean) => {
            this.houseOn = on;
          },
          toggle: (kind: string) => {
            const fixture = this.fixtures.find((f) => f.item.kind === kind && !f.on) ?? this.fixtures.find((f) => f.item.kind === kind);
            if (fixture) this.toggle(fixture);
          },
          level: () => ({ index: this.levelIndex, id: this.level.id, phase: this.phase }),
          loadLevel: (i: number) => this.loadLevel(i),
          // Loads a scene by its id (tests use this so they survive scenes being reordered); returns its index or -1.
          loadLevelId: (id: string) => {
            const i = LEVELS.findIndex((l) => l.id === id);
            if (i >= 0) this.loadLevel(i);
            return i;
          },
          levelIds: () => LEVELS.map((l) => l.id),
          // Physical mistakes in the current scene (people in walls or lights, floating crew...).
          placement: () => {
            const scene = this.world.scene;
            const inCar = this.level.set === 'led-volume';
            const cast = (this.actor?.visible ? [this.actor, ...this.extraActors] : this.extraActors).map((object, i) => ({ name: `cast member ${i + 1}`, object, inCar }));
            const crew = ['director', 'sponsor', 'gaffer', 'crafty', 'operator']
              .map((role) => ({ name: role === 'operator' ? 'the camera operator' : `the ${role}`, object: scene.getObjectByName(`crew-${role}-model`) }))
              .filter((p): p is { name: string; object: Object3D } => Boolean(p.object));
            return checkPlacement({
              stage: this.stage,
              people: [...cast, ...crew],
              gear: this.fixtures.map((f) => ({ name: `the ${KIND_LABELS[f.item.kind]}`, object: f.object })),
              outdoor: Boolean(this.level.outdoor),
              floor: { minX: -(STAGE_WIDTH + 0.34) / 2, maxX: (STAGE_WIDTH + 0.34) / 2, minZ: -STAGE_DEPTH / 2, maxZ: STAGE_DEPTH / 2 + 0.23 },
            });
          },
          pressCard: () => this.pressCard(),
          // Off: the scene waits on its Next scene button after Cut (tests of that page).
          setAutoNext: (on: boolean) => {
            this.autoNext = on;
            if (!on) this.nextIn = -1;
            else if (this.phase === 'won' && this.takeTime >= TAKE_SECONDS && this.nextIn < 0) this.nextIn = AUTO_NEXT_SECONDS;
          },
          // Seconds into the take after a win (-1 before Roll); finishTake jumps to the Cut.
          take: () => this.takeTime,
          finishTake: () => {
            if (this.takeTime >= 0 && this.takeTime < TAKE_SECONDS) {
              this.takeTime = TAKE_SECONDS - 0.001;
              this.updateTake(0.002);
            }
          },
          solve: () => this.solve(),
          // Solves the scene as if its targets were these (by role order): tests play the main game's answer on the blind track.
          solveAs: (roles: Partial<Role>[]) => {
            const real = this.level;
            this.level = { ...real, roles: real.roles.map((role, i) => ({ ...role, ...roles[i] })) };
            this.solve();
            this.level = real;
          },
          practical: () => this.practical?.on,
          togglePractical: () => this.practical?.switch.toggle(),
          creature: () => this.creature.played,
          texts: () => this.phone.log.map((t) => `${t.from}: ${t.text}`),
          card: () => this.ipad.page,
          bubble: () => (this.bubble.mesh.visible ? this.bubble.line : null),
          // The actor's line during a blown take, or null.
          castBubble: () => (this.castBubble.mesh.visible ? this.castBubble.line : null),
          // Seconds until the director rolls by himself on a match (-1 when he isn't about to).
          rollIn: () => this.rollIn,
          phoneAwake: () => this.phone.awake,
          sounds: () => ({ ...sfx.played }),
          inXR: () => Boolean(this.world.renderer.xr.getSession()),
          inFrame: () => this.framedFixture()?.item.kind ?? null,
          // Moves fixture i to an orbit pose around the aim point (for tests).
          place: (i: number, az: number, el: number, d: number) => {
            this.roleLocal({ id: 't', label: 't', kinds: [], kindHint: '', orbit: { az, el, d } }, this.fixtures[i].local);
          },
          placeAt: (i: number, x: number, y: number, z: number) => {
            this.fixtures[i].local.set(x, y, z);
          },
          toggleHouse: () => this.toggleHouse(),
          switchOn: (i: number, on = true) => {
            this.fixtures[i].on = on;
          },
          hovered: () => this.hovered?.item.kind ?? null,
          lightButtons: () => this.lightButtons.map((b) => ({ ...b })),
          kelvin: (i: number) => this.fixtures[i].kelvin,
          dimmer: (i: number) => this.fixtures[i].dimmer,
          turnDimmer: (i: number, step: 1 | -1) => this.turnDimmer(this.fixtures[i], step),
          beta: () => IS_BETA,
          result: () => (IS_RESULT ? { zones: this.resultZones(), target: this.resultTarget, live: this.resultLive } : null),
          // Blind track: the iPad shows no match bar or live tip.
          blind: () => this.ipad.blind,
          // The current scene's targets (where each role's light goes, and how bright).
          roles: () => this.level.roles.map((r) => ({ id: r.id, orbit: r.orbit, pos: r.pos, level: r.level })),
          // Roles whose target spot a player can't drag a light to (outside the set's bounds, or inside the cast).
          unreachable: () =>
            this.level.roles
              .filter((role) => {
                const want = this.roleLocal(role, new Vector3());
                const got = want.clone();
                this.clampToSet(got, role.kinds[0]);
                return got.distanceTo(want) > 0.002;
              })
              .map((role) => role.id),
          // How many shader programs exist (a rise after a press means it compiled shaders).
          programs: () => this.world.renderer.info.programs?.length ?? -1,
          warmupDone: () => this.warmup < 0,
          // The target ('target') or live ('live') shot as a PNG data URL, for tests to look at closely.
          shotImage: (which: 'target' | 'live') => {
            const rt = which === 'target' ? this.targetShot : this.shotTarget;
            const pixels = new Uint8Array(SHOT_W * SHOT_H * 4);
            this.world.renderer.readRenderTargetPixels(rt, 0, 0, SHOT_W, SHOT_H, pixels);
            const canvas = document.createElement('canvas');
            canvas.width = SHOT_W;
            canvas.height = SHOT_H;
            const ctx = canvas.getContext('2d')!;
            const image = ctx.createImageData(SHOT_W, SHOT_H);
            for (let y = 0; y < SHOT_H; y++) {
              image.data.set(pixels.subarray((SHOT_H - 1 - y) * SHOT_W * 4, (SHOT_H - y) * SHOT_W * 4), y * SHOT_W * 4);
            }
            ctx.putImageData(image, 0, 0);
            return canvas.toDataURL('image/png');
          },
          // The coach's current lesson: which control, what the tip line says, and whether its ring shows.
          coach: () => (this.coachStep ? { skill: this.coachStep.skill, text: this.coachStep.text, ring: this.coachRing.mesh.visible } : null),
          coachLearned: () => [...this.coachLearned],
          // Tests that drive the game through this API (not the controls) skip the coach, so the
          // director gives his brief right away.
          learnAll: () => COACH_SKILLS.forEach((s) => this.coachLearned.add(s)),
          zoom: () => this.ipadZoom,
          ipadScale: () => this.ipad.object.scale.x,
          phonePinned: () => this.phone.pinned,
          phoneVisible: () => this.phone.visibleTexts,
          phoneBright: () => this.phone.brightTexts,
          levelDee: () => this.level.dee,
          ledOffset: () => {
            const wall = this.set?.getObjectByName('led-wall') as Mesh | undefined;
            return (wall?.material as MeshBasicMaterial | undefined)?.map?.offset.x ?? null;
          },
          silkFabricVisible: () => {
            const silk = this.fixtures.find((f) => f.item.kind === 'silk');
            const fabric = silk?.head.getObjectByName('fixture-face');
            return fabric ? fabric.visible : null;
          },
          hasObject: (name: string) => !!this.set?.getObjectByName(name),
          phoneScrolledBack: () => this.phone.scrolledBack,
          dee: (text: string, topic?: string) => this.phone.text('dee', text, topic),
          clearPhone: () => this.phone.clear(),
          // How far (radians) the director has turned from his resting pose, e.g. to look at you.
          directorTurn: () => (this.directorModel ? this.directorModel.rotation.y - this.directorYaw : null),
          // How far his chair has turned (it turns with him), and his talking wobble (radians).
          directorChairTurn: () => (this.directorChair ? this.directorChair.rotation.y - this.directorChairYaw : null),
          directorWobble: () => (this.directorModel ? Math.abs(this.directorModel.rotation.z) + Math.abs(this.directorModel.rotation.x) : null),
          directorSpeaking: () => this.bubble.speaking,
          castSway: () => (this.actor?.visible ? [this.actor, ...this.extraActors] : this.extraActors).map((a) => Math.abs(a.rotation.z) + Math.abs(a.rotation.x)),
          // The camera operator's stage-local spot and the camera rig's, or null until his model loads.
          operator: () => {
            const op = this.cameraRig.getObjectByName('crew-operator-model');
            if (!op) return null;
            const at = this.stage.worldToLocal(op.getWorldPosition(new Vector3()));
            return { at: at.toArray(), rig: this.cameraRig.position.toArray() };
          },
          enterXR: () => this.enterHeadset(),
          // Headset: what the sign, the strip and a light's panel show, and where they are.
          onSet: () => ({
            ready: this.dockReady,
            phone: { at: this.phone.mesh.getWorldPosition(new Vector3()).toArray(), visible: this.phone.mesh.visible },
            sign: this.sign ? this.sign.group.position.toArray() : null,
            strip: this.strip ? this.strip.mesh.getWorldPosition(new Vector3()).toArray() : null,
            stripShown: this.strip?.mesh.visible ?? false,
            coachSkill: this.coachStep?.skill ?? null,
            panel: this.panel?.group.visible && this.panelFixture ? { light: KIND_LABELS[this.panelFixture.item.kind], at: this.panel.group.getWorldPosition(new Vector3()).toArray(), linger: this.panelLinger } : null,
            phase: this.phase,
            hintRing: this.hintHalo ? KIND_LABELS[this.hintHalo.fixture.item.kind] : null,
          }),
          // Ring a light as a tip does the first time it names it (by its kit index), for a while.
          ringLight: (kit: number) => {
            this.hintRingFixture = this.fixtures[kit];
            this.hintRingTime = 600;
          },
          // Headset: show a light's panel as if you pointed at it (by its kit index).
          pointAt: (kit: number) => {
            this.panelFixture = this.fixtures[kit];
            this.panelLinger = 600;
          },
          // Headset: the set grab spot's world position, the player's position, and whether the set was moved.
          setPad: () => ({
            at: this.setPad ? this.setPad.getWorldPosition(new Vector3()).toArray() : null,
            player: this.world.player.position.toArray(),
            moved: this.setMoved,
            dragging: Boolean(this.setDrag),
          }),
          xrStatus: () => this.xrStatus,
          // Where the lower third and phone sit relative to the viewer's head (meters).
          hud: () => {
            const camera = this.world.camera;
            const card = camera.worldToLocal(this.ipad.object.getWorldPosition(new Vector3()));
            const phone = camera.worldToLocal(this.phone.mesh.getWorldPosition(new Vector3()));
            return { immersive: this.immersive, card: card.toArray(), phone: phone.toArray(), phoneVisible: this.phone.mesh.visible };
          },
          // Screen pixels of a thing, for real-mouse tests: 'card', 'card-button',
          // 'phone', iPad controls ('light:N' with N the switch on the row, 0 = HOUSE;
          // 'warmer:N', 'cooler:N', 'size:1', 'size:-1'), a fixture index, or
          // 'role:N' (role N's target spot).
          screenOf: (what: string | number) => {
            const v = new Vector3();
            const control = typeof what === 'string' ? /^(light|warmer|cooler|dimmer|brighter|size):(-?\d+)$/.exec(what) : null;
            if (what === 'card' || what === 'card-button') {
              v.set(what === 'card' ? 0 : this.ipad.buttonCenter.x, what === 'card' ? 0 : this.ipad.buttonCenter.y, 0);
              this.ipad.object.localToWorld(v);
            } else if (what === 'card-button2') {
              v.set(this.ipad.secondButtonCenter.x, this.ipad.secondButtonCenter.y, 0);
              this.ipad.object.localToWorld(v);
            } else if (control) {
              const n = Number(control[2]);
              const c = this.ipad.centerOf((ctl) =>
                ctl.type === control[1] && ('index' in ctl ? ctl.index === n : 'step' in ctl ? ctl.step === n : false),
              );
              if (!c) return null;
              v.set(c.x, c.y, 0);
              this.ipad.object.localToWorld(v);
            } else if (what === 'phone') {
              this.phone.mesh.getWorldPosition(v);
            } else if (what === 'wall-switch' && this.wallSwitch) {
              this.wallSwitch.switch.hit.getWorldPosition(v);
            } else if (what === 'lamp' && this.practical) {
              this.practical.switch.hit.getWorldPosition(v);
            } else if (typeof what === 'number') {
              this.fixtures[what].head.getWorldPosition(v);
            } else if (what.startsWith('role:')) {
              const role = this.level.roles[Number(what.slice(5))];
              this.roleLocal(role, v);
              this.stage.localToWorld(v);
            }
            v.project(this.world.camera);
            const rect = this.world.renderer.domElement.getBoundingClientRect();
            return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
          },
        },
      });
    }
    return true;
  }

  // --- Scenes --------------------------------------------------------------

  private loadLevel(index: number): void {
    this.unloadLevel();
    this.nextIn = -1;
    this.hintShown.clear();
    this.hintRingFixture = undefined;
    this.hintHalo = undefined;
    this.dimFocus = undefined;
    this.levelIndex = index;
    this.level = LEVELS[index];
    const level = this.level;
    this.phase = 'playing';
    this.endCoachStep(false);
    this.briefPending = false;
    // New scene: the last scene's texts dim; this scene's notes arrive bright.
    this.phone.setStep(`scene:${index}`);
    this.takeTime = -1;
    this.rollIn = -1;
    this.blownTime = -1;
    this.wonOnce = false;
    this.castBubble.hide();
    this.directorLooking = false;
    this.houseOn = this.level.houseStartsOn ?? true;
    this.houseEverOff = !this.houseOn;
    this.sceneTime = 0;
    this.houseWork = 0;
    this.houseNudged = false;
    this.holdTime = 0;
    this.inFrameTime = 0;
    this.hintSince = 0;
    this.lastHint = '';
    this.touchedFixture = undefined;
    // The last scene's tip direction is done with: scene 3 opened on "Height looks good." for
    // a light still parked on the floor (judge playthrough, 2026-11-18).
    this.tipMove.role = '';
    this.tipMove.axis = -1;
    this.tipMove.sign = 0;
    this.tipDone = '';
    this.tipFinished = 0;
    this.ambientWait = 0;
    this.framesSinceLoad = 0;
    this.shownText = '';

    // Set pieces. The parked C-stand would stand in the desert or in front of the
    // LED wall (beta track), so it goes away there.
    const cStand = this.stage.getObjectByName('set-cstand');
    if (cStand) cStand.visible = level.set !== 'desert' && level.set !== 'led-volume';
    // Outdoors (beta track) the studio goes away: no walls, grid, house lights or floor;
    // the set brings its own ground, which fades out at the edges (ben, round 9).
    const outdoor = Boolean(level.outdoor);
    for (const child of this.stage.children) {
      if (child.name === 'stage-wall' || child.name === 'stage-floor' || child.name === 'stage-apron' || child.name === 'stage-grid' || child.name === 'house-fixtures') {
        child.visible = !outdoor;
      }
    }
    this.backdrop.set(outdoor ? OUTDOOR_SKY : STUDIO_BACKDROP);
    this.world.scene.traverse((child) => {
      if (child.name === 'crew-mat') child.visible = !outdoor;
    });
    this.set = createLevelSet(level.set);
    this.sunLight = undefined;
    this.stage.add(this.set);
    this.greenScreen = (this.set.getObjectByName('green-screen') as Mesh | undefined) ?? undefined;
    this.carPending = Boolean(this.set.getObjectByName('car'));
    this.swapInCar();

    // Cast.
    if (this.directorsChair) {
      this.directorsChair.visible = level.directorsChair;
    }
    if (this.actor) {
      const first = level.actors[0];
      this.actor.visible = Boolean(first);
      if (first) {
        this.actor.position.set(...first.pos);
        this.actor.rotation.set(0, first.rotY ?? 0, 0);
      }
      // Some scenes cast someone else in the first seat (the professor in scene 2).
      // That model loads in the background, so until it arrives the usual actor
      // sits in, and update() swaps him in as soon as it's there.
      this.castPending = Boolean(first && level.actorAsset);
      this.seatCastMember();
      // The second seat goes to the actress (asset "actress", once loaded), else a copy of the actor.
      const actress = this.loadedModel('actress');
      for (const extra of level.actors.slice(1)) {
        const clone = (actress ?? this.actor).clone(true);
        if (actress) clone.scale.copy(this.actor.scale);
        clone.position.set(...extra.pos);
        clone.rotation.set(0, extra.rotY ?? 0, 0);
        clone.visible = true;
        this.stage.add(clone);
        this.extraActors.push(clone);
      }
    }
    if (level.aim) {
      this.aimLocal.set(...level.aim);
    } else if (level.actors.length > 0) {
      this.aimLocal.set(0, 0, 0);
      for (const actor of level.actors) {
        this.aimLocal.x += actor.pos[0];
        this.aimLocal.z += actor.pos[2];
      }
      this.aimLocal.divideScalar(level.actors.length);
      this.aimLocal.y = HEAD_HEIGHT;
    }

    // Camera.
    this.cameraRig.position.set(level.camera.x, 0, level.camera.z);
    this.shotCamera.fov = level.camera.fov;
    this.shotCamera.updateProjectionMatrix();

    // The practical lamp, if this set has one.
    const lamp = this.set.getObjectByName('practical-lamp');
    const shade = lamp?.getObjectByName('practical-shade');
    const bulb = lamp?.getObjectByName('practical-light');
    if (lamp && shade instanceof Mesh && bulb instanceof PointLight) {
      lamp.getWorldPosition(this.v1);
      this.v1.y += 0.075;
      const practical = {
        on: false,
        shade: shade.material as MeshStandardMaterial,
        bulb,
        switch: this.createSwitch(this.v1, 0.04, () => {
          practical.on = !practical.on;
          this.resetHold();
          this.touchedSet('lamp');
        }),
      };
      this.practical = practical;
    }

    // The room's light switch on the wall, if this set has one: a second HOUSE switch.
    const wall = this.set.getObjectByName('house-switch');
    const rocker = wall?.getObjectByName('house-switch-rocker');
    const pilot = wall?.getObjectByName('house-switch-pilot');
    if (wall && rocker && pilot instanceof Mesh) {
      this.stage.updateMatrixWorld(true);
      wall.getWorldPosition(this.v1);
      // The press target is a bit bigger than the plate, so it's easy to hit with a ray.
      this.wallSwitch = {
        switch: this.createSwitch(this.v1, 0.035, () => {
          this.houseIntroIn = -1;
          sfx.click();
          this.toggleHouse();
        }),
        rocker,
        pilot: pilot.material as MeshStandardMaterial,
      };
    }
    this.fitHouseSwitchToSet();
    this.passThroughCameraRig();
    this.houseIntroIn = -1;

    // The kit, parked in a row behind the tape.
    const n = level.kit.length;
    level.kit.forEach((item, i) => {
      const x = n === 1 ? 0 : -0.18 + (0.36 * i) / (n - 1);
      this.fixtures.push(this.createFixtureEntity(item, x));
    });
    // Lights the scene starts with already set up (and on).
    for (const preset of level.preset ?? []) {
      const fixture = this.fixtures[preset.kit];
      this.roleLocal({ id: 'preset', label: '', kinds: [], kindHint: '', orbit: preset }, fixture.local);
      // A knocked-over light sits as low as a stand goes, its head resting just off the floor.
      if (preset.onFloor) {
        fixture.local.y = MIN_HEIGHT;
        this.stage.updateMatrixWorld(true);
        this.updateAim();
        this.placeFixture(fixture);
        this.updateFixture(fixture);
        fixture.object.updateMatrixWorld(true);
        const low = localBox(this.stage, fixture.head, new Box3()).min.y;
        if (low < 0.002) fixture.local.y += 0.002 - low;
      }
      fixture.on = true;
      if (preset.dimmer !== undefined) fixture.dimmer = preset.dimmer;
    }
    this.buildLightButtons();

    // One hidden light per role, used only to render the target shot.
    for (const role of level.roles) {
      const spot = createSpot(role.kinds[0], role.warm ? KELVIN_MIN : KELVIN_MAX);
      if (role.level !== undefined) spot.intensity *= dimmerGain(role.level);
      spot.visible = false;
      if (role.kinds.includes('silk') && role.pos) {
        // The director's silk: invisible to the camera (it hangs above the frame anyway)
        // but it shades the sun in the target shot. Shown only while that shot renders.
        const silk = new Mesh(new PlaneGeometry(SILK_SIZE, SILK_SIZE), new MeshBasicMaterial({ color: '#f4f1ea', side: DoubleSide }));
        // Both sides, or the shadow pass culls it when the sun looks at its top.
        silk.rotation.x = -Math.PI / 2;
        silk.position.set(...role.pos);
        silk.castShadow = true;
        silk.visible = false;
        this.stage.add(silk);
        this.targetSilk = silk;
      }
      this.world.scene.add(spot, spot.target);
      this.targetSpots.push(spot);
    }

    this.showBriefCard();
    this.warmup = 0;
  }

  /**
   * Switching a light on or off changes how many lights the scene has, and
   * three.js then rebuilds every material's shader: a visible stall on the
   * first press (ben, round 9: "the light on buttons are slow"; measured about
   * 1.3-1.8 s per first toggle in software rendering). So right after a scene
   * loads, one count per frame, prepare the shaders for 0..all the scene's
   * lights being on. Later presses reuse them.
   */
  private warmupStep(): void {
    const count = this.warmup;
    if (count > this.fixtures.length) {
      this.warmup = -1;
      return;
    }
    this.fixtures.forEach((fixture, i) => {
      fixture.spot.visible = i < count;
    });
    // A tiny render (not just compile) also links the shaders and allocates each
    // light's shadow map now, rather than on the first press.
    const renderer = this.world.renderer;
    const previous = renderer.getRenderTarget();
    const xrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;
    try {
      // Shaders differ between drawing to the screen (tone mapped) and to the
      // iPad's shot textures, so prepare both.
      renderer.setRenderTarget(this.warmupTarget);
      renderer.render(this.world.scene, this.shotCamera);
      renderer.setRenderTarget(null);
      renderer.compile(this.world.scene, this.world.camera);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.xr.enabled = xrEnabled;
      // A bounce card is never off.
      for (const fixture of this.fixtures) fixture.spot.visible = fixture.on || fixture.item.kind === 'bounce';
    }
    this.warmup = count + 1;
  }

  /** Puts the scene's own cast member (LevelDef.actorAsset) in the first seat once the model has loaded. */
  private seatCastMember(): void {
    const first = this.level.actors[0];
    const stand = this.level.actorAsset ? this.loadedModel(this.level.actorAsset) : undefined;
    if (!this.castPending || !first || !stand || !this.actor) return;
    this.castPending = false;
    const clone = stand.clone(true);
    clone.scale.copy(this.actor.scale);
    clone.position.set(...first.pos);
    clone.rotation.set(0, first.rotY ?? 0, 0);
    clone.visible = true;
    this.actor.visible = false;
    this.stage.add(clone);
    this.extraActors.push(clone);
    // Retake the director's target shot with him in it on the next frame.
    this.retakeTarget = true;
    devLog(`cast ${this.level.actorAsset} seated`);
  }

  /** Swaps the procedural stand-in car for the real SUV model once it has loaded. */
  private swapInCar(): void {
    const stand = this.carPending ? this.set?.getObjectByName('car') : undefined;
    const model = stand ? this.loadedModel('car-suv') : undefined;
    if (!stand || !model) return;
    this.carPending = false;
    const car = fitCarModel(model);
    car.position.copy(stand.position);
    car.rotation.copy(stand.rotation);
    stand.parent!.add(car);
    stand.removeFromParent();
    disposeSet(stand);
    this.retakeTarget = true;
    devLog('car model in');
  }

  /** Stands the camera operator behind the camera (on its rig) once his model has loaded. */
  private placeOperator(): void {
    const model = this.loadedModel(OPERATOR_ASSET);
    if (!model) return;
    this.operatorPending = false;
    attachCameraOperator(this.cameraRig, model);
    this.passThroughCameraRig();
    devLog('camera operator placed');
  }

  /** A model from the asset manifest if it is listed and loaded, else undefined. */
  private loadedModel(key: string): Object3D | undefined {
    try {
      return AssetManager.getGLTF(key)?.scene;
    } catch {
      return undefined;
    }
  }

  private unloadLevel(): void {
    for (const fixture of this.fixtures) {
      fixture.spot.removeFromParent();
      fixture.spot.target.removeFromParent();
      fixture.entity.dispose();
    }
    this.fixtures = [];
    for (const spot of this.targetSpots) {
      spot.removeFromParent();
      spot.target.removeFromParent();
      spot.dispose();
    }
    this.targetSpots = [];
    if (this.targetSilk) {
      this.targetSilk.removeFromParent();
      this.targetSilk.geometry.dispose();
      (this.targetSilk.material as MeshBasicMaterial).dispose();
      this.targetSilk = undefined;
    }
    for (const actor of this.extraActors) {
      actor.removeFromParent();
    }
    this.extraActors = [];
    if (this.practical) {
      this.removeSwitch(this.practical.switch);
      this.practical = undefined;
    }
    if (this.wallSwitch) {
      this.removeSwitch(this.wallSwitch.switch);
      this.wallSwitch = undefined;
    }
    this.houseIntroIn = -1;
    if (this.set) {
      this.set.removeFromParent();
      disposeSet(this.set);
      this.set = undefined;
      this.sunLight = undefined;
    }
    this.greenScreen = undefined;
    this.dragged = null;
    this.mouseHover = null;
  }

  private createFixtureEntity(item: KitItem, kitX: number): Fixture {
    const object = createFixture(item.kind);
    const led = this.makeLed(object);
    const entity = this.world.createTransformEntity(object);
    entity.addComponent(StageLight, { kind: item.kind, kitX });
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
      rotate: false,
      scale: false,
      translate: true,
      returnToOrigin: false,
    });
    entity.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    const head = object.getObjectByName('fixture-head')!;
    const face = head.getObjectByName('fixture-face');
    if ((item.dial || item.dimmer || item.kind === 'silk' || item.kind === 'bounce') && face instanceof Mesh) {
      // Its own face material, so the glow can follow the dial (or the dimmer, or a shaper's state).
      face.material = (face.material as MeshStandardMaterial).clone();
      // A bounce card is white on both sides: its back follows the front.
      const back = head.getObjectByName('fixture-face-back');
      if (back instanceof Mesh) back.material = face.material;
    }
    const spot = createSpot(item.kind);
    spot.name = `${item.kind}-light`;
    spot.visible = false;
    this.world.scene.add(spot, spot.target);
    return {
      entity,
      object,
      item,
      head,
      face: face instanceof Mesh ? (face.material as MeshStandardMaterial) : undefined,
      led,
      handle: object.getObjectByName('fixture-handle'),
      pole: object.getObjectByName('stand-pole')!,
      base: object.getObjectByName('stand-base')!,
      yoke: object.getObjectByName('fixture-yoke'),
      spot,
      local: new Vector3(kitX, KIT_HEIGHT, KIT_Z),
      on: false,
      kelvin: KELVIN_MAX,
      dimmer: 1,
      grabTime: 0,
      grabStart: new Vector3(),
      rollFrom: new Vector3(),
      lit: 1,
    };
  }

  /**
   * Dee's note for this scene: the one line on why the lights go where they go. Just the
   * first (ben, 2026-11-17: "fewer messages... less information from Dee, more from the
   * iPad"); the iPad's tip says what to do next.
   */
  private textDee(): void {
    const line = this.level.dee[0];
    if (line) this.phone.text('dee', line);
  }

  /** Moves the story on: the title starts scene 1, a won scene goes to the next one. */
  private pressCard(): void {
    if (!this.ipad.hasButton) {
      return;
    }
    devLog(`card pressed in phase ${this.phase}, scene ${this.levelIndex + 1}`);
    switch (this.phase) {
      case 'title':
        this.phase = 'playing';
        this.showBriefCard();
        // One text from Dee, not five (ben, 2026-11-17: "D is sending me 15,000 messages").
        // The first scene's lessons are the coach's job, on the iPad.
        if (this.levelIndex === 0) {
          this.phone.text(
            'dee',
            this.immersive
              ? "wait. is that YOU holding a light?? 😂 don't panic. I'm in video village. follow the yellow"
              : "wait. is that YOU holding a light?? 😂 don't panic. I'm in video village. do what the iPad says",
          );
        } else {
          this.textDee();
        }
        break;
      case 'playing':
        if (this.coachStep && COACH_READING.has(this.coachStep.skill)) this.coachGotIt = true;
        break;
      case 'won':
        // The take rolls by itself on a match (updateRoll); the button only appears after Cut.
        if (this.takeTime >= TAKE_SECONDS) {
          this.loadLevel(this.levelIndex + 1);
          this.textDee();
        }
        break;
      case 'rolled':
        this.phase = 'credits';
        this.showCredits();
        break;
      case 'credits':
        this.phone.clear();
        this.loadLevel(0);
        this.phase = 'title';
        this.showTitleCard();
        break;
      default:
        break;
    }
  }

  /** Shows a page on the iPad. */
  private showPage(page: IPadPage): void {
    this.ipad.show(page);
    if (!this.ipadEntity) {
      return;
    }
    // The iPad is always pressable: its light switches work all through a scene.
    if (!this.ipadEntity.hasComponent(RayInteractable)) {
      this.ipadEntity.addComponent(RayInteractable);
    }
  }

  private pickDirectorLine(): string {
    let i = Math.floor(Math.random() * DIRECTOR_WINS.length);
    if (i === this.lastDirectorLine) {
      i = (i + 1) % DIRECTOR_WINS.length;
    }
    this.lastDirectorLine = i;
    return DIRECTOR_WINS[i];
  }

  private pickDeeWin(): string {
    let i = Math.floor(Math.random() * DEE_WINS.length);
    if (i === this.lastDeeWin) {
      i = (i + 1) % DEE_WINS.length;
    }
    this.lastDeeWin = i;
    return DEE_WINS[i];
  }

  /** The director says a line from beside the set. */
  private say(line: string, hold = false): void {
    devLog(`director says ${line}`);
    this.pendingLine = null;
    this.bubble.say('Director', line, hold);
  }

  /** The director turns to look at you, takes a beat, then says the line. */
  private sayToYou(line: string, hold = false): void {
    this.directorLooking = true;
    this.bubble.hide();
    this.pendingLine = { line, hold, wait: 0.9 };
  }

  /**
   * Turns the director's model (chair and all) toward the player while he is
   * looking at you, and back to the set otherwise; plays a line waiting on that turn.
   */
  private updateDirector(delta: number): void {
    if (this.houseIntroIn >= 0) {
      // Wall-clock time: the frame that loads a scene can take a second on its own,
      // which would otherwise eat the dark beat before anyone sees it.
      if (performance.now() >= this.houseIntroIn) {
        // Somebody hits the switch by the door. Cutting them later is still the player's job.
        this.houseIntroIn = -1;
        this.houseOn = true;
        this.houseEverOff = false;
        sfx.click();
        devLog('director hit the house lights');
        this.resetHold();
      }
    }
    if (this.pendingLine) {
      this.pendingLine.wait -= delta;
      if (this.pendingLine.wait <= 0) {
        const { line, hold } = this.pendingLine;
        this.say(line, hold);
      }
    }
    if (!this.directorModel) {
      this.directorModel = this.world.getSceneObject('crew-director-model') ?? this.stage.getObjectByName('crew-director-model') ?? undefined;
      if (!this.directorModel) return;
      this.directorYaw = this.directorModel.rotation.y;
    }
    const model = this.directorModel;
    this.directorBlend += ((this.directorLooking ? 1 : 0) - this.directorBlend) * (1 - Math.exp(-delta * 4));
    this.world.camera.getWorldPosition(this.v1);
    model.parent?.worldToLocal(this.v1);
    let turn = Math.atan2(this.v1.x - model.position.x, this.v1.z - model.position.z) - this.directorYaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    turn = MathUtils.clamp(turn, -1.3, 1.3);
    model.rotation.y = this.directorYaw + turn * this.directorBlend;
    // His chair turns with him (ben, round 10): the chair lives in the crew props group.
    if (!this.directorChair) {
      this.directorChair = this.stage.getObjectByName('crew-director-props') ?? this.world.scene.getObjectByName('crew-director-props') ?? undefined;
      if (this.directorChair) this.directorChairYaw = this.directorChair.rotation.y;
    }
    if (this.directorChair) this.directorChair.rotation.y = this.directorChairYaw + turn * this.directorBlend;
    // A little wobble while he talks, so you can tell who is speaking.
    this.directorTalkTime = this.bubble.speaking ? this.directorTalkTime + delta : 0;
    const wobble = this.bubble.speaking ? Math.min(1, this.directorTalkTime * 4) : 0;
    this.directorWobble += (wobble - this.directorWobble) * (1 - Math.exp(-delta * 8));
    const t = this.directorTalkTime;
    model.rotation.z = this.directorWobble * 0.05 * Math.sin(t * 7.3);
    model.rotation.x = this.directorWobble * 0.035 * Math.sin(t * 11.1 + 1);
  }

  /** The director's next line, after the one he is saying. */
  private sayNext(line: string, hold = false): void {
    this.bubble.then('Director', line, hold);
  }

  private showTitleCard(): void {
    this.bubble.hide();
    // The scene behind the title page waits dark; Go plays the director's lights-on beat.
    if (this.level.houseIntro) {
      this.houseIntroIn = -1;
      this.houseOn = this.level.houseStartsOn ?? true;
    }
    const headset = this.immersive;
    this.showPage({
      full: true,
      eyebrow: IS_BETA
        ? `Light Lab · Beta track${this.levelIndex > 0 ? ` · Starting at scene ${this.levelIndex + 1}` : ''}`
        : this.levelIndex > 0
        ? `Light Lab · Starting at scene ${this.levelIndex + 1}`
        : 'Light Lab',
      title: 'Six months as Background Extra #47.',
      body: 'Today is your last day on set. Then the lighting guy walks off the job, and the director points straight at you.',
      // No steps: the first lesson walks you through it (ben, 2026-11-18 morning).
      footer: IS_RESULT && !this.xrStatus
        ? 'RESULT BETA: one scene, judged only by how your shot looks. Any lights, anywhere. No bar.'
        : IS_BETA && !this.xrStatus
        ? 'BETA TRACK: every scene, new shots, no match bar. Match it by eye. The main game is unchanged.'
        : headset
        ? `${LEVELS.length === 10 ? 'Ten' : LEVELS.length} scenes. One soundstage. Zero qualifications.`
        : this.xrStatus
        ? this.xrStatus
        : this.canEnterXR
        ? 'In the headset browser? If it asks to allow immersive mode, press Allow first.'
        : `${LEVELS.length === 10 ? 'Ten' : LEVELS.length} scenes. Zero qualifications. On a Quest? Open this page there to play in VR.`,
      button2: this.canEnterXR && !headset ? 'Play in VR' : undefined,
      button: 'Go',
    });
  }

  private showBriefCard(): void {
    const level = this.level;
    // The iPad shows only the shots and the tip; the director gives the brief from the set.
    this.showPage({ eyebrow: this.sceneLabel(), body: '' });
    // One teacher at a time (ben, 2026-11-17: "the director talking at the same time as
    // you're going through the walkthrough of the iPad is kind of a lot"). While the coach
    // has something to teach, the director keeps quiet; his brief comes once it's done.
    const coaching = this.coachHasLesson();
    // The last scene's line doesn't linger over this one while he waits.
    if (coaching) {
      this.bubble.hide();
      this.pendingLine = null;
    }
    if (level.houseIntro && !this.houseOn) {
      // The scene opens dark and somebody hits the lights (ben, 2026-11-16: the kicked key
      // was hard to find in the dark). The director only grumbles about it if nobody's teaching.
      if (!coaching) this.say(level.houseIntro);
      this.houseIntroIn = performance.now() + HOUSE_INTRO_SECONDS * 1000;
    }
    this.briefPending = true;
    // Straight after his lights-on line, or over whatever the last scene left in his bubble.
    if (!coaching) this.giveBrief(level.houseIntro && this.houseIntroIn >= 0 ? 'after' : 'replace');
  }

  /** The director's brief: the scene's quote, then what to do. */
  private giveBrief(how: 'after' | 'replace' | 'wait' = 'wait'): void {
    if (!this.briefPending) return;
    this.briefPending = false;
    // 'after' his lights-on line; 'replace' a line the last scene left; 'wait' for one he's saying now.
    if (how === 'after' || (how === 'wait' && (this.bubble.speaking || this.pendingLine))) this.sayNext(this.level.quote);
    else this.say(this.level.quote);
    this.sayNext(this.level.objective);
  }

  /** Is there a lesson the coach would start teaching now? */
  private coachHasLesson(): boolean {
    return COACH_SKILLS.some((s) => !this.coachLearned.has(s) && this.coachNeeded(s));
  }

  /** The callout over the target shot: "Scene 3 of 10", or on the beta track "Beta 2/10 · Desert at noon". */
  private sceneLabel(): string {
    return IS_BETA
      ? `Beta ${this.levelIndex + 1}/${LEVELS.length} · ${this.level.title}`
      : `Scene ${this.levelIndex + 1} of ${LEVELS.length}`;
  }

  private showWinCard(retry: boolean): void {
    const last = this.levelIndex === LEVELS.length - 1;
    // No Roll button (ben, 2026-11-16): the director rolls by himself a few seconds after a match.
    this.showPage({ eyebrow: this.sceneLabel(), body: '' });
    // Just the gossip: Dee taught the why at the start of the scene (ben, round 11:
    // the lesson arrived after he'd won and rolled).
    if (this.level.after && !retry) {
      this.phone.text('dee', this.level.after);
    }
    const line = last
      ? '"Okay. Okay. Everybody quiet. Roll it."'
      : retry
      ? '"That\'s it. Nobody touch a thing."'
      : (this.level.directorWin ?? this.pickDirectorLine());
    this.sayToYou(line, true);
    this.rollIn = ROLL_DELAY;
  }

  /** Counts down to the director rolling on a matched shot. */
  private updateRoll(delta: number): void {
    if (this.rollIn < 0 || this.phase !== 'won') return;
    this.rollIn -= delta;
    if (this.rollIn > 0) return;
    this.rollIn = -1;
    if (this.levelIndex === LEVELS.length - 1) {
      this.rollFinale();
      this.takeTime = 0;
    } else {
      // Every scene gets its take: action, a few seconds of acting, Cut (ben, round 10).
      this.startTake();
    }
  }

  /**
   * The player touched the set (moved a light, flipped a switch, turned a dial). Between the
   * match and "Cut!" that ruins the take (ben, 2026-11-16): the crew act it out and the scene
   * goes back to playing, so matching it again rolls again.
   */
  private touchedSet(what?: Fixture | 'lamp' | 'house lights'): void {
    if (this.phase !== 'won' || this.takeTime >= TAKE_SECONDS) return;
    const rolling = this.takeTime >= ACTION_AT;
    devLog(`take blown (${rolling ? 'while rolling' : 'before action'})`);
    this.phase = 'playing';
    this.rollIn = -1;
    this.takeTime = -1;
    this.holdTime = 0;
    this.blownTime = 0;
    this.blownRolling = rolling;
    this.shownText = '';
    // Everyone stops acting.
    for (const person of this.actor?.visible ? [this.actor, ...this.extraActors] : this.extraActors) {
      person.rotation.z = 0;
      person.rotation.x = 0;
    }
    this.directorLooking = true;
    this.showPage({ eyebrow: this.sceneLabel(), body: '' });
    if (rolling) {
      // Name what was touched: a silk or a bounce card isn't a light (ben, 2026-11-18, desert).
      const thing = what === undefined ? 'that' : typeof what === 'string' ? `the ${what}` : SHAPERS.has(what.item.kind) ? `the ${KIND_NAMES[what.item.kind]}` : 'that light';
      this.say(`"CUT! CUT! Who touched ${thing}?!"`, true);
      this.phone.text('dee', "😬 they SAW that. once they roll, don't touch anything till Cut");
    } else {
      this.say('"Whoa, hands off! I was about to call action."', true);
    }
  }

  /** Plays out a blown take: the actor's blow-up, then the director resets for another go. */
  private updateBlown(delta: number): void {
    if (this.blownTime < 0) return;
    const before = this.blownTime;
    this.blownTime += delta;
    const t = this.blownTime;
    const cast = this.actor?.visible ? [this.actor, ...this.extraActors] : this.extraActors;
    if (this.blownRolling && before < BLOWN_TANTRUM_AT && t >= BLOWN_TANTRUM_AT) {
      if (cast.length) {
        let i = Math.floor(Math.random() * TANTRUMS.length);
        if (i === this.lastTantrum) i = (i + 1) % TANTRUMS.length;
        this.lastTantrum = i;
        // Over the first cast member's head.
        const box = new Box3().setFromObject(cast[0]);
        box.getCenter(this.castBubbleAt);
        this.castBubbleAt.y = box.max.y + BUBBLE_HEIGHT / 2 + 0.01;
        this.castBubble.say('Actor', TANTRUMS[i]);
      } else {
        this.sayNext('"Amateur hour over here."', true);
      }
    }
    // The actor throws a fit while the line is up.
    if (this.blownRolling && cast.length && this.castBubble.speaking) {
      const k = t - BLOWN_TANTRUM_AT;
      cast[0].rotation.z = 0.09 * Math.sin(k * 13);
      cast[0].rotation.x = 0.05 * Math.sin(k * 17 + 1);
    } else if (this.blownRolling && cast.length) {
      cast[0].rotation.z = 0;
      cast[0].rotation.x = 0;
    }
    const reset = this.blownRolling ? BLOWN_RESET_AT : BLOWN_WARNING_RESET_AT;
    if (before < reset && t >= reset) {
      this.directorLooking = false;
      this.say(this.blownRolling ? '"Back to one, people. Match the shot and we roll again."' : '"Match the shot again and we roll."');
    }
    if (t >= reset && !this.castBubble.speaking) {
      this.blownTime = -1;
      if (cast.length) {
        cast[0].rotation.z = 0;
        cast[0].rotation.x = 0;
      }
    }
  }

  /** The camera rolls on a won scene: the director calls action and the set comes alive. */
  private startTake(): void {
    this.takeTime = 0;
    this.takeVoice = 0;
    // He turns back to watch the set.
    this.directorLooking = false;
    devLog('take rolling');
    this.say('"Roll camera... and... ACTION!"');
    this.showPage({ eyebrow: 'Rolling', body: '' });
    this.ipad.setStatus(100, '', true);
  }

  /**
   * What happens on set during a take: the cast talk (sway and a "wa-wa" voice), the LED
   * wall scrolls the highway past the car, a tumbleweed blows across the desert. Cut after
   * TAKE_SECONDS, then the Next scene button.
   */
  private updateTake(delta: number): void {
    if (this.takeTime < 0) return;
    const before = this.takeTime;
    this.takeTime += delta;
    const t = this.takeTime - ACTION_AT;
    const acting = t > 0 && this.takeTime < TAKE_SECONDS;
    const cast = this.actor?.visible ? [this.actor, ...this.extraActors] : this.extraActors;
    cast.forEach((person, i) => {
      // The cast take turns: each one talks for a beat.
      const talking = acting && Math.floor(t / 1.4) % Math.max(1, cast.length) === i;
      const amount = talking ? 1 : 0;
      person.rotation.z = amount * 0.035 * Math.sin(t * 6.1 + i);
      person.rotation.x = amount * 0.03 * Math.sin(t * 9.3 + i * 2);
    });
    if (acting && Math.floor(t / 1.4) !== this.takeVoice - 1) {
      this.takeVoice = Math.floor(t / 1.4) + 1;
      sfx.mumble('wa wa wa wa wa', 210);
    }
    const set = this.set;
    if (set && acting) {
      const wall = set.getObjectByName('led-wall') as Mesh | undefined;
      const map = (wall?.material as MeshBasicMaterial | undefined)?.map;
      // The car drives camera-left, so the world streams past to the right.
      if (map) map.offset.x += delta * 0.09;
      const car = set.getObjectByName('car');
      if (car) {
        car.position.y = 0.0006 * Math.sin(t * 17);
        // The wheels spin as if it's driving (the real SUV model lists them).
        for (const wheel of (car.userData.wheels as Object3D[] | undefined) ?? []) wheel.rotation.x -= delta * 14;
      }
      const weed = set.getObjectByName('tumbleweed');
      if (weed) {
        weed.visible = true;
        // Across the back of the shot, bouncing, in about four seconds.
        weed.position.x = -0.3 + t * 0.14;
        weed.position.y = 0.02 + Math.abs(Math.sin(t * 4.5)) * 0.014;
        weed.rotation.z = -t * 6;
      }
    }
    if (before < TAKE_SECONDS && this.takeTime >= TAKE_SECONDS && this.phase === 'won') {
      this.say('"...CUT! That\'s a print. Moving on."');
      // No Next scene button (ben, 2026-11-18: redundant): the next scene loads by itself a beat
      // later. Tests that hold the scene (setAutoNext(false)) get the button back.
      this.showPage({ eyebrow: this.sceneLabel(), body: '', button: this.autoNext ? undefined : 'Next scene' });
      this.nextIn = this.autoNext ? AUTO_NEXT_SECONDS : -1;
    }
    if (this.nextIn > 0 && this.phase === 'won') {
      this.nextIn -= delta;
      if (this.nextIn <= 0) {
        this.nextIn = -1;
        devLog('next scene by itself after Cut');
        this.loadLevel(this.levelIndex + 1);
        this.textDee();
      }
    }
  }

  private rollFinale(): void {
    this.phase = 'rolled';
    this.phone.setStep('finale');
    if (this.greenScreen) {
      const plate = paintLakeComo();
      this.greenScreen.material = new MeshBasicMaterial({ map: plate, toneMapped: false });
      this.set?.traverse((child) => {
        if (child.name === 'tracking-mark') {
          child.visible = false;
        }
      });
    }
    this.renderTargetShot();
    this.ipad.setStatus(100, '', true);
    if (!this.greenScreen && IS_RESULT) {
      this.say('"Print it. That\'s the one."', true);
      this.phone.text('dee', 'you matched it by LOOKING at it. that\'s literally the job');
      this.showPage({ eyebrow: 'Rolling', body: '', button: 'Take a bow' });
      return;
    }
    if (!this.greenScreen) {
      // A track that doesn't end on Lake Como ends on the car commercial's lines.
      this.say('"Print it. That\'s the commercial."', true);
      this.sayNext('"And somebody get that dog an agent."', true);
      this.phone.text('dee', 'the client is crying. the DOG is trending 🐶');
      this.showPage({ eyebrow: 'Rolling', body: '', button: 'Take a bow' });
      return;
    }
    this.say('"Is that... Lake Como? I\'m crying. Who ARE you?"', true);
    this.sayNext('"Background Extra #47, would you come to the front, please."', true);
    this.phone.text('dee', 'THE GREEN SCREEN IS LAKE COMO NOW and the light on their faces matches 😭😭');
    this.showPage({
      eyebrow: 'Rolling',
      body: '',
      button: 'Take a bow',
    });
  }

  private showCredits(): void {
    this.bubble.hide();
    this.showPage({
      full: true,
      eyebrow: "That's a wrap",
      title: 'LUCKY BREAK',
      body: IS_RESULT
        ? 'Result beta complete. Judged by the picture, not by where the lights stood.'
        : IS_BETA
        ? 'Blind track complete. Every scene, a new shot each time, no match bar: you lit it all by eye.'
        : 'Starring you, formerly Background Extra #47, now Gaffer. Dimmers, key, fill, back light, product, a desert silk, practicals, low-key, an LED volume, magic hour and green screen: all yours.',
      footer: 'A film by ben, lit by you.',
      button: 'Play again',
    });
  }

  // --- Fixtures and switches -------------------------------------------------

  /** A small power switch with a status LED on the light's yoke: green when on. */
  private makeLed(object: Object3D): MeshStandardMaterial {
    const box = new Mesh(new BoxGeometry(0.006, 0.004, 0.003), new MeshStandardMaterial({ color: '#1b1b1e', roughness: 0.6 }));
    box.name = 'fixture-switch';
    box.position.set(0, -0.016, 0.004);
    const led = new MeshStandardMaterial({ color: '#111', emissive: '#3a1010', emissiveIntensity: 2 });
    const dot = new Mesh(new BoxGeometry(0.0018, 0.0018, 0.0008), led);
    dot.position.set(0, 0, 0.0018);
    box.add(dot);
    object.add(box);
    return led;
  }

  /** An invisible press target at a world position, for the mouse, a ray or a poke. */
  private createSwitch(worldPosition: Vector3, size: number, toggle: () => void, visual?: Object3D): Switch {
    const hit =
      visual ??
      new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    if (!visual) {
      hit.position.copy(worldPosition);
    }
    const entity = this.world.createTransformEntity(hit);
    entity.addComponent(RayInteractable);
    const sw: Switch = { entity, hit, toggle, pressed: false };
    this.switches.push(sw);
    return sw;
  }

  private removeSwitch(sw: Switch): void {
    this.switches = this.switches.filter((s) => s !== sw);
    sw.entity.dispose();
  }

  private updateSwitches(): void {
    // In the headset the input system marks a switch Pressed (ray or poke);
    // in the browser the mouse handlers below press it.
    for (const sw of this.switches) {
      const pressed = this.immersive && sw.entity.hasComponent(Pressed);
      if (pressed && !sw.pressed) {
        sw.toggle();
      }
      sw.pressed = pressed;
    }
    // The iPad's own controls are handled by its pointer listener (it needs the hit point).

    this.setHouseLights(this.houseOn);
    this.updateHouseSwitchPlate();
    if (this.wallSwitch) {
      // Rocker up = on. The pilot glows while the lights are off, to find it in the dark.
      this.wallSwitch.rocker.rotation.z = this.houseOn ? 0.22 : -0.22;
      this.wallSwitch.pilot.emissiveIntensity = this.houseOn ? 0 : 6;
    }
    if (this.practical) {
      this.practical.shade.emissiveIntensity = this.practical.on ? 1.4 : 0;
      this.practical.bulb.intensity = this.practical.on ? 0.06 : 0;
    }
  }

  private setHouseLights(on: boolean): void {
    this.houseLights.forEach((light, i) => {
      light.intensity = on ? this.houseIntensity[i] : 0;
    });
    if (this.houseBulb) this.houseBulb.emissiveIntensity = on ? 2.2 : 0.02;
  }

  private resetHold(): void {
    this.holdTime = 0;
  }

  private toggle(fixture: Fixture): void {
    // A silk or bounce card has no switch.
    if (SHAPERS.has(fixture.item.kind)) return;
    devLog(`light ${fixture.item.kind} switched ${fixture.on ? 'off' : 'on'}`);
    fixture.on = !fixture.on;
    this.touchedFixture = fixture;
    sfx.lightSwitch(fixture.on);
    this.resetHold();
    this.touchedSet(fixture);
  }

  private toggleHouse(): void {
    this.houseOn = !this.houseOn;
    if (!this.houseOn) this.houseEverOff = true;
    devLog(`house lights ${this.houseOn ? 'on' : 'off'}`);
    this.resetHold();
    this.touchedSet('house lights');
  }

  /** Turns a bi-color light's dial one stop warmer (-1) or cooler (+1). */
  private turnDial(fixture: Fixture, step: 1 | -1): void {
    if (!fixture.item.dial) return;
    const i = KELVIN_STEPS.indexOf(fixture.kelvin);
    const next = KELVIN_STEPS[MathUtils.clamp((i < 0 ? KELVIN_STEPS.length - 1 : i) + step, 0, KELVIN_STEPS.length - 1)];
    if (next !== fixture.kelvin) sfx.dialTick(next > fixture.kelvin);
    this.touchedFixture = fixture;
    this.setKelvin(fixture, next);
    this.touchedSet(fixture);
  }

  private setKelvin(fixture: Fixture, kelvin: number): void {
    fixture.kelvin = kelvin;
    applyKelvin(fixture.spot, fixture.item.kind, kelvin);
    if (fixture.face) {
      const warm = MathUtils.clamp((KELVIN_MAX - kelvin) / (KELVIN_MAX - KELVIN_MIN), 0, 1);
      fixture.face.emissive.set('#ffffff').lerp(CTO_TINT, warm);
    }
    devLog(`light ${fixture.item.kind} dialed to ${kelvin}K`);
    this.resetHold();
  }

  /** Turns a light's dimmer one stop down (-1) or up (+1). */
  private turnDimmer(fixture: Fixture, step: 1 | -1): void {
    if (!fixture.item.dimmer) return;
    const was = fixture.dimmer;
    this.touchedFixture = fixture;
    fixture.dimmer = MathUtils.clamp(Math.round((fixture.dimmer + step * DIMMER_STEP) * 10) / 10, DIMMER_STEP, 1);
    if (fixture.dimmer !== was) sfx.dimmerTick(fixture.dimmer > was);
    devLog(`light ${fixture.item.kind} dimmed to ${Math.round(fixture.dimmer * 100)}%`);
    this.resetHold();
    this.touchedSet(fixture);
  }

  /** Builds the iPad's light row for the scene: HOUSE, each light in the kit, then the lamp. */
  private buildLightButtons(): void {
    const screens = this.level.kit.filter((item) => item.aim === 'screen').length;
    let screenN = 0;
    this.lightButtons = [];
    this.buttonTargets = [];
    // Outdoors there are no house lights to switch.
    if (!this.level.outdoor) {
      this.lightButtons.push({ label: 'HOUSE', on: this.houseOn });
      this.buttonTargets.push('house');
    }
    for (const fixture of this.fixtures) {
      const item = fixture.item;
      // Silks and bounce cards have no switch: they work once they're on the set.
      if (SHAPERS.has(item.kind)) continue;
      this.buttonTargets.push(fixture);
      let label = KIND_LABELS[item.kind];
      if (item.aim === 'screen') {
        screenN += 1;
        label = screens > 1 ? `Screen ${screenN}` : 'Screen';
      }
      this.lightButtons.push({
        label,
        on: fixture.on,
        kelvin: item.dial ? fixture.kelvin : undefined,
        dimmer: item.dimmer ? fixture.dimmer : undefined,
      });
    }
    if (this.practical) {
      this.lightButtons.push({ label: 'Lamp', on: this.practical.on });
      this.buttonTargets.push('lamp');
    }
  }

  /** Copies the lights' state onto the iPad's switches (no allocation unless something changed). */
  private updateLightButtons(): void {
    const buttons = this.lightButtons;
    if (buttons.length === 0) return;
    this.buttonTargets.forEach((target, i) => {
      const button = buttons[i];
      if (!button) return;
      if (target === 'house') {
        button.on = this.houseOn;
      } else if (target === 'lamp') {
        button.on = this.practical?.on ?? false;
      } else {
        button.on = target.on;
        if (button.kelvin !== undefined) button.kelvin = target.kelvin;
        if (button.dimmer !== undefined) button.dimmer = target.dimmer;
      }
    });
    const highlight = this.hovered ? this.buttonTargets.indexOf(this.hovered) : -1;
    this.ipad.setLights(this.ipad.isFull ? [] : buttons, highlight);
  }

  /** Acts on a press on the iPad. */
  /**
   * "Play in VR": asks for passthrough (the dollhouse on your desk) and falls
   * back to plain VR when that fails, e.g. on a Quest 1 (ben, round 6: the
   * button did nothing on his Quest 1 while Go worked). If neither starts, the
   * browser's reason shows on the title page so we can see why.
   */
  private enterHeadset(modes: SessionMode[] = this.xrModes.length ? this.xrModes : [SessionMode.ImmersiveVR]): void {
    const [mode, ...rest] = modes;
    devLog(`asking the browser for ${mode}`);
    // launchXR reports a refused request only on the console; catch that one message.
    const consoleError = console.error;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      console.error = consoleError;
    };
    console.error = (...args: unknown[]) => {
      consoleError(...args);
      if (typeof args[0] === 'string' && args[0].startsWith('[XR] Failed to start XR session')) {
        restore();
        const reason = args[1] instanceof Error ? `${args[1].name}: ${args[1].message}` : String(args[1]);
        if (rest.length) {
          // launchXR clears its pending flag just after it reports, so retry on the next tick.
          setTimeout(() => this.enterHeadset(rest), 0);
        } else {
          this.xrStatus = `VR didn't start (${reason.slice(0, 90)}). Try the browser's own VR button, or reload.`;
          if (this.phase === 'title' && !this.immersive) this.showTitleCard();
        }
      }
    };
    setTimeout(restore, 8000);
    this.xrStatus = '';
    if (this.world.sessionRequestPending) {
      // An earlier press is still waiting on the browser; launchXR would ignore this one.
      restore();
      this.xrStatus = 'Still waiting for the browser to start VR... check for a prompt, or reload.';
      if (this.phase === 'title') this.showTitleCard();
      return;
    }
    try {
      this.world.launchXR({ sessionMode: mode });
    } catch (error) {
      restore();
      this.xrStatus = `VR didn't start (${String(error).slice(0, 90)}).`;
      if (this.phase === 'title') this.showTitleCard();
    }
  }

  private pressIpad(control: IPadControl): void {
    if (control.type === 'main') {
      this.pressCard();
    } else if (control.type === 'second') {
      this.enterHeadset();
    } else if (control.type === 'size') {
      this.zoomIpad(control.step);
    } else if (control.type === 'light') {
      const target = this.buttonTargets[control.index];
      if (target === 'house') {
        this.toggleHouse();
      } else if (target === 'lamp') {
        this.practical?.switch.toggle();
      } else if (target) {
        this.toggle(target);
      }
    } else if (control.type === 'warmer' || control.type === 'cooler') {
      const fixture = this.buttonTargets[control.index];
      if (fixture && typeof fixture !== 'string') this.turnDial(fixture, control.type === 'warmer' ? -1 : 1);
    } else if (control.type === 'dimmer' || control.type === 'brighter') {
      const fixture = this.buttonTargets[control.index];
      if (fixture && typeof fixture !== 'string') this.turnDimmer(fixture, control.type === 'dimmer' ? -1 : 1);
    }
  }

  private zoomIpad(step: 1 | -1): void {
    this.ipadZoom = MathUtils.clamp(Math.round((this.ipadZoom + step * 0.15) * 100) / 100, 0.7, 1.6);
    saveZoom(this.ipadZoom);
    devLog(`iPad size ${this.ipadZoom}`);
  }

  private updateGrab(fixture: Fixture, delta: number): void {
    // In the browser the mouse moves lights, not the grab system. In the
    // headset a light is "held" while it is grabbed (squeeze, or a hand pinch)
    // or pressed with a ray (controller trigger, or a hand pinch).
    const grabbed = this.immersive && fixture.entity.hasComponent(Grabbed);
    const held = grabbed || (this.immersive && fixture.entity.hasComponent(Pressed));
    if (held) {
      if (fixture.grabTime === 0) {
        fixture.grabStart.copy(fixture.local);
      }
      fixture.grabTime += Math.max(delta, 1e-4);
      // A rigged light (LevelDef.locked) snaps back: it can be tapped and dimmed, not moved.
      if (grabbed && !this.level.locked) {
        this.touchedFixture = fixture;
        fixture.object.getWorldPosition(this.v1);
        fixture.local.copy(this.stage.worldToLocal(this.v1));
        // Moving a light while they roll ruins the take (a quick tap is a switch flip, caught
        // there). Measured from where it stood at the match, with room for a steady hand that
        // is still holding it when the shot matches.
        if (this.phase === 'won' && fixture.local.distanceTo(fixture.rollFrom) > ROLL_MOVE_SLACK) this.touchedSet(fixture);
        return;
      }
    } else if (fixture.grabTime > 0) {
      devLog(`light ${fixture.item.kind} released after ${fixture.grabTime.toFixed(2)} s, moved ${fixture.local.distanceTo(fixture.grabStart).toFixed(3)} m`);
      // A quick press or pinch that barely moved the light is a tap on its switch. Not in the
      // headset: there the switch floats over the light, and pinching a light only moves it (ben).
      if (!this.dockReady && fixture.grabTime < TAP_SECONDS && fixture.local.distanceTo(fixture.grabStart) < TAP_MAX_MOVE) {
        fixture.local.copy(fixture.grabStart);
        this.toggle(fixture);
      }
      fixture.grabTime = 0;
    }
    this.clampToSet(fixture.local, fixture.item.kind);
    this.placeFixture(fixture);
  }

  private clampToSet(local: Vector3, kind?: FixtureKind): void {
    local.x = MathUtils.clamp(local.x, -BOUNDS_X, BOUNDS_X);
    // The overhead silk always flies above everyone's heads, parked or rigged, so its
    // frame never cuts through the cast or crew (ben, round 10: "the silk is going through people").
    local.y = MathUtils.clamp(local.y, kind === 'silk' ? SILK_MIN_HEIGHT : MIN_HEIGHT, MAX_HEIGHT);
    local.z = MathUtils.clamp(local.z, BOUNDS_BACK, BOUNDS_FRONT);
    // Push the light out of the cast if it was dropped on top of them.
    for (const actor of this.level.actors) {
      const dx = local.x - actor.pos[0];
      const dz = local.z - actor.pos[2];
      const flat = Math.hypot(dx, dz);
      if (flat < SUBJECT_CLEARANCE && local.y < HEAD_HEIGHT + 0.03) {
        const scale = SUBJECT_CLEARANCE / Math.max(flat, 1e-4);
        local.x = actor.pos[0] + (flat > 1e-4 ? dx * scale : SUBJECT_CLEARANCE);
        local.z = actor.pos[2] + (flat > 1e-4 ? dz * scale : 0);
      }
    }
  }

  private placeFixture(fixture: Fixture): void {
    this.v1.copy(fixture.local);
    this.stage.localToWorld(this.v1);
    const parent = fixture.object.parent;
    if (parent) {
      parent.worldToLocal(this.v1);
    }
    fixture.object.position.copy(this.v1);
  }

  private updateAim(): void {
    this.aimWorld.copy(this.aimLocal);
    this.stage.localToWorld(this.aimWorld);
    this.screenWorld.copy(SCREEN_CENTER);
    this.stage.localToWorld(this.screenWorld);
  }

  private updateFixture(fixture: Fixture): void {
    if (fixture.item.kind === 'silk') {
      // A butterfly frame: two stands at its sides, down to the ground; no center stand.
      fixture.pole.visible = false;
      fixture.base.visible = false;
      const h = Math.max(fixture.local.y, 0.01);
      fixture.head.traverse((child) => {
        if (child.name === 'silk-leg') {
          child.scale.y = h;
          child.position.y = -h / 2;
        }
      });
    } else if (this.hangs(fixture.local.y)) {
      // High up, the light hangs from the grid: the pipe runs up to the ceiling.
      const poleLength = Math.max(STAGE_HEIGHT - fixture.local.y - 0.012, 0.001);
      fixture.pole.scale.y = poleLength;
      fixture.pole.position.y = 0.012 + poleLength / 2;
      fixture.base.visible = false;
      if (fixture.yoke) fixture.yoke.rotation.z = Math.PI;
    } else {
      // Stretch the stand from the yoke down to the floor.
      const height = Math.max(fixture.local.y, 0.014);
      const poleLength = Math.max(height - 0.012, 0.001);
      fixture.pole.scale.y = poleLength;
      fixture.pole.position.y = -0.012 - poleLength / 2;
      fixture.base.position.y = -height;
      fixture.base.visible = true;
      fixture.pole.visible = true;
      if (fixture.yoke) fixture.yoke.rotation.z = 0;
    }

    const aim = fixture.item.aim === 'screen' ? this.screenWorld : this.aimWorld;
    const kind = fixture.item.kind;
    if (kind === 'silk') {
      // A silk stays level over the cast; it isn't aimed like a light.
      fixture.head.rotation.set(0, 0, 0);
    } else {
      fixture.head.lookAt(aim);
    }
    fixture.object.getWorldPosition(this.v1);
    fixture.spot.visible = fixture.on;
    fixture.spot.position.copy(this.v1);
    fixture.spot.target.position.copy(aim);
    fixture.spot.target.updateMatrixWorld();
    if (fixture.item.dimmer) {
      const quality = LIGHT_QUALITY[kind];
      const warm = MathUtils.clamp((KELVIN_MAX - fixture.kelvin) / (KELVIN_MAX - KELVIN_MIN), 0, 1);
      fixture.spot.intensity = quality.intensity * (1 + 0.4 * warm) * dimmerGain(fixture.dimmer);
    }
    if (fixture.face) {
      const glow = fixture.item.dimmer ? 0.3 + 0.7 * fixture.dimmer : 1;
      if (kind === 'silk') {
        // The fabric is always on the frame (ben, round 11: "the silk should have silk on
        // it no matter where it is"). Rigged over the set, it glows with the sun it softens.
        fixture.face.emissiveIntensity = fixture.on ? 0.25 : 0;
        // Headset: parked behind the tape it hangs right between your eyes and the set, so the
        // whole scene opened behind a white sheet. The fabric stays on the frame, but see-through
        // until it's rigged (0.88 is the fabric's own opacity in the kit model).
        fixture.face.opacity = fixture.on || !this.dockReady ? 0.88 : 0.28;
        // Parked off the set it doesn't shade anything (scoring counts it only once rigged).
        const fabric = fixture.head.getObjectByName('fixture-face');
        if (fabric) fabric.castShadow = fixture.on;
      } else if (kind === 'bounce') {
        // Set below: a bounce card is always catching sun.
      } else {
        fixture.face.emissiveIntensity = fixture.on ? 1.6 * glow : 0;
      }
    }
    if (kind === 'bounce') {
      // A bounce card is never "off" (ben, 2026-11-15): wherever it stands it throws back
      // the sun hitting it, fading with distance like any light. Only a silk's shade cuts it.
      fixture.lit = this.sunOnCard(fixture);
      const sun = SILK_PASSES + (1 - SILK_PASSES) * fixture.lit;
      fixture.spot.visible = true;
      fixture.spot.intensity = LIGHT_QUALITY.bounce.intensity * sun;
      if (fixture.face) {
        fixture.face.color.set('#f4f1ea');
        fixture.face.emissiveIntensity = 0.35 * sun;
      }
    }
    fixture.led.emissive.set(fixture.on ? '#4ade80' : '#3a1010');
  }

  /** The sun's direction (toward the sun) in stage-local space, or undefined indoors. */
  private sunDirection(): Vector3 | undefined {
    if (this.sunLight === undefined) {
      const sun = this.set?.getObjectByName('sun');
      this.sunLight = sun instanceof DirectionalLight ? sun : null;
    }
    const sun = this.sunLight;
    if (!sun) return undefined;
    sun.getWorldPosition(this.sunDir);
    sun.target.getWorldPosition(this.v6);
    this.stage.worldToLocal(this.sunDir);
    this.stage.worldToLocal(this.v6);
    return this.sunDir.sub(this.v6).normalize();
  }

  /** How much of the bounce card's face is out in the sun (1) rather than in a rigged silk's shade (0). */
  private sunOnCard(fixture: Fixture): number {
    const silk = this.fixtures.find((f) => f.item.kind === 'silk' && f.on);
    if (!silk) return 1;
    const toSun = this.sunDirection();
    if (!toSun || toSun.y <= 0) return 1;
    fixture.head.updateWorldMatrix(true, false);
    const half = SILK_SIZE / 2;
    let lit = 0;
    for (const [a, b] of CARD_SAMPLES) {
      const p = fixture.head.localToWorld(this.v5.set(a, b, 0));
      this.stage.worldToLocal(p);
      const rise = silk.local.y - p.y;
      if (rise <= 0) {
        lit++;
        continue;
      }
      // Follow the sun ray up to the silk's height: does it pass through the fabric?
      const t = rise / toSun.y;
      const x = p.x + toSun.x * t - silk.local.x;
      const z = p.z + toSun.z * t - silk.local.z;
      if (Math.abs(x) > half || Math.abs(z) > half) lit++;
    }
    return lit / CARD_SAMPLES.length;
  }

  /** Does a light this high hang from the grid? Outdoors there is no grid: everything stands. */
  private hangs(y: number): boolean {
    return y >= HANG_HEIGHT && !this.level.outdoor;
  }

  /** A stage-local light position as an orbit around the aim point: azimuth 0 is the camera side, negative is camera-left. */
  private poseOf(local: Vector3): Pose {
    const x = local.x - this.aimLocal.x;
    const y = local.y - this.aimLocal.y;
    const z = local.z - this.aimLocal.z;
    const distance = Math.max(Math.hypot(x, y, z), 1e-4);
    return {
      azimuth: MathUtils.radToDeg(Math.atan2(x, z)),
      elevation: MathUtils.radToDeg(Math.asin(MathUtils.clamp(y / distance, -1, 1))),
      distance,
    };
  }

  /** Where a role's light belongs, in stage-local meters. */
  private roleLocal(role: Role, out: Vector3): Vector3 {
    if (role.pos) {
      return out.set(...role.pos);
    }
    const { az, el, d } = role.orbit!;
    const azR = MathUtils.degToRad(az);
    const elR = MathUtils.degToRad(el);
    return out.set(
      this.aimLocal.x + d * Math.sin(azR) * Math.cos(elR),
      this.aimLocal.y + d * Math.sin(elR),
      this.aimLocal.z + d * Math.cos(azR) * Math.cos(elR),
    );
  }

  // --- Camera shots ----------------------------------------------------------

  private aimShotCamera(): void {
    this.lens.getWorldPosition(this.lensWorld);
    this.shotCamera.position.copy(this.lensWorld);
    this.shotCamera.lookAt(this.aimWorld.x, this.aimWorld.y - 0.004, this.aimWorld.z);
    this.shotCamera.updateMatrixWorld();
  }

  /**
   * Renders the cine camera's view. The monitor, the card and the camera body
   * (the shot camera sits inside its lens) are hidden; lights stay visible in
   * the live shot, so a light parked in frame shows up just as it would on a
   * real set.
   */
  private renderShot(into: WebGLRenderTarget, showFixtures: boolean): void {
    const renderer = this.world.renderer;
    const previousTarget = renderer.getRenderTarget();
    const xrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;
    const ipadVisible = this.ipad.object.visible;
    this.ipad.object.visible = false;
    // The headset's sign shows this very picture: never draw it into itself.
    const signVisible = this.sign?.group.visible ?? false;
    const stripVisible = this.strip?.mesh.visible ?? false;
    const panelVisible = this.panel?.group.visible ?? false;
    if (this.sign) this.sign.group.visible = false;
    if (this.strip) this.strip.mesh.visible = false;
    if (this.panel) this.panel.group.visible = false;
    const bubbleVisible = this.bubble.mesh.visible;
    this.bubble.mesh.visible = false;
    const castBubbleVisible = this.castBubble.mesh.visible;
    this.castBubble.mesh.visible = false;
    const phoneVisible = this.phone.mesh.visible;
    this.phone.mesh.visible = false;
    this.cameraRig.visible = false;
    for (const fixture of this.fixtures) {
      fixture.object.visible = showFixtures;
      if (fixture.handle) {
        fixture.handle.visible = false;
      }
    }
    // In the headset the scene has no background (the room shows through), but an
    // outdoor shot on the monitor still needs its sky.
    const background = this.world.scene.background;
    if (!background && this.level.outdoor) this.world.scene.background = this.backdrop;
    try {
      renderer.setRenderTarget(into);
      renderer.render(this.world.scene, this.shotCamera);
    } finally {
      this.world.scene.background = background;
      renderer.setRenderTarget(previousTarget);
      for (const fixture of this.fixtures) {
        fixture.object.visible = true;
        if (fixture.handle) {
          fixture.handle.visible = true;
        }
      }
      this.cameraRig.visible = true;
      this.bubble.mesh.visible = bubbleVisible;
      this.castBubble.mesh.visible = castBubbleVisible;
      this.phone.mesh.visible = phoneVisible;
      this.ipad.object.visible = ipadVisible;
      if (this.sign) this.sign.group.visible = signVisible;
      if (this.strip) this.strip.mesh.visible = stripVisible;
      if (this.panel) this.panel.group.visible = panelVisible;
      renderer.xr.enabled = xrEnabled;
    }
  }

  /** The target: only the right lights, in the right spots, house lights off, no gear in frame. */
  private renderTargetShot(): void {
    for (const fixture of this.fixtures) {
      fixture.spot.visible = false;
    }
    this.setHouseLights(false);
    const practicalWasOn = this.practical?.on ?? false;
    if (this.practical) {
      this.practical.bulb.intensity = 0.06;
      this.practical.shade.emissiveIntensity = 1.4;
    }
    this.level.roles.forEach((role, i) => {
      const spot = this.targetSpots[i];
      this.roleLocal(role, this.v1);
      this.stage.localToWorld(this.v1);
      spot.position.copy(this.v1);
      spot.target.position.copy(role.aim === 'screen' ? this.screenWorld : this.aimWorld);
      spot.target.updateMatrixWorld();
      spot.visible = true;
    });
    if (this.targetSilk) this.targetSilk.visible = true;
    try {
      this.renderShot(this.targetShot, false);
    } finally {
      if (this.targetSilk) this.targetSilk.visible = false;
      for (const spot of this.targetSpots) {
        spot.visible = false;
      }
      for (const fixture of this.fixtures) {
        fixture.spot.visible = fixture.on;
      }
      this.setHouseLights(this.houseOn);
      if (this.practical) {
        this.practical.bulb.intensity = practicalWasOn ? 0.06 : 0;
        this.practical.shade.emissiveIntensity = practicalWasOn ? 1.4 : 0;
      }
    }
  }

  // --- Score -------------------------------------------------------------------

  private fits(role: Role, fixture: Fixture): boolean {
    return (
      role.kinds.includes(fixture.item.kind) &&
      (role.warm ? fixture.kelvin <= WARM_MAX_K : fixture.kelvin >= NEUTRAL_MIN_K) &&
      (role.aim ?? 'cast') === (fixture.item.aim ?? 'cast')
    );
  }

  private roleFit(role: Role, local: Vector3): number {
    return Math.exp(this.roleLogFit(role, local));
  }

  /** log of roleFit: never flat, so tips still know which way to go when the light is far off. */
  private roleLogFit(role: Role, local: Vector3): number {
    if (role.pos) {
      const d = local.distanceTo(this.v2.set(...role.pos));
      return -((Math.max(0, d - 0.01) / POSITION_TOLERANCE) ** 2);
    }
    const pose = this.poseOf(local);
    const { az, el, d } = role.orbit!;
    let dAz = Math.abs(pose.azimuth - az);
    dAz = Math.min(dAz, 360 - dAz);
    const dEl = pose.elevation - el;
    const dDist = Math.log(pose.distance / d);
    return -((dAz / 25) ** 2) - (dEl / 20) ** 2 - (dDist / 0.35) ** 2;
  }

  /**
   * Where the lighting jobs sit in the shot, in picture pixels (y down): the two halves of
   * the face (one is the key side, the other the shadow side) and the top of the head (the
   * back light's rim). Projected from the head's position, so it follows the actor.
   */
  private resultZones(): { left: number[]; right: number[]; rim: number[] } {
    const v = this.v1;
    const px = (x: number, y: number) => {
      v.set(this.aimLocal.x + x, this.aimLocal.y + y, this.aimLocal.z);
      this.stage.localToWorld(v);
      v.project(this.shotCamera);
      return [((v.x + 1) / 2) * SHOT_W, ((1 - v.y) / 2) * SHOT_H];
    };
    const [cx, cy] = px(0, 0);
    const hw = Math.abs(px(HEAD_HALF_WIDTH, 0)[0] - cx);
    const hh = Math.abs(px(0, HEAD_HALF_WIDTH)[1] - cy);
    return {
      left: [cx - 0.85 * hw, cy - 0.55 * hh, cx - 0.1 * hw, cy + 0.95 * hh],
      right: [cx + 0.1 * hw, cy - 0.55 * hh, cx + 0.85 * hw, cy + 0.95 * hh],
      rim: [cx - 0.8 * hw, cy - 1.3 * hh, cx + 0.8 * hw, cy - 0.85 * hh],
    };
  }

  /** Mean linear brightness of each job's zone in a rendered shot. */
  private readResult(rt: WebGLRenderTarget): ResultReading {
    this.world.renderer.readRenderTargetPixels(rt, 0, 0, SHOT_W, SHOT_H, this.resultPixels);
    const zones = this.resultZones();
    const mean = ([x0, y0, x1, y1]: number[]): number => {
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, Math.round(y0)); y < Math.min(SHOT_H, Math.round(y1)); y++) {
        const row = (SHOT_H - 1 - y) * SHOT_W; // the read comes back bottom row first
        for (let x = Math.max(0, Math.round(x0)); x < Math.min(SHOT_W, Math.round(x1)); x++) {
          const i = (row + x) * 4;
          sum += 0.2126 * SRGB_TO_LINEAR[this.resultPixels[i]] + 0.7152 * SRGB_TO_LINEAR[this.resultPixels[i + 1]] + 0.0722 * SRGB_TO_LINEAR[this.resultPixels[i + 2]];
          n++;
        }
      }
      return Math.max(sum / Math.max(n, 1), 1e-4);
    };
    return { left: mean(zones.left), right: mean(zones.right), rim: mean(zones.rim) };
  }

  /**
   * The result track's win check (ben, 2026-11-09): compare how the two pictures look,
   * only where this shot's lights do their jobs. Key = the brighter side of his face in
   * the target; contrast = key side against shadow side; back light = the rim on his hair.
   * Each must be within a third of a stop of the target (that scores 85, the win line),
   * whichever lights did it and wherever they stand.
   */
  private evaluateResult(): { score: number; hint: string; fixture?: Fixture } {
    const t = this.resultTarget;
    const l = this.resultLive;
    if (!t || !l) return { score: 0, hint: '' };
    const keyRight = t.right >= t.left;
    const tKey = keyRight ? t.right : t.left;
    const tShadow = keyRight ? t.left : t.right;
    const lKey = keyRight ? l.right : l.left;
    const lShadow = keyRight ? l.left : l.right;
    const errs = [Math.log2(lKey / tKey), Math.log2(lKey / lShadow / (tKey / tShadow)), Math.log2(l.rim / t.rim)];
    const worst = Math.max(...errs.map(Math.abs));
    let score = Math.round(MathUtils.clamp(100 - 45 * worst, 0, 100));
    if (this.framedFixture()) score = Math.min(score, 40);
    return { score, hint: '' };
  }

  /** Matches switched-on lights to the scene's roles and scores the setup, with one hint. */
  private evaluate(): { score: number; hint: string; fixture?: Fixture } {
    if (IS_RESULT) return this.evaluateResult();
    const level = this.level;
    const on = this.fixtures.filter((f) => f.on);
    // Best assignment of switched-on lights to roles, so two lights of the same
    // kind (say the left and right SCREEN panels) each count for the role whose
    // spot they are actually in, whichever was switched on first.
    const choice = this.bestAssignment(level.roles, on);
    const used = new Set<Fixture>();
    const assigned: { role: Role; fixture?: Fixture; fit: number; place: number; dim: number }[] = level.roles.map((role, i) => {
      const fixture = choice[i];
      if (fixture) used.add(fixture);
      const place = fixture ? this.roleFit(role, fixture.local) : 0;
      const dim = fixture ? this.dimmerFit(role, fixture) : 0;
      // A bounce card in the silk's shade has little sun to throw back.
      const sun = fixture?.item.kind === 'bounce' ? SILK_PASSES + (1 - SILK_PASSES) * fixture.lit : 1;
      return { role, fixture, fit: place * dim * sun, place, dim };
    });
    const extras = on.filter((f) => !used.has(f));
    let fit = assigned.reduce((sum, a) => sum + a.fit, 0) / Math.max(assigned.length, 1);
    fit *= Math.pow(0.6, extras.length);
    let score = Math.round(fit * 100);

    // Gear the camera can see ruins the take, whatever else is right.
    const framed = this.framedFixture();
    if (framed) {
      return {
        score: Math.min(score, 40),
        hint: `The ${itemName(framed.item)} is in the shot! Move it out of frame.`,
        fixture: framed,
      };
    }
    // House lights on: say so until the player has cut them once this scene;
    // after that, leaving them on is on purpose (to see the set), so only
    // mention them once everything else is right. Either way they block the take.
    // They halve the match rather than capping it, so the bar still climbs as a
    // light gets closer (Greg's playtest: a bar stuck at 45% gave him nothing to go on).
    if (this.houseOn) {
      score = Math.round(score * HOUSE_FACTOR);
    }
    if (level.practical && !this.practical?.on) {
      return { score: Math.min(score, 60), hint: this.dockReady ? 'The lamp in the shot is off. Point at the lamp on set and pinch.' : 'The lamp in the shot is off. Tap Lamp on the iPad.' };
    }
    // Stay on the light you just touched until it's done: first its spot, then its brightness
    // (ben, 2026-11-18 morning: "you shouldn't switch to another light's controls when the one
    // you just touched is still sitting in front of you").
    const touched = this.touchedFixture;
    const mine = touched?.on ? assigned.find((a) => a.fixture === touched) : undefined;
    if (mine && touched) {
      if (!level.locked && mine.place < 0.95) {
        const move = this.placeHint(mine.role, touched);
        if (move) return { score, hint: move, fixture: touched };
      }
      if (level.locked || mine.place > 0.85) {
        const dim = this.dimmerHint([mine]);
        if (dim) return { score, hint: dim.hint, fixture: dim.fixture };
      }
    }
    const missing = assigned.filter((a) => !a.fixture);
    if (missing.length > 0) {
      const role = missing[0].role;
      // Is a wrong light sitting where this role should be?
      const wrong = extras.find((f) => this.roleFit(role, f.local) > 0.3);
      if (wrong && wrong.item.dial && role.kinds.includes(wrong.item.kind) && (role.aim ?? 'cast') === (wrong.item.aim ?? 'cast')) {
        // The right light in the right place, at the wrong color temperature.
        return {
          score,
          hint: role.warm
            ? `Right light, wrong color: dial the ${KIND_NAMES[wrong.item.kind]} down to 3200K (warm).`
            : `Right light, wrong color: dial the ${KIND_NAMES[wrong.item.kind]} up to 5600K.`,
        };
      }
      if (wrong) {
        return {
          score,
          hint: `Wrong light for the ${role.label.toLowerCase()}: it needs ${role.kindHint}.`,
        };
      }
      if (SHAPERS.has(role.kinds[0])) {
        // Silks and bounce cards have no switch: they just need to be on the set.
        return { score, hint: `Still missing: the ${role.label.toLowerCase()}. ${this.dockReady ? 'Pinch and move' : 'Drag'} ${role.kindHint} onto the set.` };
      }
      // The light for this job is already on, just dialed to the wrong color (it can still be
      // parked): name it, so the player isn't left guessing which of two softboxes has the dial.
      const undialed = extras.find((f) => f.item.dial && role.kinds.includes(f.item.kind) && (role.aim ?? 'cast') === (f.item.aim ?? 'cast'));
      if (undialed && !level.locked && this.roleFit(role, undialed.local) < 0.85) {
        // Move it to its spot first, then the color (ben: always move first).
        const move = this.placeHint(role, undialed);
        if (move) return { score, hint: move, fixture: undialed };
      }
      if (undialed) {
        return {
          score,
          hint: role.warm
            ? `Right light, wrong color: dial the ${KIND_NAMES[undialed.item.kind]} down to 3200K (warm).`
            : `Right light, wrong color: dial the ${KIND_NAMES[undialed.item.kind]} up to 5600K.`,
          fixture: undialed,
        };
      }
      // The right light is on set but switched off: say "off", not "missing" (ben, 2026-11-18).
      // Only a light that can do the job: a warm job needs the one with the color dial (the tip
      // used to ring the plain softbox, which can never go warm; judge playthrough, 2026-11-18).
      const off = role.kinds.length
        ? this.fixtures.find(
            (f) => !f.on && role.kinds.includes(f.item.kind) && (role.aim ?? 'cast') === (f.item.aim ?? 'cast') && (!role.warm || f.item.dial),
          )
        : undefined;
      if (off && !level.locked && this.roleFit(role, off.local) < 0.85) {
        // Still parked: move it to its spot first, then switch it on (ben: never "turn on"
        // a light that's still sitting off its mark).
        const move = this.placeHint(role, off);
        if (move) return { score, hint: move, fixture: off };
      }
      if (off && (on.length > 0 || this.dockReady)) {
        return {
          score,
          hint: this.dockReady
            ? `The ${role.label.toLowerCase()} is off. Pinch the switch to turn on the ${KIND_NAMES[off.item.kind]}.`
            : `The ${role.label.toLowerCase()} is off. Switch on the ${KIND_NAMES[off.item.kind]} on the iPad.`,
          fixture: off,
        };
      }
      const label = missing.length > 1 ? `Still missing: ${missing.map((m) => m.role.label.toLowerCase()).join(', ')}.` : `Still missing: the ${role.label.toLowerCase()}.`;
      return { score, hint: on.length === 0 ? (this.dockReady ? 'Point at a light, then pinch its switch floating over it to turn it on.' : "Tap a light's button on the iPad to switch it on.") : `${label} Use ${role.kindHint}.` };
    }
    if (extras.length > 0) {
      score = Math.min(score, 70);
      return {
        score,
        hint: SHAPERS.has(extras[0].item.kind)
          ? `The ${itemName(extras[0].item)} isn't needed here. ${this.dockReady ? 'Move' : 'Drag'} it back behind the tape.`
          : `Too many lights: switch off the ${itemName(extras[0].item)}.`,
        // Rings it: with two softboxes on, "the softbox" alone doesn't say which.
        fixture: extras[0],
      };
    }
    // The bounce card is in the silk's shade (the trap in the desert): say why it does nothing.
    const shaded = assigned.find((a) => a.fixture?.item.kind === 'bounce' && a.fixture.lit < 0.5);
    if (shaded) {
      return {
        score,
        hint: "The bounce card is in the silk's shade, so it has no sun to bounce. Move it out into the sun.",
        fixture: shaded.fixture,
      };
    }
    // Dimmers (beta track): once the lights are in place, say which one is too bright or too dark.
    const placed = assigned.reduce((a, b) => (b.place < a.place ? b : a));
    {
      // A dimmer that's way off comes first even before the lights are placed: the playthrough
      // circled a top light at 24% while the real miss was the LED panel at 100% (scene 8).
      // Only lights already on their spot (ben: always move first, then brightness).
      const dim = this.dimmerHint(level.locked ? assigned : assigned.filter((a) => a.place > 0.85));
      if (dim && (placed.place > 0.85 || level.locked || / way too /.test(dim.hint))) return { score, hint: dim.hint, fixture: dim.fixture };
    }
    const worst = assigned.reduce((a, b) => (b.fit < a.fit ? b : a));
    if (this.houseOn && worst.fit > 0.85) {
      return {
        score,
        hint:
          level.houseHint === 'ambient'
            ? this.dockReady && this.ambientWait > AMBIENT_RESCUE_SECONDS
              ? "Looks right, but there's too much ambient light. Cut the house lights: pinch HOUSE."
              : "Looks right, but there's too much ambient light."
            : HOUSE_TIP,
      };
    }
    // Stay with the light the tip is already about until it is in place, so the tip
    // doesn't jump between lights as their scores trade places.
    const current = assigned.find((a) => a.fixture && a.role.id === this.tipMove.role && a.place < 0.95);
    const focus = current ?? assigned.reduce((a, b) => (b.place < a.place ? b : a));
    return { score, hint: this.placeHint(focus.role, focus.fixture!), fixture: focus.fixture };
  }

  /** How close a light's dimmer is to the role's brightness (1 when it has no dimmer or the role doesn't care). */
  private dimmerFit(role: Role, fixture: Fixture): number {
    if (!fixture.item.dimmer || role.level === undefined) return 1;
    return Math.exp(-(((fixture.dimmer - role.level) / DIMMER_TOLERANCE) ** 2));
  }

  /**
   * The tip for a dimmer that's off, or null when every dimmer is right. It stays on the light
   * it's about until that light is right (ben, 2026-11-18: following the tips meant key +, fill -,
   * key +, fill -... one click at a time), then moves to the one furthest off.
   */
  private dimmerHint(assigned: { role: Role; fixture?: Fixture }[]): { hint: string; fixture: Fixture } | null {
    let worstErr = 0;
    let worst: { role: Role; fixture?: Fixture } | undefined;
    for (const a of assigned) {
      if (!a.fixture?.item.dimmer || a.role.level === undefined) continue;
      const err = a.fixture.dimmer - a.role.level;
      if (a.fixture === this.dimFocus && Math.abs(err) >= 0.05) {
        worstErr = err;
        worst = a;
        break;
      }
      if (Math.abs(err) > Math.abs(worstErr) + 1e-6) {
        worstErr = err;
        worst = a;
      }
    }
    if (!worst || Math.abs(worstErr) < 0.05) {
      this.dimFocus = undefined;
      return null;
    }
    this.dimFocus = worst.fixture;
    const lower = worst.role.label.toLowerCase();
    const name = KIND_NAMES[worst.fixture!.item.kind];
    const lot = Math.abs(worstErr) >= 0.3 ? 'way ' : '';
    const where = this.dockReady ? 'over it' : 'on the iPad';
    const hint =
      worstErr > 0
        ? `The ${lower} is ${lot}too bright. Dim the ${name} (${this.dockReady ? '-' : '◀'} ${where}).`
        : `The ${lower} is ${lot}too dark. Bring the ${name} up (${this.dockReady ? '+' : '▶'} ${where}).`;
    return { hint, fixture: worst.fixture! };
  }

  /** Tries every way of giving roles distinct fitting lights (a handful at most) and keeps the best total fit. */
  private bestAssignment(roles: Role[], on: Fixture[]): (Fixture | undefined)[] {
    let best: (Fixture | undefined)[] = roles.map(() => undefined);
    let bestTotal = -1;
    const current: (Fixture | undefined)[] = [];
    const used = new Set<Fixture>();
    const search = (i: number, total: number) => {
      if (i === roles.length) {
        // Prefer more filled roles, then a higher total fit.
        const filled = current.filter(Boolean).length;
        const value = filled * 10 + total;
        if (value > bestTotal) {
          bestTotal = value;
          best = current.slice();
        }
        return;
      }
      for (const fixture of on) {
        if (used.has(fixture) || !this.fits(roles[i], fixture)) continue;
        used.add(fixture);
        current[i] = fixture;
        search(i + 1, total + this.roleFit(roles[i], fixture.local));
        used.delete(fixture);
      }
      current[i] = undefined;
      search(i + 1, total);
    };
    search(0, 0);
    return best;
  }

  /**
   * The first light (on or off) the cine camera can see: its head or any part
   * of its stand inside the frame. Kit lights parked behind the camera never count.
   */
  private framedFixture(): Fixture | undefined {
    for (const fixture of this.fixtures) {
      if (this.inFrameAt(fixture.local, fixture.item.kind)) {
        return fixture;
      }
    }
    return undefined;
  }

  /** Would a light standing (or hanging) at this stage-local spot show in the cine camera's frame? */
  private inFrameAt(local: Vector3, kind?: FixtureKind): boolean {
    const { x, y, z } = local;
    if (kind === 'silk') {
      // The frame's four corners and its two side stands down to the ground.
      const half = SILK_SIZE / 2;
      for (const [dx, dz] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ]) {
        if (this.seen(x + dx, y, z + dz)) return true;
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i <= 8; i++) {
          if (this.seen(x + side * half, (y * i) / 8, z)) return true;
        }
      }
      return false;
    }
    // The head's edges (a light just peeking into the frame still shows on the monitor).
    const r = kind ? HEAD_REACH[kind] : 0;
    if (r > 0) {
      if (this.seen(x - r, y, z) || this.seen(x + r, y, z) || this.seen(x, y - r, z) || this.seen(x, y + r, z)) return true;
    }
    const end = this.hangs(y) ? STAGE_HEIGHT : 0;
    for (let i = 0; i <= 8; i++) {
      if (this.seen(x, y + ((end - y) * i) / 8, z)) return true;
    }
    return false;
  }

  /** Is this stage-local point inside the cine camera's frame? */
  private seen(x: number, y: number, z: number): boolean {
    this.v4.set(x, y, z);
    this.stage.localToWorld(this.v4);
    this.v4.project(this.shotCamera);
    return this.v4.z > -1 && this.v4.z < 1 && Math.abs(this.v4.x) < 0.98 && Math.abs(this.v4.y) < 0.98;
  }

  /**
   * The tip for a light that is on and in the right role but not on its spot.
   *
   * It tries a small move in each of the six directions (left/right, up/down,
   * back/forward) and names the one that raises the match the most, so the tip
   * always points somewhere that helps, height included. It then sticks with that
   * direction while it still helps, instead of flipping to whichever direction is
   * a hair better (Greg's playtest: the old tip ping-ponged camera-left/right on
   * the top light when the real problem was its height). When a direction is done
   * and the tip moves on, it says so ("Height looks good."). "Nudge" means one
   * full step would overshoot.
   */
  private placeHint(role: Role, fixture: Fixture): string {
    const lower = role.label.toLowerCase();
    const here = fixture.local;
    const fit = this.roleFit(role, here);
    if (fit > 0.95) {
      this.tipMove.axis = -1;
      // In place: no tip at all (ben, 2026-11-18: "you're not almost there, you're there").
      return '';
    }
    const target = this.roleLocal(role, this.v2);
    // A light that belongs behind the cast but sits in front goes round, not through.
    if (role.orbit && target.z < this.aimLocal.z - 0.02 && here.z > this.aimLocal.z) {
      // Say which side: round the wrong one, the straight line to the mark crosses the shot and
      // no small step helps (the sunset's low sun got stuck there; judge playthrough, 2026-11-18).
      const side = target.x < this.aimLocal.x ? "on the director's side" : 'on the craft services side';
      return `The ${lower} belongs behind the cast, ${side}. Move it round the back.`;
    }
    // One direction at a time (ben, round 9: the tip went "right, left, back..."
    // and he got nowhere). Stay on the direction the tip already gave while it
    // still helps at all. When it stops helping, that direction is done: say so,
    // and work the other directions before coming back to it for a correction.
    const kind = fixture.item.kind;
    const kept = this.tipMove.role === role.id && this.tipMove.axis >= 0 ? this.tipMove : undefined;
    if (this.tipMove.role !== role.id) this.tipFinished = 0;
    let bestAxis = -1;
    let bestSign = 0;
    let nudge = false;
    if (kept) {
      if (this.stepGain(role, here, kept.axis, kept.sign, TIP_STEP, fit, kind) > 0.002) {
        bestAxis = kept.axis;
        bestSign = kept.sign;
        nudge = this.stepGain(role, here, kept.axis, kept.sign, TIP_STEP / 2, fit, kind) > this.stepGain(role, here, kept.axis, kept.sign, TIP_STEP, fit, kind);
      } else if (this.stepGain(role, here, kept.axis, kept.sign, TIP_STEP / 2, fit, kind) > 0.002) {
        bestAxis = kept.axis;
        bestSign = kept.sign;
        nudge = true;
      } else {
        this.tipFinished |= 1 << kept.axis;
      }
    }
    if (bestAxis < 0) {
      // Pick the most helpful direction among those not finished yet; if they are all
      // finished (or none helps), any direction may need a correction.
      let pick = this.bestMove(role, here, fit, kind, this.tipFinished);
      if (pick.axis < 0) {
        this.tipFinished = 0;
        pick = this.bestMove(role, here, fit, kind, 0);
      }
      bestAxis = pick.axis;
      bestSign = pick.sign;
      nudge = pick.nudge;
    }
    if (bestAxis < 0) {
      this.tipMove.axis = -1;
      // In place: no tip at all (ben, 2026-11-18: "you're not almost there, you're there").
      return '';
    }
    // Say when the player has finished one direction and the tip moves to another.
    if (kept && kept.axis !== bestAxis) {
      this.tipDone = ['Left-right looks good. ', 'Height looks good. ', 'Distance looks good. '][kept.axis];
    } else if (!kept) {
      this.tipDone = '';
    }
    this.tipMove.role = role.id;
    this.tipMove.axis = bestAxis;
    this.tipMove.sign = bestSign;
    const verb = nudge ? 'Nudge' : 'Move';
    const bit = nudge ? ' a little' : '';
    let move: string;
    if (bestAxis === 1) {
      if (bestSign > 0 && this.hangs(target.y) && !this.hangs(here.y)) {
        move = `Raise the ${lower} until it hangs from the grid.`;
      } else {
        move = `${bestSign > 0 ? 'Raise' : 'Lower'} the ${lower}${bit}.`;
      }
    } else if (bestAxis === 0) {
      // ben, 2026-11-16: "camera-left" could mean frame left or the camera's own left, and
      // "your left" breaks once you walk into the set. Name something on the set instead:
      // the director sits on the -x side in every scene, craft services (the chef) on the +x side.
      move = bestSign < 0 ? `${verb} the ${lower}${bit} toward the director.` : `${verb} the ${lower}${bit} toward craft services.`;
    } else if (role.pos && role.aim === 'screen') {
      move = bestSign < 0 ? `${verb} the ${lower}${bit} closer to the screen.` : `Pull the ${lower}${bit} away from the screen.`;
    } else {
      // ben, 2026-11-16: "forward, toward you" breaks if you walked into the set. The film
      // camera is in every scene and doesn't move, so measure from it.
      move = bestSign < 0 ? `${verb} the ${lower}${bit} further from the camera.` : `${verb} the ${lower}${bit} closer to the camera.`;
    }
    return this.tipDone + move;
  }

  /** The direction (not in `skip`, a bitmask of axes) whose step helps most: a full step, else a half step ("nudge"). */
  private bestMove(role: Role, here: Vector3, fit: number, kind: FixtureKind, skip: number): { axis: number; sign: number; nudge: boolean } {
    for (const step of [TIP_STEP, TIP_STEP / 2]) {
      let axis = -1;
      let sign = 0;
      let best = 0.002;
      for (let a = 0; a < 3; a++) {
        if (skip & (1 << a)) continue;
        for (let sg = -1; sg <= 1; sg += 2) {
          const gain = this.stepGain(role, here, a, sg, step, fit, kind);
          if (gain > best) {
            best = gain;
            axis = a;
            sign = sg;
          }
        }
      }
      if (axis >= 0) {
        const nudge = step < TIP_STEP || this.stepGain(role, here, axis, sign, TIP_STEP / 2, fit, kind) > best;
        return { axis, sign, nudge };
      }
    }
    return { axis: -1, sign: 0, nudge: false };
  }

  /** How much the role's fit improves if the light moves `step` along one axis (minus if it gets worse or lands in frame). */
  private stepGain(role: Role, here: Vector3, axis: number, sign: number, step: number, _fit: number, kind?: FixtureKind): number {
    const p = this.v6.copy(here);
    p.setComponent(axis, p.getComponent(axis) + sign * step);
    if (p.y < 0.01 || this.inFrameAt(p, kind)) {
      return -1;
    }
    // A light whose mark hangs from the grid never gets sent down off it: below the hang line
    // it lands on a floor stand in the shot, and the tips looped (playthrough, scene 4).
    if (axis === 1 && sign < 0 && this.hangs(here.y) && !this.hangs(p.y) && this.hangs(this.roleLocal(role, this.stepTarget).y)) {
      return -1;
    }
    // Compare on the log scale: near the spot it is the same as comparing fits, and far
    // away it still points the right way (the fit itself is ~0 everywhere out there).
    const there = this.roleLogFit(role, p);
    return there - this.roleLogFit(role, here);
  }

  private updateScore(delta: number): void {
    this.checkCreature(delta);
    if (this.phase !== 'playing') {
      return;
    }
    const { score, hint, fixture } = this.evaluate();
    this.noteHintLight(hint, fixture);
    this.arrowFixture = fixture;
    this.arrowHint = hint;
    const dim = fixture ? /too (bright|dark)\./.exec(hint) : null;
    this.dimCue = dim ? fixture : undefined;
    if (dim) this.dimCueDir = dim[1] === 'bright' ? 'dimmer' : 'brighter';
    // No new match while the crew are still reacting to a blown take.
    this.holdTime = score >= this.level.winScore && this.blownTime < 0 ? this.holdTime + delta : 0;
    if (this.holdTime >= WIN_HOLD_SECONDS) {
      this.phase = 'won';
      // You matched the shots, so you've got what they're for.
      this.coachLearned.add('shots');
      // The scene's notes and nudges are done: they dim, the win texts arrive bright.
      this.phone.setStep(`won:${this.levelIndex}`);
      this.chime.play().catch(() => undefined);
      this.ipad.setStatus(score, '', true);
      // Tips still on their way are moot now (ben, round 11: tips kept coming after the win).
      this.phone.dropPending();
      for (const fixture of this.fixtures) fixture.rollFrom.copy(fixture.local);
      const retry = this.wonOnce;
      // One text on a win: the scene's gossip if it has some, otherwise a cheer.
      if (!retry && !this.level.after) this.phone.text('dee', this.pickDeeWin());
      this.showWinCard(retry);
      if (!retry) {
        for (const text of this.level.texts ?? []) {
          this.phone.text(text.from, text.text);
        }
      }
      this.wonOnce = true;
      return;
    }
    this.updateNudges(delta, score, hint);
    const text = `${score}|${hint}|${this.creature.active}`;
    if (text !== this.shownText) {
      this.shownText = text;
      this.ipad.setStatus(score, hint, false);
    }
  }

  /** The first time a tip names a light this scene: ring that light on the set for a few seconds. */
  /**
   * Points a yellow arrow from the tip's light the way the tip says to move it (ben, 2026-11-18:
   * hints as arrows, in sync with the tip line). It shows only while the strip shows that tip.
   */
  private updateMoveArrow(delta: number): void {
    const f = this.arrowFixture;
    const show = this.dockReady && this.phase === 'playing' && !!f && this.tipMove.axis >= 0 && !this.ipad.coachText &&
      /^(?:[A-Za-z-]+ looks good\. )?(Move|Nudge|Raise|Lower|Pull)\b/.test(this.arrowHint);
    if (!show || !f) {
      if (this.moveArrow) this.moveArrow.visible = false;
      return;
    }
    if (!this.moveArrow) {
      const mat = new MeshBasicMaterial({ color: '#f5d90a', transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, toneMapped: false });
      const arrow = new Group();
      arrow.name = 'move-arrow';
      const shaft = new Mesh(new CylinderGeometry(0.002, 0.002, 0.026, 10), mat);
      shaft.position.y = 0.013;
      const tip = new Mesh(new ConeGeometry(0.0055, 0.011, 16), mat);
      tip.position.y = 0.0315;
      for (const m of [shaft, tip]) {
        m.renderOrder = 995;
        (m as unknown as { pointerEvents: string }).pointerEvents = 'none';
      }
      // A dark outline behind it, so it reads on sand and bright floors too (ben, desert).
      const ink = new MeshBasicMaterial({ color: '#111114', transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, toneMapped: false });
      const shaftInk = new Mesh(new CylinderGeometry(0.0034, 0.0034, 0.0285, 10), ink);
      shaftInk.position.y = 0.013;
      const tipInk = new Mesh(new ConeGeometry(0.0078, 0.0145, 16), ink);
      tipInk.position.y = 0.0322;
      for (const m of [shaftInk, tipInk]) {
        m.renderOrder = 994;
        (m as unknown as { pointerEvents: string }).pointerEvents = 'none';
      }
      arrow.add(shaft, tip, shaftInk, tipInk);
      this.arrowInk = ink;
      this.moveArrow = arrow;
    }
    const arrow = this.moveArrow;
    if (arrow.parent !== this.stage) this.stage.add(arrow);
    arrow.visible = true;
    this.arrowTime += delta;
    this.v1.set(0, 0, 0);
    this.v1.setComponent(this.tipMove.axis, this.tipMove.sign);
    arrow.quaternion.setFromUnitVectors(Y_AXIS, this.v1);
    // It fades as the light nears its mark, so your eyes go to the match bar (ben, 2026-11-18).
    const role = this.level.roles.find((r) => r.id === this.tipMove.role);
    const left = role ? f.local.distanceTo(this.roleLocal(role, this.v2)) : 1;
    const mat = (arrow.children[0] as Mesh).material as MeshBasicMaterial;
    const vertical = this.tipMove.axis === 1;
    // Up and down arrows are bolder and stand beside the light, not over it, where the light's
    // label and the grid's hanging pipes hid them (ben, 2026-11-18).
    mat.opacity = (vertical ? 0.9 : 0.6) * MathUtils.clamp((left - 0.012) / 0.06, 0, 1);
    if (this.arrowInk) this.arrowInk.opacity = Math.min(1, mat.opacity * 1.1);
    arrow.visible = mat.opacity > 0.02;
    const bob = 0.004 * (0.5 + 0.5 * Math.sin(this.arrowTime * 4));
    if (vertical) {
      // On the side toward the middle of the set, centered on the light's height.
      const side = f.local.x > 0 ? -1 : 1;
      arrow.position.copy(f.local);
      arrow.position.x += side * 0.034;
      arrow.position.y += this.tipMove.sign > 0 ? -0.018 + bob : 0.018 - bob;
    } else {
      arrow.position.copy(f.local).addScaledVector(this.v1, 0.024 + bob);
    }
    arrow.scale.setScalar(vertical ? 1.2 : 1);
  }

  private noteHintLight(hint: string, fixture: Fixture | undefined): void {
    const name = fixture ? KIND_NAMES[fixture.item.kind] : '';
    this.hintName = fixture && hint.toLowerCase().includes(name.toLowerCase()) ? name : '';
    // One highlight at a time (ben, 2026-11-18): the lesson's ring first, then the light.
    if (!fixture || !this.hintName || this.hintShown.has(fixture) || this.coachStep) return;
    this.hintShown.add(fixture);
    this.hintRingFixture = fixture;
    this.hintRingTime = HINT_RING_SECONDS;
    devLog(`tip rings the ${name}`);
  }

  /**
   * While it lasts, the named light's glowing grab sphere turns into a pulsing yellow halo (its
   * own copy of the material); pointing at the light or moving it ends it.
   */
  private updateHintRing(delta: number): void {
    const f = this.hintRingFixture;
    this.hintRingTime -= delta;
    if (f && this.hintRingTime < HINT_RING_SECONDS - 1 && (f.entity.hasComponent(Hovered) || f.entity.hasComponent(Grabbed) || this.dragged === f)) {
      this.hintRingTime = 0;
    }
    const lit = this.hintHalo;
    if (!f || this.hintRingTime <= 0 || this.phase !== 'playing' || this.fixtures.indexOf(f) < 0) {
      if (lit) {
        lit.mesh.material = lit.home;
        lit.mesh.scale.setScalar(1);
        lit.glow.dispose();
        this.hintHalo = undefined;
      }
      if (this.hintRingTime <= 0) this.hintRingFixture = undefined;
      return;
    }
    if (!lit || lit.fixture !== f) {
      if (lit) {
        lit.mesh.material = lit.home;
        lit.mesh.scale.setScalar(1);
        lit.glow.dispose();
      }
      const mesh = f.handle instanceof Mesh ? f.handle : undefined;
      if (!mesh) return;
      const home = mesh.material as MeshBasicMaterial;
      const glow = home.clone();
      glow.depthTest = false;
      mesh.renderOrder = 990;
      mesh.material = glow;
      this.hintHalo = { fixture: f, mesh, home, glow };
    }
    this.hintPulse += delta;
    const beat = 0.5 + 0.5 * Math.sin(this.hintPulse * 5.5);
    const halo = this.hintHalo!;
    halo.glow.opacity = 0.3 + 0.3 * beat;
    halo.mesh.scale.setScalar(1.4 + 0.2 * beat);
  }

  /** Dee texts when a light sits in the shot, or when the player has been stuck on one hint for a while. */
  private updateNudges(delta: number, score: number, hint: string): void {
    const framed = this.framedFixture();
    this.inFrameTime = framed && framed === this.inFrameFixture ? this.inFrameTime + delta : 0;
    if (framed !== this.inFrameFixture) {
      // "the light is IN THE SHOT" dims once it's out of the shot, and brightens if it wanders back.
      if (this.inFrameFixture) this.phone.setResolved(this.inFrameFixture, true);
      if (framed) this.phone.setResolved(framed, false);
    }
    this.inFrameFixture = framed;
    // No "it's IN THE SHOT" text any more (ben, 2026-11-17: too many pings): the iPad's tip
    // already names the light that's in the shot, and the match stays capped until it's out.
    this.sinceNudge += delta;
    this.sceneTime += delta;
    if (hint.startsWith("Looks right, but there's too much ambient light.")) this.ambientWait += delta;
    // The quiet gotcha (LevelDef.houseHint 'ambient'): the tip only says "too much
    // ambient light"; after a while Dee comes to the rescue, once per scene.
    if (this.houseOn && this.level.houseHint === 'ambient' && this.houseWork > 25 && !this.houseNudged) {
      // Its own flag: lastNudge gets overwritten by the stuck-on-a-hint check below,
      // which let this fire again every NUDGE_SECONDS (ben, 2026-11-16, car scene).
      this.houseNudged = true;
      this.sinceNudge = 0;
      this.phone.text('dee', 'wait. THE HOUSE LIGHTS 😱', 'house');
    }
    // Time the house lights have been on while lights are on the set.
    if (this.houseOn && this.fixtures.some((f) => f.on)) this.houseWork += delta;
    if (this.houseOn && !this.houseEverOff && this.level.houseHint !== 'ambient' && this.houseWork > HOUSE_NUDGE_SECONDS) {
      // Only once the player has been placing lights a while with them still on.
      if (this.sinceNudge > NUDGE_SECONDS && !this.houseNudged) {
        this.houseNudged = true;
        this.sinceNudge = 0;
        const text =
          this.houseTexts === 0
            ? 'the house lights are flattening everything. turn them off!'
            : ['psst... house lights...', "don't forget to cut the house lights 👀"][this.houseTexts % 2];
        this.houseTexts += 1;
        this.phone.text('dee', text, 'house');
      }
      this.lastHint = hint;
      return;
    }
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.hintSince = 0;
      return;
    }
    this.hintSince += delta;
    if (this.hintSince > NUDGE_SECONDS && this.sinceNudge > NUDGE_SECONDS && hint !== this.lastNudge && !framed) {
      this.lastNudge = hint;
      this.sinceNudge = 0;
      // Dee no longer repeats the iPad tip (ben, round 11: "he's just competing with the
      // tip on the iPad"). The tip says what to do; Dee's notes say why.
    }
  }

  /** A hard light low in front of a face, held a moment, with the house lights off. */
  private checkCreature(delta: number): void {
    if (this.creature.active) {
      if (!this.shownText.endsWith('|true')) {
        this.shownText = '';
      }
      return;
    }
    if (this.creature.played || this.houseOn || this.level.actors.length === 0) {
      return;
    }
    const monster = this.fixtures.some((f) => {
      if (!f.on || (f.item.kind !== 'fresnel' && f.item.kind !== 'par')) return false;
      const pose = this.poseOf(f.local);
      return pose.elevation < -18 && Math.abs(pose.azimuth) < 40 && pose.distance < 0.2;
    });
    this.creatureHold = monster ? this.creatureHold + delta : 0;
    if (this.creatureHold > 1.5) {
      this.creature.play();
      this.say('"...Universal is on line two."');
      this.shownText = '';
    }
  }

  // --- iPad, phone and speech bubble -------------------------------------------

  private buildMonitor(): void {
    this.ipad = new IPad(this.targetShot.texture, this.shotTarget.texture);
    this.ipad.blind = IS_BETA;
    this.creature.install(this.ipad.liveMaterial);
    this.ipad.overLive = (ctx, x, y, w, h) => {
      if (!this.creature.active) return false;
      this.creature.drawTitle(ctx, x, y, w, h);
      return true;
    };
  }

  private buildCard(): void {
    // The iPad and the phone are placed in front of the view every frame (placeHud).
    this.ipadEntity = this.world.createTransformEntity(this.ipad.object);
    // In the headset a ray press reports where it hit, so the right switch on the iPad flips.
    const onIpadDown = (event: { point?: Vector3 }) => {
      if (!this.immersive || !event.point) return;
      const local = this.ipad.object.worldToLocal(this.v4.copy(event.point));
      if (!this.ipad.contains(local.y)) return;
      this.pressIpad(this.ipad.controlAt(local.x, local.y));
    };
    (this.ipad.object as unknown as { addEventListener: (type: string, fn: (event: { point?: Vector3 }) => void) => void }).addEventListener(
      'pointerdown',
      onIpadDown,
    );
    this.showPage(this.ipad.page);
    this.phoneEntity = this.world.createTransformEntity(this.phone.mesh);
    this.phoneEntity.addComponent(RayInteractable);
    // In the headset, a ray press on the phone scrolls (its buttons) or keeps it up / tucks it.
    const onPhoneDown = (event: { point?: Vector3 }) => {
      if (!this.immersive || !event.point) return;
      const local = this.phone.mesh.worldToLocal(this.v4.copy(event.point));
      this.phone.pressAt(local.x, local.y);
    };
    (this.phone.mesh as unknown as { addEventListener: (type: string, fn: (event: { point?: Vector3 }) => void) => void }).addEventListener(
      'pointerdown',
      onPhoneDown,
    );
    // A chime and a buzz when a text lands; the director's "wah-wah" voice with each line.
    // The phone is a quiet easter egg (ben, 2026-11-18 morning): it pings at most twice in the
    // whole game, once early and once mid-game, not with every text.
    this.phone.onArrive = () => {
      const ok = this.phonePings === 0 || (this.phonePings === 1 && this.levelIndex >= 4);
      if (!ok) return;
      this.phonePings += 1;
      this.phoneHop = true;
      sfx.textChime();
      sfx.buzz(this.world.renderer.xr.getSession());
    };
    this.bubble.onShow = (_speaker, line) => sfx.mumble(line);
    this.world.scene.add(this.bubble.mesh);
    // The actor's voice is higher than the director's.
    this.castBubble.onShow = (_speaker, line) => sfx.mumble(line, 240);
    this.castBubble.mesh.name = 'cast-speech-bubble';
    this.world.scene.add(this.castBubble.mesh);
    this.buildDirector();
  }

  /**
   * Where the director sits: the "crew-director" spot on the stage (the art
   * pass puts a person there). Until a model is there, an empty director's
   * chair stands in for them.
   */
  private buildDirector(): void {
    let anchor = this.stage.getObjectByName('crew-director');
    // The art pass builds the director, his chair and the crew next to their anchors.
    const hasDirector = Boolean(anchor);
    if (!anchor) {
      anchor = new Object3D();
      anchor.name = 'crew-director';
      anchor.position.set(-0.2, 0, 0.19);
      anchor.rotation.y = Math.atan2(0 - -0.2, -0.06 - 0.19);
      this.stage.add(anchor);
    }
    let placeholder: Object3D | undefined;
    if (!hasDirector && this.directorsChair) {
      placeholder = this.directorsChair.clone(true);
      placeholder.name = 'director-chair-placeholder';
      placeholder.position.set(0, 0, 0);
      placeholder.rotation.set(0, 0, 0);
      placeholder.visible = true;
      anchor.add(placeholder);
    }
    this.director = { anchor, placeholder };
  }

  // --- The coach ------------------------------------------------------------

  /** Runs the coach: picks the next lesson this scene needs, rings its control, and checks it's done. */
  private updateCoach(delta: number): void {
    this.coachRing.update(delta);
    if (this.phase !== 'playing' || this.ipad.isFull) {
      this.endCoachStep(false);
      return;
    }
    if (!this.coachStep) {
      const skill = COACH_SKILLS.find((s) => !this.coachLearned.has(s) && this.coachNeeded(s));
      if (!skill) {
        // Nothing left to teach: now the director gives his brief.
        this.giveBrief();
        return;
      }
      this.beginCoachStep(skill);
      if (!this.coachStep) return;
    }
    const step = this.coachStep as CoachLesson;
    this.coachTime += delta;
    if (this.coachDone(step.skill)) {
      devLog(`coach: ${step.skill} learned`);
      this.coachLearned.add(step.skill);
      this.endCoachStep(true);
      return;
    }
    this.aimCoachRing(step.skill);
  }

  /** Does this scene need this lesson (it has the control, and the player has something to do with it)? */
  private coachNeeded(skill: CoachSkill): boolean {
    const movable = !this.level.locked && this.fixtures.some((f) => !SHAPERS.has(f.item.kind));
    switch (skill) {
      case 'moveset':
        return this.dockReady && Boolean(this.setPad);
      case 'shots':
        return !IS_RESULT;
      case 'house':
        return this.houseOn && !this.level.outdoor;
      case 'look':
        return !this.immersive;
      case 'switch':
        return this.fixtures.some((f) => !SHAPERS.has(f.item.kind) && !f.on) && this.coachSwitchFixture() !== undefined;
      case 'drag':
      case 'raise':
        return movable;
      case 'dimmer':
        return this.coachDimmerFixture() !== undefined;
      case 'phone':
        // In the headset the phone is an easter egg on the craft table (ben, 2026-11-18): no lesson.
        // The phone is an easter egg on the craft table now (ben, 2026-11-18): no lesson.
        return false;
    }
  }

  private beginCoachStep(skill: CoachSkill): void {
    const vr = this.immersive;
    const press = vr ? 'Point at' : 'Click';
    const trigger = vr ? ' and pinch' : '';
    let text = '';
    this.coachFixture = undefined;
    switch (skill) {
      case 'moveset':
        text = 'Pinch and drag this spot to slide the whole set closer or farther.';
        break;
      case 'shots':
        text = this.dockReady
          ? "This is the director's TARGET. Make the live set look like it."
          : "Left: the director's TARGET. Right: YOUR SHOT, live. Make them match. Click Got it.";
        break;
      case 'house':
        // First, so you can see what your lights do (ben, 2026-11-18 morning).
        text = this.dockReady ? 'Pinch HOUSE to switch off the house lights.' : `${press} HOUSE${trigger} to switch off the house lights.`;
        break;
      case 'look':
        text = 'Drag empty space to walk around the set. Scroll to zoom.';
        break;
      case 'switch': {
        const fixture = this.coachSwitchFixture()!;
        this.coachFixture = fixture;
        text = this.dockReady
          ? `Pinch the switch to turn on the ${KIND_LABELS[fixture.item.kind]}.`
          : `${press} ${KIND_LABELS[fixture.item.kind]}${trigger} to switch that light on.`;
        break;
      }
      case 'drag':
        this.coachFixture = this.coachMoveFixture();
        text = vr ? 'Point at the ringed light, pinch and hold, and move your hand.' : 'Drag the ringed light to move it across the floor.';
        break;
      case 'raise':
        this.coachFixture = this.coachMoveFixture();
        text = vr ? 'Still pinching, lift your hand to raise the light.' : 'Hold Shift and drag up (or scroll while dragging) to raise it.';
        break;
      case 'dimmer': {
        const found = this.coachDimmerFixture()!;
        this.coachFixture = found.fixture;
        const brighter = found.want > found.fixture.dimmer;
        const name = KIND_LABELS[found.fixture.item.kind];
        // The blind track never says which way: matching by eye is the game there.
        if (IS_BETA) {
          text = this.dockReady
            ? `Pinch - or + to dim or brighten the ${name}.`
            : `${press} ◀ or ▶ on the ${name}${trigger} to dim it or brighten it.`;
          break;
        }
        text = this.dockReady
          ? `Pinch ${brighter ? '+' : '-'} to make the ${name} ${brighter ? 'brighter' : 'dimmer'}.`
          : `${press} ${brighter ? '▶' : '◀'} on the ${name}${trigger} to make it ${brighter ? 'brighter' : 'dimmer'}.`;
        break;
      }
      case 'phone':
        text = !vr
          ? 'Dee texts you why. Click the phone to keep it up.'
          : this.dockReady
          ? 'Dee texted you. Point at the phone on the stage, toward craft services, and pinch to pick it up.'
          : 'Dee texts you why. Point at the phone and pinch to keep it up.';
        break;
    }
    this.coachStep = { skill, text };
    this.coachTime = 0;
    this.coachGotIt = false;
    this.coachHouse = this.houseOn;
    if (COACH_READING.has(skill)) this.showPage({ eyebrow: this.sceneLabel(), body: '', button: 'Got it' });
    if (this.coachFixture) this.coachStart.copy(this.coachFixture.local);
    this.coachDimmers = this.fixtures.map((f) => f.dimmer);
    this.coachStarts = this.fixtures.map((f) => f.local.clone());
    this.coachOnCount = this.fixtures.filter((f) => f.on).length;
    this.coachOrbit.yaw = this.orbit.yaw;
    this.coachOrbit.pitch = this.orbit.pitch;
    this.coachOrbit.radius = this.orbit.radius;
    this.coachPinned = this.phone.pinned;
    this.ipad.setCoach(text);
    devLog(`coach: ${skill}: ${text}`);
  }

  /** Has the player done what the lesson asks? Reading-only lessons wait for Got it. */
  private coachDone(skill: CoachSkill): boolean {
    const t = this.coachTime;
    const f = this.coachFixture;
    switch (skill) {
      case 'moveset':
        return this.coachGotIt || this.setMoved;
      case 'shots':
        // Reading only: done when the player says so, not on a timer, or once they get to
        // work anyway (flip the house lights, touch a light), so skipping it never blocks the game.
        return (
          this.coachGotIt ||
          this.houseOn !== this.coachHouse ||
          this.fixtures.filter((x) => x.on).length !== this.coachOnCount ||
          this.fixtures.some((x, i) => x.dimmer !== this.coachDimmers[i] || (this.coachStarts[i] && x.local.distanceToSquared(this.coachStarts[i]) > 1e-6))
        );
      case 'house':
        return !this.houseOn;
      case 'look':
        return (
          Math.abs(this.orbit.yaw - this.coachOrbit.yaw) > 0.3 ||
          Math.abs(this.orbit.pitch - this.coachOrbit.pitch) > 0.2 ||
          Math.abs(this.orbit.radius - this.coachOrbit.radius) > 0.15 ||
          t > 15
        );
      case 'switch':
        return (f?.on ?? false) || this.fixtures.filter((x) => x.on).length > this.coachOnCount;
      case 'drag':
        // Any light moved counts: they found out how.
        return this.fixtures.some((x, i) => {
          const start = this.coachStarts[i];
          return start !== undefined && Math.hypot(x.local.x - start.x, x.local.z - start.z) > 0.03;
        });
      case 'raise':
        return f ? Math.abs(f.local.y - this.coachStart.y) > 0.015 : true;
      case 'dimmer':
        return this.fixtures.some((x, i) => x.dimmer !== this.coachDimmers[i]);
      case 'phone':
        return this.phone.pinned !== this.coachPinned || t > 10;
    }
  }

  private endCoachStep(learned: boolean): void {
    void learned;
    if (this.coachStep && COACH_READING.has(this.coachStep.skill) && this.ipad.page.button === 'Got it') {
      this.showPage({ eyebrow: this.sceneLabel(), body: '' });
    }
    this.coachStep = null;
    this.coachFixture = undefined;
    this.coachRing.hide();
    this.ipad?.setCoach('');
  }

  /** Puts the ring on the lesson's control: an iPad button, the shots, the phone, or a light on set. */
  private aimCoachRing(skill: CoachSkill): void {
    const ring = this.coachRing;
    const ipad = this.ipad;
    const line = 0.002;
    const onIpad = (frame: { x: number; y: number; w: number; h: number } | null, arrow = 0.011) => {
      if (frame) ring.ring(ipad.object, frame.x, frame.y, frame.w, frame.h, line, false, arrow);
      else ring.hide();
    };
    const button = (fixture: Fixture | 'house') => this.buttonTargets.indexOf(fixture);
    // Headset: the controls are on the set (the sign, the strip, the panel over a light).
    if (this.dockReady && skill !== 'drag' && skill !== 'raise' && skill !== 'phone' && skill !== 'look') {
      this.aimCoachRingOnSet(skill);
      return;
    }
    switch (skill) {
      case 'moveset':
        ring.hide();
        break;
      case 'shots': {
        // Both shots in one ring: they're the pair to compare.
        const a = ipad.frameOf('target');
        const b = ipad.frameOf('live');
        if (a && b) onIpad({ x: (a.x + b.x) / 2, y: a.y, w: b.x - a.x + a.w, h: a.h }, 0);
        break;
      }
      case 'house': {
        const i = button('house');
        onIpad(ipad.frameOf((c) => c.type === 'light' && c.index === i));
        break;
      }
      case 'switch': {
        const i = this.coachFixture ? button(this.coachFixture) : -1;
        onIpad(ipad.frameOf((c) => c.type === 'light' && c.index === i));
        break;
      }
      case 'dimmer': {
        const f = this.coachFixture;
        const i = f ? button(f) : -1;
        const step = this.coachStep?.text.includes('▶') ? 'brighter' : 'dimmer';
        const half = ipad.frameOf((c) => c.type === step && c.index === i);
        // Just the arrow at the end of the dimmer, not its percentage.
        const w = 0.013;
        onIpad(half && { x: step === 'brighter' ? half.x + half.w / 2 - w / 2 : half.x - half.w / 2 + w / 2, y: half.y, w, h: half.h });
        break;
      }
      case 'phone':
        ring.ring(this.phone.mesh, 0, 0, PHONE_WIDTH, PHONE_HEIGHT, 0.0022);
        break;
      case 'drag':
      case 'raise': {
        const f = this.coachFixture;
        if (!f) {
          ring.hide();
          break;
        }
        // An oval around the whole light, stand and all, facing you.
        this.coachBox.setFromObject(f.object);
        this.coachBox.getCenter(this.v5);
        this.coachBox.getSize(this.v6);
        const w = Math.max(this.v6.x, this.v6.z);
        const h = this.v6.y;
        ring.ring(this.world.scene, this.v5.x, this.v5.y, w * 1.15, h * 1.1, Math.max(w, h) * 0.03, true);
        ring.mesh.position.z = this.v5.z;
        this.world.camera.getWorldQuaternion(ring.mesh.quaternion);
        ring.mesh.updateMatrixWorld();
        break;
      }
      case 'look':
        ring.hide();
        break;
    }
  }

  /** Headset: rings the shots on the sign, HOUSE on the strip, or a button on a light's panel. */
  private aimCoachRingOnSet(skill: CoachSkill): void {
    const ring = this.coachRing;
    const sign = this.sign;
    const strip = this.strip;
    const panel = this.panel;
    if (skill === 'moveset' && this.setPad) {
      ring.ring(this.setPad, 0, 0, SET_PAD_SIZE, SET_PAD_SIZE, 0.0025, true, 0);
      return;
    }
    if (skill === 'shots' && sign) {
      const a = sign.targetFrame;
      const b = sign.liveFrame;
      ring.ring(sign.group, (a.x + b.x) / 2, a.y, b.x - a.x + a.w, a.h, 0.003);
      return;
    }
    if (skill === 'house' && this.houseSwitchPlate) {
      ring.ring(this.houseSwitchPlate, 0, 0, HOUSE_PLATE_W, HOUSE_PLATE_H, 0.002, false, 0.016);
      return;
    }
    if (skill === 'house' && strip?.mesh.visible) {
      const frame = strip.frameOf('house');
      if (frame) {
        ring.ring(strip.mesh, frame.x, frame.y, frame.w, frame.h, 0.002, false, 0.014);
        return;
      }
    }
    if ((skill === 'switch' || skill === 'dimmer') && panel?.group.visible) {
      const step = skill === 'switch' ? 'power' : this.coachStep?.text.includes('brighter') ? 'brighter' : 'dimmer';
      const frame = panel.frameOf(step);
      if (frame) {
        const w = skill === 'switch' ? frame.w : 0.018;
        const x = skill === 'switch' ? frame.x : step === 'brighter' ? frame.x + frame.w / 2 - w / 2 : frame.x - frame.w / 2 + w / 2;
        ring.ring(panel.group, x, frame.y, w, frame.h, 0.0018, false, 0.012);
        return;
      }
    }
    ring.hide();
  }

  /** The light to switch on first: the one the first role needs, or any light that's off. */
  private coachSwitchFixture(): Fixture | undefined {
    const off = this.fixtures.filter((f) => !SHAPERS.has(f.item.kind) && !f.on);
    const role = this.level.roles[0];
    return off.find((f) => role?.kinds.includes(f.item.kind)) ?? off[0];
  }

  /** The light to move: the kicked one, or the one the tip is about, or the first light needed. */
  private coachMoveFixture(): Fixture | undefined {
    const kicked = this.level.preset?.find((p) => p.onFloor);
    if (kicked) return this.fixtures[kicked.kit];
    const tip = this.evaluate().fixture;
    if (tip) return tip;
    const role = this.level.roles[0];
    return this.fixtures.find((f) => f.on && !SHAPERS.has(f.item.kind)) ?? this.fixtures.find((f) => role?.kinds.includes(f.item.kind));
  }

  /** The dimmer furthest from where it should be (if one is off by a stop or more). */
  private coachDimmerFixture(): { fixture: Fixture; want: number } | undefined {
    if (IS_BETA) {
      const fixture = this.fixtures.find((f) => f.item.dimmer && this.buttonTargets.indexOf(f) >= 0);
      return fixture ? { fixture, want: 1 } : undefined;
    }
    let best: { fixture: Fixture; want: number } | undefined;
    let worst = 0.09;
    for (const role of this.level.roles) {
      if (role.level === undefined) continue;
      const fixture = this.fixtures.find((f) => f.item.dimmer && role.kinds.includes(f.item.kind));
      if (!fixture || this.buttonTargets.indexOf(fixture) < 0) continue;
      const off = Math.abs(role.level - fixture.dimmer);
      if (off > worst) {
        worst = off;
        best = { fixture, want: role.level };
      }
    }
    return best;
  }

  /**
   * Keeps the iPad, the phone and the director's speech bubble in view. In
   * the browser the iPad and phone are fixed to the screen (the view orbits
   * with the mouse); in the headset they drift after your head so they never
   * feel bolted on. The iPad starts big in the middle with how to play, then
   * settles at the bottom. The phone sits beside it and tucks down when
   * nothing new is happening.
   */
  private placeHud(delta: number): void {
    const camera = this.world.camera;
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.headWorld);
    const ipad = this.ipad.object;
    const phone = this.phone.mesh;
    const bounce = Math.sin(this.phone.pop * Math.PI) * 0.01;
    const ease = 1 - Math.exp(-delta * 6);
    this.phoneTuck += ((this.phone.awake ? 0 : 1) - this.phoneTuck) * ease;
    const full = this.ipad.isFull;
    if (!this.immersive) {
      const d = HUD_DESKTOP_DISTANCE;
      const halfH = d * Math.tan(MathUtils.degToRad(camera.fov / 2));
      const halfW = halfH * camera.aspect;
      const margin = halfH * 0.04;
      // Play: the iPad takes about 40% of the window height at the bottom; full page: most of it, centered.
      // Play: the compact strip takes about a quarter of the window height.
      const fit = full
        ? Math.min((halfH * 1.6) / IPAD_HEIGHT, (halfW * 1.7) / IPAD_WIDTH)
        : Math.min((halfH * 0.55 * this.ipadZoom) / IPAD_COMPACT_HEIGHT, (halfW * 1.25) / IPAD_WIDTH);
      const ipadScale = this.hudScale + (fit - this.hudScale) * (this.hudPlaced ? ease : 1);
      this.hudScale = ipadScale;
      const ipadH = IPAD_HEIGHT * ipadScale;
      const ipadW = IPAD_WIDTH * ipadScale;
      const playY = -halfH + margin + ipadH / 2;
      const ipadY = full ? 0 : playY;
      this.hudY = this.hudPlaced ? this.hudY + (ipadY - this.hudY) * ease : ipadY;
      this.hudPlaced = true;
      ipad.scale.setScalar(ipadScale);
      this.hudTarget.set(0, this.hudY, -d);
      ipad.position.copy(camera.localToWorld(this.hudTarget));
      ipad.quaternion.copy(camera.getWorldQuaternion(ipad.quaternion));
      // The phone stands just right of the iPad, about as tall, and slides down when idle.
      // The iPad's -/+ buttons size the phone too.
      const phoneScale =
        Math.max((halfH * 0.6) / PHONE_HEIGHT, Math.min((halfH * 0.9) / PHONE_HEIGHT, (halfW - ipadW / 2 - 2 * margin) / PHONE_WIDTH)) *
        MathUtils.clamp(this.ipadZoom, 0.85, 1.3);
      const phoneH = PHONE_HEIGHT * phoneScale;
      if (this.phone.pinned) {
        // Picked up off the craft table: up on screen beside the iPad until clicked again.
        phone.renderOrder = 1003;
        (phone.material as MeshBasicMaterial).depthTest = false;
        phone.scale.setScalar(phoneScale);
        const phoneX = Math.min(ipadW / 2 + margin + (PHONE_WIDTH * phoneScale) / 2, halfW - margin - (PHONE_WIDTH * phoneScale) / 2);
        const phoneY = -halfH + margin + phoneH / 2 + bounce;
        this.hudTarget.set(phoneX, phoneY, -d + 0.001);
        phone.position.copy(camera.localToWorld(this.hudTarget));
        phone.quaternion.copy(ipad.quaternion);
      } else {
        // ben, 2026-11-18: it covered the iPad, even tucked. It waits on the craft table.
        this.phoneOnTable(1, delta);
      }
      this.phoneSeen = this.phone.log.length;
    } else {
      const zoom = this.ipadZoom;
      this.immersiveFrames++;
      // Wait for a real head pose (the first frames of a session can still be at the origin).
      if (!this.dockReady && this.immersiveFrames > 4 && this.headWorld.y > 0.3) this.setUpOnSet();
      ipad.scale.setScalar(full ? HUD_IPAD_FULL_XR_SCALE : HUD_IPAD_XR_SCALE * zoom);
      phone.scale.setScalar(MathUtils.lerp(HUD_PHONE_AWAKE_XR_SCALE, HUD_PHONE_XR_SCALE, this.phoneTuck) * zoom);
      const follow = this.xrPlaced ? 1 - Math.exp(-delta * 3) : 1;
      this.xrPlaced = true;
      this.hudTarget.copy(full ? HUD_IPAD_FULL_OFFSET : HUD_IPAD_OFFSET);
      camera.localToWorld(this.hudTarget);
      if (this.dockReady) {
        this.placeOnSet(full, zoom, follow, bounce, delta);
      } else {
        ipad.position.lerp(this.hudTarget, follow);
        ipad.lookAt(this.headWorld);
        // Up near the middle of the view while awake, down beside the iPad when tucked.
        // A bigger iPad pushes the phone out to keep them side by side.
        this.hudTarget.lerpVectors(HUD_PHONE_AWAKE_OFFSET, HUD_PHONE_OFFSET, this.phoneTuck);
        this.hudTarget.x *= 0.5 + 0.5 * zoom;
        this.hudTarget.y += bounce;
        camera.localToWorld(this.hudTarget);
        phone.position.lerp(this.hudTarget, follow);
        phone.lookAt(this.headWorld);
      }
    }
    // The speech bubble floats over the director and turns to face you.
    if (this.director) {
      this.director.anchor.getWorldPosition(this.bubble.mesh.position);
      this.bubble.mesh.position.y += 0.14 + BUBBLE_HEIGHT / 2;
      camera.getWorldQuaternion(this.bubble.mesh.quaternion);
    }
    this.updateDirector(delta);
    this.bubble.update(delta);
    // The actor's bubble (a blown take) floats over their head.
    this.castBubble.mesh.position.copy(this.castBubbleAt);
    camera.getWorldQuaternion(this.castBubble.mesh.quaternion);
    this.castBubble.update(delta);
  }

  /**
   * Headset, once the set is dressed: the shots on the sign over the stage (or a full page,
   * like the title, in the sign's place), the match bar and tip along the front of the stage,
   * a light's panel over the light you point at, and the phone on the stage's front corner
   * unless you've picked it up.
   */
  private placeOnSet(full: boolean, zoom: number, follow: number, bounce: number, delta: number): void {
    const camera = this.world.camera;
    const ipad = this.ipad.object;
    const phone = this.phone.mesh;
    if (full) {
      // Back in the set and smaller (ben, 2026-11-18 morning: right up in your face before).
      const scale = HUD_IPAD_FULL_XR_SCALE * 0.55;
      ipad.visible = true;
      ipad.scale.setScalar(scale);
      // At eye level in the set's open front, facing you (playthrough: up at the sign you had
      // to tilt your head about 40° to read the story and the credits).
      this.stage.localToWorld(ipad.position.set(0, VIEW_AT.y + 0.015, -0.04));
      ipad.lookAt(this.headWorld);
    } else {
      // In play there's no iPad: the sign and the strip show what it did.
      ipad.visible = false;
      ipad.position.set(0, -50, 0);
    }
    const sign = this.sign!;
    const strip = this.strip!;
    const iPad = this.ipad;
    sign.group.visible = !full;
    // Nothing on the sign is pressable any more (ben, 2026-11-18: the ceiling is in the way):
    // the tip and Got it ride a small card that floats on the set by what it's about.
    const titleStrip = full && this.phase === 'title';
    if (titleStrip) {
      // The brightness - / + under the title page, at eye level.
      strip.set({ score: -1, won: false, text: 'Too dark or bright?', coaching: false, house: null, bright: this.vrBrightness });
      ipad.updateMatrixWorld();
      const k = 0.8;
      ipad.localToWorld(strip.mesh.position.set(0, -IPAD_HEIGHT / 2 - 0.006 - (CARD_H * k) / 2, 0.002));
      ipad.getWorldQuaternion(strip.mesh.quaternion);
      strip.mesh.scale.setScalar(HUD_IPAD_FULL_XR_SCALE * 0.55 * k);
      strip.mesh.visible = true;
      (strip.mesh as unknown as { pointerEvents: string }).pointerEvents = 'auto';
      this.cardShown = false;
    }
    if (!full) {
      const won = iPad.isWon;
      sign.setLabels(
        `TARGET · ${iPad.page.eyebrow.toUpperCase()}`,
        iPad.blind ? '' : `MATCH ${iPad.scoreValue}%`,
        won ? '#4ade80' : '#ffffff',
      );
      const coach = iPad.coachText;
      // After the first scene the arrows and highlights do the talking (ben, 2026-11-18): the tip
      // goes quiet while an arrow or an outlined button on a light shows the same thing.
      const shown = this.levelIndex > 0 && !coach && (this.moveArrow?.visible || (this.dimCue && this.panel?.group.visible));
      // Once won it's hands off till Cut: no tip (playthrough: "Move the key light" during the take).
      // After the house lights lesson, the house tip is only the pulsing switch, no note (ben).
      const houseNudge = !coach && this.phase === 'playing' && iPad.hintText === HOUSE_TIP && Boolean(this.houseSwitchPlate?.visible);
      const quietHouse = houseNudge && this.coachLearned.has('house');
      const text = this.phase !== 'playing' ? '' : coach || (shown || quietHouse ? '' : iPad.hintText);
      const button = iPad.page.button;
      strip.set({ score: -1, won, text, coaching: Boolean(coach), house: null, button, highlight: this.hintName });
      // The house-lights-first tip rings the HOUSE switch, like the lesson does.
      if (houseNudge && this.houseSwitchPlate) {
        this.coachRing.ring(this.houseSwitchPlate, 0, 0, HOUSE_PLATE_W, HOUSE_PLATE_H, 0.002, false, 0.016);
        this.houseTipRing = true;
      } else if (this.houseTipRing) {
        this.houseTipRing = false;
        if (!this.coachStep) this.coachRing.hide();
      }
      const want = this.phase !== 'title' && Boolean(text || button);
      if (want) this.placeCard(Boolean(coach), text, delta);
      strip.mesh.visible = want;
      // Only a card with a button takes the pointer (ben: nothing should block reaching a light).
      (strip.mesh as unknown as { pointerEvents: string }).pointerEvents = button ? 'auto' : 'none';
      this.cardShown = want;
    } else if (!titleStrip) {
      strip.mesh.visible = false;
      this.cardShown = false;
    }
    this.updateMonitorBar();
    const alert = this.monitorAlert;
    if (alert) {
      alert.visible = !full && this.phase === 'playing' && Boolean(this.inFrameFixture);
      if (alert.visible) {
        this.alertTime += delta;
        ((alert.children[0] as Mesh).material as MeshBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(this.alertTime * 6);
      }
    }
    this.placePanel(delta);
    const onSet = !this.phone.pinned;
    phone.renderOrder = onSet ? 990 : 1003;
    (phone.material as MeshBasicMaterial).depthTest = onSet;
    if (this.phone.pinned) {
      // Picked up: in front of you, where you left it last.
      // You're scaled down on set, so it's scaled with you to look the same size in your hand.
      phone.scale.setScalar((HUD_PHONE_AWAKE_XR_SCALE * zoom) / SET_ZOOM);
      this.hudTarget.copy(this.heldOffsets.phone);
      this.hudTarget.y += bounce;
      camera.localToWorld(this.hudTarget);
      phone.position.lerp(this.hudTarget, follow);
      phone.lookAt(this.headWorld);
    } else {
      this.phoneOnTable(follow, delta);
    }
    this.phoneSeen = this.phone.log.length;
  }

  /**
   * The phone lying on the craft services table, an easter egg (ben, 2026-11-18): it lights up and
   * hops when Dee texts, and a click or pinch picks it up. It's a thing in the room, so it hides
   * behind real things. Browser and headset alike.
   */
  private phoneOnTable(follow: number, delta: number): void {
    const phone = this.phone.mesh;
    const table = this.craftTable;
    if (table) {
      // In the table's own (real-meter) frame: front edge, between the coffee urn and the donuts.
      table.updateMatrixWorld();
      table.localToWorld(this.phoneSpotPos.set(-0.2, 0.7605, 0.19));
      table.getWorldQuaternion(this.phoneSpotQuat).multiply(this.dockQuatTmp.setFromAxisAngle(X_AXIS, -Math.PI / 2 + 0.05));
    }
    phone.renderOrder = 990;
    (phone.material as MeshBasicMaterial).depthTest = true;
    phone.scale.setScalar(PHONE_SPOT_SCALE);
    phone.position.lerp(this.phoneSpotPos, follow);
    phone.quaternion.slerp(this.phoneSpotQuat, follow);
    if (!phone.visible && this.phone.log.length > 0) phone.visible = true;
    // A new text buzzes it on the table: a few little hops, for anyone observant.
    if (this.phoneHop) {
      this.phoneHop = false;
      this.phoneBuzz = 1.2;
    }
    if (this.phoneBuzz > 0) {
      this.phoneBuzz -= delta;
      phone.position.y = this.phoneSpotPos.y + Math.abs(Math.sin(this.phoneBuzz * 40)) * 0.0012 * Math.min(1, this.phoneBuzz);
    }
  }

  /**
   * Headset: the tip card, a small dark card floating in the set by what it's talking about
   * (ben, 2026-11-18): under or over the light the tip or lesson is about, by the HOUSE switch
   * for the house lights, else at the front of the set just under your eyes. It stays put in
   * the world (it glides when the subject changes) and turns to face you.
   */
  private placeCard(coaching: boolean, tip: string, delta: number): void {
    const strip = this.strip!;
    const skill = coaching ? this.coachStep?.skill : undefined;
    const aboutHouse = Boolean(this.houseSwitchPlate?.visible) && (skill === 'house' || (!coaching && /house lights/i.test(tip)));
    const f = coaching
      ? skill === 'switch' || skill === 'dimmer' || skill === 'drag' || skill === 'raise'
        ? this.coachFixture
        : undefined
      : this.phase === 'playing'
        ? this.arrowFixture
        : undefined;
    const halfH = (CARD_H * CARD_SCALE) / 2;
    const halfW = (CARD_W * CARD_SCALE) / 2;
    const at = this.v6;
    const sign = this.sign;
    if (skill === 'moveset') {
      // Just over the grab spot on the floor.
      at.copy(SET_PAD_AT);
      at.y += 0.1;
    } else if (skill === 'shots' && sign) {
      // Beside the TARGET sign's lower inner corner, just over the set's front edge.
      const sp = sign.group.position;
      const sw = sign.width * sign.group.scale.x;
      const sh = sign.height * sign.group.scale.x;
      at.set(sp.x - sw / 2 - halfW - 0.008, sp.y - sh / 2 + halfH, sp.z);
    } else if (aboutHouse && this.houseSwitchPlate) {
      // Beside the wall switch, a little in from the wall and toward you.
      const plate = this.houseSwitchPlate.position;
      at.set(-STAGE_WIDTH / 2 + halfW + 0.012, plate.y + 0.06, plate.z + 0.015);
    } else if (f && this.fixtures.indexOf(f) >= 0) {
      at.copy(f.local);
      // High lights: under the light (the light's panel sits over it). Low ones: over the panel.
      if (at.y >= 0.12) at.y -= 0.045 + halfH;
      else at.y += 0.05 + PANEL_H * PANEL_SCALE + 0.012 + halfH;
      // It hangs off the light toward the nearer side wall, away from the actor in the middle.
      at.x += at.x <= 0 ? 0.025 - halfW : halfW - 0.025;
      at.x = MathUtils.clamp(at.x, -STAGE_WIDTH / 2 + halfW, STAGE_WIDTH / 2 - halfW);
      at.z = Math.min(at.z + 0.04, STAGE_DEPTH / 2);
    } else {
      // Along the set's front edge, below the cast, so it never covers the actor's face.
      at.set(0, 0.035, STAGE_DEPTH / 2 + 0.01);
    }
    at.y = MathUtils.clamp(at.y, 0.02, STAGE_HEIGHT + 0.05);
    this.stage.localToWorld(at);
    const mesh = strip.mesh;
    if (!this.cardShown || mesh.position.distanceToSquared(at) > 4) mesh.position.copy(at);
    else mesh.position.lerp(at, 1 - Math.exp(-6 * delta));
    mesh.scale.setScalar(CARD_SCALE);
    this.world.camera.getWorldQuaternion(mesh.quaternion);
  }

  /**
   * Headset: the HOUSE switch, a wall plate inside the set wall toward the
   * director, at about your hand's height (ben, 2026-11-18: up on the sign it was impossible to pinch).
   */
  private buildHouseSwitch(): void {
    if (this.houseSwitchPlate) return;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 224;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#e7e5e4';
      ctx.beginPath();
      ctx.roundRect(4, 4, 152, 216, 14);
      ctx.fill();
      ctx.fillStyle = '#18181b';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOUSE', 80, 44);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plate = new Mesh(new PlaneGeometry(HOUSE_PLATE_W, HOUSE_PLATE_H), new MeshBasicMaterial({ map: texture, toneMapped: false }));
    plate.name = 'house-wall-switch';
    // The rocker: a dark paddle that tips up (lights on) or down (off).
    const rocker = new Mesh(new BoxGeometry(0.014, 0.024, 0.004), new MeshStandardMaterial({ color: '#3f3f46', roughness: 0.5 }));
    rocker.position.set(0, -0.006, 0.002);
    plate.add(rocker);
    // On the inside of the side wall toward the director, just inside the open front.
    plate.position.set(-STAGE_WIDTH / 2 + 0.0045, 0.16, STAGE_DEPTH / 2 - 0.04);
    plate.rotation.y = Math.PI / 2;
    this.stage.add(plate);
    this.houseSwitchPlate = plate;
    this.houseSwitchRocker = rocker;
    this.stage.updateMatrixWorld(true);
    this.createSwitch(plate.getWorldPosition(new Vector3()), 0.05, () => {
      // Hidden outdoors (no house lights there), so it does nothing either.
      if (!plate.visible) return;
      this.houseIntroIn = -1;
      sfx.click();
      this.toggleHouse();
    });
    this.updateHouseSwitchPlate();
  }

  /**
   * Headset: one HOUSE switch, the same in every scene (ben, 2026-11-18: scene 2's looked
   * different). A set with its own wall switch (scene 2's study) hides it, and the HOUSE plate
   * sits just in front of that set's wall panelling so it isn't buried behind it. Outdoors there's none.
   */
  private fitHouseSwitchToSet(): void {
    const plate = this.houseSwitchPlate;
    if (!this.dockReady || !plate) return;
    const own = this.set?.getObjectByName('house-switch');
    if (own) {
      own.visible = false;
      if (this.wallSwitch) {
        this.removeSwitch(this.wallSwitch.switch);
        this.wallSwitch = undefined;
      }
    }
    plate.position.x = own ? own.position.x + 0.0015 : -STAGE_WIDTH / 2 + 0.0045;
    plate.visible = !this.level.outdoor;
    this.updateHouseSwitchPlate();
  }

  /**
   * The camera, its operator and the little monitor never take a pinch or a click (ben,
   * 2026-11-18: you couldn't reach lights behind them), so pointing goes straight through.
   */
  private passThroughCameraRig(): void {
    this.cameraRig?.traverse((child) => {
      (child as unknown as { pointerEvents: string }).pointerEvents = 'none';
    });
  }

  /**
   * Headset: a small grab spot on the studio floor by the director (ben, 2026-11-18 morning):
   * pinch it and drag to slide the whole set closer or farther, for when it's too close or too
   * far after you put the headset down. The floor point you grabbed stays under your pointer.
   */
  private buildSetPad(): void {
    if (this.setPad) return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(30,31,36,0.9)';
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,217,10,0.55)';
      ctx.lineWidth = 8;
      ctx.stroke();
      // Four arrows out from the middle: "move".
      ctx.fillStyle = 'rgba(235,235,240,0.85)';
      ctx.strokeStyle = 'rgba(235,235,240,0.85)';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(128, 128);
        ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath();
        ctx.moveTo(0, 18);
        ctx.lineTo(0, 70);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 98);
        ctx.lineTo(-22, 66);
        ctx.lineTo(22, 66);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const pad = new Mesh(new PlaneGeometry(SET_PAD_SIZE, SET_PAD_SIZE), new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }));
    pad.name = 'set-grab-pad';
    pad.rotation.x = -Math.PI / 2;
    pad.position.copy(SET_PAD_AT);
    pad.renderOrder = 2;
    (pad as unknown as { pointerEvents: string }).pointerEvents = 'none';
    this.stage.add(pad);
    this.setPad = pad;
  }

  /** While a hand holds the grab spot: slide the player so the grabbed floor point stays under its ray. */
  private dragSet(): void {
    const drag = this.setDrag;
    if (!drag) return;
    const o = this.rayOrigin;
    const d = this.rayDir;
    if (d.y > -0.05) return;
    const t = (drag.grab.y - o.y) / d.y;
    const player = this.world.player;
    player.position.x += drag.grab.x - (o.x + d.x * t);
    player.position.z += drag.grab.z - (o.z + d.z * t);
    const dx = player.position.x - this.playerHome.x;
    const dz = player.position.z - this.playerHome.z;
    const len = Math.hypot(dx, dz);
    if (len > SET_SLIDE_MAX) {
      player.position.x = this.playerHome.x + (dx * SET_SLIDE_MAX) / len;
      player.position.z = this.playerHome.z + (dz * SET_SLIDE_MAX) / len;
    }
  }

  /** Redraws the camera monitor's match bar when the match changes. */
  private updateMonitorBar(): void {
    const bar = this.monitorBar;
    if (!bar) return;
    const score = this.ipad.blind ? -1 : this.ipad.scoreValue;
    const won = this.ipad.isWon;
    const key = `${score}|${won}`;
    if (key === bar.key) return;
    bar.key = key;
    const ctx = bar.canvas.getContext('2d');
    if (!ctx) return;
    const W = bar.canvas.width;
    const H = bar.canvas.height;
    ctx.fillStyle = '#111216';
    ctx.fillRect(0, 0, W, H);
    if (score >= 0) {
      ctx.fillStyle = '#2a2b30';
      ctx.fillRect(6, 12, W - 70, H - 24);
      ctx.fillStyle = won ? '#4ade80' : score >= 80 ? '#f5d90a' : '#f97316';
      ctx.fillRect(6, 12, ((W - 70) * score) / 100, H - 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${score}%`, W - 58, H / 2 + 1);
    }
    bar.texture.needsUpdate = true;
  }

  private updateHouseSwitchPlate(): void {
    if (this.houseSwitchRocker) this.houseSwitchRocker.rotation.x = this.houseOn ? -0.35 : 0.35;
  }

  /** The craft services table, found once per scene load (crew are re-placed per scene). */
  private get craftTable(): Object3D | undefined {
    if (!this.craftTableRef || !this.craftTableRef.parent) this.craftTableRef = this.world.scene.getObjectByName('craft-table');
    return this.craftTableRef;
  }

  /**
   * A light's panel (switch, dimmer, color) floats just over the light you point at or move,
   * turned to face you, and stays a moment after so you can move the pointer onto it. While
   * the coach teaches a light's switch or dimmer, that light's panel stays up.
   */
  private placePanel(delta: number): void {
    const panel = this.panel!;
    const step = this.coachStep?.skill;
    const coached = (step === 'switch' || step === 'dimmer') && this.coachFixture ? this.coachFixture : undefined;
    const pointed = this.fixtures.find((f) => !SHAPERS.has(f.item.kind) && (f.entity.hasComponent(Hovered) || f.entity.hasComponent(Grabbed)));
    // A brightness tip keeps that light's panel up, in sync with the tip line (ben, 2026-11-18).
    const cued = this.dimCue && !this.ipad.coachText && this.phase === 'playing' ? this.dimCue : undefined;
    const wanted = pointed ?? coached ?? cued;
    if (wanted) {
      this.panelFixture = wanted;
      this.panelLinger = Math.max(this.panelLinger, PANEL_LINGER);
    } else if (this.panelHot) {
      this.panelLinger = Math.max(this.panelLinger, PANEL_LINGER);
    } else {
      this.panelLinger -= delta;
    }
    const f = this.panelLinger > 0 ? this.panelFixture : undefined;
    if (!f || this.ipad.isFull || this.fixtures.indexOf(f) < 0) {
      panel.group.visible = false;
      this.panelFixture = undefined;
      return;
    }
    panel.set({
      label: KIND_LABELS[f.item.kind],
      on: f.on,
      dimmer: f.item.dimmer ? Math.round(f.dimmer * 100) : undefined,
      kelvin: f.item.dial ? f.kelvin : undefined,
      cue: f === this.dimCue && !this.ipad.coachText && this.phase === 'playing' ? this.dimCueDir : undefined,
    });
    // Just over the light's head (its bounds take in its beam, so go by where the head is).
    // A bit bigger than life, so it reads from where you stand; smaller on a light right in
    // front of you, where full size was big and in your face (ben, 2026-11-18).
    let scale = PANEL_SCALE;
    if (this.dockReady) {
      this.stage.localToWorld(this.v5.copy(f.local));
      scale *= MathUtils.clamp(this.v5.distanceTo(this.headWorld) / 0.42, 0.5, 1);
    }
    this.v5.copy(f.local);
    this.v5.y += 0.05 + (PANEL_H * scale) / 2;
    this.stage.localToWorld(panel.group.position.copy(this.v5));
    panel.group.scale.setScalar(scale);
    this.world.camera.getWorldQuaternion(panel.group.quaternion);
    panel.group.visible = true;
  }

  /** A press on a light's panel: its switch, dimmer or color. */
  private pressPanel(control: PanelControl): void {
    const f = this.panelFixture;
    if (!f) return;
    this.panelLinger = Math.max(this.panelLinger, PANEL_LINGER);
    if (control === 'power') this.toggle(f);
    else if (control === 'dimmer' || control === 'brighter') this.turnDimmer(f, control === 'dimmer' ? -1 : 1);
    else this.turnDial(f, control === 'warmer' ? -1 : 1);
  }

  /**
   * Headset: what a hand's ray points at among the things you press (a full page, the phone,
   * the strip, a light's panel). While it points at one, that hand's near-grab is off, so a
   * press lands there and never on a light behind it near your hand (ben, 2026-11-17).
   * Squeeze while pointing at the picked-up phone and drag to move it in your view.
   */
  private updateHudRays(): void {
    const session = this.immersive ? this.world.renderer.xr.getSession() : null;
    this.panelHot = false;
    if (!session) {
      this.hudDrag = null;
      return;
    }
    if (this.selectSession !== session) {
      this.selectSession = session;
      const held = this.selectHeld;
      const set = (on: boolean) => (e: XRInputSourceEvent) => {
        const h = e.inputSource.handedness;
        if (h === 'left' || h === 'right') held[h] = on;
      };
      session.addEventListener('selectstart', set(true));
      session.addEventListener('selectend', set(false));
    }
    let holding = false;
    for (const fixture of this.fixtures) if (fixture.entity.hasComponent(Grabbed)) holding = true;
    for (const source of session.inputSources) {
      const hand = source.handedness;
      if (hand !== 'left' && hand !== 'right') continue;
      const space = this.world.player.raySpaces[hand];
      if (!space) continue;
      space.getWorldPosition(this.rayOrigin);
      space.getWorldDirection(this.rayDir).negate();
      const hit = this.hudUnderRay();
      if (hit?.what === 'panel') this.panelHot = true;
      // The floor grab spot: pinch on it and drag to slide the whole set.
      const select = (source.gamepad?.buttons[0]?.pressed ?? false) || this.selectHeld[hand];
      const wasSelect = this.prevSelect[hand];
      this.prevSelect[hand] = select;
      if (this.setDrag && this.setDrag.hand === hand) {
        if (!select) {
          this.setDrag = null;
          this.setMoved = true;
          devLog('moved the set');
        } else {
          this.dragSet();
        }
      } else if (!this.setDrag && select && !wasSelect && !hit && !holding && this.setPad?.visible) {
        const padHit = this.hudRaycaster.intersectObject(this.setPad, false)[0];
        if (padHit) {
          this.setDrag = { hand, grab: padHit.point.clone() };
          devLog('grabbed the set');
        }
      }
      const squeeze = source.gamepad?.buttons[1]?.pressed ?? false;
      const drag = this.hudDrag;
      if (drag && drag.hand === hand) {
        if (!squeeze) {
          this.hudDrag = null;
          saveHeldOffsets(this.heldOffsets);
          devLog(`moved the ${drag.what}`);
        } else {
          this.v1.copy(this.rayOrigin).addScaledVector(this.rayDir, drag.distance);
          this.world.camera.worldToLocal(this.v1);
          this.heldOffsets[drag.what].copy(this.v1);
        }
      } else if (!drag && squeeze && hit && !holding && hit.what === 'phone' && this.phone.pinned) {
        this.hudDrag = { hand, what: 'phone', distance: hit.distance };
      }
      const wantGrab = holding || (!hit && this.hudDrag?.hand !== hand);
      if (wantGrab !== this.grabOn[hand]) {
        this.grabOn[hand] = wantGrab;
        this.input.xr.multiPointers[hand].toggleSubPointer('grab', wantGrab);
      }
    }
  }

  /** What the ray (rayOrigin, rayDir) hits first among a full page, the phone, the strip and a light's panel. */
  private hudUnderRay(): { what: 'ipad' | 'phone' | 'strip' | 'panel'; distance: number } | null {
    const ray = this.hudRaycaster;
    ray.set(this.rayOrigin, this.rayDir);
    ray.far = 4;
    let best: { what: 'ipad' | 'phone' | 'strip' | 'panel'; distance: number } | null = null;
    const consider = (what: 'ipad' | 'phone' | 'strip' | 'panel', object: Object3D | undefined) => {
      if (!object?.visible) return;
      const hit = ray.intersectObject(object, true)[0];
      if (!hit || (best && best.distance <= hit.distance)) return;
      if (what === 'ipad' && !this.ipad.contains(this.ipad.object.worldToLocal(this.v2.copy(hit.point)).y)) return;
      // The tip card only takes the ray on its buttons: lights behind its text stay reachable.
      if (what === 'strip' && this.strip) {
        const at = this.strip.mesh.worldToLocal(this.v2.copy(hit.point));
        if (!this.strip.controlAt(at.x, at.y)) return;
      }
      best = { what, distance: hit.distance };
    };
    consider('ipad', this.ipad.object);
    consider('phone', this.phone.mesh);
    consider('strip', this.strip?.mesh);
    consider('panel', this.panel?.group);
    return best;
  }

  /**
   * Headset start: dresses the set (once per session, from the set's own layout, not from
   * you): the sign over the front of the stage, the strip along its front lip, the phone on
   * its corner. Then turns your view to face the set.
   */
  private setUpOnSet(): void {
    this.dockReady = true;
    this.buildSetHud();
    const stage = this.stage;
    this.applyBrightness(true);
    // A dark studio around you in plain VR (no passthrough); the real room shows through in AR.
    const session = this.world.renderer.xr.getSession();
    if (session && session.environmentBlendMode === 'opaque') this.world.scene.background = this.backdrop;
    stage.updateMatrixWorld(true);
    this.placeViewer();
    this.playerHome.copy(this.world.player.position);
    this.buildSetPad();
    const local = this.dockTmp.copy(VIEW_AT);
    // The TARGET sign hangs off the set's top front corner toward craft services, just above the
    // front edge, turned to face you (ben, 2026-11-18 morning: up on the back wall you had to
    // look away from the lesson to find it). Above the front edge it hides nothing on the set.
    const sign = this.sign!;
    const s = SIGN_SCALE * SIGN_CORNER_SCALE;
    const front = STAGE_DEPTH / 2;
    const signW = sign.width * s;
    const signH = sign.height * s;
    const bottom = STAGE_HEIGHT + 0.015;
    const sightY = bottom;
    sign.group.scale.setScalar(s);
    sign.group.rotation.set(0, 0, 0);
    sign.group.position.set(STAGE_WIDTH / 2 + signW / 2 - 0.11, bottom + signH / 2, front + 0.01);
    sign.group.visible = true;
    stage.add(sign.group);
    stage.updateMatrixWorld(true);
    sign.group.lookAt(stage.localToWorld(this.v1.copy(local)));
    const posts = stage.getObjectByName('shot-sign-posts');
    if (posts) {
      posts.removeFromParent();
      posts.clear();
    }
    const postGroup = posts ?? new Group();
    postGroup.name = 'shot-sign-posts';
    const metal = new MeshStandardMaterial({ color: '#2a2b30', metalness: 0.5, roughness: 0.5 });
    // A short pipe up from the corner post to the sign.
    const post = new Mesh(new CylinderGeometry(0.003, 0.003, 0.03, 8), metal);
    post.position.set(STAGE_WIDTH / 2, STAGE_HEIGHT + 0.012, front);
    postGroup.add(post);
    stage.add(postGroup);
    const pitch = 0;
    sign.group.updateMatrixWorld(true);
    sign.group.getWorldPosition(this.signPos);
    sign.group.getWorldQuaternion(this.signQuat);
    // The strip: on the sign, right under the shots.
    const strip = this.strip!;
    // (It's a pressable entity, kept under the level root, so it follows the sign each frame.)
    // The tip card floats in the set, so nothing on set hides it.
    strip.mesh.renderOrder = 1003;
    (strip.mesh.material as MeshBasicMaterial).depthTest = false;
    (strip.mesh.material as MeshBasicMaterial).depthWrite = false;
    strip.mesh.visible = false;
    // The phone, lying tipped toward you on the apron's front corner.
    const lean = MathUtils.degToRad(72);
    this.v1.set(PHONE_SPOT.x, PHONE_SPOT.y + ((PHONE_HEIGHT * PHONE_SPOT_SCALE) / 2) * Math.cos(lean), PHONE_SPOT.z);
    stage.localToWorld(this.phoneSpotPos.copy(this.v1));
    stage.getWorldQuaternion(this.phoneSpotQuat).multiply(this.dockQuatTmp.setFromAxisAngle(X_AXIS, -lean));
    this.buildHouseSwitch();
    this.fitHouseSwitchToSet();
    this.passThroughCameraRig();
    devLog(
      `on set: sign bottom ${bottom.toFixed(2)} m over the set floor (sightline ${sightY.toFixed(2)}), tipped ${MathUtils.radToDeg(pitch).toFixed(0)}°`,
    );
  }

  /**
   * Puts you right in front of the set's open front, eyes a little above its floor, facing it,
   * and makes the set look SET_ZOOM times bigger by scaling you down (ben, 2026-11-18: "the main
   * studio should be right in front of you. and you should be closer, and it should feel bigger").
   * Scaling you, not the set, keeps the lights' falloff and shadows exactly as scored.
   */
  private placeViewer(): void {
    const player = this.world.player;
    const camera = this.world.camera;
    const stage = this.stage;
    // Face the set: the stage's own -z, whatever way your head happens to point in the room.
    this.dockDir.set(0, 0, -1).applyQuaternion(stage.getWorldQuaternion(this.dockQuatTmp));
    const faceYaw = Math.atan2(-this.dockDir.x, -this.dockDir.z);
    this.dockDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const headYaw = Math.atan2(-this.dockDir.x, -this.dockDir.z);
    player.rotation.set(0, faceYaw - headYaw, 0);
    player.scale.setScalar(1 / SET_ZOOM);
    // Then slide the room so your eyes land on the spot.
    stage.localToWorld(this.v1.copy(VIEW_AT));
    this.v2.copy(camera.position).multiplyScalar(1 / SET_ZOOM).applyAxisAngle(Y_AXIS, player.rotation.y);
    player.position.copy(this.v1).sub(this.v2);
    player.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(this.headWorld);
    const at = stage.worldToLocal(this.v3d.copy(this.headWorld));
    devLog(`viewer at ${at.x.toFixed(2)},${at.y.toFixed(2)},${at.z.toFixed(2)} in set meters (camera local y ${camera.position.y.toFixed(2)})`);
  }

  /** Headset brightness: an exposure on the view of the room and set (the shots on the sign stay as they are). */
  private applyBrightness(on: boolean): void {
    const renderer = this.world.renderer;
    if (on) {
      if (this.toneMappingHome === undefined) {
        this.toneMappingHome = renderer.toneMapping;
        this.exposureHome = renderer.toneMappingExposure;
      }
      if (this.toneMappingHome === NoToneMapping) renderer.toneMapping = LinearToneMapping;
      renderer.toneMappingExposure = this.exposureHome * BRIGHT_STEPS[this.vrBrightness];
    } else if (this.toneMappingHome !== undefined) {
      renderer.toneMapping = this.toneMappingHome;
      renderer.toneMappingExposure = this.exposureHome;
      this.toneMappingHome = undefined;
    }
  }

  private setBrightness(step: number): void {
    this.vrBrightness = MathUtils.clamp(step, 0, BRIGHT_STEPS.length - 1);
    saveBrightness(this.vrBrightness);
    if (this.dockReady) this.applyBrightness(true);
    devLog(`brightness ${this.vrBrightness + 1}`);
  }

  /** Leaving or entering the headset: the set goes back to how it was, and is dressed again next time. */
  private resetOnSet(): void {
    this.applyBrightness(false);
    this.dockReady = false;
    this.immersiveFrames = 0;
    this.xrPlaced = false;
    const player = this.world.player;
    if (player) {
      player.position.set(0, 0, 0);
      player.rotation.set(0, 0, 0);
      player.scale.setScalar(1);
    }
    if (this.sign) this.sign.group.visible = false;
    if (this.houseTipRing) {
      this.houseTipRing = false;
      if (!this.coachStep) this.coachRing.hide();
    }
    if (this.monitorAlert) this.monitorAlert.visible = false;
    this.cardShown = false;
    this.stage?.getObjectByName('shot-sign-posts')?.removeFromParent();
    if (this.strip) this.strip.mesh.visible = false;
    if (this.panel) this.panel.group.visible = false;
    this.panelFixture = undefined;
    if (this.ipad) this.ipad.object.visible = true;
    if (this.phone) {
      this.phone.mesh.renderOrder = 1003;
      (this.phone.mesh.material as MeshBasicMaterial).depthTest = false;
    }
    this.hudDrag = null;
    for (const hand of ['left', 'right'] as const) {
      if (!this.grabOn[hand]) {
        this.grabOn[hand] = true;
        this.input.xr.multiPointers[hand].toggleSubPointer('grab', true);
      }
    }
  }

  /** Builds the sign, the strip and the light panel once, with their press handlers. */
  private buildSetHud(): void {
    // A small YOUR SHOT monitor on a C-stand beside the film camera, by the operator (ben, 2026-11-18).
    if (!this.camMonitor) {
      const stand = new Group();
      stand.name = 'camera-side-monitor';
      const metal = new MeshStandardMaterial({ color: '#3a3b40', metalness: 0.6, roughness: 0.45 });
      const top = CAMERA_POSITION[1] + 0.012;
      // Three low, splayed legs (a C-stand's turtle base) and a riser up to the knuckle.
      const legGeometry = new CylinderGeometry(0.0007, 0.0007, 0.03, 6);
      for (let i = 0; i < 3; i++) {
        const leg = new Mesh(legGeometry, metal);
        const a = (i / 3) * Math.PI * 2 + 0.4;
        leg.position.set(Math.sin(a) * 0.011, 0.007, Math.cos(a) * 0.011);
        leg.rotation.set(Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1);
        stand.add(leg);
      }
      const riser = new Mesh(new CylinderGeometry(0.0009, 0.0009, top - 0.008, 6), metal);
      riser.position.y = 0.008 + (top - 0.008) / 2;
      const knuckle = new Mesh(new CylinderGeometry(0.0018, 0.0018, 0.003, 8), metal);
      knuckle.position.y = top;
      // A short arm from the knuckle to the back of the monitor.
      const arm = new Mesh(new CylinderGeometry(0.0006, 0.0006, 0.008, 6), metal);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, top, -0.004);
      stand.add(riser, knuckle, arm);
      // Bigger again (ben, 2026-11-18 morning), growing downward: its top edge stays where the
      // 0.039-wide one's was, so it sits no higher in the set.
      const w = 0.05;
      const h = (w * 9) / 16;
      const topEdge = top + (0.039 * 9) / 16 + 0.002;
      const mon = new Group();
      const frame = new Mesh(new BoxGeometry(w + 0.003, h + 0.003, 0.002), new MeshStandardMaterial({ color: '#111216', roughness: 0.6 }));
      const screen = new Mesh(new PlaneGeometry(w, h), this.ipad.liveMaterial);
      screen.position.z = 0.0011;
      mon.add(frame, screen);
      // A red border that lights up while a light is in the shot (ben, 2026-11-18: so you notice
      // what the frame is).
      // A frame of four thin bars, wrapping the screen and the match bar under it.
      const alertMat = new MeshBasicMaterial({ color: '#ef4444', transparent: true, toneMapped: false });
      const alert = new Group();
      const aw = w + 0.0055;
      const ah = h + 0.0055 + 0.0076;
      const t = 0.0016;
      for (const [bw, bh, bx, by] of [
        [aw, t, 0, ah / 2 - t / 2],
        [aw, t, 0, -ah / 2 + t / 2],
        [t, ah, -aw / 2 + t / 2, 0],
        [t, ah, aw / 2 - t / 2, 0],
      ]) {
        const bar = new Mesh(new PlaneGeometry(bw, bh), alertMat);
        bar.position.set(bx, by, 0);
        alert.add(bar);
      }
      alert.position.set(0, -0.0038, 0.0012);
      alert.name = 'monitor-in-frame';
      alert.visible = false;
      mon.add(alert);
      this.monitorAlert = alert;
      // The match bar, a copy of the sign's, along the monitor's bottom edge (ben, 2026-11-18).
      const barCanvas = document.createElement('canvas');
      barCanvas.width = 256;
      barCanvas.height = 40;
      const barTexture = new CanvasTexture(barCanvas);
      barTexture.colorSpace = SRGBColorSpace;
      const bar = new Mesh(new PlaneGeometry(w + 0.003, 0.0047), new MeshBasicMaterial({ map: barTexture, toneMapped: false }));
      bar.position.set(0, -h / 2 - 0.0038, 0.0011);
      mon.add(bar);
      this.monitorBar = { canvas: barCanvas, texture: barTexture, key: '' };
      // Faces back toward the operator and you, tipped up a little.
      mon.position.set(0, topEdge - h / 2, 0.001);
      mon.rotation.x = -0.25;
      stand.add(mon);
      stand.position.set(0.03, 0, 0.024);
      stand.rotation.y = -0.35;
      this.cameraRig.add(stand);
      this.camMonitor = stand;
    }
    if (this.sign) return;
    type Pressable = { addEventListener: (type: string, fn: (event: { point?: Vector3 }) => void) => void; pointerEventsOrder: number };
    // The sign's live picture is the iPad's own (so the creature feature shows there too).
    // Only the TARGET: you match it by looking at the live set (ben, 2026-11-18); your shot is on the camera monitor.
    const sign = new ShotSign(this.targetShot.texture, this.ipad.liveMaterial, 16 / 9, true);
    // A dark box behind the face, so it reads as a real sign.
    const boxH = sign.height + 0.01;
    const box = new Mesh(new BoxGeometry(sign.width + 0.01, boxH, 0.018), new MeshStandardMaterial({ color: '#17171a', roughness: 0.6 }));
    box.position.set(0, sign.height / 2 + 0.005 - boxH / 2, -0.0095);
    sign.group.add(box);
    this.sign = sign;
    const strip = new EdgeStrip();
    this.strip = strip;
    this.world.createTransformEntity(strip.mesh).addComponent(RayInteractable);
    const stripObject = strip.mesh as unknown as Pressable;
    stripObject.pointerEventsOrder = 10;
    stripObject.addEventListener('pointerdown', (event) => {
      if (!this.immersive || !event.point) return;
      const at = strip.mesh.worldToLocal(this.v4.copy(event.point));
      const control = strip.controlAt(at.x, at.y);
      if (control === 'house') this.toggleHouse();
      else if (control === 'next') this.pressCard();
      else if (control === 'darker' || control === 'brighter') this.setBrightness(this.vrBrightness + (control === 'brighter' ? 1 : -1));
    });
    const panel = new LightPanel();
    this.panel = panel;
    this.world.createTransformEntity(panel.group).addComponent(RayInteractable);
    const panelObject = panel.group as unknown as Pressable;
    panelObject.pointerEventsOrder = 20;
    panelObject.addEventListener('pointerdown', (event) => {
      if (!this.immersive || !event.point) return;
      const at = panel.group.worldToLocal(this.v4.copy(event.point));
      const control = panel.controlAt(at.x, at.y);
      if (control) this.pressPanel(control);
    });
  }

  /**
   * In the headset, pushing either controller's thumbstick up or down scrolls
   * Dee's chat (up = older texts), and brings a tucked phone up first
   * (ben, round 6). It scrolls smoothly, faster the further it's pushed.
   */
  private scrollPhoneWithThumbstick(delta: number): void {
    this.thumbstickWait = Math.max(0, this.thumbstickWait - delta);
    const session = this.immersive ? this.world.renderer.xr.getSession() : null;
    if (!session) return;
    let y = 0;
    for (const source of session.inputSources) {
      const axes = source.gamepad?.axes;
      // xr-standard: axes 2 and 3 are the thumbstick's x and y (y is negative when pushed up).
      if (axes && axes.length >= 4 && Math.abs(axes[3]) > Math.abs(y)) y = axes[3];
    }
    if (Math.abs(y) < 0.3) {
      this.thumbstickWait = 0;
      return;
    }
    if (!this.phone.awake) {
      if (this.thumbstickWait > 0) return;
      this.thumbstickWait = 0.4;
      this.phone.wake();
      return;
    }
    this.phone.scrollBy(-y * 900 * delta);
  }

  /** The light under the pointer (or being moved); its switch on the iPad gets outlined. */
  private updateHoverTag(): void {
    let fixture: Fixture | undefined;
    if (this.immersive) {
      fixture = this.fixtures.find((f) => f.entity.hasComponent(Hovered) || f.entity.hasComponent(Grabbed));
    } else {
      fixture = this.dragged ?? this.mouseHover ?? undefined;
    }
    if (fixture !== this.hovered) {
      this.hovered = fixture;
      if (fixture) devLog(`hover ${fixture.item.kind}`);
    }
    this.updateLightButtons();
  }

  /**
   * The studio's house lights: flat, even light from above that shows the
   * whole set but flattens the face. They start on, are left out of the
   * target shot, and HOUSE on the iPad turns them off.
   */
  private buildHouseLights(): void {
    const fill = new HemisphereLight('#f4f1ea', '#3a3631', 1.4);
    fill.name = 'house-fill';
    const top = new DirectionalLight('#fff8ee', 1.2);
    top.name = 'house-top';
    this.stage.getWorldPosition(this.v1);
    top.position.set(this.v1.x, this.v1.y + 1, this.v1.z + 0.2);
    top.target.position.copy(this.v1);
    this.world.scene.add(fill, top, top.target);
    this.houseLights = [fill, top];
    this.houseIntensity = [fill.intensity, top.intensity];

    // The fixtures themselves: industrial dome lights hanging from the grid, up
    // out of the shot, glowing while the house lights are on. Its switch is
    // HOUSE on the iPad's light row.
    const shadeMaterial = new MeshStandardMaterial({ color: '#3b3d42', roughness: 0.45, metalness: 0.6 });
    const cableMaterial = new MeshStandardMaterial({ color: '#111113', roughness: 0.8 });
    this.houseBulb = new MeshStandardMaterial({ color: '#fff6e6', emissive: '#fff3dd', emissiveIntensity: 2.2 });
    const shadeGeometry = new CylinderGeometry(0.006, 0.02, 0.014, 20, 1, true);
    const capGeometry = new CylinderGeometry(0.006, 0.006, 0.006, 12);
    const bulbGeometry = new CylinderGeometry(0.017, 0.017, 0.002, 20);
    const cableGeometry = new CylinderGeometry(0.0008, 0.0008, 0.024, 6);
    const houseRig = new Group();
    houseRig.name = 'house-fixtures';
    for (const x of [-0.16, 0, 0.16]) {
      for (const z of [-0.08, 0.12]) {
        const lamp = new Group();
        lamp.name = 'house-fixture';
        const cable = new Mesh(cableGeometry, cableMaterial);
        cable.position.y = 0.012;
        const cap = new Mesh(capGeometry, shadeMaterial);
        cap.position.y = 0.003;
        const shade = new Mesh(shadeGeometry, shadeMaterial);
        shade.material.side = 2; // both sides, so the open shade reads from below
        shade.position.y = -0.007;
        const bulb = new Mesh(bulbGeometry, this.houseBulb);
        bulb.position.y = -0.012;
        lamp.add(cable, cap, shade, bulb);
        lamp.position.set(x, STAGE_HEIGHT - 0.024, z);
        houseRig.add(lamp);
      }
    }
    this.stage.add(houseRig);
  }

  // --- Test helper -------------------------------------------------------------

  /** Puts the right lights in the right places (used by the automated playthrough test). */
  private solve(): void {
    this.houseOn = false;
    if (this.practical) this.practical.on = true;
    const used = new Set<Fixture>();
    for (const fixture of this.fixtures) fixture.on = false;
    for (const role of this.level.roles) {
      if (role.warm) {
        // Dial the bi-color light for this role down to warm first.
        const dial = this.fixtures.find((f) => !used.has(f) && f.item.dial && role.kinds.includes(f.item.kind));
        if (dial && dial.kelvin !== KELVIN_MIN) this.setKelvin(dial, KELVIN_MIN);
      }
      const fixture = this.fixtures.find((f) => !used.has(f) && this.fits(role, f));
      if (!fixture) continue;
      used.add(fixture);
      fixture.on = true;
      if (fixture.item.dimmer && role.level !== undefined) fixture.dimmer = role.level;
      if (!this.level.locked) this.roleLocal(role, fixture.local);
    }
  }

  // --- Desktop view and mouse controls ------------------------------------

  /** Starts the orbit from wherever the configured desktop camera is. */
  private initOrbit(): void {
    this.stage.getWorldPosition(this.pivot);
    // Aim a little low so the set sits in the upper part of the window, above the lower third.
    this.pivot.y -= 0.05;
    this.world.camera.getWorldPosition(this.v1);
    this.v1.sub(this.pivot);
    this.orbit.radius = this.v1.length();
    this.orbit.yaw = Math.atan2(this.v1.x, this.v1.z);
    this.orbit.pitch = Math.asin(MathUtils.clamp(this.v1.y / this.orbit.radius, -1, 1));
  }

  private applyOrbit(): void {
    const { yaw, pitch, radius } = this.orbit;
    this.v1.set(
      this.pivot.x + radius * Math.sin(yaw) * Math.cos(pitch),
      this.pivot.y + radius * Math.sin(pitch),
      this.pivot.z + radius * Math.cos(yaw) * Math.cos(pitch),
    );
    const camera = this.world.camera;
    camera.parent?.worldToLocal(this.v1);
    camera.position.copy(this.v1);
    camera.lookAt(this.pivot);
  }

  private setPointerRay(x: number, y: number): void {
    const rect = this.world.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.world.camera);
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.ready || this.immersive) {
      return;
    }
    this.lastPointer.set(event.clientX, event.clientY);
    this.downPointer.set(event.clientX, event.clientY);
    this.dragMoved = false;
    this.pressing = null;
    this.setPointerRay(event.clientX, event.clientY);

    // Find the nearest thing under the pointer: a light, a switch or the card.
    let nearest = Infinity;
    let fixtureHit: Fixture | null = null;
    let press: (() => void) | null = null;
    for (const fixture of this.fixtures) {
      const hit = this.raycaster.intersectObject(fixture.object, true)[0];
      if (hit && hit.distance < nearest) {
        nearest = hit.distance;
        fixtureHit = fixture;
        press = null;
      }
    }
    for (const sw of this.switches) {
      const hit = this.raycaster.intersectObject(sw.hit, true)[0];
      if (hit && hit.distance < nearest) {
        nearest = hit.distance;
        fixtureHit = null;
        press = sw.toggle;
      }
    }
    // The iPad and the phone sit on top of everything, so they win.
    const cardHit = this.raycaster.intersectObject(this.ipad.object, true)[0];
    const cardLocal = cardHit ? this.ipad.object.worldToLocal(this.v4.copy(cardHit.point)) : null;
    if (cardLocal && this.ipad.contains(cardLocal.y)) {
      fixtureHit = null;
      const control = this.ipad.controlAt(cardLocal.x, cardLocal.y);
      // A press on the iPad that misses every control does nothing (it doesn't turn the view).
      press = () => this.pressIpad(control);
    } else {
      const phoneHit = this.raycaster.intersectObject(this.phone.mesh, false)[0];
      // On the table it's small: a click near it picks it up.
      const nearPhone = !this.phone.pinned && this.phone.mesh.visible && this.raycaster.ray.distanceToPoint(this.phone.mesh.position) < 0.012;
      if (nearPhone) {
        fixtureHit = null;
        press = () => this.phone.togglePin();
      } else if (phoneHit) {
        fixtureHit = null;
        const local = this.phone.mesh.worldToLocal(phoneHit.point.clone());
        press = () => this.phone.pressAt(local.x, local.y);
      }
    }

    if (press) {
      // Switches and the card act on release, if the pointer didn't drag.
      this.pressing = press;
      return;
    }
    if (fixtureHit && event.button === 0) {
      // Drag in the horizontal plane at the light's height.
      this.dragged = fixtureHit;
      this.touchedFixture = fixtureHit;
      this.resetDragPlane(fixtureHit);
      event.preventDefault();
      return;
    }
    this.orbiting = true;
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.downPointer.distanceTo(this.v3.set(event.clientX, event.clientY)) > TAP_MAX_PIXELS) {
      this.dragMoved = true;
      // Dragging a light while they roll ruins the take.
      if (this.dragged && !this.level.locked) this.touchedSet(this.dragged);
    }
    if (this.dragged && this.level.locked) {
      // Rigged lights don't move; a click still flips the switch.
      this.lastPointer.set(event.clientX, event.clientY);
      return;
    }
    if (this.dragged && event.shiftKey) {
      // Shift-drag raises and lowers the held light.
      const dy = event.clientY - this.lastPointer.y;
      this.dragged.local.y = MathUtils.clamp(this.dragged.local.y - dy * 0.0008, MIN_HEIGHT, MAX_HEIGHT);
      this.lastPointer.set(event.clientX, event.clientY);
      this.resetDragPlane(this.dragged);
      return;
    }
    if (this.dragged) {
      this.setPointerRay(event.clientX, event.clientY);
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.v1)) {
        this.v1.add(this.dragOffset);
        this.stage.worldToLocal(this.v1);
        this.dragged.local.x = this.v1.x;
        this.dragged.local.z = this.v1.z;
      }
    } else if (!this.orbiting && this.ready && !this.immersive) {
      // Hovering: which light is under the pointer, so its switch on the iPad lights up.
      this.setPointerRay(event.clientX, event.clientY);
      let nearest = Infinity;
      this.mouseHover = null;
      for (const fixture of this.fixtures) {
        const hit = this.raycaster.intersectObject(fixture.object, true)[0];
        if (hit && hit.distance < nearest) {
          nearest = hit.distance;
          this.mouseHover = fixture;
        }
      }
    } else if (this.orbiting) {
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.orbit.yaw -= dx * 0.004;
      this.orbit.pitch = MathUtils.clamp(this.orbit.pitch + dy * 0.004, -0.05, 1.35);
    }
    this.lastPointer.set(event.clientX, event.clientY);
  }

  private onPointerUp(): void {
    // A click on a light that didn't drag it flips its switch.
    if (this.dragged && !this.dragMoved) {
      this.toggle(this.dragged);
    }
    if (this.pressing && !this.dragMoved) {
      this.pressing();
    }
    this.pressing = null;
    this.dragged = null;
    this.orbiting = false;
  }

  /** Re-anchors the horizontal drag plane at the held light's current height. */
  private resetDragPlane(fixture: Fixture): void {
    this.v1.copy(fixture.local);
    this.stage.localToWorld(this.v1);
    this.dragPlane.setFromNormalAndCoplanarPoint(this.v2.set(0, 1, 0), this.v1);
    this.setPointerRay(this.lastPointer.x, this.lastPointer.y);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.v2)) {
      this.dragOffset.copy(this.v1).sub(this.v2);
    } else {
      this.dragOffset.set(0, 0, 0);
    }
  }

  private onWheel(event: WheelEvent): void {
    if (!this.ready || this.immersive) {
      return;
    }
    event.preventDefault();
    // Scrolling over the phone scrolls Dee's chat back through older texts.
    this.setPointerRay(event.clientX, event.clientY);
    if (!this.dragged && this.raycaster.intersectObject(this.phone.mesh, false).length > 0) {
      // By pixel, eased on the phone: a trackpad glides and a mouse wheel's page jumps
      // still slide (ben, round 11). Line-mode wheels (Firefox) send lines, not pixels.
      const px = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 600 : 1.3);
      this.phone.scrollBy(-px);
      return;
    }
    if (this.dragged && !this.level.locked) {
      // Raise or lower the held light, and keep dragging at its new height.
      this.dragged.local.y = MathUtils.clamp(this.dragged.local.y - event.deltaY * 0.00015, MIN_HEIGHT, MAX_HEIGHT);
      this.resetDragPlane(this.dragged);
      return;
    }
    this.orbit.radius = MathUtils.clamp(this.orbit.radius * Math.exp(event.deltaY * 0.001), 0.2, 1.6);
  }
}


