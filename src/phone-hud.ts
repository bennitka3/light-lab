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
/**
 * How long the phone stays up after the last text lands, and how long a banner shows.
 * ben, round 11: "the phone disappears" before he'd read Dee. It now stays up at
 * least 10 seconds, plus time to read everything that arrived in this burst.
 */
const AWAKE_SECONDS = 10;
const AWAKE_SECONDS_PER_WORD = 0.35;
const AWAKE_MAX = 30;
const BANNER_SECONDS = 5;
const PX_W = 500;
const PX_H = Math.round((PX_W * PHONE_HEIGHT) / PHONE_WIDTH);
const TYPING_SECONDS = 1.1;
/**
 * After a text lands, the next one waits until there's been time to read it
 * (ben, round 9: at the start of a scene Dee's texts pushed each other off the
 * screen too fast). About a quarter second a word, between 1.2 and 5 seconds.
 */
const READ_SECONDS_PER_WORD = 0.25;
const READ_MIN = 1.2;
const READ_MAX = 5;
/** Where the scroll buttons sit on the phone canvas (top of each pill, pixels). */
const EARLIER_Y = 168;
const NEWEST_Y = PX_H - 92;
/**
 * Chat text size (canvas pixels). ben, round 11: at 40px only one or two texts fit, so
 * a scene's notes pushed each other off. At 30px a scene's two or three notes fit together.
 */
