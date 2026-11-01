/**
 * Little synthesized sounds, so there are no audio files to load: a text
 * landing on the phone, and the director's muffled "wah-wah" voice while his
 * speech bubble is up. Browsers only allow sound after the player has pressed
 * something, so `unlock()` runs on the first press (or entering the headset).
 */

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
/** Tests read these to check a sound was asked for. */
export const played: { text: number; voice: number } = { text: 0, voice: 0 };

export function unlock(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // No sound is fine.
  }
}

function ready(): AudioContext | undefined {
  return ctx && master && ctx.state === 'running' ? ctx : undefined;
}

/** A short two-note chime for an incoming text. */
export function textChime(): void {
  played.text += 1;
  const ac = ready();
  if (!ac || !master) return;
  const t = ac.currentTime;
  [
    [1175, 0],
    [1568, 0.09],
  ].forEach(([freq, at]) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t + at);
    gain.gain.linearRampToValueAtTime(0.35, t + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + at + 0.28);
    osc.connect(gain).connect(master!);
    osc.start(t + at);
    osc.stop(t + at + 0.3);
  });
}

/**
 * The director's voice: a muted-trumpet "wah-wah", one syllable for every
 * couple of words, capped at a few seconds so long lines don't drone.
 */
export function mumble(line: string): void {
  played.voice += 1;
  const ac = ready();
  if (!ac || !master) return;
  const words = line.split(/\s+/).filter(Boolean).length;
  const syllables = Math.min(12, Math.max(2, Math.round(words / 1.6)));
  const t0 = ac.currentTime + 0.05;
  const osc = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  filter.type = 'lowpass';
  filter.Q.value = 6;
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(master);
  let t = t0;
  for (let i = 0; i < syllables; i++) {
    const length = 0.13 + Math.random() * 0.12;
    const pitch = 150 + Math.random() * 45 - (i === syllables - 1 ? 30 : 0);
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.linearRampToValueAtTime(pitch * 0.92, t + length);
    // The "wah": the filter opens and closes like a plunger mute.
    filter.frequency.setValueAtTime(350, t);
    filter.frequency.linearRampToValueAtTime(1300, t + length * 0.4);
    filter.frequency.linearRampToValueAtTime(400, t + length);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    gain.gain.setValueAtTime(0.22, t + length - 0.04);
    gain.gain.linearRampToValueAtTime(0, t + length);
    t += length + 0.04 + Math.random() * 0.05;
  }
  osc.start(t0);
  osc.stop(t + 0.05);
}

/** A short buzz on the headset controllers, like a phone vibrating in your hand. */
export function buzz(session: XRSession | null | undefined): void {
  if (!session) return;
  try {
    for (const source of session.inputSources) {
      const actuators = (source.gamepad as unknown as { hapticActuators?: { pulse?: (v: number, ms: number) => unknown }[] } | undefined)
        ?.hapticActuators;
      const pulse = actuators?.[0]?.pulse;
      if (pulse) void pulse.call(actuators![0], 0.5, 70);
    }
  } catch {
    // No haptics is fine.
  }
}
