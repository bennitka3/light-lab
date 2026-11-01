import {
  AssetManager,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  createSystem,
  DirectionalLight,
  DistanceGrabbable,
  Entity,
  Grabbed,
  Group,
  HemisphereLight,
  Hovered,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MovementMode,
  Object3D,
  OneHandGrabbable,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PointLight,
  Pressed,
  RayInteractable,
  Raycaster,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VisibilityState,
  WebGLRenderTarget,
} from '@iwsdk/core';
import { CreatureFeature } from './creature-feature.js';
import { LightingStage, StageLight } from './lighting-components.js';
import { DEE_WINS, DIRECTOR_WINS, type KitItem, type LevelDef, LEVELS, type Role } from './levels.js';
import { PHONE_HEIGHT, PHONE_WIDTH, PhoneHud } from './phone-hud.js';
import { createLevelSet, disposeSet, paintLakeComo } from './scene-assets/level-sets.js';
import {
  createFixture,
  type FixtureKind,
  KIT_HEIGHT,
  KIT_Z,
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
import * as sfx from './sfx.js';

/**
 * Runs Lucky Break: seven lighting scenes on one tabletop soundstage, and the
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
const WIN_HOLD_SECONDS = 0.8;
// Where a light's head may go, in stage-local meters.
const BOUNDS_X = STAGE_WIDTH / 2 - 0.02;
const BOUNDS_BACK = -STAGE_DEPTH / 2 + 0.02;
const BOUNDS_FRONT = STAGE_DEPTH / 2 + 0.14;
const MIN_HEIGHT = 0.03;
const MAX_HEIGHT = STAGE_HEIGHT - 0.02;
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
// A light raised this high hangs from the grid instead of standing on the floor
// (its pipe runs up, out of the shot, like a real studio's overhead lights).
const HANG_HEIGHT = 0.17;
// How long a light must sit in the shot before Dee texts about it, and how long
// a hint must stay the same before Dee texts it as a nudge.
// (Headset playtest: a text every time a light crossed the frame crowded the view,
// so Dee waits until it has really been parked there, and texts once per light per scene.)
const IN_FRAME_TEXT_SECONDS = 10;
const NUDGE_SECONDS = 14;
/** Dee only mentions the house lights once the player is this far into a scene. */
const HOUSE_NUDGE_SECONDS = 20;
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
};
const CTO_TINT = new Color('#ff9a45');

const KIND_NAMES: Record<FixtureKind, string> = {
  softbox: 'softbox',
  panel: 'LED panel',
  strip: 'strip box',
  fresnel: 'Fresnel',
  par: 'PAR can',
};

