import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { wrap } from './text.js';

/**
 * A comic-style speech bubble that floats over someone on the set (the
 * director, for now) and says a line, then fades out. The lighting system
 * places it above the speaker and turns it to face the viewer.
 */

export const BUBBLE_WIDTH = 0.2;
const PX_W = 1000;
const PX_H = 380;
export const BUBBLE_HEIGHT = (BUBBLE_WIDTH * PX_H) / PX_W;

export class SpeechBubble {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private texture: CanvasTexture;
  private material: MeshBasicMaterial;
  private remaining = 0;
  private queue: { speaker: string; line: string; hold: boolean }[] = [];
  /** The last line said, for tests. */
  line = '';

  constructor() {
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(BUBBLE_WIDTH, BUBBLE_HEIGHT), this.material);
    this.mesh.name = 'speech-bubble';
    this.mesh.renderOrder = 990;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * Says a line; it stays up long enough to read (about 3 words a second, at
   * least 4 s), or until the next line when `hold` is set.
   */
  say(speaker: string, line: string, hold = false): void {
    this.queue = [];
    this.show(speaker, line, hold);
  }

  /** Says a line after the current one finishes. */
  then(speaker: string, line: string, hold = false): void {
    if (this.remaining <= 0) {
      this.show(speaker, line, hold);
    } else {
      this.queue.push({ speaker, line, hold });
    }
  }

  private show(speaker: string, line: string, hold: boolean): void {
    this.line = line;
    const words = line.split(' ').length;
    this.remaining = hold ? Infinity : Math.max(4, words / 3 + 1.5);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, PX_W, PX_H);
    ctx.font = 'bold 50px system-ui, sans-serif';
    const lines = wrap(ctx, line, PX_W - 110).slice(0, 4);
    const lineH = 60;
    const boxH = 92 + lines.length * lineH;
    const boxTop = PX_H - 50 - boxH;
    // Bubble with a tail pointing down at the speaker.
    ctx.fillStyle = '#fafaf7';
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 8;
    roundRect(ctx, 8, boxTop, PX_W - 16, boxH, 44);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(PX_W / 2 - 40, boxTop + boxH - 4);
    ctx.lineTo(PX_W / 2, PX_H - 6);
    ctx.lineTo(PX_W / 2 + 40, boxTop + boxH - 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(PX_W / 2 - 40, boxTop + boxH);
    ctx.lineTo(PX_W / 2, PX_H - 6);
    ctx.lineTo(PX_W / 2 + 40, boxTop + boxH);
    ctx.stroke();
    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(speaker.toUpperCase(), 50, boxTop + 52);
    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 50px system-ui, sans-serif';
    lines.forEach((text, i) => ctx.fillText(text, 50, boxTop + 110 + i * lineH));
    this.texture.needsUpdate = true;
    this.mesh.visible = true;
    this.material.opacity = 1;
  }

  hide(): void {
    this.queue = [];
    this.remaining = 0;
    this.mesh.visible = false;
  }

  update(delta: number): void {
    if (this.remaining <= 0) {
      return;
    }
    this.remaining -= delta;
    this.material.opacity = Math.min(1, this.remaining / 0.5);
    if (this.remaining <= 0) {
      this.mesh.visible = false;
      const next = this.queue.shift();
      if (next) {
        this.show(next.speaker, next.line, next.hold);
      }
    }
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
