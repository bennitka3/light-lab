import {
  BoxGeometry,
  CanvasTexture,
  Color,
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
  type Gel,
  KIT_HEIGHT,
  KIT_Z,
  STAGE_DEPTH,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './scene-assets/soundstage.scene-asset.js';
import { CARD_BUTTON_CENTER, CARD_HEIGHT, CARD_WIDTH, type CardContent, StoryCard, wrap } from './story-card.js';

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

const MONITOR_W = 0.24;
const MONITOR_H = 0.135;
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
const IN_FRAME_TEXT_SECONDS = 1.2;
const NUDGE_SECONDS = 14;
// Where the lower third and the phone ride in front of the headset view (meters, head space).
const HUD_CARD_OFFSET = new Vector3(0, -0.2, -0.7);
const HUD_PHONE_OFFSET = new Vector3(0.3, -0.17, -0.62);
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

/** What the hover label says about each kind of light. */
const KIND_INFO: Record<FixtureKind, { name: string; what: string }> = {
  softbox: { name: 'Softbox', what: 'Big and soft. The classic key light.' },
  panel: { name: 'LED panel', what: 'Soft and gentle. Good for fill.' },
  strip: { name: 'Strip box', what: 'Tall, thin and soft. Draws edges.' },
  fresnel: { name: 'Fresnel', what: 'Hard light with crisp shadows.' },
  par: { name: 'PAR can', what: 'Hard, narrow and punchy.' },
};

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

function createSpot(kind: FixtureKind, gel: Gel = 'none'): SpotLight {
  const quality = LIGHT_QUALITY[kind];
  const color = new Color(quality.color);
  if (gel === 'cto') {
    color.multiply(CTO_TINT);
  }
  const spot = new SpotLight(
    color,
    quality.intensity * (gel === 'cto' ? 1.4 : 1),
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
  return spot;
}

function itemName(item: KitItem): string {
  const gel = item.gel === 'cto' ? ' with orange gel' : '';
  const screen = item.aim === 'screen' ? 'SCREEN ' : '';
  return `${screen}${KIND_NAMES[item.kind]}${gel}`;
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
  private houseLights: Object3D[] = [];
  private houseLed!: MeshStandardMaterial;
  private switches: Switch[] = [];
  private houseSwitch!: Switch;

  // Camera shots and the monitor.
  private shotCamera!: PerspectiveCamera;
  private shotTarget!: WebGLRenderTarget;
  private targetShot!: WebGLRenderTarget;
  private framesSinceLoad = 0;
  private monitor!: Group;
  private liveMaterial!: MeshBasicMaterial;
  private label!: { canvas: HTMLCanvasElement; texture: CanvasTexture };
  private shownText = '';
  private holdTime = 0;
  private creature = new CreatureFeature();
  private creatureHold = 0;

  // The lower third, the phone, and the hover label.
  private card = new StoryCard();
  private cardEntity!: Entity;
  private cardPressed = false;
  private phone = new PhoneHud();
  private hudPlaced = false;
  private hoverTag!: { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture; shown?: Fixture };
  private mouseHover: Fixture | null = null;
  private lastDirectorLine = -1;

  // Dee's texts: a light in the shot, or a hint that hasn't changed in a while.
  private inFrameTime = 0;
  private inFrameTexted = false;
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
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.immersive = state !== VisibilityState.NonImmersive;
        this.dragged = null;
        this.orbiting = false;
        // A dark studio backdrop in the browser; in the headset the real room shows through.
        this.world.scene.background = this.immersive ? null : this.backdrop;
      }),
    );
    const canvas = this.world.renderer.domElement;
    const onDown = (event: PointerEvent) => this.onPointerDown(event);
    const onMove = (event: PointerEvent) => this.onPointerMove(event);
    const onUp = () => this.onPointerUp();
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    const onContextMenu = (event: Event) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && this.ready && this.card.hasButton) {
        event.preventDefault();
        this.pressCard();
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
      this.cardEntity?.dispose();
      this.phone.mesh.removeFromParent();
      this.hoverTag?.mesh.removeFromParent();
      this.monitor?.removeFromParent();
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
      if (this.framesSinceLoad % 90 === 3) {
        this.renderTargetShot();
      }
      // The monitor's live picture is a second full render of the set. In the
      // headset that doubles a frame's cost, so refresh it every third frame
      // there (24 fps on a 72 Hz Quest is plenty for a monitor).
      if (!this.immersive || this.framesSinceLoad % 3 === 0) {
        this.renderShot(this.shotTarget, true);
      }
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
    if (this.label) {
      const message = error instanceof Error ? error.message : String(error);
      this.drawLabel(0, 'MONITOR ERROR (send ben a screenshot)', message.slice(0, 70));
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
    this.buildHoverTag();
    this.initOrbit();
    this.ready = true;

    const start = startLevelFromUrl();
    this.loadLevel(start);
    if (start === 0) {
      this.phase = 'title';
      this.showTitleCard();
    } else {
      this.phone.text('dee', this.level.tip);
    }

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
          card: () => this.card.content,
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
          hovered: () => this.hoverTag.shown?.item.kind ?? null,
          enterXR: () => this.world.launchXR(),
          // Where the lower third and phone sit relative to the viewer's head (meters).
          hud: () => {
            const camera = this.world.camera;
            const card = camera.worldToLocal(this.card.mesh.getWorldPosition(new Vector3()));
            const phone = camera.worldToLocal(this.phone.mesh.getWorldPosition(new Vector3()));
            return { immersive: this.immersive, card: card.toArray(), phone: phone.toArray(), phoneVisible: this.phone.mesh.visible };
          },
          // Screen pixels of a thing, for real-mouse tests: 'card', 'house',
          // 'card-button', a fixture index, or 'role:N' (role N's target spot).
          screenOf: (what: string | number) => {
            const v = new Vector3();
            if (what === 'card' || what === 'card-button') {
              v.set(what === 'card' ? 0 : CARD_BUTTON_CENTER.x, what === 'card' ? 0 : CARD_BUTTON_CENTER.y, 0);
              this.card.mesh.localToWorld(v);
            } else if (what === 'house') {
              this.houseSwitch.hit.getWorldPosition(v);
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
    this.houseOn = this.level.houseStartsOn ?? true;
    this.holdTime = 0;
    this.inFrameTime = 0;
    this.inFrameTexted = false;
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
      for (const extra of level.actors.slice(1)) {
        const clone = this.actor.clone(true);
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

    // One hidden light per role, used only to render the target shot.
    for (const role of level.roles) {
      const spot = createSpot(role.kinds[0], role.gel);
      spot.visible = false;
      this.world.scene.add(spot, spot.target);
      this.targetSpots.push(spot);
    }

    this.showBriefCard();
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
    const object = createFixture(item.kind, item.gel ?? 'none');
    if (item.aim === 'screen') {
      object.add(this.makeTag('SCREEN', '#4ade80'));
    } else if (item.gel === 'cto') {
      object.add(this.makeTag('WARM', '#ff9a45'));
    }
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
    const spot = createSpot(item.kind, item.gel);
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
      grabTime: 0,
      grabStart: new Vector3(),
    };
  }

  /** Moves the story on: the title starts scene 1, a won scene goes to the next one. */
  private pressCard(): void {
    if (!this.card.hasButton) {
      return;
    }
    devLog(`card pressed in phase ${this.phase}, scene ${this.levelIndex + 1}`);
    switch (this.phase) {
      case 'title':
        this.phase = 'playing';
        this.showBriefCard();
        this.phone.text('dee', 'wait. is that YOU holding a light?? 😂');
        this.phone.text('dee', "ok don't panic. I'm in video village, I can see the monitor. I'll text you");
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

  /** Shows content in the lower third; it only catches rays and clicks while it has a button. */
  private showCard(content: CardContent): void {
    this.card.show(content);
    if (!this.cardEntity) {
      return;
    }
    if (content.button && !this.cardEntity.hasComponent(RayInteractable)) {
      this.cardEntity.addComponent(RayInteractable);
    } else if (!content.button && this.cardEntity.hasComponent(RayInteractable)) {
      this.cardEntity.removeComponent(RayInteractable);
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

  private showTitleCard(): void {
    this.showCard({
      eyebrow: 'Lucky Break',
      title: 'Twelve years as Background Extra #47.',
      body: "Tonight is your last day on set. Then the lighting guy walks off the job, and the director points straight at you.",
      footer: 'Seven scenes. One soundstage. Zero qualifications.',
      button: 'Get to work',
    });
  }

  private showBriefCard(): void {
    const level = this.level;
    this.showCard({
      eyebrow: `Scene ${this.levelIndex + 1} of ${LEVELS.length} · ${level.title} · Director`,
      title: level.quote,
      body: level.objective,
      footer: `Kit: ${level.kit.map(itemName).join(', ')}.`,
    });
  }

  private showWinCard(): void {
    const last = this.levelIndex === LEVELS.length - 1;
    this.showCard({
      eyebrow: `Scene ${this.levelIndex + 1} of ${LEVELS.length} · Cut!`,
      title: last ? '"Okay. Okay. Everybody quiet. Roll it."' : this.pickDirectorLine(),
      body: this.level.lesson,
      footer: this.level.after || undefined,
      button: last ? 'Roll!' : 'Next scene',
    });
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
    this.drawLabel(100, 'DIRECTOR: "Is that... Lake Como? I\'m crying."', '"WHO ARE YOU?"');
    this.showCard({
      eyebrow: 'Rolling · Final scene',
      title: '"Is that Lake Como? I\'m crying. Who ARE you?"',
      body: 'The green screen is gone. The couple is on a terrace above the lake at sunset, and the light on their faces matches it.',
      footer: 'Background Extra #47, would you come to the front, please.',
      button: 'Take a bow',
    });
  }

  private showCredits(): void {
    this.showCard({
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

  /** A little label floating above a light, so special lights are easy to tell apart. */
  private makeTag(text: string, color: string): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(10,10,12,0.85)';
      ctx.fillRect(0, 0, 256, 80);
      ctx.fillStyle = color;
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 42);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const tag = new Mesh(new PlaneGeometry(0.03, 0.0094), new MeshBasicMaterial({ map: texture, toneMapped: false }));
    tag.name = 'fixture-tag';
    tag.position.set(0, 0.026, 0);
    return tag;
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
    const cardPressed = this.immersive && this.cardEntity.hasComponent(Pressed);
    if (cardPressed && !this.cardPressed) {
      this.pressCard();
    }
    this.cardPressed = cardPressed;

    for (const light of this.houseLights) {
      light.visible = this.houseOn;
    }
    this.houseLed.emissive.set(this.houseOn ? '#4ade80' : '#3a1010');
    if (this.practical) {
      this.practical.shade.emissiveIntensity = this.practical.on ? 1.4 : 0;
      this.practical.bulb.intensity = this.practical.on ? 0.06 : 0;
    }
  }

  private resetHold(): void {
    this.holdTime = 0;
  }

  private toggle(fixture: Fixture): void {
    devLog(`light ${fixture.item.kind} switched ${fixture.on ? 'off' : 'on'}`);
    fixture.on = !fixture.on;
    this.resetHold();
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
    this.monitor.visible = false;
    this.card.mesh.visible = false;
    const phoneVisible = this.phone.mesh.visible;
    this.phone.mesh.visible = false;
    const tagVisible = this.hoverTag.mesh.visible;
    this.hoverTag.mesh.visible = false;
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
      this.card.mesh.visible = true;
      this.phone.mesh.visible = phoneVisible;
      this.hoverTag.mesh.visible = tagVisible;
      this.monitor.visible = true;
      renderer.xr.enabled = xrEnabled;
    }
  }

  /** The target: only the right lights, in the right spots, house lights off, no gear in frame. */
  private renderTargetShot(): void {
    for (const fixture of this.fixtures) {
      fixture.spot.visible = false;
    }
    for (const light of this.houseLights) {
      light.visible = false;
    }
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
      for (const light of this.houseLights) {
        light.visible = this.houseOn;
      }
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
      (role.gel ?? 'none') === (fixture.item.gel ?? 'none') &&
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
    if (this.houseOn) {
      return { score: Math.min(score, 45), hint: 'The house lights flatten everything. Hit the HOUSE switch.' };
    }
    if (level.practical && !this.practical?.on) {
      return { score: Math.min(score, 60), hint: this.immersive ? 'The lamp in the shot is off. Point at it and pinch to switch it on.' : 'The lamp in the shot is off. Click it to switch it on.' };
    }
    const missing = assigned.filter((a) => !a.fixture);
    if (missing.length > 0) {
      const role = missing[0].role;
      // Is a wrong light sitting where this role should be?
      const wrong = extras.find((f) => this.roleFit(role, f.local) > 0.3);
      if (wrong) {
        return {
          score,
          hint: `Wrong light for the ${role.label.toLowerCase()}: it needs ${role.kindHint}.`,
        };
      }
      const label = missing.length > 1 ? `Still missing: ${missing.map((m) => m.role.label.toLowerCase()).join(', ')}.` : `Still missing: the ${role.label.toLowerCase()}.`;
      return { score, hint: on.length === 0 ? (this.immersive ? 'Point at a light in the kit and quick-pinch to switch it on.' : 'Click a light in the kit to switch it on.') : `${label} Use ${role.kindHint}.` };
    }
    if (extras.length > 0) {
      score = Math.min(score, 70);
      return { score, hint: `Too many lights: switch off the ${itemName(extras[0].item)}.` };
    }
    const worst = assigned.reduce((a, b) => (b.fit < a.fit ? b : a));
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
    if (tAz >= tEl && tAz >= tD) {
      const behind = Math.abs(az) > 100;
      if (behind && Math.abs(pose.azimuth) < 90) {
        return `The ${lower} belongs behind the cast. Move it round the back.`;
      }
      return dAz > 0 ? `Swing the ${lower} toward camera-left.` : `Swing the ${lower} toward camera-right.`;
    }
    if (tEl >= tD) {
      return dEl < 0 ? `Raise the ${lower}.` : `Lower the ${lower}.`;
    }
    return ratio > 1 ? `Bring the ${lower} closer.` : `Pull the ${lower} back a bit.`;
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
      this.drawLabel(score, `CUT! MATCH ${score}%`, this.level.lesson);
      this.showWinCard();
      this.phone.text('dee', DEE_WINS[Math.floor(Math.random() * DEE_WINS.length)]);
      for (const text of this.level.texts ?? []) {
        this.phone.text(text.from, text.text);
      }
      return;
    }
    this.updateNudges(delta, score, hint);
    const text = `${score}|${hint}|${this.creature.active}`;
    if (text !== this.shownText) {
      this.shownText = text;
      this.drawLabel(score, `MATCH ${score}%`, hint);
    }
  }

  /** Dee texts when a light sits in the shot, or when the player has been stuck on one hint for a while. */
  private updateNudges(delta: number, score: number, hint: string): void {
    const framed = this.framedFixture();
    this.inFrameTime = framed ? this.inFrameTime + delta : 0;
    if (framed && this.inFrameTime > IN_FRAME_TEXT_SECONDS && !this.inFrameTexted) {
      this.inFrameTexted = true;
      this.phone.text('dee', `dude the ${itemName(framed.item)} is IN THE SHOT 😬 I can see it on the monitor`);
    }
    if (!framed && this.inFrameTime === 0 && this.inFrameTexted && score > 40) {
      this.inFrameTexted = false;
    }
    this.sinceNudge += delta;
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
      this.shownText = '';
    }
  }

  // --- Monitor and card ------------------------------------------------------

  private buildMonitor(): void {
    this.monitor = new Group();
    this.monitor.name = 'camera-monitor';
    const frame = new Mesh(
      new BoxGeometry(MONITOR_W + 0.02, MONITOR_H * 2 + 0.075, 0.008),
      new MeshBasicMaterial({ color: '#0b0b0d' }),
    );
    frame.position.set(0, 0.0, -0.005);
    const targetPlane = new Mesh(
      new PlaneGeometry(MONITOR_W, MONITOR_H),
      new MeshBasicMaterial({ map: this.targetShot.texture, toneMapped: false }),
    );
    targetPlane.name = 'monitor-target';
    targetPlane.position.set(0, MONITOR_H / 2 + 0.022, 0);
    this.liveMaterial = new MeshBasicMaterial({ map: this.shotTarget.texture, toneMapped: false });
    this.creature.install(this.liveMaterial);
    const livePlane = new Mesh(new PlaneGeometry(MONITOR_W, MONITOR_H), this.liveMaterial);
    livePlane.name = 'monitor-live';
    livePlane.position.set(0, -MONITOR_H / 2 + 0.002, 0);

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.label = { canvas, texture };
    const overlay = new Mesh(
      new PlaneGeometry(MONITOR_W + 0.02, MONITOR_H * 2 + 0.075),
      new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
    );
    overlay.name = 'monitor-labels';
    overlay.position.z = 0.0005;

    this.monitor.add(frame, targetPlane, livePlane, overlay);
    // Beside the stage, on the camera's side, angled toward the player.
    this.monitor.position.set(0.43, 0.16, 0.08);
    this.monitor.rotation.y = -0.35;
    this.stage.add(this.monitor);
  }

  private drawLabel(score: number, line1: string, line2: string): void {
    const { canvas, texture } = this.label;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    // The canvas maps onto the whole monitor face.
    const sx = canvas.width / (MONITOR_W + 0.02);
    const sy = canvas.height / (MONITOR_H * 2 + 0.075);
    const toY = (metersFromTop: number) => metersFromTop * sy;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillStyle = '#f5d90a';
    ctx.fillText('TARGET', 0.012 * sx, toY(0.014));
    ctx.fillStyle = '#ffffff';
    ctx.fillText('YOUR SHOT', 0.012 * sx, toY(0.0145 + MONITOR_H + 0.012));
    if (this.creature.active) {
      this.creature.drawTitle(ctx, 0.01 * sx, toY(0.0145 + MONITOR_H + 0.02), MONITOR_W * sx, MONITOR_H * sy);
      line1 = 'DIRECTOR: "...Universal is on line two."';
    }

    const barTop = toY(0.03 + MONITOR_H * 2);
    const barWidth = canvas.width - 0.024 * sx;
    const won = this.phase !== 'playing' && this.phase !== 'title';
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(0.012 * sx, barTop, barWidth, 30);
    ctx.fillStyle = won ? '#4ade80' : score >= 70 ? '#f5d90a' : '#f97316';
    ctx.fillRect(0.012 * sx, barTop, (barWidth * score) / 100, 30);
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line1, 0.012 * sx, barTop + 78);
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillStyle = '#d4d4d8';
    const lines = wrap(ctx, line2, barWidth);
    lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, 0.012 * sx, barTop + 122 + i * 36));
    texture.needsUpdate = true;
  }

  private buildCard(): void {
    // The lower third and the phone are placed in front of the view every frame (placeHud).
    this.cardEntity = this.world.createTransformEntity(this.card.mesh);
    this.showCard(this.card.content);
    this.world.scene.add(this.phone.mesh);
  }

  /**
   * Keeps the lower third and the phone at the bottom of the view. In the
   * browser they are fixed to the screen (the view orbits with the mouse);
   * in the headset they drift after your head so they never feel bolted on.
   */
  private placeHud(delta: number): void {
    const camera = this.world.camera;
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.headWorld);
    const card = this.card.mesh;
    const phone = this.phone.mesh;
    const bounce = Math.sin(this.phone.pop * Math.PI) * 0.012;
    if (!this.immersive) {
      // Fit both into the bottom of the browser window.
      const d = HUD_DESKTOP_DISTANCE;
      const halfH = d * Math.tan(MathUtils.degToRad(camera.fov / 2));
      const halfW = halfH * camera.aspect;
      const margin = halfH * 0.05;
      const phoneScale = Math.min(1, (halfH * 0.6) / PHONE_HEIGHT);
      const phoneW = PHONE_WIDTH * phoneScale;
      const cardScale = Math.min(0.85, (halfW * 2 - 2 * (phoneW + 2 * margin)) / CARD_WIDTH);
      card.scale.setScalar(cardScale);
      phone.scale.setScalar(phoneScale);
      this.hudTarget.set(0, -halfH + margin + (CARD_HEIGHT * cardScale) / 2, -d);
      card.position.copy(camera.localToWorld(this.hudTarget));
      card.quaternion.copy(camera.getWorldQuaternion(card.quaternion));
      this.hudTarget.set(halfW - margin - phoneW / 2, -halfH + margin + (PHONE_HEIGHT * phoneScale) / 2 + bounce, -d + 0.001);
      phone.position.copy(camera.localToWorld(this.hudTarget));
      phone.quaternion.copy(card.quaternion);
      this.hudPlaced = false;
      return;
    }
    card.scale.setScalar(1);
    phone.scale.setScalar(1);
    const follow = this.hudPlaced ? 1 - Math.exp(-delta * 3) : 1;
    this.hudPlaced = true;
    this.hudTarget.copy(HUD_CARD_OFFSET);
    camera.localToWorld(this.hudTarget);
    card.position.lerp(this.hudTarget, follow);
    card.lookAt(this.headWorld);
    this.hudTarget.copy(HUD_PHONE_OFFSET);
    this.hudTarget.y += bounce;
    camera.localToWorld(this.hudTarget);
    phone.position.lerp(this.hudTarget, follow);
    phone.lookAt(this.headWorld);
  }

  /** One shared label that floats over whichever light the pointer is on, saying what it is. */
  private buildHoverTag(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 170;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(0.12, 0.0319),
      new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }),
    );
    mesh.name = 'hover-tag';
    mesh.renderOrder = 1002;
    mesh.visible = false;
    this.world.scene.add(mesh);
    this.hoverTag = { mesh, canvas, texture };
  }

  private updateHoverTag(): void {
    let fixture: Fixture | undefined;
    if (this.immersive) {
      fixture = this.fixtures.find((f) => f.entity.hasComponent(Hovered) || f.entity.hasComponent(Grabbed));
    } else {
      fixture = this.dragged ?? this.mouseHover ?? undefined;
    }
    const tag = this.hoverTag;
    if (fixture !== tag.shown) {
      tag.shown = fixture;
      if (fixture) {
        devLog(`hover ${fixture.item.kind}`);
        this.drawHoverTag(fixture.item);
      }
    }
    tag.mesh.visible = Boolean(fixture);
    if (!fixture) {
      return;
    }
    fixture.object.getWorldPosition(tag.mesh.position);
    tag.mesh.position.y += fixture.item.aim === 'screen' || fixture.item.gel ? 0.05 : 0.038;
    this.world.camera.getWorldQuaternion(tag.mesh.quaternion);
  }

  private drawHoverTag(item: KitItem): void {
    const { canvas, texture } = this.hoverTag;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const info = KIND_INFO[item.kind];
    const extra = item.aim === 'screen' ? ' · for the green screen' : item.gel === 'cto' ? ' · orange gel (warm)' : '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(12, 12, 14, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 28);
    ctx.fill();
    ctx.fillStyle = '#f5d90a';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(info.name, 28, 68);
    const nameWidth = ctx.measureText(info.name).width;
    ctx.fillStyle = '#9ad1a8';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(extra.replace(' · ', ''), 28 + nameWidth + 22, 66);
    ctx.fillStyle = '#e4e4e7';
    ctx.font = '34px system-ui, sans-serif';
    ctx.fillText(info.what, 28, 130);
    texture.needsUpdate = true;
  }

  /**
   * The studio's house lights: flat, even light from above that shows the
   * whole set but flattens the face. They start on, are left out of the
   * target shot, and the HOUSE switch beside the stage turns them off.
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

    // The switch: a wall plate with a status LED and a label, at the front-left corner of the stage.
    const plate = new Group();
    plate.name = 'house-switch';
    const body = new Mesh(
      new BoxGeometry(0.05, 0.034, 0.008),
      new MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.5, metalness: 0.3 }),
    );
    this.houseLed = new MeshStandardMaterial({ color: '#111', emissive: '#4ade80', emissiveIntensity: 2 });
    const led = new Mesh(new BoxGeometry(0.006, 0.006, 0.002), this.houseLed);
    led.position.set(-0.016, 0, 0.0045);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f5d90a';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('HOUSE', 20, 64);
    }
    const labelTexture = new CanvasTexture(canvas);
    labelTexture.colorSpace = SRGBColorSpace;
    const label = new Mesh(
      new PlaneGeometry(0.032, 0.016),
      new MeshBasicMaterial({ map: labelTexture, transparent: true, toneMapped: false }),
    );
    label.position.set(0.006, 0, 0.0045);
    plate.add(body, led, label);
    // Placed by the stage (which is never rotated), as its own scene-level entity.
    plate.position.set(-STAGE_WIDTH / 2 - 0.05, 0.06, STAGE_DEPTH / 2 + 0.06);
    this.stage.localToWorld(plate.position);
    plate.rotation.set(-0.5, 0.4, 0);
    this.houseSwitch = this.createSwitch(plate.position, 0, () => {
      this.houseOn = !this.houseOn;
      devLog(`house lights ${this.houseOn ? 'on' : 'off'}`);
      this.resetHold();
    }, plate);
  }

  // --- Test helper -------------------------------------------------------------

  /** Puts the right lights in the right places (used by the automated playthrough test). */
  private solve(): void {
    this.houseOn = false;
    if (this.practical) this.practical.on = true;
    const used = new Set<Fixture>();
    for (const fixture of this.fixtures) fixture.on = false;
    for (const role of this.level.roles) {
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
    this.pivot.y += 0.02;
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
    // The lower third sits on top of everything, so it wins when it has a button.
    const cardHit = this.card.hasButton && this.raycaster.intersectObject(this.card.mesh, false)[0];
    if (cardHit) {
      fixtureHit = null;
      press = () => this.pressCard();
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
      // Hovering: which light is under the pointer, for its name label.
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
    if (this.dragged) {
      // Raise or lower the held light, and keep dragging at its new height.
      this.dragged.local.y = MathUtils.clamp(this.dragged.local.y - event.deltaY * 0.00015, MIN_HEIGHT, MAX_HEIGHT);
      this.resetDragPlane(this.dragged);
      return;
    }
    this.orbit.radius = MathUtils.clamp(this.orbit.radius * Math.exp(event.deltaY * 0.001), 0.2, 1.6);
  }
}

// Card size is exported for layout tests and docs.
export const CARD_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT };
export type { CardContent };
