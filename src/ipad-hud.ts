import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from '@iwsdk/core';
import { wrap } from './text.js';

/**
 * The iPad you hold in the middle of your view: the director's target shot
 * and your live shot side by side, the scene callout, the match bar and the
 * current hint, plus what to do next. At the very start it shows a full
 * how-to-play page and waits for "Go". It draws on top of the set, so the
 * lighting system can keep it in front of the camera.
 */

export type IPadPage = {
  /** The callout at the top, e.g. "Scene 3 of 7 · Product shot". */
  eyebrow: string;
  /** Only shown on full pages (title, credits). */
  title?: string;
  body: string;
  footer?: string;
  button?: string;
  /** A full page that covers the shots (title, how to play, credits). */
  full?: boolean;
  /** Extra lines on a full page (how-to-play steps). */
  steps?: string[];
};

export const IPAD_WIDTH = 0.4;
export const IPAD_HEIGHT = 0.27;
const PX = 4000; // canvas pixels per meter
const W = Math.round(IPAD_WIDTH * PX);
const H = Math.round(IPAD_HEIGHT * PX);
const BEZEL = 0.012;
const GAP = 0.01;
const SHOT_W = (IPAD_WIDTH - 2 * BEZEL - GAP) / 2;
const SHOT_H = (SHOT_W * 9) / 16;
const SHOT_TOP = 0.05;
const BUTTON = { w: 0.105, h: 0.032 };
/** The button's center in the iPad's own meters (origin at its center), for tests that click it. */
export const IPAD_BUTTON_CENTER = {
  x: IPAD_WIDTH / 2 - BEZEL - BUTTON.w / 2 - 0.006,
  y: IPAD_HEIGHT / 2 - (IPAD_HEIGHT - BEZEL - 0.006 - BUTTON.h / 2),
};

export class IPad {
  readonly object = new Group();
  readonly liveMaterial: MeshBasicMaterial;
  private canvas = document.createElement('canvas');
  private texture: CanvasTexture;
  private shots: Mesh[] = [];
  page: IPadPage = { eyebrow: '', body: '' };
  private score = 0;
  private hint = '';
  private won = false;
  /** Draws something over the live shot (used by a special effect); called on every redraw. */
  overLive?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => boolean;

