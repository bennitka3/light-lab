import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Object3D } from '@iwsdk/core';

/**
 * The coach's ring: a pulsing yellow outline around the one control the
 * how-to on the iPad's tip line is about (ben, 2026-11-16: a list of
 * controls "means nothing without seeing the actual controls"). It rings an
 * iPad button, one of the two shots, the phone, or a light on the set, and
 * the tip line says what to do with it, in the same yellow.
 *
 * One mesh, re-parented to whatever it rings. Its canvas is redrawn only
 * when the ringed thing's shape changes, so it costs nothing per frame
 * beyond a pulse of its opacity and scale.
 */

const PX_PER_M = 9000;
const YELLOW = '#f5d90a';

export class CoachRing {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private texture: CanvasTexture;
  private material: MeshBasicMaterial;
  private shape = '';
  private time = 0;
  private baseW = 1;
  private baseH = 1;
  /** A bobbing arrow above small rings (an iPad switch is easy to miss among the others). */
  readonly arrow: Mesh;
  private arrowSize = 0;
  private arrowY = 0;

  constructor() {
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.name = 'coach-ring';
    // Over the iPad, its shots and the phone.
    this.mesh.renderOrder = 1005;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Never in the way of a press: the control under it still gets the click.
    (this.mesh as unknown as { pointerEvents: string }).pointerEvents = 'none';
    const arrowCanvas = document.createElement('canvas');
    arrowCanvas.width = arrowCanvas.height = 64;
    const ctx = arrowCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = YELLOW;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(8, 10);
      ctx.lineTo(56, 10);
      ctx.lineTo(32, 56);
      ctx.closePath();
      ctx.fill();
    }
    const arrowTexture = new CanvasTexture(arrowCanvas);
    arrowTexture.colorSpace = SRGBColorSpace;
    this.arrow = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: arrowTexture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }),
    );
    this.arrow.name = 'coach-arrow';
    this.arrow.renderOrder = 1006;
    this.arrow.frustumCulled = false;
    this.arrow.visible = false;
    (this.arrow as unknown as { pointerEvents: string }).pointerEvents = 'none';
  }

  /**
   * Rings a w x h area (meters, in the parent's own units) centered at x, y
   * in front of the parent. `round` makes it a circle (for a light on set).
   * `line` is the outline's thickness in the same units.
   */
  ring(parent: Object3D, x: number, y: number, w: number, h: number, line: number, round = false, arrow = 0): void {
    if (this.mesh.parent !== parent) parent.add(this.mesh);
    if (this.arrow.parent !== parent) parent.add(this.arrow);
    const pad = line * 1.6;
    const fw = w + 2 * pad;
    const fh = h + 2 * pad;
    const shape = `${fw.toFixed(4)}|${fh.toFixed(4)}|${line.toFixed(4)}|${round}`;
    if (shape !== this.shape) {
      this.shape = shape;
      this.draw(fw, fh, line, round);
    }
    this.baseW = fw;
    this.baseH = fh;
    this.mesh.position.set(x, y, 0.0005);
    this.mesh.visible = true;
    this.arrowSize = arrow;
    this.arrowY = y + fh / 2 + arrow * 0.6;
    this.arrow.visible = arrow > 0;
    this.arrow.position.set(x, this.arrowY, 0.0006);
    this.arrow.scale.setScalar(arrow || 1);
  }

  hide(): void {
    this.mesh.visible = false;
    this.arrow.visible = false;
  }

  /** The pulse: brighter and a touch bigger, about once a second. */
  update(delta: number): void {
    if (!this.mesh.visible) return;
    this.time += delta;
    const beat = 0.5 + 0.5 * Math.sin(this.time * 5.5);
    this.material.opacity = 0.55 + 0.45 * beat;
    const grow = 1 + 0.035 * beat;
    this.mesh.scale.set(this.baseW * grow, this.baseH * grow, 1);
    if (this.arrow.visible) this.arrow.position.y = this.arrowY + this.arrowSize * 0.35 * beat;
  }

  private draw(w: number, h: number, line: number, round: boolean): void {
    // Scale the canvas so a small iPad button and a big shot look alike, within texture limits.
    const scale = Math.min(PX_PER_M, 1024 / Math.max(w, h));
    const cw = Math.max(8, Math.round(w * scale));
    const ch = Math.max(8, Math.round(h * scale));
    this.canvas.width = cw;
    this.canvas.height = ch;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    const lw = Math.max(2, line * scale);
    const inset = lw * 1.1;
    ctx.strokeStyle = YELLOW;
    ctx.shadowColor = YELLOW;
    ctx.shadowBlur = lw * 1.2;
    ctx.lineWidth = lw;
    ctx.beginPath();
    if (round) {
      ctx.ellipse(cw / 2, ch / 2, cw / 2 - inset, ch / 2 - inset, 0, 0, Math.PI * 2);
    } else {
      const r = Math.min(cw, ch) * 0.22;
      const x = inset;
      const y = inset;
      const rw = cw - 2 * inset;
      const rh = ch - 2 * inset;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + rw, y, x + rw, y + rh, r);
      ctx.arcTo(x + rw, y + rh, x, y + rh, r);
      ctx.arcTo(x, y + rh, x, y, r);
      ctx.arcTo(x, y, x + rw, y, r);
      ctx.closePath();
    }
    ctx.stroke();
    // A second pass without the blur keeps the line crisp over its glow.
    ctx.shadowBlur = 0;
    ctx.stroke();
    this.texture.dispose();
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material.map = this.texture;
    this.material.needsUpdate = true;
  }
}