const FONT_PX = 30;
const LINE_H = 37;
const BUBBLE_PAD = 26;
const BUBBLE_GAP = 12;
const CHAT_TOP = EARLIER_Y + 56;
const CHAT_BOTTOM = PX_H - 50;
/** How far one press of "earlier" scrolls (canvas pixels). */
const EARLIER_STEP = 260;

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
  /** Seconds left before the next queued text may start arriving. */
  private readFor = 0;
  /** Seconds the phone keeps quiet before a new text starts (the director is talking). */
  quietFor = 0;
  /** How far (canvas pixels) the chat is still sliding up after a text landed; eases to 0. */
  private slide = 0;
  /** The player tapped the phone to keep it up. */
  pinned = false;
  /**
   * How far the chat is scrolled back, in canvas pixels (0 = showing the latest).
   * Scrolling is by pixel and eased, so a mouse wheel that jumps a page at a time
   * still glides (ben, round 11: "it just pages down or up").
   */
  private scrollTarget = 0;
  private scrollPx = 0;
  /** How far back the chat can scroll (content taller than the screen), from the last draw. */
  private maxScroll = 0;
  /** Words that arrived since the phone last went quiet: they decide how long it stays up. */
  private burstWords = 0;
  /** Older messages are cut off above (so the "earlier" button shows). */
  private hiddenAbove = false;
  /** 1 right after a message lands, easing to 0; the system uses it to bounce the phone. */
  pop = 0;
  /** Called when a text or banner lands (the system plays a chime and buzzes the controllers). */
  onArrive?: () => void;
  /** Every message shown so far, for tests. */
  readonly log: Text[] = [];
  /** The texts fully on screen at the last draw, for tests. */
  visibleTexts: string[] = [];

  constructor() {
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(
      new PlaneGeometry(PHONE_WIDTH, PHONE_HEIGHT),
      new MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }),
    );
    this.mesh.renderOrder = 1003;
    // Over the iPad when they overlap, and a ray that crosses it presses it, not the set behind.
    (this.mesh as unknown as { pointerEventsOrder: number }).pointerEventsOrder = 10;
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
    this.scrollTarget = 0;
    this.scrollPx = 0;
    this.burstWords = 0;
    this.queue = [];
    this.typing = 0;
    this.banner = undefined;
    this.mesh.visible = false;
  }

  togglePin(): void {
    this.pinned = !this.pinned;
    this.draw(this.typing > 0);
  }

  /** Scrolls the chat by a step: +1 is about two texts older, -1 newer. */
  scroll(step: number): void {
    this.scrollBy(step * EARLIER_STEP);
  }

  /** Scrolls the chat by canvas pixels (positive = back to older texts); it glides there. */
  scrollBy(px: number): void {
    const next = Math.max(0, Math.min(this.maxScroll, this.scrollTarget + px));
    if (Math.abs(next - this.scrollTarget) < 0.5) return;
    this.scrollTarget = next;
    // Reading back through the chat keeps the phone up.
    this.sinceLast = 0;
  }

  /** Drops Dee's texts that haven't arrived yet (a won scene doesn't need tips any more). */
  dropPending(): void {
    this.queue = this.queue.filter((t) => t.from !== 'dee');
    this.typing = 0;
  }

  /** Brings the phone up for a few seconds (e.g. the player reached for its thumbstick). */
  wake(): void {
    if (this.awake) return;
    this.sinceLast = 0;
    this.mesh.visible = true;
    this.draw(this.typing > 0);
  }

  /**
   * A tap on the phone at a point in its own meters (origin at the center):
   * the "earlier" and "newest" buttons scroll the chat, anywhere else keeps
   * the phone up or tucks it away.
   */
  pressAt(x: number, y: number): void {
    const py = (PHONE_HEIGHT / 2 - y) * (PX_H / PHONE_HEIGHT);
    if (!this.awake) {
      // Tucked away: any tap brings it up and keeps it there.
      this.togglePin();
    } else if (this.hiddenAbove && py > EARLIER_Y - 30 && py < EARLIER_Y + 50) {
      this.scroll(1);
    } else if (this.scrollTarget > 0 && py > NEWEST_Y - 30 && py < NEWEST_Y + 50) {
      this.scrollBy(-this.scrollTarget);
    } else {
      this.togglePin();
    }
    void x;
  }

  get scrolledBack(): number {
    return Math.round(this.scrollTarget);
  }

  /** Seconds the phone stays up after the last text: longer when more was said. */
  private get awakeSeconds(): number {
    return Math.min(AWAKE_MAX, Math.max(AWAKE_SECONDS, this.burstWords * AWAKE_SECONDS_PER_WORD));
  }

  get awake(): boolean {
    return this.pinned || this.typing > 0 || this.queue.length > 0 || this.banner !== undefined || this.sinceLast < this.awakeSeconds;
  }

  update(delta: number): void {
    this.pop = Math.max(0, this.pop - delta * 2.5);
    this.sinceLast += delta;
    this.readFor = Math.max(0, this.readFor - delta);
    this.quietFor = Math.max(0, this.quietFor - delta);
    if (!this.awake) this.burstWords = 0;
    if (Math.abs(this.scrollTarget - this.scrollPx) > 0.5) {
      this.scrollPx += (this.scrollTarget - this.scrollPx) * (1 - Math.exp(-delta * 14));
      if (Math.abs(this.scrollTarget - this.scrollPx) <= 0.5) this.scrollPx = this.scrollTarget;
      this.draw(this.typing > 0);
    }
    if (this.slide > 0) {
      // The chat glides up instead of jumping when a text lands.
      this.slide = this.slide < 0.5 ? 0 : this.slide * Math.exp(-delta * 9);
      this.draw(this.typing > 0);
    }
    if (this.banner) {
      this.bannerTime += delta;
      if (this.bannerTime > BANNER_SECONDS) {
        this.banner = undefined;
        this.draw(false);
      }
    }
    if (this.queue.length === 0 || ((this.readFor > 0 || this.quietFor > 0) && this.typing === 0)) {
      return;
    }
    if (this.queue[0].from !== 'dee') {
      // Someone else: a notification banner over Dee's chat, no typing bubble.
      this.banner = this.queue.shift()!;
      this.log.push(this.banner);
      this.bannerTime = 0;
      this.sinceLast = 0;
      this.pop = 1;
      this.onArrive?.();
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
      if (this.messages.length > 40) {
        this.messages.shift();
      }
      this.scrollTarget = 0;
      this.scrollPx = 0;
      this.typing = 0;
      this.pop = 1;
      this.onArrive?.();
      this.sinceLast = 0;
      const words = next.text.split(/\s+/).length;
      this.burstWords += words;
      this.readFor = Math.min(READ_MAX, Math.max(READ_MIN, words * READ_SECONDS_PER_WORD));
      this.slide = this.bubbleHeight(next.text) + 14;
      this.draw(false);
    }
  }

  /** A text's bubble height on the canvas, in pixels (as draw() lays it out). */
  private bubbleHeight(text: string): number {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = `${FONT_PX}px system-ui, sans-serif`;
    return wrap(ctx, text, PX_W - 70 - 44).length * LINE_H + BUBBLE_PAD + BUBBLE_GAP;
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

    // Bubbles, newest at the bottom; older ones scroll off the top. The chat scrolls by pixel.
    const maxBubble = PX_W - 70;
    const top = CHAT_TOP;
    const bottom = CHAT_BOTTOM;
    ctx.font = `${FONT_PX}px system-ui, sans-serif`;
    const layout = this.messages.map((message) => {
      const lines = wrap(ctx, message.text, maxBubble - 44);
      const width = Math.min(maxBubble, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 44);
      return { lines, width, height: lines.length * LINE_H + BUBBLE_PAD };
    });
    const typingH = typing ? 50 + BUBBLE_GAP : 0;
    const content = layout.reduce((sum, b) => sum + b.height + BUBBLE_GAP, 0) + typingH;
    this.maxScroll = Math.max(0, content - (bottom - top));
    this.scrollTarget = Math.min(this.scrollTarget, this.maxScroll);
    this.scrollPx = Math.min(this.scrollPx, this.maxScroll);
    const scrolled = this.scrollTarget > 1;
    // While sliding, everything sits a little lower and the newest text rises in from
    // the bottom edge; the chat area clips it.
    let y = bottom + this.scrollPx + (scrolled ? 0 : this.slide);
    ctx.save();
    ctx.beginPath();
    ctx.rect(14, top - 8, PX_W - 28, PX_H - 40 - (top - 8));
    ctx.clip();
    if (typing) {
      // The "..." typing bubble.
      roundRect(ctx, 34, y - 50, 100, 50, 25);
      ctx.fillStyle = '#2c2c2e';
      ctx.fill();
      ctx.fillStyle = '#9a9aa0';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(60 + i * 24, y - 25, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      y -= typingH;
    }
    this.hiddenAbove = false;
    this.visibleTexts = [];
    for (let i = layout.length - 1; i >= 0; i--) {
      const { lines, width, height } = layout[i];
      if (y - height < top - 2) {
        this.hiddenAbove = true;
      }
      if (y < top - 8) break;
      if (y - height >= top - 2 && y <= bottom + 2) this.visibleTexts.push(this.messages[i].text);
      if (y - height <= bottom + 8) {
        roundRect(ctx, 34, y - height, width, height, 22);
        ctx.fillStyle = '#2c2c2e';
        ctx.fill();
        ctx.fillStyle = '#f4f4f5';
        lines.forEach((line, j) => ctx.fillText(line, 56, y - height + BUBBLE_PAD / 2 + FONT_PX - 2 + j * LINE_H));
      }
      y -= height + BUBBLE_GAP;
    }
    ctx.restore();
    // Scroll buttons: older texts above, and a way back to the newest.
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (this.hiddenAbove) {
      roundRect(ctx, PX_W / 2 - 110, EARLIER_Y, 220, 46, 23);
      ctx.fillStyle = '#3a3a40';
      ctx.fill();
      ctx.fillStyle = '#e4e4e7';
      ctx.fillText('▲ earlier', PX_W / 2, EARLIER_Y + 32);
    }
    if (scrolled) {
      roundRect(ctx, PX_W / 2 - 110, NEWEST_Y, 220, 46, 23);
      ctx.fillStyle = '#a78bfa';
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillText('▼ newest', PX_W / 2, NEWEST_Y + 32);
    }
    ctx.textAlign = 'left';
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
