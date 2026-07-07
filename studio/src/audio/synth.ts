import { ensureAudio } from './context';
import { masterDest } from './masterBus';

interface Partial { type: OscillatorType; ratio: number; gain: number; detune?: number; }
interface Preset {
  label: string;
  partials: Partial[];
  filter: { start: number; startMax: number; end: number; endMin: number; time: number } | null;
  sustain: boolean;
  peak: [number, number];
  attack: number;
  decay?: number;
  release?: number;
  vibrato?: { rate: number; depth: number };
}
interface Voice { o: OscillatorNode[]; g: GainNode; release: number; }

export const SYNTH: Record<string, Preset> = {
  piano: { label: '🎹 Piano',
    partials: [{ type: 'triangle', ratio: 1, gain: 1 }, { type: 'sine', ratio: 2, gain: 0.22 },
               { type: 'sawtooth', ratio: 1, gain: 0.07, detune: 5 }],
    filter: { start: 9, startMax: 13000, end: 2, endMin: 700, time: 1.3 },
    sustain: false, peak: [0.16, 0.22], attack: 0.006, decay: 2.8 },
  brillante: { label: '✨ Piano brillante',
    partials: [{ type: 'sawtooth', ratio: 1, gain: 0.5 }, { type: 'square', ratio: 2, gain: 0.12 },
               { type: 'triangle', ratio: 1, gain: 0.5, detune: 6 }],
    filter: { start: 14, startMax: 16000, end: 4, endMin: 1400, time: 1.0 },
    sustain: false, peak: [0.11, 0.18], attack: 0.004, decay: 2.4 },
  organo: { label: '🎛️ Órgano',
    partials: [{ type: 'sine', ratio: 1, gain: 0.5 }, { type: 'sine', ratio: 2, gain: 0.3 },
               { type: 'sine', ratio: 4, gain: 0.18 }, { type: 'square', ratio: 1, gain: 0.06 }],
    filter: null, sustain: true, peak: [0.15, 0.10], attack: 0.02, release: 0.12 },
  campanas: { label: '🔔 Campanas',
    partials: [{ type: 'sine', ratio: 1, gain: 0.6 }, { type: 'sine', ratio: 3.0, gain: 0.3 },
               { type: 'sine', ratio: 5.4, gain: 0.12 }],
    filter: null, sustain: false, peak: [0.17, 0.16], attack: 0.003, decay: 3.4 },
  cuerda: { label: '🎻 Cuerda sintética',
    partials: [{ type: 'sawtooth', ratio: 1, gain: 0.4 }, { type: 'sawtooth', ratio: 1, gain: 0.4, detune: -7 },
               { type: 'sawtooth', ratio: 2, gain: 0.12 }],
    filter: { start: 6, startMax: 7000, end: 3, endMin: 900, time: 0.6 },
    sustain: true, peak: [0.12, 0.10], attack: 0.08, release: 0.22, vibrato: { rate: 5, depth: 4 } },
  guitarra: { label: '🎸 Guitarra',
    partials: [{ type: 'triangle', ratio: 1, gain: 0.6 }, { type: 'sawtooth', ratio: 2, gain: 0.14 },
               { type: 'sawtooth', ratio: 3, gain: 0.07, detune: 4 }],
    filter: { start: 8, startMax: 6000, end: 2, endMin: 500, time: 0.8 },
    sustain: false, peak: [0.13, 0.16], attack: 0.004, decay: 1.6 },
  flauta: { label: '🪈 Flauta',
    partials: [{ type: 'sine', ratio: 1, gain: 0.5 }, { type: 'sine', ratio: 2, gain: 0.1 },
               { type: 'triangle', ratio: 3, gain: 0.04 }],
    filter: null, sustain: true, peak: [0.12, 0.08], attack: 0.05, release: 0.15, vibrato: { rate: 5, depth: 3 } }
};

const voices: Record<number, Voice> = {};
let currentPreset = 'piano';
let synthOut: AudioNode | null = null;

// Redirige la salida de las voces (p. ej. al rack del instrumento). null = directo al bus maestro.
export function setSynthOut(node: AudioNode | null): void { synthOut = node; }

export function setPreset(name: string): void { if (SYNTH[name]) currentPreset = name; }
export function getPresetNames(): [string, string][] {
  return Object.keys(SYNTH).map(k => [k, SYNTH[k].label]);
}

