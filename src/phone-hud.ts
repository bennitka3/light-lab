import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import type { Text } from './levels.js';
import { wrap } from './story-card.js';

/**
 * The player's phone, held low in the corner of the view. Dee, a friend
 * watching the monitors in video village, knows you are bluffing and texts
 * you tips; Mom texts too. New messages show a "typing" bubble first, then pop
 * in with a little bounce, like a real phone.
 */

export const PHONE_WIDTH = 0.1;
export const PHONE_HEIGHT = 0.18;
const PX_W = 500;
const PX_H = Math.round((PX_W * PHONE_HEIGHT) / PHONE_WIDTH);
const TYPING_SECONDS = 1.1;

const CONTACTS: Record<Text['from'], { name: string; color: string }> = {
  dee: { name: 'Dee (video village)', color: '#a78bfa' },
  mom: { name: 'Mom', color: '#f472b6' },
};

export class PhoneHud {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private texture: CanvasTexture;
  private messages: Text[] = [];
  private queue: Text[] = [];
  private typing = 0;
  /** 1 right after a message lands, easing to 0; the system uses it to bounce the phone. */
  pop = 0;
  /** Every message shown so far, for tests. */
  readonly log: Text[] = [];

  constructor() {
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(
      new PlaneGeometry(PHONE_WIDTH, PHONE_HEIGHT),
      new MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }),
    );
    this.mesh.renderOrder = 1001;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'phone-hud';
    this.mesh.visible = false;
  }

  /** Queues a text; it arrives after a short "typing" moment. */
  text(from: Text['from'], text: string): void {
    this.queue.push({ from, text });
  }

  clear(): void {
    this.messages = [];
    this.queue = [];
    this.typing = 0;
    this.mesh.visible = false;
  }

  update(delta: number): void {
    this.pop = Math.max(0, this.pop - delta * 2.5);
    if (this.queue.length === 0) {
      return;
    }
    const wasTyping = this.typing > 0;
    this.typing += delta;
    if (!wasTyping) {
      this.mesh.visible = true;
      this.draw(true);
    }
    if (this.typing >= TYPING_SECONDS) {
      const next = this.queue.shift()!;
      this.messages.push(next);
      this.log.push(next);
      if (this.messages.length > 12) {
        this.messages.shift();
      }
      this.typing = 0;
      this.pop = 1;
      this.draw(false);
    }
  }

  private draw(typing: boolean): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, PX_W, PX_H);
    // Phone body and screen.
    roundRect(ctx, 0, 0, PX_W, PX_H, 70);
    ctx.fillStyle = '#0a0a0b';
    ctx.fill();
    roundRect(ctx, 14, 14, PX_W - 28, PX_H - 28, 58);
    ctx.fillStyle = '#121214';
    ctx.fill();
    // Header: the contact who texted last.
    const last = typing ? this.queue[0] : this.messages[this.messages.length - 1];
    const contact = CONTACTS[last?.from ?? 'dee'];
    ctx.fillStyle = '#1c1c1f';
    ctx.fillRect(14, 60, PX_W - 28, 96);
    ctx.fillStyle = '#000';
    roundRect(ctx, PX_W / 2 - 60, 26, 120, 26, 13);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 108, 28, 0, Math.PI * 2);
    ctx.fillStyle = contact.color;
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(contact.name[0], 64, 119);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(contact.name, 106, 118);

    // Bubbles, newest at the bottom; older ones scroll off the top.
    const maxBubble = PX_W - 120;
    const lineH = 36;
    const bottom = PX_H - 50;
    const top = 172;
    ctx.font = '29px system-ui, sans-serif';
    let y = bottom;
    if (typing) {
      // The "..." typing bubble.
      roundRect(ctx, 34, y - 58, 110, 58, 29);
      ctx.fillStyle = '#2c2c2e';
      ctx.fill();
      ctx.fillStyle = '#9a9aa0';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(62 + i * 27, y - 29, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      y -= 58 + 18;
    }
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      const lines = wrap(ctx, message.text, maxBubble - 40);
      const width = Math.min(maxBubble, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 40);
      const height = lines.length * lineH + 26;
      // A name above the bubble when the sender changes.
      const showName = i === 0 || this.messages[i - 1].from !== message.from;
      const needed = height + (showName ? 32 : 0);
      if (y - needed < top) {
        break;
      }
      roundRect(ctx, 34, y - height, width, height, 26);
      ctx.fillStyle = '#2c2c2e';
      ctx.fill();
      ctx.fillStyle = '#f4f4f5';
      lines.forEach((line, j) => ctx.fillText(line, 54, y - height + 40 + j * lineH));
      y -= height;
      if (showName) {
        ctx.fillStyle = CONTACTS[message.from].color;
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.fillText(CONTACTS[message.from].name, 40, y - 8);
        ctx.font = '29px system-ui, sans-serif';
        y -= 32;
      }
      y -= 14;
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
