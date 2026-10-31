import type { MeshBasicMaterial } from '@iwsdk/core';

/**
 * A 1931 monster-movie mode for the camera monitor. When it runs, the live
 * shot turns black and white with film grain, gate weave, a flickering
 * exposure and a vignette, and a theremin plays a short, very serious tune
 * built from oscillators. Nothing in the game tells anyone how to start it.
 */

const RUN_SECONDS = 9;

// The tune: [midi note, beats]. Slides between notes like a real theremin.
const MELODY: [number, number][] = [
  [69, 1.5],
  [72, 0.5],
  [71, 1],
  [65, 1.5],
  [64, 0.5],
  [68, 2],
  [69, 1],
  [76, 2.5],
];
const BEAT = 0.42;

export class CreatureFeature {
  private uniforms = { uMono: { value: 0 }, uTime: { value: 0 } };
  private remaining = 0;
  private audio: AudioContext | null = null;
  played = false;

  /** Teaches the monitor's live-shot material the effect; it stays off until play(). */
  install(material: MeshBasicMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uMono = this.uniforms.uMono;
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uMono;
uniform float uTime;
float creatureHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
  vec2 creatureUv = vMapUv;
  if (uMono > 0.5) {
    // Gate weave: the frame drifts a little, like film in an old projector.
    creatureUv += vec2(sin(uTime * 13.0) * 0.002, sin(uTime * 7.0) * 0.003);
  }
  vec4 sampledDiffuseColor = texture2D(map, creatureUv);
  if (uMono > 0.5) {
    float luma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    luma = pow(luma, 0.85) * 1.15;
    float grain = creatureHash(creatureUv * 900.0 + uTime) - 0.5;
    float flicker = 0.9 + 0.1 * sin(uTime * 41.0) * creatureHash(vec2(floor(uTime * 24.0)));
    float scratch = step(0.997, creatureHash(vec2(floor(creatureUv.x * 300.0), floor(uTime * 12.0))));
    vec2 centered = creatureUv - 0.5;
    float vignette = smoothstep(0.75, 0.25, length(centered * vec2(1.0, 1.6)));
    vec3 film = vec3(luma * flicker + grain * 0.18 + scratch * 0.5) * vignette;
    sampledDiffuseColor.rgb = film * vec3(1.0, 0.97, 0.9);
  }
  diffuseColor *= sampledDiffuseColor;
#endif`,
        );
    };
    material.needsUpdate = true;
  }

  get active(): boolean {
    return this.remaining > 0;
  }

  play(): void {
    this.played = true;
    this.remaining = RUN_SECONDS;
    this.uniforms.uMono.value = 1;
    this.playTheremin();
  }

  update(delta: number): void {
    this.uniforms.uTime.value += delta;
    if (this.remaining > 0) {
      this.remaining -= delta;
      if (this.remaining <= 0) {
        this.uniforms.uMono.value = 0;
      }
    }
  }

  /** Draws the title card over the monitor's live picture. */
  drawTitle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#e8e2d0';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 18, y + 18, w - 36, h - 36);
    ctx.strokeRect(x + 28, y + 28, w - 56, h - 56);
    ctx.fillStyle = '#e8e2d0';
    ctx.textAlign = 'center';
    ctx.font = 'italic 28px Georgia, serif';
    ctx.fillText('Soundstage Pictures presents', x + w / 2, y + h * 0.3);
    ctx.font = 'bold 58px Georgia, serif';
    ctx.fillText('THE CREATURE', x + w / 2, y + h * 0.52);
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText('FROM SOUNDSTAGE 4', x + w / 2, y + h * 0.68);
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText('(1931)  ·  lit entirely from below', x + w / 2, y + h * 0.84);
    ctx.restore();
  }

  private playTheremin(): void {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      void ctx.resume();
      const start = ctx.currentTime + 0.05;
      const total = MELODY.reduce((sum, [, beats]) => sum + beats * BEAT, 0);

      const voice = ctx.createOscillator();
      voice.type = 'sine';
      // A second, quieter oscillator an octave up gives the tone its eerie edge.
      const overtone = ctx.createOscillator();
      overtone.type = 'triangle';
      const overtoneGain = ctx.createGain();
      overtoneGain.gain.value = 0.18;

      // Vibrato: a slow wobble on pitch that deepens as each note is held.
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5.6;
      const vibratoDepth = ctx.createGain();
      vibratoDepth.gain.setValueAtTime(0, start);
      vibratoDepth.gain.linearRampToValueAtTime(9, start + 0.8);
      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(voice.frequency);

      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.16, start + 0.3);
      envelope.gain.setValueAtTime(0.16, start + total - 0.6);
      envelope.gain.linearRampToValueAtTime(0, start + total);

      let t = start;
      MELODY.forEach(([note, beats], i) => {
        const hz = 440 * Math.pow(2, (note - 69) / 12);
        if (i === 0) {
          voice.frequency.setValueAtTime(hz, t);
          overtone.frequency.setValueAtTime(hz * 2, t);
        } else {
          // Portamento: slide into each note instead of jumping.
          voice.frequency.setTargetAtTime(hz, t, 0.07);
          overtone.frequency.setTargetAtTime(hz * 2, t, 0.07);
        }
        t += beats * BEAT;
      });

      voice.connect(envelope);
      overtone.connect(overtoneGain);
      overtoneGain.connect(envelope);
      envelope.connect(ctx.destination);
      for (const osc of [voice, overtone, vibrato]) {
        osc.start(start);
        osc.stop(start + total + 0.1);
      }
    } catch {
      // No audio (blocked or unsupported): the picture still plays.
    }
  }
}