export function noteOn(midi: number, vel = 0.8): void {
  const actx = ensureAudio();
  if (voices[midi]) noteOff(midi);
  const preset = SYNTH[currentPreset] ?? SYNTH.piano;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const t = actx.currentTime;
  const g = actx.createGain();
  let out: AudioNode = g;
  if (preset.filter) {
    const f = actx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(freq * preset.filter.start, preset.filter.startMax), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(freq * preset.filter.end, preset.filter.endMin), t + preset.filter.time);
    g.connect(f); out = f;
  }
  out.connect(synthOut ?? masterDest());
  const oscs: OscillatorNode[] = [];
  for (const part of preset.partials) {
    const o = actx.createOscillator(); o.type = part.type; o.frequency.value = freq * part.ratio;
    if (part.detune) o.detune.value = part.detune;
    const pg = actx.createGain(); pg.gain.value = part.gain;
    o.connect(pg); pg.connect(g); oscs.push(o);
  }
  if (preset.vibrato) {
    const lfo = actx.createOscillator(); lfo.frequency.value = preset.vibrato.rate;
    const lg = actx.createGain(); lg.gain.value = preset.vibrato.depth;
    lfo.connect(lg); oscs.forEach(o => lg.connect(o.detune)); lfo.start(t); oscs.push(lfo);
  }
  const peak = Math.max(0.0002, preset.peak[0] + preset.peak[1] * vel);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + preset.attack);
  if (!preset.sustain) g.gain.exponentialRampToValueAtTime(0.0001, t + (preset.decay ?? 1));
  oscs.forEach(o => o.start(t));
  voices[midi] = { o: oscs, g, release: preset.release ?? 0.18 };
}

export function noteOff(midi: number): void {
  const v = voices[midi]; if (!v) return;
  const actx = ensureAudio();
  const t = actx.currentTime, rel = v.release;
  try {
    const cur = v.g.gain.value;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(Math.max(cur, 0.0001), t);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t + rel);
  } catch (e) { /* ignora */ }
  const os = v.o;
  setTimeout(() => os.forEach(x => { try { x.stop(); } catch (e) { /* ya parado */ } }), rel * 1000 + 60);
  delete voices[midi];
}

export function allNotesOff(): void { Object.keys(voices).forEach(m => noteOff(+m)); }

// Construye y agenda una voz de `preset` en `when` con gate `dur`, hacia `out`. De usar y tirar.
function triggerVoice(actx: AudioContext, preset: Preset, midi: number, vel: number, when: number, dur: number, out: AudioNode): void {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const g = actx.createGain();
  let node: AudioNode = g;
  if (preset.filter) {
    const f = actx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(freq * preset.filter.start, preset.filter.startMax), when);
    f.frequency.exponentialRampToValueAtTime(Math.max(freq * preset.filter.end, preset.filter.endMin), when + preset.filter.time);
    g.connect(f); node = f;
  }
  node.connect(out);
  const oscs: OscillatorNode[] = [];
  for (const part of preset.partials) {
    const o = actx.createOscillator(); o.type = part.type; o.frequency.value = freq * part.ratio;
    if (part.detune) o.detune.value = part.detune;
    const pg = actx.createGain(); pg.gain.value = part.gain;
    o.connect(pg); pg.connect(g); oscs.push(o);
  }
  if (preset.vibrato) {
    const lfo = actx.createOscillator(); lfo.frequency.value = preset.vibrato.rate;
    const lg = actx.createGain(); lg.gain.value = preset.vibrato.depth;
    lfo.connect(lg); oscs.forEach(o => lg.connect(o.detune)); oscs.push(lfo);
  }
  const peak = Math.max(0.0002, preset.peak[0] + preset.peak[1] * vel);
  const rel = preset.release ?? 0.18;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + preset.attack);
  let stopAt: number;
  if (preset.sustain) {
    const gateEnd = when + Math.max(dur, preset.attack);
    g.gain.setValueAtTime(peak, gateEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, gateEnd + rel);
    stopAt = gateEnd + rel + 0.03;
  } else {
    const decay = preset.decay ?? 1;
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    stopAt = when + decay + 0.03;
  }
  oscs.forEach(o => o.start(when));
  oscs.forEach(o => o.stop(stopAt));
}

// Dispara el preset ACTUAL (modo en vivo / secuenciador de 1 canal). Ruta por defecto: synthOut ?? masterDest.
export function triggerAt(midi: number, vel: number, when: number, dur: number, dest?: AudioNode): void {
  const actx = ensureAudio();
  triggerVoice(actx, SYNTH[currentPreset] ?? SYNTH.piano, midi, vel, when, dur, dest ?? synthOut ?? masterDest());
}

// Dispara un preset CONCRETO a un destino CONCRETO (para los canales del groovebox).
export function triggerPreset(presetName: string, midi: number, vel: number, when: number, dur: number, dest: AudioNode): void {
  const actx = ensureAudio();
  triggerVoice(actx, SYNTH[presetName] ?? SYNTH.piano, midi, vel, when, dur, dest);
}
