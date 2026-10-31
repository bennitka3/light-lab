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
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VisibilityState,
  WebGLRenderTarget,
} from '@iwsdk/core';
import { KeyLightRig, LightingStage } from './lighting-components.js';

/**
 * Runs one lighting level: the grabbed softbox drives a real spot light aimed
 * at the subject's head, a cine camera renders "your shot" to the monitor, the
 * same set rendered with the light in its target spot is the "target" shot,
 * and a match score compares where the light is to where it should be.
 *
 * In the headset the softbox is grabbed with a pinch (DistanceGrabbable).
 * In a desktop browser it is dragged with the mouse: left/right swings it
 * around the subject, up/down raises it, the scroll wheel moves it closer.
 */

const MONITOR_W = 0.24;
const MONITOR_H = 0.135;
const SHOT_W = 512;
const SHOT_H = 288;
const WIN_SCORE = 90;
const WIN_HOLD_SECONDS = 0.8;
const MIN_DISTANCE = 0.06;
const MAX_DISTANCE = 0.32;

type Pose = { azimuth: number; elevation: number; distance: number };

export class LightingLevelSystem extends createSystem({
  stages: { required: [LightingStage] },
  lights: { required: [KeyLightRig] },
}) {
  private ready = false;
  private stage!: Object3D;
  private head!: Object3D;
  private lens!: Object3D;
  private cameraRig!: Object3D;
  private softbox!: Object3D;
  private lightEntity!: Entity;
  private spot!: SpotLight;
  private shotCamera!: PerspectiveCamera;
  private shotTarget!: WebGLRenderTarget;
  private targetShot!: WebGLRenderTarget;
  private framesSinceSetup = 0;
  private monitor!: Group;
  private label!: { canvas: HTMLCanvasElement; texture: CanvasTexture };
  private shownScore = -1;
  private holdTime = 0;
  private won = false;
  private target: Pose = { azimuth: -45, elevation: 35, distance: 0.16 };
  private pose: Pose = { azimuth: 0, elevation: 0, distance: 0.2 };
  private backdrop = new Color('#141416');
  private chime = new Audio(`${import.meta.env.BASE_URL}audio/chime.mp3`);

  // Desktop mouse dragging.
  private immersive = false;
  private dragging = false;
  private lastPointer = new Vector2();
  private pointerNdc = new Vector2();
  private raycaster = new Raycaster();

  // Scratch vectors, reused every frame.
  private headWorld = new Vector3();
  private lensWorld = new Vector3();
  private lightWorld = new Vector3();
  private local = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.immersive = state !== VisibilityState.NonImmersive;
        this.dragging = false;
        // A dark studio backdrop in the browser; in the headset the real room shows through.
        this.world.scene.background = this.immersive ? null : this.backdrop;
      }),
    );
    const canvas = this.world.renderer.domElement;
    const onDown = (event: PointerEvent) => this.onPointerDown(event);
    const onMove = (event: PointerEvent) => this.onPointerMove(event);
    const onUp = () => {
      this.dragging = false;
    };
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      this.spot?.removeFromParent();
      this.spot?.target.removeFromParent();
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

    // In the browser the mouse drag below moves the light, not the grab system.
    const grabbed = this.immersive && this.lightEntity.hasComponent(Grabbed);
    if (grabbed) {
      this.readPoseFromSoftbox();
    }
    if (!grabbed) {
      // Desktop drags and releases both land here: keep the light inside the
      // playable range and on its orbit around the subject.
      this.placeSoftbox(this.pose);
    }
    this.aimRig();

    // Capture the target once shadows settle, then refresh it now and then in
    // case the set was moved (for example placed on a desk in the headset).
    if (this.framesSinceSetup % 90 === 3) {
      this.renderTargetShot();
    }
    this.renderShot(this.shotTarget);
    this.updateScore(delta);
  }

  private trySetup(): boolean {
    const stageEntity = this.queries.stages.entities.values().next().value;
    const lightEntity = this.queries.lights.entities.values().next().value;
    const stage = stageEntity?.object3D;
    const softbox = lightEntity?.object3D;
    const head = stage?.getObjectByName('subject-head');
    const lens = stage?.getObjectByName('camera-lens');
    const cameraRig = stage?.getObjectByName('camera-rig');
    if (!stage || !softbox || !head || !lens || !cameraRig || !lightEntity) {
      return false;
    }
    this.stage = stage;
    this.head = head;
    this.lens = lens;
    this.cameraRig = cameraRig;
    this.softbox = softbox;
    this.lightEntity = lightEntity;

    this.target = {
      azimuth: lightEntity.getValue(KeyLightRig, 'targetAzimuthDeg') ?? -45,
      elevation: lightEntity.getValue(KeyLightRig, 'targetElevationDeg') ?? 35,
      distance: lightEntity.getValue(KeyLightRig, 'targetDistance') ?? 0.16,
    };
    this.pose = {
      azimuth: lightEntity.getValue(KeyLightRig, 'startAzimuthDeg') ?? 0,
      elevation: lightEntity.getValue(KeyLightRig, 'startElevationDeg') ?? 0,
      distance: lightEntity.getValue(KeyLightRig, 'startDistance') ?? 0.2,
    };

    // A soft key: wide cone, fully feathered edge, blurred shadow.
    this.spot = new SpotLight(
      '#fff1dc',
      lightEntity.getValue(KeyLightRig, 'intensity') ?? 0.1,
      0,
      MathUtils.degToRad(55),
      1,
      2,
    );
    this.spot.name = 'key-light';
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.01;
    this.spot.shadow.camera.far = 1;
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.0005;
    this.spot.shadow.radius = 8;
    this.spot.shadow.blurSamples = 16;
    this.world.scene.add(this.spot, this.spot.target);

    this.shotCamera = new PerspectiveCamera(26, SHOT_W / SHOT_H, 0.005, 2);
    this.shotTarget = new WebGLRenderTarget(SHOT_W, SHOT_H);
    this.shotTarget.texture.colorSpace = SRGBColorSpace;
    this.targetShot = new WebGLRenderTarget(SHOT_W, SHOT_H);
    this.targetShot.texture.colorSpace = SRGBColorSpace;

    this.buildMonitor();
    this.placeSoftbox(this.pose);
    if (import.meta.env.DEV) {
      // Lets automated browser tests read the light's pose and the score.
      Object.assign(window, { lightLab: { pose: this.pose, score: () => this.score() } });
    }
    this.ready = true;
    return true;
  }

  /** Stage-local orbit around the head: azimuth 0 is the camera side, negative is camera-left. */
  private poseToWorld(pose: Pose, out: Vector3): Vector3 {
    const az = MathUtils.degToRad(pose.azimuth);
    const el = MathUtils.degToRad(pose.elevation);
    this.headLocal(out);
    out.x += pose.distance * Math.sin(az) * Math.cos(el);
    out.y += pose.distance * Math.sin(el);
    out.z += pose.distance * Math.cos(az) * Math.cos(el);
    return this.stage.localToWorld(out);
  }

  private headLocal(out: Vector3): Vector3 {
    this.head.getWorldPosition(out);
    return this.stage.worldToLocal(out);
  }

  private readPoseFromSoftbox(): void {
    this.softbox.getWorldPosition(this.local);
    this.stage.worldToLocal(this.local);
    this.headLocal(this.headWorld);
    this.local.sub(this.headWorld);
    const distance = this.local.length();
    if (distance < 1e-4) {
      return;
    }
    this.pose.distance = MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
    this.pose.elevation = MathUtils.radToDeg(Math.asin(MathUtils.clamp(this.local.y / distance, -1, 1)));
    this.pose.azimuth = MathUtils.radToDeg(Math.atan2(this.local.x, this.local.z));
  }

  private placeSoftbox(pose: Pose): void {
    pose.distance = MathUtils.clamp(pose.distance, MIN_DISTANCE, MAX_DISTANCE);
    pose.elevation = MathUtils.clamp(pose.elevation, -20, 80);
    pose.azimuth = MathUtils.clamp(pose.azimuth, -160, 160);
    this.poseToWorld(pose, this.lightWorld);
    const parent = this.softbox.parent;
    if (parent) {
      parent.worldToLocal(this.local.copy(this.lightWorld));
      this.softbox.position.copy(this.local);
    } else {
      this.softbox.position.copy(this.lightWorld);
    }
  }

  private aimRig(): void {
    this.head.getWorldPosition(this.headWorld);
    this.softbox.lookAt(this.headWorld);
    this.softbox.getWorldPosition(this.lightWorld);
    this.spot.position.copy(this.lightWorld);
    this.spot.target.position.copy(this.headWorld);
    this.spot.target.updateMatrixWorld();

    this.lens.getWorldPosition(this.lensWorld);
    this.shotCamera.position.copy(this.lensWorld);
    this.shotCamera.lookAt(this.headWorld.x, this.headWorld.y - 0.004, this.headWorld.z);
    this.shotCamera.updateMatrixWorld();
  }

  private renderShot(into: WebGLRenderTarget): void {
    const renderer = this.world.renderer;
    const previousTarget = renderer.getRenderTarget();
    const xrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;
    // Hide the monitor, the softbox and the camera body (the shot camera sits
    // inside its lens) so they don't appear in the shot.
    this.monitor.visible = false;
    this.softbox.visible = false;
    this.cameraRig.visible = false;
    renderer.setRenderTarget(into);
    renderer.render(this.world.scene, this.shotCamera);
    renderer.setRenderTarget(previousTarget);
    this.cameraRig.visible = true;
    this.softbox.visible = true;
    this.monitor.visible = true;
    renderer.xr.enabled = xrEnabled;
  }

  private renderTargetShot(): void {
    this.poseToWorld(this.target, this.lightWorld);
    this.spot.position.copy(this.lightWorld);
    this.renderShot(this.targetShot);
    this.softbox.getWorldPosition(this.lightWorld);
    this.spot.position.copy(this.lightWorld);
  }

  private score(): number {
    let dAz = Math.abs(this.pose.azimuth - this.target.azimuth);
    dAz = Math.min(dAz, 360 - dAz);
    const dEl = this.pose.elevation - this.target.elevation;
    const dDist = Math.log(this.pose.distance / this.target.distance);
    const fit = Math.exp(-((dAz / 28) ** 2) - (dEl / 22) ** 2 - (dDist / 0.45) ** 2);
    return Math.round(fit * 100);
  }

  private updateScore(delta: number): void {
    const score = this.score();
    if (!this.won) {
      this.holdTime = score >= WIN_SCORE ? this.holdTime + delta : 0;
      if (this.holdTime >= WIN_HOLD_SECONDS) {
        this.won = true;
        this.chime.play().catch(() => undefined);
        this.drawLabel(score);
        return;
      }
    }
    if (score !== this.shownScore) {
      this.drawLabel(score);
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
    this.drawLabel(this.score());
  }

  private drawLabel(score: number): void {
    this.shownScore = score;
    const { canvas, texture } = this.label;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    // The canvas maps onto the whole monitor face: 0.18 m wide, 0.255 m tall.
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
    const line1 = this.won ? 'DIRECTOR: "That\'s the look! Who ARE you?"' : `MATCH ${score}%`;
    ctx.fillText(line1, 0.012 * sx, barTop + 78);
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillStyle = '#d4d4d8';
    const line2 = this.won
      ? 'Soft key, 45° to the side, a little above the eyes.'
      : this.hint();
    ctx.fillText(line2, 0.012 * sx, barTop + 122);
    texture.needsUpdate = true;
  }

  private hint(): string {
    let dAz = this.pose.azimuth - this.target.azimuth;
    if (dAz > 180) dAz -= 360;
    if (dAz < -180) dAz += 360;
    const dEl = this.pose.elevation - this.target.elevation;
    const ratio = this.pose.distance / this.target.distance;
    if (Math.abs(dAz) > 15) {
      return dAz > 0 ? 'Swing the light toward camera-left.' : 'Swing the light back toward the camera.';
    }
    if (Math.abs(dEl) > 12) {
      return dEl < 0 ? 'Raise the light above eye level.' : 'Lower the light a little.';
    }
    if (Math.abs(Math.log(ratio)) > 0.25) {
      return ratio > 1 ? 'Bring the light closer.' : 'Pull the light back a bit.';
    }
    return 'Almost there. Hold it...';
  }

  // --- Desktop mouse controls ---------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    if (!this.ready || this.immersive || event.button !== 0) {
      return;
    }
    const rect = this.world.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.world.camera);
    const hit = this.raycaster.intersectObject(this.softbox, true).length > 0;
    if (hit) {
      this.dragging = true;
      this.lastPointer.set(event.clientX, event.clientY);
      event.preventDefault();
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.lastPointer.set(event.clientX, event.clientY);
    this.pose.azimuth += dx * 0.35;
    this.pose.elevation -= dy * 0.3;
  }

  private onWheel(event: WheelEvent): void {
    if (!this.ready || this.immersive) {
      return;
    }
    event.preventDefault();
    this.pose.distance *= Math.exp(event.deltaY * 0.001);
  }
}
