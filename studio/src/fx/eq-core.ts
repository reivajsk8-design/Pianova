// studio/src/fx/eq-core.ts
// Núcleo puro del EQ gráfico: tipos, bandas por defecto, presets, conversión bandas↔params (persistencia)
// y matemática del canvas (frecuencia log / ganancia dB). Sin DOM ni Web Audio → testeable.

export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';
export interface EqDyn { on: boolean; threshold: number; range: number; attack: number; release: number }
export interface EqBand { type: EqBandType; freq: number; gain: number; q: number; on: boolean; dyn: EqDyn }

// API que el efecto EQ expone para su editor a medida.
export interface EqApi {
  getBands(): EqBand[];
  setBand(i: number, patch: Partial<EqBand>): void;
  setDyn(i: number, patch: Partial<EqDyn>): void;
  reset(): void;
  applyPreset(name: string): void;
  presetNames(): string[];
  analyser: AnalyserNode;
  magResponse(freqs: Float32Array): Float32Array;   // magnitud combinada de las bandas
  mode(): 'stereo' | 'ms';
  setMode(m: 'stereo' | 'ms'): void;
  channelLabels(): string[];
  activeChannel(): number;
  setActiveChannel(i: number): void;
}

export const EQ_FMIN = 20, EQ_FMAX = 20000, EQ_GAIN_RANGE = 18, Q_MIN = 0.3, Q_MAX = 8;
export const BAND_TYPES: EqBandType[] =
  ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
export const DEFAULT_FREQS = [80, 150, 350, 800, 1800, 4000, 8000, 12000];

// Presets = ganancia (dB) de cada una de las 8 bandas (freq/Q/on quedan por defecto).
export const EQ_PRESETS: Record<string, number[]> = {
  'Plano':     [0, 0, 0, 0, 0, 0, 0, 0],
  'Cuerpo':    [3, 2, 0, -1, 0, 0, 0, 1],
  'Cálido':    [2, 1, 0, 0, -1, -2, 0, 0],
  'Brillante': [-1, 0, 0, 0, 1, 2, 3, 4],
  'Presencia': [0, 0, -1, 0, 2, 3, 1, 0],
  'Loudness':  [4, 2, 0, -1, 0, 1, 3, 4]
};

export function defaultDyn(): EqDyn { return { on: false, threshold: -24, range: -6, attack: 20, release: 150 }; }
export function defaultBands(): EqBand[] {
  return BAND_TYPES.map((t, i) => ({ type: t, freq: DEFAULT_FREQS[i], gain: 0, q: 1, on: true, dyn: defaultDyn() }));
}
export function presetNames(): string[] { return Object.keys(EQ_PRESETS); }
export function presetBands(name: string): EqBand[] {
  const g = EQ_PRESETS[name] ?? EQ_PRESETS['Plano'];
  return defaultBands().map((b, i) => ({ ...b, gain: g[i] ?? 0 }));
}

export function bandsToParams(bands: EqBand[], prefix = 'b'): Record<string, number> {
  const p: Record<string, number> = {};
  bands.forEach((b, i) => {
    p[`${prefix}${i}_freq`] = b.freq; p[`${prefix}${i}_gain`] = b.gain; p[`${prefix}${i}_q`] = b.q; p[`${prefix}${i}_on`] = b.on ? 1 : 0;
    p[`${prefix}${i}_dyn_on`] = b.dyn.on ? 1 : 0; p[`${prefix}${i}_thr`] = b.dyn.threshold; p[`${prefix}${i}_range`] = b.dyn.range;
    p[`${prefix}${i}_atk`] = b.dyn.attack; p[`${prefix}${i}_rel`] = b.dyn.release;
  });
  return p;
}
export function bandsFromParams(params: Record<string, number>, prefix = 'b'): EqBand[] {
  return defaultBands().map((b, i) => ({
    type: b.type,
    freq: params[`${prefix}${i}_freq`] ?? b.freq,
    gain: params[`${prefix}${i}_gain`] ?? b.gain,
    q: params[`${prefix}${i}_q`] ?? b.q,
    on: params[`${prefix}${i}_on`] !== undefined ? params[`${prefix}${i}_on`] === 1 : b.on,
    dyn: {
      on: params[`${prefix}${i}_dyn_on`] !== undefined ? params[`${prefix}${i}_dyn_on`] === 1 : b.dyn.on,
      threshold: params[`${prefix}${i}_thr`] ?? b.dyn.threshold,
      range: params[`${prefix}${i}_range`] ?? b.dyn.range,
      attack: params[`${prefix}${i}_atk`] ?? b.dyn.attack,
      release: params[`${prefix}${i}_rel`] ?? b.dyn.release
    }
  }));
}

// Matemática del canvas (portada de pianova.html).
export function freqToX(f: number, w: number): number { return Math.log(f / EQ_FMIN) / Math.log(EQ_FMAX / EQ_FMIN) * w; }
export function xToFreq(x: number, w: number): number { return EQ_FMIN * Math.pow(EQ_FMAX / EQ_FMIN, x / w); }
export function gainToY(g: number, h: number): number { return h / 2 * (1 - g / EQ_GAIN_RANGE); }
export function yToGain(y: number, h: number): number { return (1 - y / (h / 2)) * EQ_GAIN_RANGE; }

// Índice de la banda ACTIVA cuyo nodo está más cerca de (px,py), dentro de ~16px; o -1.
export function bandAt(bands: EqBand[], px: number, py: number, w: number, h: number): number {
  let best = -1, bd = 16 * 16;
  bands.forEach((b, i) => {
    if (!b.on) return;
    const x = freqToX(b.freq, w), y = gainToY(b.gain, h);
    const d = (x - px) * (x - px) + (y - py) * (y - py);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// Desplazamiento de ganancia objetivo (dB) de una banda dinámica: 0 si el nivel no supera el umbral,
// si no proporcional (0..1 a lo largo de `knee` dB) hasta `range` (negativo = corta, positivo = sube).
export function dynTarget(levelDb: number, threshold: number, range: number, knee = 18): number {
  const over = levelDb - threshold;
  if (over <= 0) return 0;
  return range * Math.min(1, over / knee);
}
// Coeficiente de envolvente por tick (0..1): 1 - e^(-dt/tau). Menor tau ⇒ mayor coef (más rápido).
export function envCoef(tauMs: number, dtMs: number): number {
  return 1 - Math.exp(-dtMs / Math.max(1, tauMs));
}