  constructor(target: Texture, live: Texture) {
    this.object.name = 'ipad';
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    // All layers are "transparent" so they draw in renderOrder after the set, on top of everything.
    const hud = (map: Texture, _transparent: boolean) =>
      new MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthTest: false, depthWrite: false });

    // Body, with the screen drawn on the same canvas.
    const body = new Mesh(new PlaneGeometry(IPAD_WIDTH, IPAD_HEIGHT), hud(this.texture, true));
    body.name = 'ipad-screen';
    body.renderOrder = 1000;
    // Shot planes, on top of the body.
    const left = -IPAD_WIDTH / 2 + BEZEL + SHOT_W / 2;
    const y = IPAD_HEIGHT / 2 - SHOT_TOP - SHOT_H / 2;
    const targetPlane = new Mesh(new PlaneGeometry(SHOT_W, SHOT_H), hud(target, false));
    targetPlane.name = 'ipad-target';
    targetPlane.position.set(left, y, 0);
    this.liveMaterial = hud(live, false);
    const livePlane = new Mesh(new PlaneGeometry(SHOT_W, SHOT_H), this.liveMaterial);
    livePlane.name = 'ipad-live';
    livePlane.position.set(left + SHOT_W + GAP, y, 0);
    targetPlane.renderOrder = livePlane.renderOrder = 1001;
    this.shots = [targetPlane, livePlane];
    // Labels and effects over the shots: a second, transparent layer of the same canvas would
    // cost a texture; instead the labels sit in a thin strip drawn above each shot on the body.
    this.object.add(body, targetPlane, livePlane);
    for (const child of this.object.children) {
      child.frustumCulled = false;
    }
    this.overlay = new Mesh(new PlaneGeometry(SHOT_W, SHOT_H), hud(this.overlayTexture(), true));
    this.overlay.position.copy(livePlane.position);
    this.overlay.renderOrder = 1002;
    this.overlay.frustumCulled = false;
    this.overlay.visible = false;
    this.object.add(this.overlay);
  }

  private overlay: Mesh;
  private overlayCanvas = document.createElement('canvas');
  private overlayTex?: CanvasTexture;

  private overlayTexture(): CanvasTexture {
    this.overlayCanvas.width = Math.round(SHOT_W * PX);
    this.overlayCanvas.height = Math.round(SHOT_H * PX);
    this.overlayTex = new CanvasTexture(this.overlayCanvas);
    this.overlayTex.colorSpace = SRGBColorSpace;
    return this.overlayTex;
  }

  get hasButton(): boolean {
    return Boolean(this.page.button);
  }

  get isFull(): boolean {
    return Boolean(this.page.full);
  }

  show(page: IPadPage): void {
    this.page = page;
    this.draw();
  }

  setStatus(score: number, hint: string, won: boolean): void {
    this.score = score;
    this.hint = hint;
    this.won = won;
    this.draw();
  }

  /** Redraws the over-the-live-shot layer (for effects that come and go). */
  refreshOverlay(): void {
    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx || !this.overLive) {
      this.overlay.visible = false;
      return;
    }
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    const shown = !this.page.full && this.overLive(ctx, 0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.overlay.visible = shown;
    if (shown && this.overlayTex) {
      this.overlayTex.needsUpdate = true;
    }
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const page = this.page;
    const m = (meters: number) => meters * PX;
    const pad = m(BEZEL);
    ctx.clearRect(0, 0, W, H);
    // The iPad: a dark aluminium body and a black screen.
    roundRect(ctx, 0, 0, W, H, m(0.018));
    ctx.fillStyle = '#2a2b2f';
    ctx.fill();
    roundRect(ctx, m(0.004), m(0.004), W - m(0.008), H - m(0.008), m(0.015));
    ctx.fillStyle = '#0c0c0e';
    ctx.fill();

    // Header: the scene callout, and the match score on the right.
    ctx.fillStyle = '#f5d90a';
    ctx.font = `bold ${m(0.0115)}px system-ui, sans-serif`;
    ctx.fillText(page.eyebrow.toUpperCase(), pad + m(0.004), m(0.034));
    for (const shot of this.shots) {
      shot.visible = !page.full;
    }
    if (page.full) {
      this.drawFullPage(ctx, m, pad);
      this.texture.needsUpdate = true;
      this.refreshOverlay();
      return;
    }
    const scoreText = `MATCH ${this.score}%`;
    ctx.font = `bold ${m(0.0115)}px system-ui, sans-serif`;
    ctx.fillStyle = this.won ? '#4ade80' : '#fafafa';
    ctx.fillText(scoreText, W - pad - m(0.004) - ctx.measureText(scoreText).width, m(0.034));
    // Shot labels sit just above the shots.
    ctx.font = `bold ${m(0.0085)}px system-ui, sans-serif`;
    ctx.fillStyle = '#f5d90a';
    ctx.fillText('TARGET', pad, m(SHOT_TOP - 0.003));
    ctx.fillStyle = '#ffffff';
    ctx.fillText('YOUR SHOT', pad + m(SHOT_W + GAP), m(SHOT_TOP - 0.003));

    // Match bar under the shots.
    const barTop = m(SHOT_TOP + SHOT_H + 0.007);
    const barW = W - 2 * pad;
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(pad, barTop, barW, m(0.005));
    ctx.fillStyle = this.won ? '#4ade80' : this.score >= 70 ? '#f5d90a' : '#f97316';
    ctx.fillRect(pad, barTop, (barW * this.score) / 100, m(0.005));

    // Text block: hint (or the lesson after a win), objective, story beat; button on the right.
    const textW = barW - (page.button ? m(BUTTON.w + 0.012) : 0);
    let y = barTop + m(0.017);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${m(0.0118)}px system-ui, sans-serif`;
    const headline = this.won ? 'CUT! That\'s the shot.' : this.hint;
    for (const line of wrap(ctx, headline, barW).slice(0, 1)) {
      ctx.fillText(line, pad, y);
      y += m(0.0155);
    }
    ctx.fillStyle = '#d4d4d8';
    ctx.font = `${m(0.0102)}px system-ui, sans-serif`;
    for (const line of wrap(ctx, page.body, textW).slice(0, 3)) {
      ctx.fillText(line, pad, y);
      y += m(0.0135);
    }
    if (page.footer) {
      ctx.fillStyle = '#9ad1a8';
      ctx.font = `italic ${m(0.0095)}px system-ui, sans-serif`;
      for (const line of wrap(ctx, page.footer, textW).slice(0, 2)) {
        if (y > H - m(0.006)) break;
        ctx.fillText(line, pad, y);
        y += m(0.0125);
      }
    }
    if (page.button) {
      this.drawButton(ctx, m, pad, page.button);
    }
    this.texture.needsUpdate = true;
    this.refreshOverlay();
  }

  private drawFullPage(ctx: CanvasRenderingContext2D, m: (n: number) => number, pad: number): void {
    const page = this.page;
    const textW = W - 2 * pad - m(0.01);
    let y = m(0.075);
    ctx.fillStyle = '#fafaf7';
    ctx.font = `bold ${m(0.02)}px system-ui, sans-serif`;
    for (const line of wrap(ctx, page.title ?? '', textW).slice(0, 2)) {
      ctx.fillText(line, pad + m(0.004), y);
      y += m(0.024);
    }
    y += m(0.002);
    ctx.fillStyle = '#dddfe3';
    ctx.font = `${m(0.0105)}px system-ui, sans-serif`;
    for (const line of wrap(ctx, page.body, textW).slice(0, 3)) {
      ctx.fillText(line, pad + m(0.004), y);
      y += m(0.0145);
    }
    if (page.steps?.length) {
      y += m(0.006);
      ctx.font = `${m(0.0098)}px system-ui, sans-serif`;
      page.steps.forEach((step, i) => {
        ctx.fillStyle = '#f5d90a';
        ctx.fillText(`${i + 1}`, pad + m(0.006), y);
        ctx.fillStyle = '#e4e4e7';
        ctx.fillText(step, pad + m(0.02), y);
        y += m(0.0138);
      });
    }
    if (page.footer) {
      ctx.fillStyle = '#9ad1a8';
      ctx.font = `italic ${m(0.0095)}px system-ui, sans-serif`;
      ctx.fillText(page.footer, pad + m(0.004), H - pad - m(0.012));
    }
    if (page.button) {
      this.drawButton(ctx, m, pad, page.button);
    }
  }

  private drawButton(ctx: CanvasRenderingContext2D, m: (n: number) => number, pad: number, label: string): void {
    const bw = m(BUTTON.w);
    const bh = m(BUTTON.h);
    const bx = W - pad - bw - m(0.006);
    const by = H - pad - m(0.006) - bh;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = '#f5d90a';
    ctx.fill();
    ctx.fillStyle = '#18181b';
    ctx.font = `bold ${m(0.0115)}px system-ui, sans-serif`;
    const text = `${label}  ▶`;
    ctx.fillText(text, bx + (bw - ctx.measureText(text).width) / 2, by + bh / 2 + m(0.004));
  }
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
