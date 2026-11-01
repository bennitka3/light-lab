import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import type { Text } from './levels.js';
import { wrap } from './text.js';

/**
 * The player's phone, held low beside the iPad. It is your chat with Dee, a
 * friend watching the monitors in video village who knows you are bluffing
 * and texts you tips. New messages show a "typing" bubble first, then pop in
 * with a little bounce. Anyone else (Mom) arrives as a notification banner
 * with a preview, the way a real phone shows a text from another chat. The
 * phone pops up when a text lands and tucks itself down again a few seconds
 * later, unless the player taps it to keep it up (tap again to tuck it).
 */

export const PHONE_WIDTH = 0.1;
export const PHONE_HEIGHT = 0.18;
/** How long the phone stays up after a text lands, and how long a banner shows. */
const AWAKE_SECONDS = 7;
const BANNER_SECONDS = 5;
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
  private banner?: Text;
  private bannerTime = 0;
  private sinceLast = Infinity;
  /** The player tapped the phone to keep it up. */
  pinned = false;
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
    this.banner = undefined;
    this.mesh.visible = false;
  }

  togglePin(): void {
    this.pinned = !this.pinned;
    this.draw(this.typing > 0);
  }

  get awake(): boolean {
    return this.pinned || this.typing > 0 || this.queue.length > 0 || this.banner !== undefined || this.sinceLast < AWAKE_SECONDS;
  }

  update(delta: number): void {
    this.pop = Math.max(0, this.pop - delta * 2.5);
    this.sinceLast += delta;
    if (this.banner) {
      this.bannerTime += delta;
      if (this.bannerTime > BANNER_SECONDS) {
        this.banner = undefined;
        this.draw(false);
      }
    }
    if (this.queue.length === 0) {
      return;
    }
    if (this.queue[0].from !== 'dee') {
      // Someone else: a notification banner over Dee's chat, no typing bubble.
      this.banner = this.queue.shift()!;
      this.log.push(this.banner);
      this.bannerTime = 0;
      this.sinceLast = 0;
      this.pop = 1;
      this.mesh.visible = true;
      this.draw(false);
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
      this.sinceLast = 0;
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
    // Header: this is Dee's chat.
    const contact = CONTACTS.dee;
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
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('Dee', 106, 106);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(this.pinned ? 'video village · tap to tuck away' : 'video village · tap to keep open', 106, 136);

    // Bubbles, newest at the bottom; older ones scroll off the top.
    const maxBubble = PX_W - 70;
    const lineH = 48;
    const bottom = PX_H - 50;
    const top = 172;
    ctx.font = '40px system-ui, sans-serif';
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
      const lines = wrap(ctx, message.text, maxBubble - 44);
      const width = Math.min(maxBubble, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 44);
      const height = lines.length * lineH + 30;
      if (y - height < top) {
        break;
      }
      roundRect(ctx, 34, y - height, width, height, 26);
      ctx.fillStyle = '#2c2c2e';
      ctx.fill();
      ctx.fillStyle = '#f4f4f5';
      lines.forEach((line, j) => ctx.fillText(line, 56, y - height + 52 + j * lineH));
      y -= height + 14;
    }
    if (this.banner) {
      // A notification banner from another chat, dropped over the top of the screen.
      const from = CONTACTS[this.banner.from];
      const bx = 26;
      const by = 64;
      const bw = PX_W - 52;
      ctx.font = '34px system-ui, sans-serif';
      const lines = wrap(ctx, this.banner.text, bw - 110).slice(0, 3);
      const bh = 80 + lines.length * 42;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 24;
      roundRect(ctx, bx, by, bw, bh, 30);
      ctx.fillStyle = 'rgba(58, 58, 64, 0.97)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(bx + 50, by + 50, 26, 0, Math.PI * 2);
      ctx.fillStyle = from.color;
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(from.name[0], bx + 50, by + 60);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fafafa';
      ctx.font = 'bold 27px system-ui, sans-serif';
      ctx.fillText(from.name, bx + 92, by + 44);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('now', bx + bw - 64, by + 44);
      ctx.fillStyle = '#e4e4e7';
      ctx.font = '34px system-ui, sans-serif';
      lines.forEach((line, j) => ctx.fillText(line, bx + 92, by + 88 + j * 42));
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
