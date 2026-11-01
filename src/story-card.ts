import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

/**
 * The lower third: a wide caption bar that rides along at the bottom of the
 * player's view and carries the story (who is talking, what they say, what
 * to do) and, between scenes, one button. The lighting system keeps it in
 * front of the camera; it draws on top of the set so it is never hidden.
 * When it has a button, the whole bar is the button's hit area, so it is easy
 * to press with a mouse, a controller ray or a hand ray.
 */

export type CardContent = {
  eyebrow: string;
  title: string;
  body: string;
  footer?: string;
  /** Without a button the card is just information. */
  button?: string;
};

export const CARD_WIDTH = 0.5;
export const CARD_HEIGHT = 0.13;
const PX_W = 1600;
const PX_H = Math.round((PX_W * CARD_HEIGHT) / CARD_WIDTH);
const BUTTON_W = 360;
const BUTTON_H = 100;
/** The button's center in the card's own meters, for tests that click it. */
export const CARD_BUTTON_CENTER = {
  x: CARD_WIDTH / 2 - ((BUTTON_W / 2 + 40) / PX_W) * CARD_WIDTH,
  y: 0,
};

export class StoryCard {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private texture: CanvasTexture;
  content: CardContent = { eyebrow: '', title: '', body: '' };

  constructor() {
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(
      new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT),
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'story-card';
  }

  get hasButton(): boolean {
    return Boolean(this.content.button);
  }

  show(content: CardContent): void {
    this.content = content;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const pad = 40;
    ctx.clearRect(0, 0, PX_W, PX_H);
    roundRect(ctx, 0, 0, PX_W, PX_H, 34);
    ctx.fillStyle = 'rgba(14, 14, 17, 0.86)';
    ctx.fill();
    // A yellow accent down the left edge, like a broadcast lower third.
    ctx.fillStyle = '#f5d90a';
    ctx.fillRect(0, 34, 12, PX_H - 68);

    const textLeft = pad + 16;
    const textWidth = PX_W - textLeft - pad - (content.button ? BUTTON_W + 40 : 0);
    let y = pad + 22;
    ctx.fillStyle = '#f5d90a';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(content.eyebrow.toUpperCase(), textLeft, y);

    ctx.fillStyle = '#fafaf7';
    ctx.font = 'bold 44px system-ui, sans-serif';
    for (const line of wrap(ctx, content.title, textWidth).slice(0, 2)) {
      y += 52;
      ctx.fillText(line, textLeft, y);
    }
    y += 8;

    ctx.fillStyle = '#dddfe3';
    ctx.font = '32px system-ui, sans-serif';
    for (const line of wrap(ctx, content.body, textWidth).slice(0, 2)) {
      y += 40;
      ctx.fillText(line, textLeft, y);
    }

    if (content.footer) {
      ctx.fillStyle = '#9ad1a8';
      ctx.font = 'italic 28px system-ui, sans-serif';
      for (const line of wrap(ctx, content.footer, textWidth).slice(0, 2)) {
        if (y + 36 > PX_H - 18) break;
        y += 36;
        ctx.fillText(line, textLeft, y);
      }
    }

    if (content.button) {
      const bx = PX_W - pad - BUTTON_W;
      const by = (PX_H - BUTTON_H) / 2;
      roundRect(ctx, bx, by, BUTTON_W, BUTTON_H, BUTTON_H / 2);
      ctx.fillStyle = '#f5d90a';
      ctx.fill();
      ctx.fillStyle = '#18181b';
      ctx.font = 'bold 40px system-ui, sans-serif';
      const label = `${content.button}  ▶`;
      const width = ctx.measureText(label).width;
      ctx.fillText(label, bx + (BUTTON_W - width) / 2, by + 64);
    }
    this.texture.needsUpdate = true;
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

/** Splits text into lines that fit the given width in the current font. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}
