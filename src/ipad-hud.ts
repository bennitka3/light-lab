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

/** One switch on the iPad's light row: a light from the kit, the house lights, or the lamp. */
export type LightButton = {
  label: string;
  on: boolean;
  /** Bi-color lights show their color temperature with a dial (◀ warmer, ▶ cooler). */
  kelvin?: number;
};

/** What a press on the iPad landed on. */
export type IPadControl =
  | { type: 'main' }
  | { type: 'second' }
  | { type: 'light'; index: number }
  | { type: 'warmer'; index: number }
  | { type: 'cooler'; index: number }
  | { type: 'size'; step: 1 | -1 }
  | { type: 'none' };

type Rect = { x: number; y: number; w: number; h: number; control: IPadControl };

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
export const IPAD_COMPACT_HEIGHT = 0.195;
const COMPACT_TOP = 0.27 - IPAD_COMPACT_HEIGHT;
const SHOT_TOP = COMPACT_TOP + 0.022;
/** The row of light switches under the shots. */
const ROW_TOP = SHOT_TOP + 0.103 + 0.011;
const ROW_H = 0.022;
const SMALL_BUTTON = { w: 0.1, h: 0.024 };
export const KELVIN_MIN = 3200;
export const KELVIN_MAX = 5600;
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
const SMALL_BUTTON_TOP = ROW_TOP + ROW_H + 0.004;
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
  /** The light switches along the row under the shots. */
  private lights: LightButton[] = [];
  /** Which switch to outline (the light under the pointer, or being moved). */
  private highlight = -1;
  /** Where each control was last drawn, in canvas pixels, for presses. */
  private rects: Rect[] = [];
  /** Show a "VR" button on the play strip (this browser can start a headset session, and isn't in one). */
  private vrButton = false;

  setVrButton(on: boolean): void {
    if (on === this.vrButton) return;
    this.vrButton = on;
    this.draw();
  }

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
    // Pointer hits land on an invisible plane the size of what is drawn (the
    // compact strip leaves the top of the body empty), and the iPad outranks
    // the set behind it, so a headset ray that crosses it always presses it.
    for (const layer of [body, targetPlane, livePlane]) {
      (layer as unknown as { pointerEvents: string }).pointerEvents = 'none';
    }
    this.hit.name = 'ipad-hit';
    (this.object as unknown as { pointerEventsOrder: number }).pointerEventsOrder = 10;
    this.object.add(body, targetPlane, livePlane, this.hit);
    for (const child of this.object.children) {
      child.frustumCulled = false;
    }
    this.fitHit();
    this.overlay = new Mesh(new PlaneGeometry(SHOT_W, SHOT_H), hud(this.overlayTexture(), true));
    this.overlay.position.copy(livePlane.position);
    this.overlay.renderOrder = 1002;
    this.overlay.frustumCulled = false;
    this.overlay.visible = false;
    (this.overlay as unknown as { pointerEvents: string }).pointerEvents = 'none';
    this.object.add(this.overlay);
  }

  private overlay: Mesh;
  /** What a pointer hits: the drawn part of the iPad only. */
  private hit = new Mesh(
    new PlaneGeometry(IPAD_WIDTH, 1),
    new MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, colorWrite: false }),
  );

  /** Sizes the hit plane to the full page or the compact strip at the bottom. */
  private fitHit(): void {
    const h = this.page.full ? IPAD_HEIGHT : IPAD_COMPACT_HEIGHT;
    this.hit.scale.y = h;
    this.hit.position.y = -IPAD_HEIGHT / 2 + h / 2;
  }
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
   * What a point on the iPad (its own meters, origin at the center) lands on:
   * a light switch, a dial arrow, a size button, or a page button. On a full
   * page anywhere else counts as the main button, so it is easy to hit.
   */
  controlAt(x: number, y: number): IPadControl {
    const px = (x + IPAD_WIDTH / 2) * PX;
    const py = (IPAD_HEIGHT / 2 - y) * PX;
    if (this.page.full) {
      if (this.page.button2) {
        const c = SECOND_BUTTON_CENTER;
        if (Math.abs(x - c.x) < BUTTON2.w / 2 && Math.abs(y - c.y) < BUTTON.h / 2) return { type: 'second' };
      }
      return this.page.button ? { type: 'main' } : { type: 'none' };
    }
    for (const rect of this.rects) {
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) return rect.control;
    }
    return { type: 'none' };
  }

  /** The same, from a texture coordinate (headset pointer hits report these). */
  controlAtUv(u: number, v: number): IPadControl {
    return this.controlAt((u - 0.5) * IPAD_WIDTH, (v - 0.5) * IPAD_HEIGHT);
  }

  /** The center of a control in the iPad's own meters, for tests that click it. */
  centerOf(match: (control: IPadControl) => boolean): { x: number; y: number } | null {
    const rect = this.rects.find((r) => match(r.control));
    if (!rect) return null;
    return { x: (rect.x + rect.w / 2) / PX - IPAD_WIDTH / 2, y: IPAD_HEIGHT / 2 - (rect.y + rect.h / 2) / PX };
  }

  /** Is this point on the visible part of the iPad (in play the top of the plane is empty)? */
  contains(y: number): boolean {
    return this.page.full || IPAD_HEIGHT / 2 - y >= COMPACT_TOP;
  }

  setLights(lights: LightButton[], highlight: number): void {
    const same =
      highlight === this.highlight &&
      lights.length === this.lights.length &&
      lights.every((l, i) => l.on === this.lights[i].on && l.kelvin === this.lights[i].kelvin && l.label === this.lights[i].label);
    if (same) return;
    this.lights = lights.map((l) => ({ ...l }));
    this.highlight = highlight;
    this.draw();
  }

  /** The button's center in the iPad's own meters (origin at its center), for tests that click it. */
  get buttonCenter(): { x: number; y: number } {
    return this.page.full ? FULL_BUTTON_CENTER : SMALL_BUTTON_CENTER;
  }

  /** The second button ("Play in VR") center, for tests that click it. */
  get secondButtonCenter(): { x: number; y: number } {
    return SECOND_BUTTON_CENTER;
  }

  get isFull(): boolean {
    return Boolean(this.page.full);
  }

  show(page: IPadPage): void {
    this.page = page;
    this.fitHit();
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
    this.drawTapeLabel(ctx, m, top);
    // Labels above each shot: the scene callout with the target, the match score with yours.
    ctx.font = `bold ${m(0.0085)}px system-ui, sans-serif`;
    ctx.fillStyle = '#f5d90a';
    ctx.fillText(`TARGET · ${page.eyebrow.toUpperCase()}`, pad, m(SHOT_TOP - 0.004));
    ctx.fillStyle = this.won ? '#4ade80' : '#ffffff';
    ctx.fillText(`YOUR SHOT · MATCH ${this.score}%`, pad + m(SHOT_W + GAP), m(SHOT_TOP - 0.004));
    this.rects = [];
    // Size buttons in the top-right corner: make the iPad smaller or bigger.
    const sz = m(0.014);
    ['−', '+'].forEach((glyph, i) => {
      const bx = W - pad - (2 - i) * sz - (1 - i) * m(0.004);
      const by = m(SHOT_TOP - 0.004) - sz + m(0.002);
      roundRect(ctx, bx, by, sz, sz, sz / 2);
      ctx.fillStyle = '#26262b';
      ctx.fill();
      ctx.fillStyle = '#d4d4d8';
      ctx.font = `bold ${m(0.011)}px system-ui, sans-serif`;
      ctx.fillText(glyph, bx + (sz - ctx.measureText(glyph).width) / 2, by + sz / 2 + m(0.0038));
      // A generous hit box: the visible circle plus a margin.
      this.rects.push({ x: bx - m(0.002), y: by - m(0.003), w: sz + m(0.004), h: sz + m(0.006), control: { type: 'size', step: i === 0 ? -1 : 1 } });
    });
    if (this.vrButton) {
      // "VR": jump into the headset from any point in the game, left of the size buttons.
      const vw = m(0.03);
      const vx = W - pad - 2 * sz - m(0.004) - m(0.006) - vw;
      const vy = m(SHOT_TOP - 0.004) - sz + m(0.002);
      roundRect(ctx, vx, vy, vw, sz, sz / 2);
      ctx.fillStyle = '#f5d90a';
      ctx.fill();
      ctx.fillStyle = '#18181b';
      ctx.font = `bold ${m(0.0085)}px system-ui, sans-serif`;
      ctx.fillText('VR', vx + (vw - ctx.measureText('VR').width) / 2, vy + sz / 2 + m(0.003));
      this.rects.push({ x: vx - m(0.002), y: vy - m(0.003), w: vw + m(0.004), h: sz + m(0.006), control: { type: 'second' } });
    }

    // Match bar under the shots.
    const barTop = m(SHOT_TOP + SHOT_H + 0.004);
    const barW = W - 2 * pad;
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(pad, barTop, barW, m(0.004));
    ctx.fillStyle = this.won ? '#4ade80' : this.score >= 70 ? '#f5d90a' : '#f97316';
    ctx.fillRect(pad, barTop, (barW * this.score) / 100, m(0.004));

    this.drawLightRow(ctx, m, pad);

    // The tip (or "Cut!"), with the button beside it when there is one.
    const textW = barW - (page.button ? m(SMALL_BUTTON.w + 0.01) : 0);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${m(0.0112)}px system-ui, sans-serif`;
    // A won take leaves the tip line empty: the director and Dee do the talking.
    const headline = page.body || (this.won ? '' : this.hint);
    // Long tips shrink to fit on the one line rather than getting cut off.
    let tipSize = 0.0112;
    while (ctx.measureText(headline).width > textW && tipSize > 0.0084) {
      tipSize -= 0.0004;
      ctx.font = `bold ${m(tipSize)}px system-ui, sans-serif`;
    }
    const lines = wrap(ctx, headline, textW);
    const line = lines.length > 1 ? `${lines[0]}…` : (lines[0] ?? '');
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
      this.rects.push({ x: bx, y: by, w: bw, h: bh, control: { type: 'main' } });
    }
    this.texture.needsUpdate = true;
    this.refreshOverlay();
  }

  /**
   * A strip of white gaffer tape on the iPad's top edge, labeled in marker the
   * way crews label gear, so a new player knows this is "the iPad" every tip
   * and text talks about (Greg's playtest: "the iPad is not very clear... is
   * that this?"). It hangs over the top edge, outside the screen.
   */
  private drawTapeLabel(ctx: CanvasRenderingContext2D, m: (n: number) => number, top: number): void {
    const label = 'VIDEO VILLAGE iPAD';
    ctx.font = `bold ${m(0.0098)}px "Marker Felt", "Comic Sans MS", system-ui, sans-serif`;
    const tw = ctx.measureText(label).width + m(0.014);
    const th = m(0.0135);
    const tx = (W - tw) / 2;
    const ty = top - m(0.0085);
    ctx.save();
    ctx.translate(tx + tw / 2, ty + th / 2);
    ctx.rotate(-0.012);
    ctx.fillStyle = '#ecebe4';
    ctx.fillRect(-tw / 2, -th / 2, tw, th);
    // Torn ends: a few notches cut into each short side.
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) {
      const y = -th / 2 + (th * (i + 0.5)) / 4;
      ctx.fillRect(-tw / 2, y - m(0.0006), m(0.0012), m(0.0012));
      ctx.fillRect(tw / 2 - m(0.0012), y + m(0.0004), m(0.0012), m(0.0012));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#1d1d22';
    ctx.fillText(label, -tw / 2 + m(0.007), m(0.0035));
    ctx.restore();
  }

  /**
   * One switch per light along the row under the shots, each with a status
   * LED and its name. A bi-color light's switch is wider and carries its
   * color temperature dial: ◀ warmer, ▶ cooler.
   */
  private drawLightRow(ctx: CanvasRenderingContext2D, m: (n: number) => number, pad: number): void {
    if (this.lights.length === 0) return;
    const gap = m(0.004);
    const units = this.lights.reduce((sum, l) => sum + (l.kelvin !== undefined ? 2 : 1), 0);
    const unit = (W - 2 * pad - gap * (this.lights.length - 1)) / units;
    const top = m(ROW_TOP);
    const h = m(ROW_H);
    let x = pad;
    this.lights.forEach((light, index) => {
      const dial = light.kelvin !== undefined;
      const w = unit * (dial ? 2 : 1) + (dial ? gap : 0);
      roundRect(ctx, x, top, w, h, m(0.005));
      ctx.fillStyle = light.on ? '#2d2a14' : '#1c1c20';
      ctx.fill();
      ctx.lineWidth = m(index === this.highlight ? 0.0016 : 0.0008);
      ctx.strokeStyle = index === this.highlight ? '#ffffff' : light.on ? '#f5d90a' : '#3f3f46';
      ctx.stroke();
      // Status LED: green when on.
      ctx.beginPath();
      ctx.arc(x + m(0.006), top + h / 2, m(0.0022), 0, Math.PI * 2);
      ctx.fillStyle = light.on ? '#4ade80' : '#52525b';
      ctx.fill();
      const nameW = dial ? unit : w;
      ctx.fillStyle = light.on ? '#fafafa' : '#a1a1aa';
      let size = 0.0082;
      ctx.font = `bold ${m(size)}px system-ui, sans-serif`;
      while (ctx.measureText(light.label).width > nameW - m(0.013) && size > 0.0055) {
        size -= 0.0004;
        ctx.font = `bold ${m(size)}px system-ui, sans-serif`;
      }
      ctx.fillText(light.label, x + m(0.0105), top + h / 2 + m(size * 0.36));
      this.rects.push({ x, y: top, w: nameW, h, control: { type: 'light', index } });
      if (dial) {
        // The dial: a warm-to-daylight gradient with a marker at the current setting.
        const dx = x + unit + m(0.002);
        const dw = w - unit - m(0.004);
        const arrow = m(0.011);
        const trackX = dx + arrow;
        const trackW = dw - 2 * arrow;
        const t = Math.min(1, Math.max(0, (light.kelvin! - KELVIN_MIN) / (KELVIN_MAX - KELVIN_MIN)));
        const grad = ctx.createLinearGradient(trackX, 0, trackX + trackW, 0);
        grad.addColorStop(0, '#ff9a45');
        grad.addColorStop(0.5, '#ffe2b8');
        grad.addColorStop(1, '#cfe3ff');
        ctx.fillStyle = grad;
        ctx.fillRect(trackX, top + h * 0.62, trackW, h * 0.14);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(trackX + trackW * t - m(0.0008), top + h * 0.54, m(0.0016), h * 0.3);
        ctx.fillStyle = '#fafafa';
        ctx.font = `bold ${m(0.0072)}px system-ui, sans-serif`;
        const k = `${light.kelvin}K`;
        ctx.fillText(k, trackX + (trackW - ctx.measureText(k).width) / 2, top + h * 0.46);
        ctx.fillStyle = '#f5d90a';
        ctx.font = `bold ${m(0.009)}px system-ui, sans-serif`;
        ctx.fillText('◀', dx + m(0.001), top + h / 2 + m(0.003));
        ctx.fillText('▶', dx + dw - arrow + m(0.002), top + h / 2 + m(0.003));
        this.rects.push({ x: dx, y: top, w: dw / 2, h, control: { type: 'warmer', index } });
        this.rects.push({ x: dx + dw / 2, y: top, w: dw / 2, h, control: { type: 'cooler', index } });
      }
      x += w + gap;
    });
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
