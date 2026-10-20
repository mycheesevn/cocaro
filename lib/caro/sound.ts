// Tiny WebAudio synth for game sounds — no audio assets needed.
// All sounds are generated: wooden knocks, clash bursts, chimes.

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem("caro-muted") === "1";
} catch {
  /* storage unavailable */
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem("caro-muted", m ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  delay?: number;
}

function toneTo(dest: AudioNode, o: ToneOpts & { at?: number }) {
  const c = dest.context;
  const t = (o.at ?? c.currentTime) + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + o.dur);
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

function tone(o: ToneOpts) {
  const c = ac();
  if (!c) return;
  toneTo(c.destination, { ...o, at: c.currentTime });
}

interface NoiseOpts {
  dur: number;
  gain: number;
  freq: number;
  q?: number;
  type?: BiquadFilterType;
  delay?: number;
}

function noiseTo(dest: AudioNode, o: NoiseOpts & { at?: number }) {
  const c = dest.context;
  const t = (o.at ?? c.currentTime) + (o.delay ?? 0);
  const len = Math.max(1, Math.floor(c.sampleRate * o.dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + o.dur + 0.05);
}

function noise(o: NoiseOpts) {
  const c = ac();
  if (!c) return;
  noiseTo(c.destination, { ...o, at: c.currentTime });
}

/** Wooden knock when a piece lands. */
export function playMove(): void {
  tone({ freq: 210, freqEnd: 95, dur: 0.09, gain: 0.5 });
  noise({ dur: 0.03, gain: 0.12, freq: 2500, type: "highpass" });
}

/** Magical rising sparkle when a hint appears. */
export function playHint(): void {
  tone({ freq: 880, dur: 0.12, gain: 0.14, type: "sine" });
  tone({ freq: 1174.7, dur: 0.12, gain: 0.14, type: "sine", delay: 0.09 });
  tone({ freq: 1568, dur: 0.22, gain: 0.16, type: "sine", delay: 0.18 });
}

/** Rising arpeggio for a win. */
export function playWin(): void {
  [523, 659, 784, 1047].forEach((f, i) =>
    tone({ freq: f, dur: 0.18, gain: 0.2, type: "triangle", delay: i * 0.11 })
  );
}

/** Falling tones for a loss. */
export function playLose(): void {
  [392, 330, 262].forEach((f, i) =>
    tone({ freq: f, dur: 0.22, gain: 0.18, type: "triangle", delay: i * 0.14 })
  );
}

/**
 * Playful checkmate fanfare — you won!
 * Bouncy ascending run, a cheeky ta-da ending, and an oom-pah circus bass.
 */
export function playCheckmateFanfare(): void {
  // Bouncy ascending run: E5 G5 C6 E6
  [659, 784, 1047, 1319].forEach((f, i) =>
    tone({ freq: f, dur: 0.1, gain: 0.22, type: "triangle", delay: i * 0.09 })
  );
  // High hold, little turn, then ta-da with an upward bend
  tone({ freq: 1568, dur: 0.22, gain: 0.22, type: "triangle", delay: 0.36 });
  tone({ freq: 1319, dur: 0.1, gain: 0.22, type: "triangle", delay: 0.58 });
  tone({ freq: 1047, dur: 0.1, gain: 0.22, type: "triangle", delay: 0.67 });
  tone({ freq: 784, freqEnd: 880, dur: 0.38, gain: 0.26, type: "triangle", delay: 0.76 });
  tone({ freq: 1047, freqEnd: 1175, dur: 0.38, gain: 0.16, type: "triangle", delay: 0.76 });
  // Oom-pah circus bass underneath
  [131, 196, 131, 196, 131, 196, 131].forEach((f, i) =>
    tone({ freq: f, dur: 0.14, gain: 0.13, type: "sine", delay: i * 0.18 })
  );
}

/**
 * Comedic sad trombone — the computer checkmated you.
 * Classic "womp womp womp wompp" with downward slides.
 */
export function playSadTrombone(): void {
  const notes = [
    { f: 233, e: 220, d: 0.22 },
    { f: 220, e: 208, d: 0.22 },
    { f: 208, e: 196, d: 0.22 },
    { f: 196, e: 128, d: 0.55 },
  ];
  let t = 0;
  for (const n of notes) {
    tone({ freq: n.f, freqEnd: n.e, dur: n.d, gain: 0.22, type: "sawtooth", delay: t });
    t += n.d * 0.92;
  }
}

/**
 * Crowd applause — synthesized from dozens of random noise claps through a
 * bandpass filter, with a swell in/out envelope. No audio assets needed.
 */
export function playApplause(duration = 2.8): void {
  const c = ac();
  if (!c) return;
  try {
    const sr = c.sampleRate;
    const len = Math.max(1, Math.floor(sr * duration));
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    // ~90 individual claps at random times, denser at the start.
    const claps = 90;
    for (let i = 0; i < claps; i++) {
      const t0 = Math.floor(
        Math.pow(Math.random(), 1.4) * len * 0.92
      );
      const clapLen = Math.floor(sr * (0.015 + Math.random() * 0.05));
      const amp = 0.12 + Math.random() * 0.4;
      for (let j = 0; j < clapLen && t0 + j < len; j++) {
        const decay = Math.exp(-j / (sr * 0.012));
        d[t0 + j] += (Math.random() * 2 - 1) * amp * decay;
      }
    }
    // Soft crowd bed underneath.
    for (let i = 0; i < len; i++) {
      d[i] += (Math.random() * 2 - 1) * 0.03;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600;
    bp.Q.value = 0.7;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.25);
    g.gain.setValueAtTime(0.55, t + Math.max(0.25, duration - 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(bp);
    bp.connect(g);
    g.connect(c.destination);
    src.start(t);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Destination-parameterized synth for video export. `at` is an       */
/* absolute time on the destination's context (defaults to now).       */
/* ------------------------------------------------------------------ */

