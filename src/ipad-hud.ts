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
  /** A second button on a full page, left of the main one (e.g. "Play in VR"). */
  button2?: string;
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
// In play the iPad is a compact strip: just the two shots and the tip, along the
// bottom of the plane (the part above is left transparent).
export const IPAD_COMPACT_HEIGHT = 0.165;
const COMPACT_TOP = 0.27 - IPAD_COMPACT_HEIGHT;
const SHOT_TOP = COMPACT_TOP + 0.022;
const SMALL_BUTTON = { w: 0.1, h: 0.024 };
const BUTTON = { w: 0.105, h: 0.032 };
/** The button's center in the iPad's own meters (origin at its center), for tests that click it. */
const FULL_BUTTON_CENTER = {
  x: IPAD_WIDTH / 2 - BEZEL - BUTTON.w / 2 - 0.006,
  y: IPAD_HEIGHT / 2 - (IPAD_HEIGHT - BEZEL - 0.006 - BUTTON.h / 2),
};
const BUTTON2 = { w: 0.13 };
const SECOND_BUTTON_CENTER = {
  x: FULL_BUTTON_CENTER.x - BUTTON.w / 2 - 0.01 - BUTTON2.w / 2,
  y: FULL_BUTTON_CENTER.y,
};
const SMALL_BUTTON_TOP = SHOT_TOP + SHOT_H + 0.009 + 0.001;
const SMALL_BUTTON_CENTER = {
  x: IPAD_WIDTH / 2 - BEZEL - SMALL_BUTTON.w / 2,
  y: IPAD_HEIGHT / 2 - (SMALL_BUTTON_TOP + SMALL_BUTTON.h / 2),
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
  /** What the pointed-at light is, shown on the tip line instead of the hint. */
  hoverText?: string;
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

  /**
   * Which button a point on the iPad (its own meters, origin at the center)
   * lands on. Anywhere else counts as the main button, so it is easy to hit.
   */
  buttonAt(x: number, y: number): 'main' | 'second' {
    if (!this.page.full || !this.page.button2) return 'main';
    const c = SECOND_BUTTON_CENTER;
    return Math.abs(x - c.x) < BUTTON2.w / 2 && Math.abs(y - c.y) < BUTTON.h / 2 ? 'second' : 'main';
  }

  /** The button's center in the iPad's own meters (origin at its center), for tests that click it. */
  get buttonCenter(): { x: number; y: number } {
    return this.page.full ? FULL_BUTTON_CENTER : SMALL_BUTTON_CENTER;
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

  setHover(text: string | undefined): void {
    this.hoverText = text;
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
    for (const shot of this.shots) {
      shot.visible = !page.full;
    }
    if (page.full) {
      // The iPad: a dark aluminium body and a black screen, with the how-to-play (or credits) page.
      roundRect(ctx, 0, 0, W, H, m(0.018));
      ctx.fillStyle = '#2a2b2f';
      ctx.fill();
      roundRect(ctx, m(0.004), m(0.004), W - m(0.008), H - m(0.008), m(0.015));
      ctx.fillStyle = '#0c0c0e';
      ctx.fill();
      ctx.fillStyle = '#f5d90a';
      ctx.font = `bold ${m(0.0115)}px system-ui, sans-serif`;
      ctx.fillText(page.eyebrow.toUpperCase(), pad + m(0.004), m(0.034));
      this.drawFullPage(ctx, m, pad);
      this.texture.needsUpdate = true;
      this.refreshOverlay();
      return;
    }
    // Play: a compact strip along the bottom, just the two shots and the tip.
    const top = m(COMPACT_TOP);
    roundRect(ctx, 0, top, W, H - top, m(0.014));
    ctx.fillStyle = '#2a2b2f';
    ctx.fill();
    roundRect(ctx, m(0.003), top + m(0.003), W - m(0.006), H - top - m(0.006), m(0.011));
    ctx.fillStyle = '#0c0c0e';
    ctx.fill();
    // Labels above each shot: the scene callout with the target, the match score with yours.
    ctx.font = `bold ${m(0.0085)}px system-ui, sans-serif`;
    ctx.fillStyle = '#f5d90a';
    ctx.fillText(`TARGET · ${page.eyebrow.toUpperCase()}`, pad, m(SHOT_TOP - 0.004));
    ctx.fillStyle = this.won ? '#4ade80' : '#ffffff';
    ctx.fillText(`YOUR SHOT · MATCH ${this.score}%`, pad + m(SHOT_W + GAP), m(SHOT_TOP - 0.004));

    // Match bar under the shots.
    const barTop = m(SHOT_TOP + SHOT_H + 0.004);
    const barW = W - 2 * pad;
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(pad, barTop, barW, m(0.004));
    ctx.fillStyle = this.won ? '#4ade80' : this.score >= 70 ? '#f5d90a' : '#f97316';
    ctx.fillRect(pad, barTop, (barW * this.score) / 100, m(0.004));

    // The tip (or "Cut!"), with the button beside it when there is one.
    const textW = barW - (page.button ? m(SMALL_BUTTON.w + 0.01) : 0);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${m(0.0112)}px system-ui, sans-serif`;
    const headline = page.body || (this.won ? "CUT! That's the shot." : (this.hoverText ?? this.hint));
    ctx.fillStyle = this.hoverText && !page.body && !this.won ? '#f5d90a' : '#ffffff';
    const line = wrap(ctx, headline, textW)[0] ?? '';
    ctx.fillText(line, pad, m(SMALL_BUTTON_TOP + SMALL_BUTTON.h / 2 + 0.004));
    if (page.button) {
      const bw = m(SMALL_BUTTON.w);
      const bh = m(SMALL_BUTTON.h);
      const bx = W - pad - bw;
      const by = m(SMALL_BUTTON_TOP);
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = '#f5d90a';
      ctx.fill();
      ctx.fillStyle = '#18181b';
      ctx.font = `bold ${m(0.0102)}px system-ui, sans-serif`;
      const text = `${page.button}  ▶`;
      ctx.fillText(text, bx + (bw - ctx.measureText(text).width) / 2, by + bh / 2 + m(0.0035));
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
      // Full width, just above the button row, so it never collides with the buttons.
      const footerBottom = H - pad - m(0.006) - m(BUTTON.h) - m(0.009);
      wrap(ctx, page.footer, W - 2 * pad)
        .slice(0, 2)
        .reverse()
        .forEach((line, i) => ctx.fillText(line, pad + m(0.004), footerBottom - i * m(0.012)));
    }
    if (page.button) {
      this.drawButton(ctx, m, pad, page.button);
    }
    if (page.button2) {
      const bw = m(BUTTON2.w);
      const bh = m(BUTTON.h);
      const bx = W / 2 + m(SECOND_BUTTON_CENTER.x) - bw / 2;
      const by = H - pad - m(0.006) - bh;
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = '#26262b';
      ctx.fill();
      ctx.strokeStyle = '#f5d90a';
      ctx.lineWidth = m(0.0012);
      ctx.stroke();
      ctx.fillStyle = '#f5d90a';
      ctx.font = `bold ${m(0.0105)}px system-ui, sans-serif`;
      const text = page.button2;
      ctx.fillText(text, bx + (bw - ctx.measureText(text).width) / 2, by + bh / 2 + m(0.0037));
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
