import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

/**
 * The call sheet beside the set: a canvas-drawn card that carries the story
 * between scenes (title, director's line, objective, lesson) and one button.
 * The whole card is the button's hit area, so it is easy to press with a
 * mouse, a controller ray or a hand ray.
 */

export type CardContent = {
  eyebrow: string;
  title: string;
  body: string;
  footer?: string;
  /** Without a button the card is just information. */
  button?: string;
};

export const CARD_WIDTH = 0.27;
export const CARD_HEIGHT = 0.18;
const PX_W = 1024;
const PX_H = Math.round((PX_W * CARD_HEIGHT) / CARD_WIDTH);

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
      new MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false }),
    );
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
    const pad = 44;
    ctx.clearRect(0, 0, PX_W, PX_H);
    // Card body: a dark clipboard with a yellow tape strip on top.
    roundRect(ctx, 0, 0, PX_W, PX_H, 36);
    ctx.fillStyle = 'rgba(24, 24, 28, 0.94)';
    ctx.fill();
    ctx.fillStyle = '#f5d90a';
    ctx.fillRect(PX_W / 2 - 90, 0, 180, 14);

    let y = pad + 26;
    ctx.fillStyle = '#f5d90a';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(content.eyebrow.toUpperCase(), pad, y);
    y += 26;

    ctx.fillStyle = '#fafaf7';
    ctx.font = 'bold 50px system-ui, sans-serif';
    for (const line of wrap(ctx, content.title, PX_W - pad * 2)) {
      y += 58;
      ctx.fillText(line, pad, y);
    }
    y += 18;

    ctx.fillStyle = '#dddfe3';
    ctx.font = '36px system-ui, sans-serif';
    for (const line of wrap(ctx, content.body, PX_W - pad * 2)) {
      y += 46;
      ctx.fillText(line, pad, y);
    }

    if (content.footer) {
      y += 22;
      ctx.fillStyle = '#9ad1a8';
      ctx.font = 'italic 32px system-ui, sans-serif';
      for (const line of wrap(ctx, content.footer, PX_W - pad * 2)) {
        y += 42;
        ctx.fillText(line, pad, y);
      }
    }

    if (content.button) {
      const bw = 420;
      const bh = 86;
      const bx = pad;
      const by = PX_H - pad - bh;
      roundRect(ctx, bx, by, bw, bh, 43);
      ctx.fillStyle = '#f5d90a';
      ctx.fill();
      ctx.fillStyle = '#18181b';
      ctx.font = 'bold 40px system-ui, sans-serif';
      const label = `${content.button}  ▶`;
      const width = ctx.measureText(label).width;
      ctx.fillText(label, bx + (bw - width) / 2, by + 56);
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