/** The short name on each light's switch on the iPad. */
const KIND_LABELS: Record<FixtureKind, string> = {
  softbox: 'Softbox',
  panel: 'LED panel',
  strip: 'Strip box',
  fresnel: 'Fresnel',
  par: 'PAR can',
};
/** The bi-color dial's stops, warm to daylight. Warm roles need the warm end. */
const KELVIN_STEPS = [3200, 4000, 4800, 5600];
const WARM_MAX_K = 3600;
const NEUTRAL_MIN_K = 4800;

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
  /** Headset grab bookkeeping for telling a tap from a move. */
  grabTime: number;
  grabStart: Vector3;
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
  private aimWorld = new Vector3();
  private screenWorld = new Vector3();
  private practical?: { on: boolean; shade: MeshStandardMaterial; bulb: PointLight; switch: Switch };
  private greenScreen?: Mesh;

  // House lights and switches.
  private houseOn = true;
  // House lights are dimmed to zero rather than hidden: hiding a light changes the
  // light count, which makes three.js recompile every material (a visible stall).
  private houseLights: (HemisphereLight | DirectionalLight)[] = [];
  private houseIntensity: number[] = [];
  /** The glowing undersides of the house light fixtures hanging from the grid. */
  private houseBulb?: MeshStandardMaterial;
  private switches: Switch[] = [];

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
  private hudScale = 1;
  private hudY = 0;
  private phoneTuck = 0;
  // The light the pointer is on (or being moved); its switch on the iPad is outlined.
  private hovered?: Fixture;
  /** The iPad's light row: HOUSE, each light in the kit, then the lamp when there is one. */
  private lightButtons: LightButton[] = [];
  /** How big the player wants the iPad (the - and + buttons), remembered between visits. */
  private ipadZoom = loadZoom();
  private canEnterXR = false;
  private mouseHover: Fixture | null = null;
  private lastDirectorLine = -1;
  // The director turning to look at you before a line.
  private directorModel?: Object3D;
  private directorYaw = 0;
  private directorLooking = false;
  private directorBlend = 0;
  private pendingLine: { line: string; hold: boolean; wait: number } | null = null;
  private phoneWheel = 0;
  /** The scene's own cast member hasn't loaded yet (the stand-in actor is sitting in). */
  private castPending = false;
  private retakeTarget = false;
  // House lights: has the player cut them this scene (then leaving them on is on purpose),
  // how long the scene has run, and how often Dee has mentioned them all game.
  private houseEverOff = false;
  private sceneTime = 0;
  private houseTexts = 0;

  // Dee's texts: a light in the shot, or a hint that hasn't changed in a while.
  private inFrameTime = 0;
  /** Lights Dee has already texted about being in the shot, this scene. */
  private inFrameTexted = new Set<Fixture>();
  private inFrameFixture: Fixture | undefined;
  private hintSince = 0;
  private lastHint = '';
  private lastNudge = '';
  private sinceNudge = 0;

  private errorShown = false;
  private backdrop = new Color('#141416');
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
        if (this.ready && this.phase === 'title') this.showTitleCard();
      });
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const wasImmersive = this.immersive;
        this.immersive = state !== VisibilityState.NonImmersive;
        if (this.immersive) sfx.unlock();
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
        this.updateFixture(fixture);
      }
      this.aimShotCamera();
      // Capture the target once shadows settle, then refresh it now and then in
      // case the set was moved (for example placed on a desk in the headset).
      if (this.framesSinceLoad % 90 === 3 || this.retakeTarget) {
        this.retakeTarget = false;
        this.renderTargetShot();
      }
      // The monitor's live picture is a second full render of the set. In the
      // headset that doubles a frame's cost, so refresh it every third frame
      // there (24 fps on a 72 Hz Quest is plenty for a monitor).
      if (!this.immersive || this.framesSinceLoad % 3 === 0) {
        this.renderShot(this.shotTarget, true);
      }
      if (this.castPending && this.framesSinceLoad % 20 === 0) this.seatCastMember();
      this.creature.update(delta);
      this.updateScore(delta);
      this.phone.update(delta);
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
    this.shotTarget = new WebGLRenderTarget(SHOT_W, SHOT_H);
    this.shotTarget.texture.colorSpace = SRGBColorSpace;
    this.targetShot = new WebGLRenderTarget(SHOT_W, SHOT_H);
    this.targetShot.texture.colorSpace = SRGBColorSpace;

    this.buildMonitor();
    this.buildHouseLights();
    this.buildCard();
    this.initOrbit();
    this.ready = true;

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
          houseOn: () => this.houseOn,
          setHouse: (on: boolean) => {
            this.houseOn = on;
          },
          toggle: (kind: string) => {
            const fixture = this.fixtures.find((f) => f.item.kind === kind && !f.on) ?? this.fixtures.find((f) => f.item.kind === kind);
            if (fixture) this.toggle(fixture);
          },
          level: () => ({ index: this.levelIndex, id: this.level.id, phase: this.phase }),
          loadLevel: (i: number) => this.loadLevel(i),
          pressCard: () => this.pressCard(),
          solve: () => this.solve(),
          practical: () => this.practical?.on,
          togglePractical: () => this.practical?.switch.toggle(),
          creature: () => this.creature.played,
          texts: () => this.phone.log.map((t) => `${t.from}: ${t.text}`),
          card: () => this.ipad.page,
          bubble: () => (this.bubble.mesh.visible ? this.bubble.line : null),
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
          switchOn: (i: number, on = true) => {
            this.fixtures[i].on = on;
          },
          hovered: () => this.hovered?.item.kind ?? null,
          lightButtons: () => this.lightButtons.map((b) => ({ ...b })),
          kelvin: (i: number) => this.fixtures[i].kelvin,
          zoom: () => this.ipadZoom,
          ipadScale: () => this.ipad.object.scale.x,
          phonePinned: () => this.phone.pinned,
          phoneScrolledBack: () => this.phone.scrolledBack,
          dee: (text: string) => this.phone.text('dee', text),
          // How far (radians) the director has turned from his resting pose, e.g. to look at you.
          directorTurn: () => (this.directorModel ? this.directorModel.rotation.y - this.directorYaw : null),
          enterXR: () => this.world.launchXR(),
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
            const control = typeof what === 'string' ? /^(light|warmer|cooler|size):(-?\d+)$/.exec(what) : null;
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
    this.levelIndex = index;
    this.level = LEVELS[index];
    const level = this.level;
    this.phase = 'playing';
    this.directorLooking = false;
    this.houseOn = this.level.houseStartsOn ?? true;
    this.houseEverOff = !this.houseOn;
    this.sceneTime = 0;
    this.holdTime = 0;
    this.inFrameTime = 0;
    this.inFrameTexted.clear();
    this.hintSince = 0;
    this.lastHint = '';
    this.framesSinceLoad = 0;
    this.shownText = '';

    // Set pieces.
    this.set = createLevelSet(level.set);
    this.stage.add(this.set);
    this.greenScreen = (this.set.getObjectByName('green-screen') as Mesh | undefined) ?? undefined;

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
        }),
      };
      this.practical = practical;
    }

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
      fixture.on = true;
    }
    this.buildLightButtons();

    // One hidden light per role, used only to render the target shot.
    for (const role of level.roles) {
      const spot = createSpot(role.kinds[0], role.warm ? KELVIN_MIN : KELVIN_MAX);
      spot.visible = false;
      this.world.scene.add(spot, spot.target);
      this.targetSpots.push(spot);
    }

    this.showBriefCard();
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
    for (const actor of this.extraActors) {
      actor.removeFromParent();
    }
    this.extraActors = [];
    if (this.practical) {
      this.removeSwitch(this.practical.switch);
      this.practical = undefined;
    }
    if (this.set) {
      this.set.removeFromParent();
      disposeSet(this.set);
      this.set = undefined;
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
    if (item.dial && face instanceof Mesh) {
      // Its own face material, so the glow can follow the dial.
      face.material = (face.material as MeshStandardMaterial).clone();
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
      grabTime: 0,
      grabStart: new Vector3(),
    };
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
        if (this.levelIndex === 0) {
          this.phone.text('dee', 'wait. is that YOU holding a light?? 😂');
          this.phone.text('dee', "ok don't panic. I'm in video village, I can see the monitor. I'll text you");
        }
        this.phone.text('dee', this.level.tip);
        break;
      case 'won':
        if (this.levelIndex < LEVELS.length - 1) {
          this.loadLevel(this.levelIndex + 1);
          this.phone.text('dee', this.level.tip);
        } else {
          this.rollFinale();
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
  }

  /** The director's next line, after the one he is saying. */
  private sayNext(line: string, hold = false): void {
    this.bubble.then('Director', line, hold);
  }

  private showTitleCard(): void {
    this.bubble.hide();
    const headset = this.immersive;
    this.showPage({
      full: true,
      eyebrow: this.levelIndex > 0 ? `Lucky Break · Starting at scene ${this.levelIndex + 1}` : 'Lucky Break · How to play',
      title: 'Twelve years as Background Extra #47.',
      body: 'Tonight is your last day on set. Then the lighting guy walks off the job, and the director points straight at you.',
      steps: headset
        ? [
            'Make YOUR SHOT on this iPad match the director\'s TARGET.',
            'Switch lights (and HOUSE) on and off with the buttons on this iPad.',
            'Pinch and hold a light to move it. Switch one on to see which it is.',
            'The director talks from the set. Dee texts you tips: tap the phone to keep it up.',
          ]
        : [
            'Make YOUR SHOT on this iPad match the director\'s TARGET.',
            'Switch lights (and HOUSE) on and off with the buttons on this iPad.',
            'Drag a light to move it. Shift-drag (or scroll while dragging) to raise it.',
            'Drag empty space to turn the set. Click the phone to keep Dee\'s texts up.',
          ],
      footer: headset
        ? 'Seven scenes. One soundstage. Zero qualifications.'
        : this.canEnterXR
        ? 'In the headset browser? If it asks to allow immersive mode, press Allow first.'
        : 'Seven scenes. Zero qualifications. On a Quest? Open this page there to play in VR.',
      button2: this.canEnterXR && !headset ? 'Play in VR' : undefined,
      button: 'Go',
    });
  }

  private showBriefCard(): void {
    const level = this.level;
    // The iPad shows only the shots and the tip; the director gives the brief from the set.
    this.showPage({ eyebrow: `Scene ${this.levelIndex + 1} of ${LEVELS.length}`, body: '' });
    this.say(level.quote);
    this.sayNext(level.objective);
  }

  private showWinCard(): void {
    const last = this.levelIndex === LEVELS.length - 1;
    this.showPage({
      eyebrow: `Scene ${this.levelIndex + 1} of ${LEVELS.length}`,
      body: '',
      button: last ? 'Roll!' : 'Next scene',
    });
    // Dee explains what you just did, then the gossip.
    this.phone.text('dee', this.level.lesson);
    if (this.level.after) {
      this.phone.text('dee', this.level.after);
    }
    this.sayToYou(last ? '"Okay. Okay. Everybody quiet. Roll it."' : (this.level.directorWin ?? this.pickDirectorLine()), true);
  }

  private rollFinale(): void {
    this.phase = 'rolled';
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
      body: 'Starring you, formerly Background Extra #47, now Gaffer. Key, fill, back light, product, practicals, low-key, magic hour and green screen: all yours.',
      footer: 'A film by ben, lit by you, built by Claude.',
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
    devLog(`light ${fixture.item.kind} switched ${fixture.on ? 'off' : 'on'}`);
    fixture.on = !fixture.on;
    this.resetHold();
  }

  private toggleHouse(): void {
    this.houseOn = !this.houseOn;
    if (!this.houseOn) this.houseEverOff = true;
    devLog(`house lights ${this.houseOn ? 'on' : 'off'}`);
    this.resetHold();
  }

  /** Turns a bi-color light's dial one stop warmer (-1) or cooler (+1). */
  private turnDial(fixture: Fixture, step: 1 | -1): void {
    if (!fixture.item.dial) return;
    const i = KELVIN_STEPS.indexOf(fixture.kelvin);
    const next = KELVIN_STEPS[MathUtils.clamp((i < 0 ? KELVIN_STEPS.length - 1 : i) + step, 0, KELVIN_STEPS.length - 1)];
    this.setKelvin(fixture, next);
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

  /** Builds the iPad's light row for the scene: HOUSE, each light in the kit, then the lamp. */
  private buildLightButtons(): void {
    const screens = this.level.kit.filter((item) => item.aim === 'screen').length;
    let screenN = 0;
    this.lightButtons = [{ label: 'HOUSE', on: this.houseOn }];
    for (const fixture of this.fixtures) {
      const item = fixture.item;
      let label = KIND_LABELS[item.kind];
      if (item.aim === 'screen') {
        screenN += 1;
        label = screens > 1 ? `Screen ${screenN}` : 'Screen';
      }
      this.lightButtons.push({ label, on: fixture.on, kelvin: item.dial ? fixture.kelvin : undefined });
    }
    if (this.practical) {
      this.lightButtons.push({ label: 'Lamp', on: this.practical.on });
    }
  }

  /** Copies the lights' state onto the iPad's switches (no allocation unless something changed). */
  private updateLightButtons(): void {
    const buttons = this.lightButtons;
    if (buttons.length === 0) return;
    buttons[0].on = this.houseOn;
    this.fixtures.forEach((fixture, i) => {
      const button = buttons[i + 1];
      if (!button) return;
      button.on = fixture.on;
      if (button.kelvin !== undefined) button.kelvin = fixture.kelvin;
    });
    if (this.practical && buttons.length > this.fixtures.length + 1) {
      buttons[this.fixtures.length + 1].on = this.practical.on;
    }
    const highlight = this.hovered ? this.fixtures.indexOf(this.hovered) + 1 : -1;
    this.ipad.setLights(this.ipad.isFull ? [] : buttons, highlight);
  }

  /** Acts on a press on the iPad. */
  private pressIpad(control: IPadControl): void {
    if (control.type === 'main') {
      this.pressCard();
    } else if (control.type === 'second') {
      this.world.launchXR();
    } else if (control.type === 'size') {
      this.zoomIpad(control.step);
    } else if (control.type === 'light') {
      const n = control.index;
      if (n === 0) {
        this.toggleHouse();
      } else if (n <= this.fixtures.length) {
        this.toggle(this.fixtures[n - 1]);
      } else if (this.practical) {
        this.practical.switch.toggle();
      }
    } else if (control.type === 'warmer' || control.type === 'cooler') {
      const fixture = this.fixtures[control.index - 1];
      if (fixture) this.turnDial(fixture, control.type === 'warmer' ? -1 : 1);
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
      if (grabbed) {
        fixture.object.getWorldPosition(this.v1);
        fixture.local.copy(this.stage.worldToLocal(this.v1));
        return;
      }
    } else if (fixture.grabTime > 0) {
      devLog(`light ${fixture.item.kind} released after ${fixture.grabTime.toFixed(2)} s, moved ${fixture.local.distanceTo(fixture.grabStart).toFixed(3)} m`);
      // A quick press or pinch that barely moved the light is a tap on its switch.
      if (fixture.grabTime < TAP_SECONDS && fixture.local.distanceTo(fixture.grabStart) < TAP_MAX_MOVE) {
        fixture.local.copy(fixture.grabStart);
        this.toggle(fixture);
      }
      fixture.grabTime = 0;
    }
    this.clampToSet(fixture.local);
    this.placeFixture(fixture);
  }

  private clampToSet(local: Vector3): void {
    local.x = MathUtils.clamp(local.x, -BOUNDS_X, BOUNDS_X);
    local.y = MathUtils.clamp(local.y, MIN_HEIGHT, MAX_HEIGHT);
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
    if (fixture.local.y >= HANG_HEIGHT) {
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
      if (fixture.yoke) fixture.yoke.rotation.z = 0;
    }

    const aim = fixture.item.aim === 'screen' ? this.screenWorld : this.aimWorld;
    fixture.head.lookAt(aim);
    fixture.object.getWorldPosition(this.v1);
    fixture.spot.visible = fixture.on;
    fixture.spot.position.copy(this.v1);
    fixture.spot.target.position.copy(aim);
    fixture.spot.target.updateMatrixWorld();
    if (fixture.face) {
      fixture.face.emissiveIntensity = fixture.on ? 1.6 : 0;
    }
    fixture.led.emissive.set(fixture.on ? '#4ade80' : '#3a1010');
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
    this.ipad.object.visible = false;
    const bubbleVisible = this.bubble.mesh.visible;
    this.bubble.mesh.visible = false;
    const phoneVisible = this.phone.mesh.visible;
    this.phone.mesh.visible = false;
    this.cameraRig.visible = false;
    for (const fixture of this.fixtures) {
      fixture.object.visible = showFixtures;
      if (fixture.handle) {
        fixture.handle.visible = false;
      }
    }
    try {
      renderer.setRenderTarget(into);
      renderer.render(this.world.scene, this.shotCamera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      for (const fixture of this.fixtures) {
        fixture.object.visible = true;
        if (fixture.handle) {
          fixture.handle.visible = true;
        }
      }
      this.cameraRig.visible = true;
      this.bubble.mesh.visible = bubbleVisible;
      this.phone.mesh.visible = phoneVisible;
      this.ipad.object.visible = true;
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
    try {
      this.renderShot(this.targetShot, false);
    } finally {
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
    if (role.pos) {
      const d = local.distanceTo(this.v2.set(...role.pos));
      return Math.exp(-((Math.max(0, d - 0.01) / POSITION_TOLERANCE) ** 2));
    }
    const pose = this.poseOf(local);
    const { az, el, d } = role.orbit!;
    let dAz = Math.abs(pose.azimuth - az);
    dAz = Math.min(dAz, 360 - dAz);
    const dEl = pose.elevation - el;
    const dDist = Math.log(pose.distance / d);
    return Math.exp(-((dAz / 25) ** 2) - (dEl / 20) ** 2 - (dDist / 0.35) ** 2);
  }

  /** Matches switched-on lights to the scene's roles and scores the setup, with one hint. */
  private evaluate(): { score: number; hint: string } {
    const level = this.level;
    const on = this.fixtures.filter((f) => f.on);
    // Best assignment of switched-on lights to roles, so two lights of the same
    // kind (say the left and right SCREEN panels) each count for the role whose
    // spot they are actually in, whichever was switched on first.
    const choice = this.bestAssignment(level.roles, on);
    const used = new Set<Fixture>();
    const assigned: { role: Role; fixture?: Fixture; fit: number }[] = level.roles.map((role, i) => {
      const fixture = choice[i];
      if (fixture) used.add(fixture);
      return { role, fixture, fit: fixture ? this.roleFit(role, fixture.local) : 0 };
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
      };
    }
    // House lights on: say so until the player has cut them once this scene;
    // after that, leaving them on is on purpose (to see the set), so only
    // mention them once everything else is right. Either way they block the take.
    const houseCap = this.houseOn ? 45 : 100;
    if (this.houseOn && !this.houseEverOff) {
      return {
        score: Math.min(score, houseCap),
        hint: this.houseTexts < 2 ? 'The house lights flatten everything. Turn them off!' : "Don't forget to cut the house lights.",
      };
    }
    score = Math.min(score, houseCap);
    if (level.practical && !this.practical?.on) {
      return { score: Math.min(score, 60), hint: 'The lamp in the shot is off. Tap Lamp on the iPad.' };
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
      const label = missing.length > 1 ? `Still missing: ${missing.map((m) => m.role.label.toLowerCase()).join(', ')}.` : `Still missing: the ${role.label.toLowerCase()}.`;
      return { score, hint: on.length === 0 ? "Tap a light's button on the iPad to switch it on." : `${label} Use ${role.kindHint}.` };
    }
    if (extras.length > 0) {
      score = Math.min(score, 70);
      return { score, hint: `Too many lights: switch off the ${itemName(extras[0].item)}.` };
    }
    const worst = assigned.reduce((a, b) => (b.fit < a.fit ? b : a));
    if (this.houseOn && worst.fit > 0.85) {
      return { score, hint: 'Looks right. Cut the house lights when you want to roll.' };
    }
    return { score, hint: this.placeHint(worst.role, worst.fixture!) };
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
      const { x, y, z } = fixture.local;
      const hung = y >= HANG_HEIGHT;
      const end = hung ? STAGE_HEIGHT : 0;
      for (let i = 0; i <= 8; i++) {
        this.v4.set(x, y + ((end - y) * i) / 8, z);
        this.stage.localToWorld(this.v4);
        this.v4.project(this.shotCamera);
        if (this.v4.z > -1 && this.v4.z < 1 && Math.abs(this.v4.x) < 0.98 && Math.abs(this.v4.y) < 0.98) {
          return fixture;
        }
      }
    }
    return undefined;
  }

  private placeHint(role: Role, fixture: Fixture): string {
    const name = role.label;
    if (role.pos) {
      const dx = role.pos[0] - fixture.local.x;
      const dz = role.pos[2] - fixture.local.z;
      const dy = role.pos[1] - fixture.local.y;
      if (Math.hypot(dx, dz, dy) < 0.02) return 'Almost there. Hold it...';
      if (Math.abs(dz) > Math.abs(dx) && Math.abs(dz) > 0.02) {
        return dz < 0 ? `Move the ${name.toLowerCase()} closer to the screen.` : `Pull the ${name.toLowerCase()} away from the screen a bit.`;
      }
      if (Math.abs(dx) > 0.02) {
        return dx < 0 ? `Move the ${name.toLowerCase()} toward camera-left.` : `Move the ${name.toLowerCase()} toward camera-right.`;
      }
      return dy > 0 ? `Raise the ${name.toLowerCase()}.` : `Lower the ${name.toLowerCase()}.`;
    }
    const pose = this.poseOf(fixture.local);
    const { az, el, d } = role.orbit!;
    let dAz = pose.azimuth - az;
    if (dAz > 180) dAz -= 360;
    if (dAz < -180) dAz += 360;
    const dEl = pose.elevation - el;
    const ratio = pose.distance / d;
    const lower = name.toLowerCase();
    // Hint at whichever error costs the most score (same weights as roleFit).
    const tAz = (dAz / 25) ** 2;
    const tEl = (dEl / 20) ** 2;
    const tD = (Math.log(ratio) / 0.35) ** 2;
    if (tAz + tEl + tD < 0.05) {
      return 'Almost there. Hold it...';
    }
    const target = this.roleLocal(role, this.v2);
    if (tEl > tAz && tEl > tD) {
      if (dEl < 0 && target.y >= HANG_HEIGHT && fixture.local.y < HANG_HEIGHT) {
        return `Raise the ${lower} until it hangs from the grid.`;
      }
      return dEl < 0 ? `Raise the ${lower}.` : `Lower the ${lower}.`;
    }
    // Direction and distance errors: say which way to move it across the floor,
    // in set terms (camera-left/right, back toward the wall, forward toward the camera).
    const behindCast = target.z < this.aimLocal.z - 0.02;
    if (behindCast && fixture.local.z > this.aimLocal.z) {
      return `The ${lower} belongs behind the cast. Move it round the back.`;
    }
    const dx = target.x - fixture.local.x;
    const dz = target.z - fixture.local.z;
    if (Math.abs(dx) >= Math.abs(dz)) {
      return dx < 0 ? `Move the ${lower} toward camera-left.` : `Move the ${lower} toward camera-right.`;
    }
    return dz < 0 ? `Move the ${lower} back, away from the camera.` : `Move the ${lower} forward, toward the camera.`;
  }

  private updateScore(delta: number): void {
    this.checkCreature(delta);
    if (this.phase !== 'playing') {
      return;
    }
    const { score, hint } = this.evaluate();
    this.holdTime = score >= this.level.winScore ? this.holdTime + delta : 0;
    if (this.holdTime >= WIN_HOLD_SECONDS) {
      this.phase = 'won';
      this.chime.play().catch(() => undefined);
      this.ipad.setStatus(score, '', true);
      this.phone.text('dee', this.pickDeeWin());
      this.showWinCard();
      for (const text of this.level.texts ?? []) {
        this.phone.text(text.from, text.text);
      }
      return;
    }
    this.updateNudges(delta, score, hint);
    const text = `${score}|${hint}|${this.creature.active}`;
    if (text !== this.shownText) {
      this.shownText = text;
      this.ipad.setStatus(score, hint, false);
    }
  }

  /** Dee texts when a light sits in the shot, or when the player has been stuck on one hint for a while. */
  private updateNudges(delta: number, score: number, hint: string): void {
    const framed = this.framedFixture();
    this.inFrameTime = framed && framed === this.inFrameFixture ? this.inFrameTime + delta : 0;
    this.inFrameFixture = framed;
    if (framed && this.inFrameTime > IN_FRAME_TEXT_SECONDS && !this.inFrameTexted.has(framed)) {
      this.inFrameTexted.add(framed);
      this.phone.text('dee', `dude the ${itemName(framed.item)} is IN THE SHOT 😬 I can see it on the monitor`);
    }
    this.sinceNudge += delta;
    this.sceneTime += delta;
    if (this.houseOn && !this.houseEverOff && /house lights/.test(hint)) {
      // Only once the player is a while into the scene and still hasn't cut them.
      if (this.sceneTime > HOUSE_NUDGE_SECONDS && this.sinceNudge > NUDGE_SECONDS && this.lastNudge !== `house:${this.levelIndex}`) {
        this.lastNudge = `house:${this.levelIndex}`;
        this.sinceNudge = 0;
        const text =
          this.houseTexts === 0
            ? 'the house lights are flattening everything. turn them off!'
            : ['psst... house lights...', "don't forget to cut the house lights 👀"][this.houseTexts % 2];
        this.houseTexts += 1;
        this.phone.text('dee', text);
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
      const lead = ['psst. ', 'from here: ', 'tip: '][Math.floor(Math.random() * 3)];
      this.phone.text('dee', lead + hint.charAt(0).toLowerCase() + hint.slice(1));
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
    this.phone.onArrive = () => {
      sfx.textChime();
      sfx.buzz(this.world.renderer.xr.getSession());
    };
    this.bubble.onShow = (_speaker, line) => sfx.mumble(line);
    this.world.scene.add(this.bubble.mesh);
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
      phone.scale.setScalar(phoneScale);
      const phoneX = Math.min(ipadW / 2 + margin + (PHONE_WIDTH * phoneScale) / 2, halfW - margin - (PHONE_WIDTH * phoneScale) / 2);
      const phoneY = -halfH + margin + phoneH / 2 - this.phoneTuck * phoneH * 0.8 + bounce;
      this.hudTarget.set(phoneX, phoneY, -d + 0.001);
      phone.position.copy(camera.localToWorld(this.hudTarget));
      phone.quaternion.copy(ipad.quaternion);
    } else {
      const zoom = this.ipadZoom;
      ipad.scale.setScalar(full ? HUD_IPAD_FULL_XR_SCALE : HUD_IPAD_XR_SCALE * zoom);
      phone.scale.setScalar(MathUtils.lerp(HUD_PHONE_AWAKE_XR_SCALE, HUD_PHONE_XR_SCALE, this.phoneTuck) * zoom);
      const follow = this.xrPlaced ? 1 - Math.exp(-delta * 3) : 1;
      this.xrPlaced = true;
      this.hudTarget.copy(full ? HUD_IPAD_FULL_OFFSET : HUD_IPAD_OFFSET);
      camera.localToWorld(this.hudTarget);
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
    // The speech bubble floats over the director and turns to face you.
    if (this.director) {
      this.director.anchor.getWorldPosition(this.bubble.mesh.position);
      this.bubble.mesh.position.y += 0.14 + BUBBLE_HEIGHT / 2;
      camera.getWorldQuaternion(this.bubble.mesh.quaternion);
    }
    this.updateDirector(delta);
    this.bubble.update(delta);
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
      this.roleLocal(role, fixture.local);
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
      if (phoneHit) {
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
      this.resetDragPlane(fixtureHit);
      event.preventDefault();
      return;
    }
    this.orbiting = true;
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.downPointer.distanceTo(this.v3.set(event.clientX, event.clientY)) > TAP_MAX_PIXELS) {
      this.dragMoved = true;
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
      // Trackpads send many small steps: one message per ~80 pixels of scroll.
      this.phoneWheel += event.deltaY;
      while (Math.abs(this.phoneWheel) >= 80) {
        this.phone.scroll(this.phoneWheel < 0 ? 1 : -1);
        this.phoneWheel -= Math.sign(this.phoneWheel) * 80;
      }
      return;
    }
    if (this.dragged) {
      // Raise or lower the held light, and keep dragging at its new height.
      this.dragged.local.y = MathUtils.clamp(this.dragged.local.y - event.deltaY * 0.00015, MIN_HEIGHT, MAX_HEIGHT);
      this.resetDragPlane(this.dragged);
      return;
    }
    this.orbit.radius = MathUtils.clamp(this.orbit.radius * Math.exp(event.deltaY * 0.001), 0.2, 1.6);
  }
}


