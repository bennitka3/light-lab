import {
  BoxGeometry,
  CanvasTexture,
  Color,
  createSystem,
  Entity,
  Grabbed,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VisibilityState,
  WebGLRenderTarget,
} from '@iwsdk/core';
import { LightingStage, StageLight } from './lighting-components.js';
import {
  type FixtureKind,
  KIT_HEIGHT,
  KIT_Z,
  STAGE_DEPTH,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './scene-assets/soundstage.scene-asset.js';

/**
 * Runs one lighting level. The light kit sits behind the tape at the front of
 * the stage; a light switches on once it is moved past the tape onto the set,
 * and it always aims at the subject's head. A cine camera renders "your shot"
 * to the monitor, the same set lit by the right light in the right spot is the
 * "target" shot, and a match score compares the two setups.
 *
 * In the headset a light is grabbed with a pinch (DistanceGrabbable). In a
 * desktop browser it is dragged with the mouse across the floor, and the
 * scroll wheel raises or lowers it while it is held. Dragging empty space
 * turns the view around the set, and scrolling zooms.
 */

const MONITOR_W = 0.24;
const MONITOR_H = 0.135;
const SHOT_W = 512;
const SHOT_H = 288;
const WIN_SCORE = 90;
const WIN_HOLD_SECONDS = 0.8;
// Where a light's head may go, in stage-local meters.
const BOUNDS_X = STAGE_WIDTH / 2 - 0.02;
const BOUNDS_BACK = -STAGE_DEPTH / 2 + 0.02;
const BOUNDS_FRONT = STAGE_DEPTH / 2 + 0.14;
const MIN_HEIGHT = 0.03;
const MAX_HEIGHT = STAGE_HEIGHT - 0.02;
// Keeps lights from being pushed through the actor.
const SUBJECT_CLEARANCE = 0.03;
// Lights on the stage side of the tape are on; behind it they are parked.
const TAPE_Z = STAGE_DEPTH / 2;

type Pose = { azimuth: number; elevation: number; distance: number };

/** How each kind of fixture lights: the softbox is broad and soft, the others hard. */
const LIGHT_QUALITY: Record<
  FixtureKind,
  { color: string; intensity: number; angleDeg: number; penumbra: number; shadowRadius: number }
> = {
  softbox: { color: '#fff1dc', intensity: 0.25, angleDeg: 60, penumbra: 1, shadowRadius: 10 },
  fresnel: { color: '#ffd2a0', intensity: 0.45, angleDeg: 20, penumbra: 0.3, shadowRadius: 1 },
  par: { color: '#ffe2b8', intensity: 0.6, angleDeg: 12, penumbra: 0.15, shadowRadius: 1 },
};

type Fixture = {
  entity: Entity;
  object: Object3D;
  kind: FixtureKind;
  head: Object3D;
  face?: MeshStandardMaterial;
  pole: Object3D;
  base: Object3D;
  handle?: Object3D;
  spot: SpotLight;
  /** Head position in stage-local meters. */
  local: Vector3;
  on: boolean;
};

function createSpot(kind: FixtureKind): SpotLight {
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
  return spot;
}

export class LightingLevelSystem extends createSystem({
  stages: { required: [LightingStage] },
  lights: { required: [StageLight] },
}) {
  private ready = false;
  private stage!: Object3D;
  private head!: Object3D;
  private lens!: Object3D;
  private cameraRig!: Object3D;
  private fixtures: Fixture[] = [];
  private targetSpot!: SpotLight;
  private targetKind: FixtureKind = 'softbox';
  private target: Pose = { azimuth: -45, elevation: 35, distance: 0.16 };
  private shotCamera!: PerspectiveCamera;
  private shotTarget!: WebGLRenderTarget;
  private targetShot!: WebGLRenderTarget;
  private framesSinceSetup = 0;
  private monitor!: Group;
  private label!: { canvas: HTMLCanvasElement; texture: CanvasTexture };
  private shownText = '';
  private holdTime = 0;
  private won = false;
  private backdrop = new Color('#141416');
  private chime = new Audio(`${import.meta.env.BASE_URL}audio/chime.mp3`);

  // Desktop mouse: dragging a light, or orbiting the view around the set.
  private immersive = false;
  private dragged: Fixture | null = null;
  private orbiting = false;
  private dragPlane = new Plane();
  private dragOffset = new Vector3();
  private lastPointer = new Vector2();
  private pointerNdc = new Vector2();
  private raycaster = new Raycaster();
  private orbit = { yaw: 0, pitch: 0.4, radius: 0.85 };
  private pivot = new Vector3();

  // Scratch vectors, reused every frame.
  private headWorld = new Vector3();
  private lensWorld = new Vector3();
  private v1 = new Vector3();
  private v2 = new Vector3();

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
    const onUp = () => {
      this.dragged = null;
      this.orbiting = false;
    };
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    const onContextMenu = (event: Event) => event.preventDefault();
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
      for (const fixture of this.fixtures) {
        fixture.spot.removeFromParent();
        fixture.spot.target.removeFromParent();
      }
      this.targetSpot?.removeFromParent();
      this.monitor?.removeFromParent();
      this.shotTarget?.dispose();
      this.targetShot?.dispose();
    });
  }

  update(delta: number): void {
    if (!this.ready && !this.trySetup()) {
      return;
    }
    this.framesSinceSetup++;
    this.head.getWorldPosition(this.headWorld);

    for (const fixture of this.fixtures) {
      // In the browser the mouse drag moves lights, not the grab system.
      if (this.immersive && fixture.entity.hasComponent(Grabbed)) {
        fixture.object.getWorldPosition(this.v1);
        fixture.local.copy(this.stage.worldToLocal(this.v1));
      } else {
        this.clampToSet(fixture.local);
        this.placeFixture(fixture);
      }
      this.updateFixture(fixture);
    }

    this.aimShotCamera();
    if (!this.immersive) {
      this.applyOrbit();
    }
    // Capture the target once shadows settle, then refresh it now and then in
    // case the set was moved (for example placed on a desk in the headset).
    if (this.framesSinceSetup % 90 === 3) {
      this.renderTargetShot();
    }
    this.renderShot(this.shotTarget, true);
    this.updateScore(delta);
  }

  private trySetup(): boolean {
    const stageEntity = this.queries.stages.entities.values().next().value;
    const stage = stageEntity?.object3D;
    const head = stage?.getObjectByName('subject-head');
    const lens = stage?.getObjectByName('camera-lens');
    const cameraRig = stage?.getObjectByName('camera-rig');
    const lightEntities = [...this.queries.lights.entities];
    if (!stageEntity || !stage || !head || !lens || !cameraRig || lightEntities.length === 0) {
      return false;
    }
    if (lightEntities.some((entity) => !entity.object3D)) {
      return false;
    }
    this.stage = stage;
    this.head = head;
    this.lens = lens;
    this.cameraRig = cameraRig;

    this.targetKind = (stageEntity.getValue(LightingStage, 'targetKind') ?? 'softbox') as FixtureKind;
    this.target = {
      azimuth: stageEntity.getValue(LightingStage, 'targetAzimuthDeg') ?? -45,
      elevation: stageEntity.getValue(LightingStage, 'targetElevationDeg') ?? 35,
      distance: stageEntity.getValue(LightingStage, 'targetDistance') ?? 0.16,
    };

    for (const entity of lightEntities) {
      const object = entity.object3D!;
      const kind = (entity.getValue(StageLight, 'kind') ?? 'softbox') as FixtureKind;
      const fixtureHead = object.getObjectByName('fixture-head');
      const pole = object.getObjectByName('stand-pole');
      const base = object.getObjectByName('stand-base');
      if (!fixtureHead || !pole || !base) {
        continue;
      }
      const face = fixtureHead.getObjectByName('fixture-face');
      const spot = createSpot(kind);
      spot.name = `${kind}-light`;
      spot.visible = false;
      this.world.scene.add(spot, spot.target);
      this.fixtures.push({
        entity,
        object,
        kind,
        head: fixtureHead,
        face: face instanceof Mesh ? (face.material as MeshStandardMaterial) : undefined,
        pole,
        base,
        handle: object.getObjectByName('fixture-handle'),
        spot,
        local: new Vector3(entity.getValue(StageLight, 'kitX') ?? 0, KIT_HEIGHT, KIT_Z),
        on: false,
      });
    }

    // A work light over the kit so the gear is easy to see; its cone stops short of the actor.
    const workLight = new SpotLight('#dfe6ff', 0.12, 0, MathUtils.degToRad(38), 0.6, 2);
    workLight.name = 'kit-work-light';
    workLight.position.set(0, 0.24, KIT_Z + 0.03);
    workLight.target.position.set(0, 0, KIT_Z + 0.03);
    stage.add(workLight, workLight.target);

    this.targetSpot = createSpot(this.targetKind);
    this.targetSpot.visible = false;
    this.world.scene.add(this.targetSpot, this.targetSpot.target);

    this.shotCamera = new PerspectiveCamera(26, SHOT_W / SHOT_H, 0.005, 2);
    this.shotTarget = new WebGLRenderTarget(SHOT_W, SHOT_H);
    this.shotTarget.texture.colorSpace = SRGBColorSpace;
    this.targetShot = new WebGLRenderTarget(SHOT_W, SHOT_H);
    this.targetShot.texture.colorSpace = SRGBColorSpace;

    this.buildMonitor();
    this.initOrbit();
    this.ready = true;
    if (import.meta.env.DEV) {
      // Lets automated browser tests read the lights and the score.
      Object.assign(window, {
        lightLab: {
          fixtures: this.fixtures,
          orbit: this.orbit,
          score: () => this.evaluate().score,
          hint: () => this.evaluate().hint,
        },
      });
    }
    return true;
  }

  // --- Fixtures ------------------------------------------------------------

  private clampToSet(local: Vector3): void {
    local.x = MathUtils.clamp(local.x, -BOUNDS_X, BOUNDS_X);
    local.y = MathUtils.clamp(local.y, MIN_HEIGHT, MAX_HEIGHT);
    local.z = MathUtils.clamp(local.z, BOUNDS_BACK, BOUNDS_FRONT);
    // Push the light out of the actor if it was dropped on top of him.
    this.headLocal(this.v2);
    const dx = local.x - this.v2.x;
    const dz = local.z - this.v2.z;
    const flat = Math.hypot(dx, dz);
    if (flat < SUBJECT_CLEARANCE && local.y < this.v2.y + 0.03) {
      const scale = SUBJECT_CLEARANCE / Math.max(flat, 1e-4);
      local.x = this.v2.x + (flat > 1e-4 ? dx * scale : SUBJECT_CLEARANCE);
      local.z = this.v2.z + (flat > 1e-4 ? dz * scale : 0);
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

  private updateFixture(fixture: Fixture): void {
    fixture.on = fixture.local.z < TAPE_Z;

    // Stretch the stand from the yoke down to the floor.
    const height = Math.max(fixture.local.y, 0.014);
    const poleLength = Math.max(height - 0.012, 0.001);
    fixture.pole.scale.y = poleLength;
    fixture.pole.position.y = -0.012 - poleLength / 2;
    fixture.base.position.y = -height;

    fixture.head.lookAt(this.headWorld);
    fixture.object.getWorldPosition(this.v1);
    fixture.spot.visible = fixture.on;
    fixture.spot.position.copy(this.v1);
    fixture.spot.target.position.copy(this.headWorld);
    fixture.spot.target.updateMatrixWorld();
    if (fixture.face) {
      fixture.face.emissiveIntensity = fixture.on ? 1.6 : 0;
    }
  }

  private headLocal(out: Vector3): Vector3 {
    this.head.getWorldPosition(out);
    return this.stage.worldToLocal(out);
  }

  /** A stage-local light position as an orbit around the head: azimuth 0 is the camera side, negative is camera-left. */
  private poseOf(local: Vector3): Pose {
    this.headLocal(this.v2);
    const x = local.x - this.v2.x;
    const y = local.y - this.v2.y;
    const z = local.z - this.v2.z;
    const distance = Math.max(Math.hypot(x, y, z), 1e-4);
    return {
      azimuth: MathUtils.radToDeg(Math.atan2(x, z)),
      elevation: MathUtils.radToDeg(Math.asin(MathUtils.clamp(y / distance, -1, 1))),
      distance,
    };
  }

  private poseToWorld(pose: Pose, out: Vector3): Vector3 {
    const az = MathUtils.degToRad(pose.azimuth);
    const el = MathUtils.degToRad(pose.elevation);
    this.headLocal(out);
    out.x += pose.distance * Math.sin(az) * Math.cos(el);
    out.y += pose.distance * Math.sin(el);
    out.z += pose.distance * Math.cos(az) * Math.cos(el);
    return this.stage.localToWorld(out);
  }

  // --- Camera shots ----------------------------------------------------------

  private aimShotCamera(): void {
    this.lens.getWorldPosition(this.lensWorld);
    this.shotCamera.position.copy(this.lensWorld);
    this.shotCamera.lookAt(this.headWorld.x, this.headWorld.y - 0.004, this.headWorld.z);
    this.shotCamera.updateMatrixWorld();
  }

  /**
   * Renders the cine camera's view. The monitor and the camera body (the shot
   * camera sits inside its lens) are hidden; lights stay visible in the live
   * shot, so a light parked in frame shows up just as it would on a real set.
   */
  private renderShot(into: WebGLRenderTarget, showFixtures: boolean): void {
    const renderer = this.world.renderer;
    const previousTarget = renderer.getRenderTarget();
    const xrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;
    this.monitor.visible = false;
    this.cameraRig.visible = false;
    for (const fixture of this.fixtures) {
      fixture.object.visible = showFixtures;
      if (fixture.handle) {
        fixture.handle.visible = false;
      }
    }
    renderer.setRenderTarget(into);
    renderer.render(this.world.scene, this.shotCamera);
    renderer.setRenderTarget(previousTarget);
    for (const fixture of this.fixtures) {
      fixture.object.visible = true;
      if (fixture.handle) {
        fixture.handle.visible = true;
      }
    }
    this.cameraRig.visible = true;
    this.monitor.visible = true;
    renderer.xr.enabled = xrEnabled;
  }

  /** The target: only the right light, in the right spot, and no gear in frame. */
  private renderTargetShot(): void {
    for (const fixture of this.fixtures) {
      fixture.spot.visible = false;
    }
    this.poseToWorld(this.target, this.v1);
    this.targetSpot.position.copy(this.v1);
    this.targetSpot.target.position.copy(this.headWorld);
    this.targetSpot.target.updateMatrixWorld();
    this.targetSpot.visible = true;
    this.renderShot(this.targetShot, false);
    this.targetSpot.visible = false;
    for (const fixture of this.fixtures) {
      fixture.spot.visible = fixture.on;
    }
  }

  // --- Score -------------------------------------------------------------------

  private poseFit(pose: Pose): number {
    let dAz = Math.abs(pose.azimuth - this.target.azimuth);
    dAz = Math.min(dAz, 360 - dAz);
    const dEl = pose.elevation - this.target.elevation;
    const dDist = Math.log(pose.distance / this.target.distance);
    return Math.exp(-((dAz / 25) ** 2) - (dEl / 20) ** 2 - (dDist / 0.35) ** 2);
  }

  private evaluate(): { score: number; hint: string } {
    const on = this.fixtures.filter((fixture) => fixture.on);
    const right = on.find((fixture) => fixture.kind === this.targetKind);
    const extras = on.filter((fixture) => fixture.kind !== this.targetKind);
    if (on.length === 0) {
      return { score: 0, hint: 'Pick a light from the kit and move it past the tape.' };
    }
    if (!right) {
      const fit = this.poseFit(this.poseOf(extras[0].local));
      return {
        score: Math.round(fit * 40),
        hint: 'See the hard shadow under the nose? The target uses a softer light.',
      };
    }
    const pose = this.poseOf(right.local);
    const fit = this.poseFit(pose);
    if (extras.length > 0) {
      return {
        score: Math.round(fit * 55),
        hint: 'Too many lights. Put the extra one back behind the tape.',
      };
    }
    return { score: Math.round(fit * 100), hint: this.poseHint(pose) };
  }

  private poseHint(pose: Pose): string {
    let dAz = pose.azimuth - this.target.azimuth;
    if (dAz > 180) dAz -= 360;
    if (dAz < -180) dAz += 360;
    const dEl = pose.elevation - this.target.elevation;
    const ratio = pose.distance / this.target.distance;
    if (Math.abs(pose.azimuth) > 110) {
      return "The light is behind the talent. Bring it round to the front.";
    }
    if (Math.abs(dAz) > 12) {
      return dAz > 0 ? 'Swing the light toward camera-left.' : 'Swing the light back toward the camera.';
    }
    if (Math.abs(dEl) > 10) {
      return dEl < 0 ? 'Raise the light above eye level.' : 'Lower the light a little.';
    }
    if (Math.abs(Math.log(ratio)) > 0.2) {
      return ratio > 1 ? 'Bring the light closer.' : 'Pull the light back a bit.';
    }
    return 'Almost there. Hold it...';
  }

  private updateScore(delta: number): void {
    if (this.won) {
      return;
    }
    const { score, hint } = this.evaluate();
    this.holdTime = score >= WIN_SCORE ? this.holdTime + delta : 0;
    if (this.holdTime >= WIN_HOLD_SECONDS) {
      this.won = true;
      this.chime.play().catch(() => undefined);
      this.drawLabel(score, 'DIRECTOR: "That\'s the look! Who ARE you?"', 'Soft key, 45° to the side, a little above the eyes.');
      return;
    }
    const text = `${score}|${hint}`;
    if (text !== this.shownText) {
      this.shownText = text;
      this.drawLabel(score, `MATCH ${score}%`, hint);
    }
  }

  // --- Monitor -------------------------------------------------------------

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
    const livePlane = new Mesh(
      new PlaneGeometry(MONITOR_W, MONITOR_H),
      new MeshBasicMaterial({ map: this.shotTarget.texture, toneMapped: false }),
    );
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

    const barTop = toY(0.03 + MONITOR_H * 2);
    const barWidth = canvas.width - 0.024 * sx;
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(0.012 * sx, barTop, barWidth, 30);
    ctx.fillStyle = this.won ? '#4ade80' : score >= 70 ? '#f5d90a' : '#f97316';
    ctx.fillRect(0.012 * sx, barTop, (barWidth * score) / 100, 30);
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line1, 0.012 * sx, barTop + 78);
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillStyle = '#d4d4d8';
    ctx.fillText(line2, 0.012 * sx, barTop + 122);
    texture.needsUpdate = true;
  }

  // --- Desktop view and mouse controls ------------------------------------

  /** Starts the orbit from wherever the configured desktop camera is. */
  private initOrbit(): void {
    this.stage.getWorldPosition(this.pivot);
    this.pivot.y += 0.1;
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

  private setPointerRay(event: PointerEvent): void {
    const rect = this.world.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.world.camera);
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.ready || this.immersive) {
      return;
    }
    this.lastPointer.set(event.clientX, event.clientY);
    this.setPointerRay(event);
    if (event.button === 0) {
      let best: { fixture: Fixture; distance: number } | null = null;
      for (const fixture of this.fixtures) {
        const hit = this.raycaster.intersectObject(fixture.object, true)[0];
        if (hit && (!best || hit.distance < best.distance)) {
          best = { fixture, distance: hit.distance };
        }
      }
      if (best) {
        // Drag in the horizontal plane at the light's height.
        this.dragged = best.fixture;
        best.fixture.object.getWorldPosition(this.v1);
        this.dragPlane.setFromNormalAndCoplanarPoint(this.v2.set(0, 1, 0), this.v1);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.v2)) {
          this.dragOffset.copy(this.v1).sub(this.v2);
        } else {
          this.dragOffset.set(0, 0, 0);
        }
        event.preventDefault();
        return;
      }
    }
    this.orbiting = true;
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.dragged) {
      this.setPointerRay(event);
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.v1)) {
        this.v1.add(this.dragOffset);
        this.stage.worldToLocal(this.v1);
        this.dragged.local.x = this.v1.x;
        this.dragged.local.z = this.v1.z;
      }
    } else if (this.orbiting) {
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.orbit.yaw -= dx * 0.004;
      this.orbit.pitch = MathUtils.clamp(this.orbit.pitch + dy * 0.004, -0.05, 1.35);
    }
    this.lastPointer.set(event.clientX, event.clientY);
  }

  private onWheel(event: WheelEvent): void {
    if (!this.ready || this.immersive) {
      return;
    }
    event.preventDefault();
    if (this.dragged) {
      // Raise or lower the held light, and keep dragging at its new height.
      this.dragged.local.y = MathUtils.clamp(
        this.dragged.local.y - event.deltaY * 0.00015,
        MIN_HEIGHT,
        MAX_HEIGHT,
      );
      this.v1.copy(this.dragged.local);
      this.stage.localToWorld(this.v1);
      this.dragPlane.setFromNormalAndCoplanarPoint(this.v2.set(0, 1, 0), this.v1);
      return;
    }
    this.orbit.radius = MathUtils.clamp(this.orbit.radius * Math.exp(event.deltaY * 0.001), 0.2, 1.6);
  }
}
