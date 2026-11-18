import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Material, type Texture } from '@iwsdk/core';

/**
 * Headset play that keeps your eyes on the set (ben, 2026-11-18: "the whole goal of this is
 * to focus on what you're actually doing and not on the monitor, because then you're just
 * playing a 2D game in VR"). Three in-world pieces, all fixed to the set:
 *
 * - ShotSign: the target and your shot, like a storefront sign above the front of the stage.
 * - EdgeStrip: the match bar and the tip, printed along the stage's front edge, with the
 *   HOUSE switch at one end and Next scene at the other when there is one.
 * - LightPanel: a light's own controls (switch, dimmer, color), floating over the light you
 *   point at.
 *
 * Each is a canvas on a plane, redrawn only when what it shows changes.
 */

const PX = 4000; // canvas pixels per meter
const YELLOW = '#f5d90a';
const GREEN = '#4ade80';

function canvasPlane(w: number, h: number, name: string): { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
  mesh.name = name;
  return { mesh, canvas, texture };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A rectangle in a plane's own meters (origin at its center, y up). */
export type Frame = { x: number; y: number; w: number; h: number };

type Hit<T> = { frame: Frame; control: T };

function hitTest<T>(hits: Hit<T>[], x: number, y: number): T | null {
  for (const h of hits) {
    if (Math.abs(x - h.frame.x) <= h.frame.w / 2 && Math.abs(y - h.frame.y) <= h.frame.h / 2) return h.control;
  }
  return null;
}

// --- The sign -----------------------------------------------------------------

export const SIGN_SHOT_W = 0.2;
const SIGN_GAP = 0.012;
const SIGN_PAD = 0.012;
const SIGN_LABEL_H = 0.022;

/** The target and your shot side by side in a dark sign box, labels along the top. */
export class ShotSign {
  readonly group = new Group();
  readonly width: number;
  readonly height: number;
  private label: { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture };
  private labelKey = '';
  private shotH: number;
  readonly targetFrame: Frame;
  readonly liveFrame: Frame;

  constructor(target: Texture, live: Material, aspect: number) {
    this.group.name = 'shot-sign';
    this.shotH = SIGN_SHOT_W / aspect;
    this.width = 2 * SIGN_SHOT_W + SIGN_GAP + 2 * SIGN_PAD;
    this.height = this.shotH + SIGN_LABEL_H + 2 * SIGN_PAD;
    // The sign's face: a rounded dark panel (the box behind it is built by the caller).
    const face = canvasPlane(this.width, this.height, 'shot-sign-face');
    const ctx = face.canvas.getContext('2d');
    if (ctx) {
      roundRect(ctx, 0, 0, face.canvas.width, face.canvas.height, 0.012 * PX);
      ctx.fillStyle = '#121214';
      ctx.fill();
      ctx.strokeStyle = '#2f3036';
      ctx.lineWidth = 0.003 * PX;
      ctx.stroke();
    }
    face.texture.needsUpdate = true;
    this.group.add(face.mesh);
    const shotY = -this.height / 2 + SIGN_PAD + this.shotH / 2;
    const leftX = -SIGN_SHOT_W / 2 - SIGN_GAP / 2;
    const rightX = SIGN_SHOT_W / 2 + SIGN_GAP / 2;
    const targetPlane = new Mesh(new PlaneGeometry(SIGN_SHOT_W, this.shotH), new MeshBasicMaterial({ map: target, toneMapped: false }));
    targetPlane.position.set(leftX, shotY, 0.001);
    const livePlane = new Mesh(new PlaneGeometry(SIGN_SHOT_W, this.shotH), live);
    livePlane.position.set(rightX, shotY, 0.001);
    // The face is see-through at its rounded corners, so it sorts with the other see-through
    // layers; draw it first, always (sorted by distance, it sometimes covered your shot).
    face.mesh.renderOrder = 0;
    targetPlane.renderOrder = 1;
    livePlane.renderOrder = 1;
    this.group.add(targetPlane, livePlane);
    this.targetFrame = { x: leftX, y: shotY, w: SIGN_SHOT_W, h: this.shotH };
    this.liveFrame = { x: rightX, y: shotY, w: SIGN_SHOT_W, h: this.shotH };
    this.label = canvasPlane(this.width - 2 * SIGN_PAD, SIGN_LABEL_H, 'shot-sign-label');
    this.label.mesh.position.set(0, this.height / 2 - SIGN_PAD / 2 - SIGN_LABEL_H / 2, 0.001);
    this.label.mesh.renderOrder = 1;
    this.group.add(this.label.mesh);
    for (const child of this.group.children) (child as unknown as { pointerEvents: string }).pointerEvents = 'none';
    this.setLabels('TARGET', 'YOUR SHOT', '#ffffff');
  }

  /** The two captions over the shots, e.g. "TARGET · SCENE 3 OF 10" and "YOUR SHOT". */
  setLabels(left: string, right: string, rightColor: string): void {
    const key = `${left}|${right}|${rightColor}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    const { canvas, texture } = this.label;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `bold ${0.012 * PX}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const fit = (text: string) => {
      let t = text;
      while (ctx.measureText(t).width > (SIGN_SHOT_W - 0.004) * PX && t.length > 4) t = `${t.slice(0, -2)}…`;
      return t;
    };
    ctx.fillStyle = YELLOW;
    ctx.fillText(fit(left), 0, canvas.height / 2);
    ctx.fillStyle = rightColor;
    ctx.fillText(fit(right), (SIGN_SHOT_W + SIGN_GAP) * PX, canvas.height / 2);
    texture.needsUpdate = true;
  }
}

// --- The strip along the front edge ---------------------------------------------

export const STRIP_W = 0.5;
export const STRIP_H = 0.05;
const HOUSE_W = 0.07;
const NEXT_W = 0.1;

export type StripState = {
  /** 0-100, or -1 for no bar (the blind track). */
  score: number;
  won: boolean;
  /** The line to show, and whether it's the coach's how-to (yellow) or the tip (white). */
  text: string;
  coaching: boolean;
  /** HOUSE switch: whether the house lights are on, or null for no switch (outdoors). */
  house: boolean | null;
  /** "Next scene" and the like, when the take is in the can. */
  button?: string;
  /** A light's name in the text to show in yellow (the first time a tip names it). */
  highlight?: string;
  /** Headset brightness step (0-based) to show with - and +, or undefined for none. */
  bright?: number;
};

export type StripControl = 'house' | 'next' | 'darker' | 'brighter';

/** The match bar and the tip, printed along the stage's front edge. */
export class EdgeStrip {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private key = '';
  private hits: Hit<StripControl>[] = [];

  constructor() {
    const plane = canvasPlane(STRIP_W, STRIP_H, 'edge-strip');
    this.mesh = plane.mesh;
    this.canvas = plane.canvas;
    this.texture = plane.texture;
  }

  set(state: StripState): void {
    const key = `${state.score}|${state.won}|${state.text}|${state.coaching}|${state.house}|${state.button ?? ''}|${state.highlight ?? ''}|${state.bright ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(state);
  }

  controlAt(x: number, y: number): StripControl | null {
    return hitTest(this.hits, x, y);
  }

  frameOf(control: StripControl): Frame | null {
    return this.hits.find((h) => h.control === control)?.frame ?? null;
  }

  private draw(s: StripState): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const m = (n: number) => n * PX;
    ctx.clearRect(0, 0, W, H);
    // Black gaffer tape along the edge, so the text reads on any floor.
    roundRect(ctx, 0, 0, W, H, m(0.006));
    ctx.fillStyle = 'rgba(14,14,16,0.92)';
    ctx.fill();
    this.hits = [];
    const pad = m(0.004);
    let left = pad;
    let right = W - pad;
    const button = (x: number, w: number, label: string, fill: string, ink: string, control: StripControl) => {
      roundRect(ctx, x, pad, w, H - 2 * pad, m(0.008));
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.font = `bold ${m(0.014)}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + (w - ctx.measureText(label).width) / 2, H / 2);
      // Hit frames in the plane's meters (origin at its center, y up).
      this.hits.push({ control, frame: { x: (x + w / 2) / PX - STRIP_W / 2, y: 0, w: w / PX, h: STRIP_H } });
    };
    if (s.house !== null) {
      button(left, m(HOUSE_W), 'HOUSE', s.house ? '#e7e5e4' : '#26262b', s.house ? '#18181b' : '#a1a1aa', 'house');
      left += m(HOUSE_W) + pad;
    }
    if (s.button) {
      const w = m(NEXT_W);
      button(right - w, w, s.button, YELLOW, '#18181b', 'next');
      right -= w + pad;
    }
    if (s.bright !== undefined) {
      // Brightness: - and + either side of its step.
      const bw = m(0.03);
      button(right - bw, bw, '+', '#e7e5e4', '#18181b', 'brighter');
      right -= bw + pad;
      ctx.font = `bold ${m(0.011)}px system-ui, sans-serif`;
      const label = `BRIGHTNESS ${s.bright + 1}`;
      const lw = ctx.measureText(label).width + m(0.008);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, right - lw + m(0.004), H / 2);
      right -= lw;
      button(right - bw, bw, '-', '#e7e5e4', '#18181b', 'darker');
      right -= bw + pad;
    }
    // The match bar along the top, the line under it.
    const barW = right - left;
    if (s.score >= 0) {
      ctx.fillStyle = '#2b2b30';
      ctx.fillRect(left, pad, barW, m(0.006));
      ctx.fillStyle = s.won ? GREEN : s.score >= 70 ? YELLOW : '#f97316';
      ctx.fillRect(left, pad, (barW * s.score) / 100, m(0.006));
      ctx.font = `bold ${m(0.011)}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = s.won ? GREEN : '#ffffff';
      const pct = `${s.score}%`;
      ctx.fillText(pct, right - ctx.measureText(pct).width, pad + m(0.008));
    }
    let size = 0.016;
    ctx.font = `bold ${m(size)}px system-ui, sans-serif`;
    const textW = barW - m(0.03);
    while (ctx.measureText(s.text).width > textW && size > 0.0105) {
      size -= 0.0005;
      ctx.font = `bold ${m(size)}px system-ui, sans-serif`;
    }
    let line = s.text;
    while (ctx.measureText(line).width > textW && line.length > 4) line = `${line.slice(0, -2)}…`;
    ctx.textBaseline = 'alphabetic';
    const baseY = H - pad - m(0.006);
    const at = s.highlight && !s.coaching ? line.toLowerCase().indexOf(s.highlight.toLowerCase()) : -1;
    if (at < 0) {
      ctx.fillStyle = s.coaching ? YELLOW : '#ffffff';
      ctx.fillText(line, left, baseY);
    } else {
      // The light's name in yellow, the rest in white.
      const parts = [line.slice(0, at), line.slice(at, at + s.highlight!.length), line.slice(at + s.highlight!.length)];
      let x = left;
      parts.forEach((part, i) => {
        ctx.fillStyle = i === 1 ? YELLOW : '#ffffff';
        ctx.fillText(part, x, baseY);
        x += ctx.measureText(part).width;
      });
    }
    this.texture.needsUpdate = true;
  }
}

// --- The panel over a light -----------------------------------------------------

export const PANEL_H = 0.034;
const SEG_W = 0.07;

/** `cue` softly outlines the dimmer button the tip line is asking for. */
export type PanelState = { label: string; on: boolean; dimmer?: number; kelvin?: number; cue?: 'dimmer' | 'brighter' };
export type PanelControl = 'power' | 'dimmer' | 'brighter' | 'warmer' | 'cooler';

/** A light's own controls, floating over it while you point at it. */
export class LightPanel {
  /** Place and turn this; its hit frames and rings are in its own meters. */
  readonly group = new Group();
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private key = '';
  private hits: Hit<PanelControl>[] = [];
  /** Its width in meters for the current light (one segment per control). */
  width = SEG_W;

  constructor() {
    const plane = canvasPlane(3 * SEG_W, PANEL_H, 'light-panel');
    this.mesh = plane.mesh;
    this.canvas = plane.canvas;
    this.texture = plane.texture;
    this.mesh.renderOrder = 1004;
    (this.mesh.material as MeshBasicMaterial).depthTest = false;
    (this.mesh.material as MeshBasicMaterial).depthWrite = false;
    this.group.name = 'light-panel';
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  set(s: PanelState): void {
    const key = `${s.label}|${s.on}|${s.dimmer}|${s.kelvin}|${s.cue ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(s);
  }

  controlAt(x: number, y: number): PanelControl | null {
    return hitTest(this.hits, x, y);
  }

  frameOf(control: PanelControl): Frame | null {
    return this.hits.find((h) => h.control === control)?.frame ?? null;
  }

  private draw(s: PanelState): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const segs = 1 + (s.dimmer !== undefined ? 1 : 0) + (s.kelvin !== undefined ? 1 : 0);
    this.width = segs * SEG_W;
    // The plane is 3 segments wide; show only the used part, centered.
    this.mesh.scale.x = segs / 3;
    const m = (n: number) => n * PX;
    const W = m(this.width);
    const H = this.canvas.height;
    this.canvas.width = Math.round(W);
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 0, 0, W, H, m(0.008));
    ctx.fillStyle = 'rgba(16,16,18,0.94)';
    ctx.fill();
    ctx.strokeStyle = s.on ? YELLOW : '#3f3f46';
    ctx.lineWidth = m(0.0015);
    ctx.stroke();
    this.hits = [];
    const toFrame = (x: number, w: number): Frame => ({ x: (x + w / 2) / PX - this.width / 2, y: 0, w: w / PX, h: PANEL_H });
    ctx.textBaseline = 'middle';
    // The switch: a status light and the light's name.
    let x = 0;
    const sw = m(SEG_W);
    ctx.fillStyle = s.on ? GREEN : '#52525b';
    ctx.beginPath();
    ctx.arc(x + m(0.009), H / 2, m(0.004), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${m(0.0095)}px system-ui, sans-serif`;
    let label = s.label;
    while (ctx.measureText(label).width > sw - m(0.019) && label.length > 4) label = `${label.slice(0, -2)}…`;
    ctx.fillText(label, x + m(0.017), H / 2);
    this.hits.push({ control: 'power', frame: toFrame(x, sw) });
    x += sw;
    const stepper = (value: string, down: PanelControl, up: PanelControl, color: string) => {
      ctx.strokeStyle = '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(x, m(0.005));
      ctx.lineTo(x, H - m(0.005));
      ctx.stroke();
      const arrow = m(0.017);
      ctx.fillStyle = YELLOW;
      ctx.font = `bold ${m(0.013)}px system-ui, sans-serif`;
      // Plain - and + (some headset browsers draw ◀ ▶ as empty boxes).
      ctx.font = `bold ${m(0.017)}px system-ui, sans-serif`;
      ctx.fillText('-', x + m(0.006), H / 2);
      ctx.fillText('+', x + sw - arrow + m(0.002), H / 2);
      ctx.fillStyle = color;
      ctx.font = `bold ${m(0.0105)}px system-ui, sans-serif`;
      ctx.fillText(value, x + (sw - ctx.measureText(value).width) / 2, H / 2);
      // The tip's ask (brighter or dimmer), outlined softly on its half of the stepper.
      if (s.cue === down || s.cue === up) {
        const half = s.cue === down ? x : x + sw / 2;
        roundRect(ctx, half + m(0.002), m(0.003), sw / 2 - m(0.004), H - m(0.006), m(0.004));
        ctx.strokeStyle = 'rgba(245,217,10,0.7)';
        ctx.lineWidth = m(0.0012);
        ctx.stroke();
      }
      this.hits.push({ control: down, frame: toFrame(x, sw / 2) });
      this.hits.push({ control: up, frame: toFrame(x + sw / 2, sw / 2) });
      x += sw;
    };
    if (s.dimmer !== undefined) stepper(`${s.dimmer}%`, 'dimmer', 'brighter', '#ffffff');
    if (s.kelvin !== undefined) stepper(`${s.kelvin}K`, 'warmer', 'cooler', s.kelvin < 4000 ? '#fdba74' : '#bfdbfe');
    // Redraw at the new width on a fresh texture (the canvas size changed).
    this.texture.dispose();
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    (this.mesh.material as MeshBasicMaterial).map = this.texture;
    (this.mesh.material as MeshBasicMaterial).needsUpdate = true;
  }
}
